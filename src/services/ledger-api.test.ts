import type { LedgerOperation } from '../domain/operations';
import { describe, expect, it, vi } from 'vitest';
import { LedgerApi } from './ledger-api';

const ledgerId = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000010';
const transactionId = '00000000-0000-4000-8000-000000000020';

const operation = {
  schemaVersion: 1,
  operationId,
  ledgerId,
  createdAt: '2026-07-18T08:00:00.000Z',
  kind: 'transaction.delete',
  transactionId,
  baseVersion: 1,
  deletedAt: '2026-07-18T09:00:00.000Z',
} as const satisfies LedgerOperation;

const records = {
  profile: {
    id: '00000000-0000-4000-8000-000000000100',
    display_name: '海风',
    settings: { weekStartsOn: 1 },
  },
  ledger: {
    id: ledgerId,
    owner_user_id: '00000000-0000-4000-8000-000000000002',
    name: '家庭账本',
    currency: 'CNY',
    version: 2,
  },
  member: {
    id: '00000000-0000-4000-8000-000000000103',
    user_id: '00000000-0000-4000-8000-000000000002',
    ledger_id: ledgerId,
    role: 'owner',
    version: 3,
  },
  account: {
    id: '00000000-0000-4000-8000-000000000104',
    ledger_id: ledgerId,
    name: '储蓄卡',
    kind: 'debit_card',
    account_class: 'asset',
    currency: 'CNY',
    opening_balance_cents: 120_000,
    sort_order: 4,
    version: 2,
    archived_at: null,
  },
  category: {
    id: '00000000-0000-4000-8000-000000000105',
    ledger_id: ledgerId,
    name: '餐饮',
    kind: 'expense',
    icon_key: 'food',
    sort_order: 1,
    version: 2,
    archived_at: null,
  },
  transaction: {
    id: transactionId,
    operation_id: operationId,
    ledger_id: ledgerId,
    type: 'expense',
    amount_cents: 6_800,
    category_id: '00000000-0000-4000-8000-000000000105',
    occurred_at: '2026-07-18T08:00:00.000Z',
    note: '午餐',
    original_transaction_id: null,
    version: 2,
    deleted_at: null,
  },
  entry: {
    id: '00000000-0000-4000-8000-000000000107',
    ledger_id: ledgerId,
    transaction_id: transactionId,
    account_id: '00000000-0000-4000-8000-000000000104',
    delta_cents: -6_800,
  },
  budget: {
    id: '00000000-0000-4000-8000-000000000108',
    ledger_id: ledgerId,
    month: '2026-07-01',
    amount_cents: 300_000,
    version: 2,
    archived_at: null,
  },
  categoryBudget: {
    id: '00000000-0000-4000-8000-000000000109',
    ledger_id: ledgerId,
    category_id: '00000000-0000-4000-8000-000000000105',
    month: '2026-07-01',
    amount_cents: 100_000,
    version: 2,
    archived_at: null,
  },
  reminder: {
    id: '00000000-0000-4000-8000-000000000110',
    ledger_id: ledgerId,
    name: '还信用卡',
    amount_cents: null,
    category_id: null,
    account_id: '00000000-0000-4000-8000-000000000104',
    recurrence: 'FREQ=MONTHLY',
    next_due_at: '2026-08-01T00:00:00.000Z',
    version: 2,
    archived_at: null,
  },
} as const;

