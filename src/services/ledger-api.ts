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
import { z } from 'zod';
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
const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

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

function uuidValue(value: unknown): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) return invalidSyncData();
  return result.data;
}

function nullableUuidValue(value: unknown): string | null {
  if (value === null) return null;
  return uuidValue(value);
}

function timestampValue(value: unknown): string {
  const result = timestampSchema.safeParse(value);
  if (!result.success) return invalidSyncData();
  return result.data;
}

function nullableTimestampValue(value: unknown): string | null {
  if (value === null) return null;
  return timestampValue(value);
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

function nonzeroIntegerValue(value: unknown): number {
  const integer = integerValue(value);
  if (integer === 0) return invalidSyncData();
  return integer;
}

function nullablePositiveIntegerValue(value: unknown): number | null {
  if (value === null) return null;
  return positiveIntegerValue(value);
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
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)) return value;
  return invalidSyncData();
}

function compareDecimalStrings(left: string, right: string): number {
  const normalizedLeft = left.replace(/^0+(?=\d)/, '');
  const normalizedRight = right.replace(/^0+(?=\d)/, '');
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  if (normalizedLeft === normalizedRight) return 0;
  return normalizedLeft < normalizedRight ? -1 : 1;
}

function mapProfile(value: unknown) {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    displayName: stringValue(record.display_name),
    settings: objectValue(record.settings),
  };
}

function mapLedger(value: unknown) {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ownerUserId: uuidValue(record.owner_user_id),
    name: stringValue(record.name),
    currency: literalValue(record.currency, ['CNY'] as const),
    version: positiveIntegerValue(record.version),
  };
}

function mapMember(value: unknown) {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    userId: uuidValue(record.user_id),
    ledgerId: uuidValue(record.ledger_id),
    role: literalValue(record.role, ['owner', 'member'] as const),
    version: positiveIntegerValue(record.version),
  };
}

function mapAccount(value: unknown): Account {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    name: stringValue(record.name),
    kind: literalValue(record.kind, ['cash', 'wechat', 'alipay', 'debit_card', 'credit_card', 'custom'] as const),
    accountClass: literalValue(record.account_class, ['asset', 'liability'] as const),
    currency: literalValue(record.currency, ['CNY'] as const),
    openingBalanceCents: integerValue(record.opening_balance_cents),
    sortOrder: nonNegativeIntegerValue(record.sort_order),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableTimestampValue(record.archived_at),
  };
}

function mapCategory(value: unknown): Category {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    name: stringValue(record.name),
    kind: literalValue(record.kind, ['expense', 'income'] as const),
    iconKey: stringValue(record.icon_key),
    sortOrder: nonNegativeIntegerValue(record.sort_order),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableTimestampValue(record.archived_at),
  };
}

function mapTransaction(value: unknown): Transaction {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    operationId: uuidValue(record.operation_id),
    ledgerId: uuidValue(record.ledger_id),
    type: literalValue(record.type, ['expense', 'income', 'transfer', 'refund', 'adjustment'] as const),
    amountCents: positiveIntegerValue(record.amount_cents),
    categoryId: nullableUuidValue(record.category_id),
    occurredAt: timestampValue(record.occurred_at),
    note: typeof record.note === 'string' ? record.note : invalidSyncData(),
    originalTransactionId: nullableUuidValue(record.original_transaction_id),
    version: positiveIntegerValue(record.version),
    deletedAt: nullableTimestampValue(record.deleted_at),
  };
}

function mapEntry(value: unknown): LedgerEntryRecord {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    transactionId: uuidValue(record.transaction_id),
    accountId: uuidValue(record.account_id),
    deltaCents: nonzeroIntegerValue(record.delta_cents),
  };
}

function mapBudget(value: unknown): Budget {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    month: monthValue(record.month),
    amountCents: positiveIntegerValue(record.amount_cents),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableTimestampValue(record.archived_at),
  };
}

function mapCategoryBudget(value: unknown): CategoryBudget {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    categoryId: uuidValue(record.category_id),
    month: monthValue(record.month),
    amountCents: positiveIntegerValue(record.amount_cents),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableTimestampValue(record.archived_at),
  };
}

function mapReminder(value: unknown): Reminder {
  const record = objectValue(value);
  return {
    id: uuidValue(record.id),
    ledgerId: uuidValue(record.ledger_id),
    name: stringValue(record.name),
    amountCents: nullablePositiveIntegerValue(record.amount_cents),
    categoryId: nullableUuidValue(record.category_id),
    accountId: nullableUuidValue(record.account_id),
    recurrence: stringValue(record.recurrence),
    nextDueAt: timestampValue(record.next_due_at),
    version: positiveIntegerValue(record.version),
    archivedAt: nullableTimestampValue(record.archived_at),
  };
}

