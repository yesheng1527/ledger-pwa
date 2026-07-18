import type { ServerChange } from '../db/records';
import type { LedgerOperation } from '../domain/operations';
import type {
  Account,
  Budget,
  Category,
  CategoryBudget,
  LedgerEntryRecord,
  Reminder,
  Transaction,
} from '../domain/types';
import { getSupabaseClient } from './supabase';

export type ApplyOperationResult =
  | { status: 'applied'; transactionId?: string; entityId?: string; serverVersion: number }
  | { status: 'conflict'; transactionId?: string; server: unknown; local: unknown };

export interface PullChangesResult {
  changes: ServerChange[];
  nextCursor: string;
}

interface LedgerRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

const INVALID_SYNC_DATA = '服务器返回了无法识别的同步数据';

function invalidSyncData(): never {
  throw new Error(INVALID_SYNC_DATA);
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidSyncData();
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return invalidSyncData();
  return value;
}

function nullableStringValue(value: unknown): string | null {
  if (value === null) return null;
  return stringValue(value);
}

function integerValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return invalidSyncData();
  return value;
}

function nonNegativeIntegerValue(value: unknown): number {
  const integer = integerValue(value);
  if (integer < 0) return invalidSyncData();
  return integer;
}

function positiveIntegerValue(value: unknown): number {
  const integer = integerValue(value);
  if (integer <= 0) return invalidSyncData();
  return integer;
}

function nullableIntegerValue(value: unknown): number | null {
  if (value === null) return null;
  return integerValue(value);
}

function literalValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) return invalidSyncData();
  return value as T[number];
}

function monthValue(value: unknown): string {
  const month = stringValue(value);
  const match = /^(\d{4}-(?:0[1-9]|1[0-2]))(?:-01)?$/.exec(month);
  if (!match) return invalidSyncData();
  return match[1];
}

function cursorValue(value: unknown): string {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return invalidSyncData();
}

function mapProfile(value: unknown) {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    displayName: stringValue(record.display_name),
    settings: objectValue(record.settings),
  };
}

function mapLedger(value: unknown) {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ownerUserId: stringValue(record.owner_user_id),
    name: stringValue(record.name),
    currency: literalValue(record.currency, ['CNY'] as const),
    version: positiveIntegerValue(record.version),
  };
}

function mapMember(value: unknown) {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    userId: stringValue(record.user_id),
    ledgerId: stringValue(record.ledger_id),
    role: literalValue(record.role, ['owner', 'member'] as const),
    version: positiveIntegerValue(record.version),
  };
}

function mapAccount(value: unknown): Account {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    name: stringValue(record.name),
    kind: literalValue(record.kind, ['cash', 'wechat', 'alipay', 'debit_card', 'credit_card', 'custom'] as const),
    accountClass: literalValue(record.account_class, ['asset', 'liability'] as const),
    currency: literalValue(record.currency, ['CNY'] as const),
    openingBalanceCents: integerValue(record.opening_balance_cents),
    sortOrder: nonNegativeIntegerValue(record.sort_order),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableStringValue(record.archived_at),
  };
}

function mapCategory(value: unknown): Category {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    name: stringValue(record.name),
    kind: literalValue(record.kind, ['expense', 'income'] as const),
    iconKey: stringValue(record.icon_key),
    sortOrder: nonNegativeIntegerValue(record.sort_order),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableStringValue(record.archived_at),
  };
}

function mapTransaction(value: unknown): Transaction {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    operationId: stringValue(record.operation_id),
    ledgerId: stringValue(record.ledger_id),
    type: literalValue(record.type, ['expense', 'income', 'transfer', 'refund', 'adjustment'] as const),
    amountCents: positiveIntegerValue(record.amount_cents),
    categoryId: nullableStringValue(record.category_id),
    occurredAt: stringValue(record.occurred_at),
    note: typeof record.note === 'string' ? record.note : invalidSyncData(),
    originalTransactionId: nullableStringValue(record.original_transaction_id),
    version: positiveIntegerValue(record.version),
    deletedAt: nullableStringValue(record.deleted_at),
  };
}

function mapEntry(value: unknown): LedgerEntryRecord {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    transactionId: stringValue(record.transaction_id),
    accountId: stringValue(record.account_id),
    deltaCents: integerValue(record.delta_cents),
  };
}

function mapBudget(value: unknown): Budget {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    month: monthValue(record.month),
    amountCents: positiveIntegerValue(record.amount_cents),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableStringValue(record.archived_at),
  };
}

