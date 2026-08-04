import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const requiredNames = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_TEST_USER_A_EMAIL',
  'SUPABASE_TEST_USER_A_PASSWORD',
  'SUPABASE_TEST_USER_B_EMAIL',
  'SUPABASE_TEST_USER_B_PASSWORD',
] as const;
type RequiredName = (typeof requiredNames)[number];
type RequiredEnvironment = Record<RequiredName, string>;

function loadEnvironment(): RequiredEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  const source = runtime.process?.env ?? {};
  const missing = requiredNames.filter((name) => !source[name]);
  if (missing.length > 0) {
    throw new Error(`缺少 Supabase 集成测试环境变量：${missing.join(', ')}`);
  }
  return Object.fromEntries(requiredNames.map((name) => [name, source[name]!])) as RequiredEnvironment;
}

const env = loadEnvironment();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
let userA: SupabaseClient;
let userB: SupabaseClient;
let ledgerId: string;
let createdTransactionId: string;
let createdAccountId: string;
let foreignCategoryId: string;
const transactionIds: string[] = [];
const operationIds: string[] = [];
const categoryIds: string[] = [];
const categoryBudgetIds: string[] = [];

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  [userA, userB] = await Promise.all([
    signedInClient(env.SUPABASE_TEST_USER_A_EMAIL, env.SUPABASE_TEST_USER_A_PASSWORD),
    signedInClient(env.SUPABASE_TEST_USER_B_EMAIL, env.SUPABASE_TEST_USER_B_PASSWORD),
  ]);
  const { data, error } = await userA.rpc('v2_bootstrap_personal_ledger');
  if (error) throw error;
  ledgerId = String(data.ledgerId);

  const { data: otherLedger, error: otherLedgerError } = await userB.rpc('v2_bootstrap_personal_ledger');
  if (otherLedgerError) throw otherLedgerError;
  const { data: otherCategories, error: otherCategoryError } = await userB
    .from('v2_categories')
    .select('id')
    .eq('ledger_id', String(otherLedger.ledgerId))
    .limit(1);
  if (otherCategoryError) throw otherCategoryError;
  foreignCategoryId = String(otherCategories![0].id);
});

afterAll(async () => {
  if (categoryBudgetIds.length > 0) {
    await admin.from('v2_category_budgets').delete().in('id', categoryBudgetIds);
  }
  if (categoryIds.length > 0) {
    await admin.from('v2_categories').delete().in('id', categoryIds);
  }
  if (transactionIds.length > 0) {
    await admin.from('v2_transaction_entries').delete().in('transaction_id', transactionIds);
    await admin.from('v2_transactions').delete().in('id', transactionIds);
    await admin.from('v2_change_log').delete().in('entity_id', transactionIds);
  }
  if (operationIds.length > 0) {
    await admin.from('v2_sync_operations').delete().in('operation_id', operationIds);
  }
  await Promise.all([userA?.auth.signOut(), userB?.auth.signOut()]);
});