type EnvelopeRecord = { id: string; ledgerId?: string; version?: number };

function validateEnvelope(
  record: EnvelopeRecord,
  entityId: string,
  version: number,
  requestedLedgerId: string,
  ledgerScope: 'none' | 'record' | 'identity',
  versioned: boolean,
): void {
  if (record.id !== entityId) return invalidSyncData();
  if (ledgerScope === 'record' && record.ledgerId !== requestedLedgerId) return invalidSyncData();
  if (ledgerScope === 'identity' && record.id !== requestedLedgerId) return invalidSyncData();
  if (versioned && record.version !== version) return invalidSyncData();
}

interface MappedChange {
  changeSeq: string;
  change: ServerChange;
}

function mapChange(value: unknown, requestedLedgerId: string): MappedChange {
  const change = objectValue(value);
  const changeSeq = cursorValue(change.changeSeq);
  const entityId = uuidValue(change.entityId);
  const version = positiveIntegerValue(change.version);
  if (typeof change.tombstone !== 'boolean') return invalidSyncData();
  const tombstone = change.tombstone;

  switch (change.entityType) {
    case 'profile': {
      const record = mapProfile(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'none', false);
      return { changeSeq, change: { entityType: 'profile', entityId, version, tombstone, record } };
    }
    case 'ledger': {
      const record = mapLedger(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'identity', true);
      return { changeSeq, change: { entityType: 'ledger', entityId, version, tombstone, record } };
    }
    case 'member': {
      const record = mapMember(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'member', entityId, version, tombstone, record } };
    }
    case 'account': {
      const record = mapAccount(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'account', entityId, version, tombstone, record } };
    }
    case 'category': {
      const record = mapCategory(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'category', entityId, version, tombstone, record } };
    }
    case 'transaction': {
      const record = mapTransaction(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'transaction', entityId, version, tombstone, record } };
    }
    case 'entry': {
      const record = mapEntry(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', false);
      return { changeSeq, change: { entityType: 'entry', entityId, version, tombstone, record } };
    }
    case 'budget': {
      const record = mapBudget(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'budget', entityId, version, tombstone, record } };
    }
    case 'categoryBudget': {
      const record = mapCategoryBudget(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'categoryBudget', entityId, version, tombstone, record } };
    }
    case 'reminder': {
      const record = mapReminder(change.record);
      validateEnvelope(record, entityId, version, requestedLedgerId, 'record', true);
      return { changeSeq, change: { entityType: 'reminder', entityId, version, tombstone, record } };
    }
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
    if (result.transactionId !== undefined) mapped.transactionId = uuidValue(result.transactionId);
    if (result.entityId !== undefined) mapped.entityId = uuidValue(result.entityId);
    return mapped;
  }
  if (result.status === 'conflict') {
    if (!Object.hasOwn(result, 'server') || !Object.hasOwn(result, 'local')) return invalidSyncData();
    const mapped: ApplyOperationResult = {
      status: 'conflict',
      server: result.server,
      local: result.local,
    };
    if (result.transactionId !== undefined) mapped.transactionId = uuidValue(result.transactionId);
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
    return uuidValue(objectValue(data).ledgerId);
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
    const requestedLedgerId = uuidValue(ledgerId);
    const requestedCursor = cursorValue(afterSeq);

    const { data, error } = await this.client.rpc('v2_pull_changes', {
      p_ledger_id: requestedLedgerId,
      p_after_seq: afterSeq,
    });
    if (error) throw error;

    const page = objectValue(data);
    if (!Array.isArray(page.changes)) return invalidSyncData();
    const nextCursor = cursorValue(page.nextCursor);
    let previousCursor = requestedCursor;
    const changes: ServerChange[] = [];
    for (const rawChange of page.changes) {
      const mapped = mapChange(rawChange, requestedLedgerId);
      if (compareDecimalStrings(mapped.changeSeq, previousCursor) <= 0) return invalidSyncData();
      previousCursor = mapped.changeSeq;
      changes.push(mapped.change);
    }

    if (changes.length === 0) {
      if (nextCursor !== requestedCursor) return invalidSyncData();
    } else if (nextCursor !== previousCursor) {
      return invalidSyncData();
    }

    return {
      changes,
      nextCursor,
    };
  }
}