function mapCategoryBudget(value: unknown): CategoryBudget {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    categoryId: stringValue(record.category_id),
    month: monthValue(record.month),
    amountCents: positiveIntegerValue(record.amount_cents),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableStringValue(record.archived_at),
  };
}

function mapReminder(value: unknown): Reminder {
  const record = objectValue(value);
  return {
    id: stringValue(record.id),
    ledgerId: stringValue(record.ledger_id),
    name: stringValue(record.name),
    amountCents: nullableIntegerValue(record.amount_cents),
    categoryId: nullableStringValue(record.category_id),
    accountId: nullableStringValue(record.account_id),
    recurrence: stringValue(record.recurrence),
    nextDueAt: stringValue(record.next_due_at),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableStringValue(record.archived_at),
  };
}

function mapChange(value: unknown): ServerChange {
  const change = objectValue(value);
  cursorValue(change.changeSeq);
  const entityId = stringValue(change.entityId);
  const version = positiveIntegerValue(change.version);
  if (typeof change.tombstone !== 'boolean') return invalidSyncData();
  const tombstone = change.tombstone;

  switch (change.entityType) {
    case 'profile':
      return { entityType: 'profile', entityId, version, tombstone, record: mapProfile(change.record) };
    case 'ledger':
      return { entityType: 'ledger', entityId, version, tombstone, record: mapLedger(change.record) };
    case 'member':
      return { entityType: 'member', entityId, version, tombstone, record: mapMember(change.record) };
    case 'account':
      return { entityType: 'account', entityId, version, tombstone, record: mapAccount(change.record) };
    case 'category':
      return { entityType: 'category', entityId, version, tombstone, record: mapCategory(change.record) };
    case 'transaction':
      return { entityType: 'transaction', entityId, version, tombstone, record: mapTransaction(change.record) };
    case 'entry':
      return { entityType: 'entry', entityId, version, tombstone, record: mapEntry(change.record) };
    case 'budget':
      return { entityType: 'budget', entityId, version, tombstone, record: mapBudget(change.record) };
    case 'categoryBudget':
      return { entityType: 'categoryBudget', entityId, version, tombstone, record: mapCategoryBudget(change.record) };
    case 'reminder':
      return { entityType: 'reminder', entityId, version, tombstone, record: mapReminder(change.record) };
    default:
      return invalidSyncData();
  }
}

function mapApplyOperationResult(value: unknown): ApplyOperationResult {
  const result = objectValue(value);
  if (result.status === 'applied') {
    const mapped: ApplyOperationResult = {
      status: 'applied',
      serverVersion: positiveIntegerValue(result.serverVersion),
    };
    if (result.transactionId !== undefined) mapped.transactionId = stringValue(result.transactionId);
    if (result.entityId !== undefined) mapped.entityId = stringValue(result.entityId);
    return mapped;
  }
  if (result.status === 'conflict') {
    if (!Object.hasOwn(result, 'server') || !Object.hasOwn(result, 'local')) return invalidSyncData();
    const mapped: ApplyOperationResult = {
      status: 'conflict',
      server: result.server,
      local: result.local,
    };
    if (result.transactionId !== undefined) mapped.transactionId = stringValue(result.transactionId);
    return mapped;
  }
  return invalidSyncData();
}

export class LedgerApi {
  private readonly client: LedgerRpcClient;

  constructor(client: LedgerRpcClient = getSupabaseClient() as LedgerRpcClient) {
    this.client = client;
  }

  async bootstrapPersonalLedger(): Promise<string> {
    const { data, error } = await this.client.rpc('v2_bootstrap_personal_ledger');
    if (error) throw error;
    return stringValue(objectValue(data).ledgerId);
  }

  async applyOperation(operation: LedgerOperation): Promise<ApplyOperationResult> {
    const { data, error } = await this.client.rpc('v2_apply_operation', {
      p_operation_id: operation.operationId,
      p_payload: operation,
    });
    if (error) throw error;
    return mapApplyOperationResult(data);
  }

  async pullChanges(ledgerId: string, afterSeq: string): Promise<PullChangesResult> {
    if (!/^\d+$/.test(afterSeq)) return invalidSyncData();

    const { data, error } = await this.client.rpc('v2_pull_changes', {
      p_ledger_id: ledgerId,
      p_after_seq: afterSeq,
    });
    if (error) throw error;

    const page = objectValue(data);
    if (!Array.isArray(page.changes)) return invalidSyncData();
    return {
      changes: page.changes.map(mapChange),
      nextCursor: cursorValue(page.nextCursor),
    };
  }
}