describe('Supabase v2 ledger security and atomic operations', () => {
  it('bootstraps one personal ledger idempotently', async () => {
    const first = await userA.rpc('v2_bootstrap_personal_ledger');
    const second = await userA.rpc('v2_bootstrap_personal_ledger');
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data.ledgerId).toBe(second.data.ledgerId);

    const { count, error } = await userA
      .from('v2_ledger_members')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_id', ledgerId);
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  it('prevents another authenticated user and anonymous clients from accessing the ledger', async () => {
    const anonymous = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
    const [otherResult, anonymousResult] = await Promise.all([
      userB.from('v2_ledgers').select('id').eq('id', ledgerId),
      anonymous.from('v2_ledgers').select('id').eq('id', ledgerId),
    ]);
    expect(otherResult.data).toEqual([]);
    expect(anonymousResult.data).toBeNull();
    expect(anonymousResult.error?.code).toBe('42501');
  });

  it('prevents anonymous clients from invoking internal security-definer helpers', async () => {
    const anonymous = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, clientOptions);
    const forgedEntityId = crypto.randomUUID();
    transactionIds.push(forgedEntityId);

    const result = await anonymous.rpc('v2_append_change', {
      target_ledger: ledgerId,
      target_type: 'forged',
      target_id: forgedEntityId,
      target_version: 1,
      is_tombstone: false,
      target_record: {},
    });

    expect(result.error).not.toBeNull();
    const { count } = await admin
      .from('v2_change_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', forgedEntityId);
    expect(count).toBe(0);
  });

  it('applies a valid expense once and rolls an invalid posting back', async () => {
    const { data: accounts, error: accountError } = await userA
      .from('v2_accounts')
      .select('id, account_class')
      .eq('ledger_id', ledgerId)
      .eq('account_class', 'asset')
      .limit(1);
    if (accountError) throw accountError;
    const accountId = accounts![0].id as string;
    createdAccountId = accountId;
    const transactionId = crypto.randomUUID();
    createdTransactionId = transactionId;
    const operationId = crypto.randomUUID();
    transactionIds.push(transactionId);
    operationIds.push(operationId);
    const transaction = {
      id: transactionId,
      operationId,
      ledgerId,
      type: 'expense',
      amountCents: 6800,
      categoryId: null,
      occurredAt: new Date().toISOString(),
      note: 'integration test',
      originalTransactionId: null,
      version: 1,
      deletedAt: null,
    };
    const payload = {
      schemaVersion: 1,
      operationId,
      ledgerId,
      createdAt: new Date().toISOString(),
      kind: 'transaction.create',
      transaction,
      entries: [{ accountId, deltaCents: -6800 }],
    };

    const first = await userA.rpc('v2_apply_operation', { p_operation_id: operationId, p_payload: payload });
    const duplicate = await userA.rpc('v2_apply_operation', { p_operation_id: operationId, p_payload: payload });
    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(duplicate.data).toEqual(first.data);
    const { count } = await userA
      .from('v2_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('id', transactionId);
    expect(count).toBe(1);

    const invalidId = crypto.randomUUID();
    const invalidOperationId = crypto.randomUUID();
    transactionIds.push(invalidId);
    operationIds.push(invalidOperationId);
    const invalid = await userA.rpc('v2_apply_operation', {
      p_operation_id: invalidOperationId,
      p_payload: {
        ...payload,
        operationId: invalidOperationId,
        transaction: { ...transaction, id: invalidId, operationId: invalidOperationId },
        entries: [{ accountId, deltaCents: 6800 }],
      },
    });
    expect(invalid.error).not.toBeNull();
    const { count: invalidCount } = await admin
      .from('v2_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('id', invalidId);
    expect(invalidCount).toBe(0);
  });

  it('returns both versions for an optimistic update conflict', async () => {
    const transactionId = createdTransactionId;
    const operationId = crypto.randomUUID();
    operationIds.push(operationId);
    const conflict = await userA.rpc('v2_apply_operation', {
      p_operation_id: operationId,
      p_payload: {
        schemaVersion: 1,
        operationId,
        ledgerId,
        createdAt: new Date().toISOString(),
        kind: 'transaction.update',
        transactionId,
        baseVersion: 0,
        transaction: { id: transactionId, version: 1 },
        entries: [],
      },
    });
    expect(conflict.error).toBeNull();
    expect(conflict.data.status).toBe('conflict');
    expect(conflict.data.server).toBeTruthy();
    expect(conflict.data.local).toBeTruthy();
  });

  it('applies a versioned transaction update', async () => {
    const operationId = crypto.randomUUID();
    operationIds.push(operationId);
    const update = await userA.rpc('v2_apply_operation', {
      p_operation_id: operationId,
      p_payload: {
        schemaVersion: 1,
        operationId,
        ledgerId,
        createdAt: new Date().toISOString(),
        kind: 'transaction.update',
        transactionId: createdTransactionId,
        baseVersion: 1,
        transaction: {
          id: createdTransactionId,
          operationId,
          ledgerId,
          type: 'expense',
          amountCents: 7200,
          categoryId: null,
          occurredAt: new Date().toISOString(),
          note: 'updated integration test',
          originalTransactionId: null,
          version: 2,
          deletedAt: null,
        },
        entries: [{ accountId: createdAccountId, deltaCents: -7200 }],
      },
    });

    expect(update.error).toBeNull();
    expect(update.data.status).toBe('applied');
    const { data: saved } = await userA
      .from('v2_transactions')
      .select('amount_cents, version')
      .eq('id', createdTransactionId)
      .single();
    expect(saved).toMatchObject({ amount_cents: 7200, version: 2 });
  });

  it('rejects unknown management fields', async () => {
    const categoryId = crypto.randomUUID();
    const categoryOperationId = crypto.randomUUID();
    categoryIds.push(categoryId);
    operationIds.push(categoryOperationId);
    const categoryResult = await userA.rpc('v2_apply_operation', {
      p_operation_id: categoryOperationId,
      p_payload: {
        schemaVersion: 1,
        operationId: categoryOperationId,
        ledgerId,
        createdAt: new Date().toISOString(),
        kind: 'category.create',
        unexpected: true,
        category: {
          id: categoryId,
          ledgerId,
          name: 'invalid test category',
          kind: 'expense',
          iconKey: 'test',
          sortOrder: 99,
          version: 1,
          archivedAt: null,
        },
      },
    });
    expect(categoryResult.error).not.toBeNull();

    const { count } = await admin
      .from('v2_categories')
      .select('*', { count: 'exact', head: true })
      .eq('id', categoryId);
    expect(count).toBe(0);
  });

  it('rejects cross-ledger references', async () => {
    const categoryBudgetId = crypto.randomUUID();
    const categoryBudgetOperationId = crypto.randomUUID();
    categoryBudgetIds.push(categoryBudgetId);
    operationIds.push(categoryBudgetOperationId);
    const categoryBudgetResult = await userA.rpc('v2_apply_operation', {
      p_operation_id: categoryBudgetOperationId,
      p_payload: {
        schemaVersion: 1,
        operationId: categoryBudgetOperationId,
        ledgerId,
        createdAt: new Date().toISOString(),
        kind: 'category-budget.create',
        categoryBudget: {
          id: categoryBudgetId,
          ledgerId,
          categoryId: foreignCategoryId,
          month: '2026-07',
          amountCents: 10000,
          version: 1,
          archivedAt: null,
        },
      },
    });
    expect(categoryBudgetResult.error).not.toBeNull();

    const { count: categoryBudgetCount } = await admin
      .from('v2_category_budgets')
      .select('*', { count: 'exact', head: true })
      .eq('id', categoryBudgetId);
    expect(categoryBudgetCount).toBe(0);
  });

  it('pulls committed changes once using a monotonic sequence cursor', async () => {
    const first = await userA.rpc('v2_pull_changes', { p_ledger_id: ledgerId, p_after_seq: '0' });
    if (first.error) throw first.error;
    expect(first.data.nextCursor).toMatch(/^[1-9]\d*$/);
    expect(first.data.changes.length).toBeGreaterThan(0);
    expect(first.data.changes.every((change: { changeSeq: unknown }) => (
      typeof change.changeSeq === 'string' && /^\d+$/.test(change.changeSeq)
    ))).toBe(true);
    const second = await userA.rpc('v2_pull_changes', {
      p_ledger_id: ledgerId,
      p_after_seq: first.data.nextCursor,
    });
    expect(second.error).toBeNull();
    expect(second.data.changes).toEqual([]);
    expect(second.data.nextCursor).toBe(first.data.nextCursor);
  });
});