describe('LedgerApi', () => {
  it('bootstraps a personal ledger and validates its identifier', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ledgerId }, error: null });
    const api = new LedgerApi({ rpc } as never);

    await expect(api.bootstrapPersonalLedger()).resolves.toBe(ledgerId);
    expect(rpc).toHaveBeenCalledWith('v2_bootstrap_personal_ledger');

    rpc.mockResolvedValueOnce({ data: {}, error: null });
    await expect(api.bootstrapPersonalLedger())
      .rejects.toThrow('服务器返回了无法识别的同步数据');
  });

  it('passes an operation and its id to the apply RPC', async () => {
    const result = { status: 'applied', transactionId, serverVersion: 2 };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    const api = new LedgerApi({ rpc } as never);

    await expect(api.applyOperation(operation)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith('v2_apply_operation', {
      p_operation_id: operationId,
      p_payload: operation,
    });
  });

  it('maps conflict results to the stable result type', async () => {
    const result = {
      status: 'conflict',
      transactionId,
      server: { version: 2 },
      local: operation,
    };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });

    await expect(new LedgerApi({ rpc } as never).applyOperation(operation)).resolves.toEqual(result);
  });

  it('maps every pull entity from database fields to exact local record fields', async () => {
    const entityTypes = Object.keys(records) as Array<keyof typeof records>;
    const rpc = vi.fn().mockResolvedValue({
      data: {
        nextCursor: 12,
        changes: entityTypes.map((entityType, index) => ({
          changeSeq: index + 1,
          entityType,
          entityId: records[entityType].id,
          version: entityType === 'profile' ? 1 : 2,
          tombstone: entityType === 'entry',
          record: records[entityType],
        })),
      },
      error: null,
    });
    const api = new LedgerApi({ rpc } as never);

    const page = await api.pullChanges(ledgerId, '0');

    expect(page).toEqual({
      nextCursor: '12',
      changes: [
        { entityType: 'profile', entityId: records.profile.id, version: 1, tombstone: false,
          record: { id: records.profile.id, displayName: '海风', settings: { weekStartsOn: 1 } } },
        { entityType: 'ledger', entityId: ledgerId, version: 2, tombstone: false,
          record: { id: ledgerId, ownerUserId: records.ledger.owner_user_id, name: '家庭账本', currency: 'CNY', version: 2 } },
        { entityType: 'member', entityId: records.member.id, version: 2, tombstone: false,
          record: { id: records.member.id, userId: records.member.user_id, ledgerId, role: 'owner', version: 3 } },
        { entityType: 'account', entityId: records.account.id, version: 2, tombstone: false,
          record: { id: records.account.id, ledgerId, name: '储蓄卡', kind: 'debit_card', accountClass: 'asset', currency: 'CNY', openingBalanceCents: 120_000, sortOrder: 4, version: 2, archivedAt: null } },
        { entityType: 'category', entityId: records.category.id, version: 2, tombstone: false,
          record: { id: records.category.id, ledgerId, name: '餐饮', kind: 'expense', iconKey: 'food', sortOrder: 1, version: 2, archivedAt: null } },
        { entityType: 'transaction', entityId: transactionId, version: 2, tombstone: false,
          record: { id: transactionId, operationId, ledgerId, type: 'expense', amountCents: 6_800, categoryId: records.transaction.category_id, occurredAt: records.transaction.occurred_at, note: '午餐', originalTransactionId: null, version: 2, deletedAt: null } },
        { entityType: 'entry', entityId: records.entry.id, version: 2, tombstone: true,
          record: { id: records.entry.id, ledgerId, transactionId, accountId: records.entry.account_id, deltaCents: -6_800 } },
        { entityType: 'budget', entityId: records.budget.id, version: 2, tombstone: false,
          record: { id: records.budget.id, ledgerId, month: '2026-07', amountCents: 300_000, version: 2, archivedAt: null } },
        { entityType: 'categoryBudget', entityId: records.categoryBudget.id, version: 2, tombstone: false,
          record: { id: records.categoryBudget.id, ledgerId, categoryId: records.categoryBudget.category_id, month: '2026-07', amountCents: 100_000, version: 2, archivedAt: null } },
        { entityType: 'reminder', entityId: records.reminder.id, version: 2, tombstone: false,
          record: { id: records.reminder.id, ledgerId, name: '还信用卡', amountCents: null, categoryId: null, accountId: records.reminder.account_id, recurrence: 'FREQ=MONTHLY', nextDueAt: records.reminder.next_due_at, version: 2, archivedAt: null } },
      ],
    });
  });

  it('passes a bigint cursor string to the pull RPC without losing precision', async () => {
    const cursor = '9223372036854775806';
    const rpc = vi.fn().mockResolvedValue({
      data: { nextCursor: '9223372036854775807', changes: [] },
      error: null,
    });
    const api = new LedgerApi({ rpc } as never);

    await expect(api.pullChanges(ledgerId, cursor)).resolves.toEqual({
      changes: [],
      nextCursor: '9223372036854775807',
    });
    expect(rpc).toHaveBeenCalledWith('v2_pull_changes', {
      p_ledger_id: ledgerId,
      p_after_seq: cursor,
    });
  });

  it.each(['', '-1', '+1', '1.5', ' 1', '1 '])(
    'rejects invalid cursor %j before calling Supabase',
    async (cursor) => {
      const rpc = vi.fn();
      const api = new LedgerApi({ rpc } as never);

      await expect(api.pullChanges(ledgerId, cursor))
        .rejects.toThrow('服务器返回了无法识别的同步数据');
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it('rejects unknown entity types and malformed RPC results', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { nextCursor: 1, changes: [{ changeSeq: 1, entityType: 'mystery', entityId: ledgerId, version: 1, tombstone: false, record: {} }] },
        error: null,
      })
      .mockResolvedValueOnce({ data: { nextCursor: 1, changes: 'not-an-array' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'applied' }, error: null });
    const api = new LedgerApi({ rpc } as never);

    await expect(api.pullChanges(ledgerId, '0'))
      .rejects.toThrow('服务器返回了无法识别的同步数据');
    await expect(api.pullChanges(ledgerId, '0'))
      .rejects.toThrow('服务器返回了无法识别的同步数据');
    await expect(api.applyOperation(operation))
      .rejects.toThrow('服务器返回了无法识别的同步数据');
  });

  it('throws RPC errors unchanged', async () => {
    const error = new Error('network failed');
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const api = new LedgerApi({ rpc } as never);

    await expect(api.bootstrapPersonalLedger()).rejects.toBe(error);
    await expect(api.applyOperation(operation)).rejects.toBe(error);
    await expect(api.pullChanges(ledgerId, '0')).rejects.toBe(error);
  });
});
