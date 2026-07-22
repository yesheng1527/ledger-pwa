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

export interface ProfileRecord {
  id: string;
  displayName: string;
  settings: Record<string, unknown>;
}

export interface LedgerRecord {
  id: string;
  ownerUserId: string;
  name: string;
  currency: 'CNY';
  version: number;
}

export interface LedgerMemberRecord {
  id: string;
  userId: string;
  ledgerId: string;
  role: 'owner' | 'member';
  version: number;
}

export interface OutboxRecord {
  operationId: string;
  ledgerId: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'conflict';
  payload: LedgerOperation;
  notBefore: string | null;
  lastError: string | null;
}

export interface ConflictRecord {
  id: string;
  ledgerId: string;
  entityId: string;
  operation: LedgerOperation;
  serverRecord: unknown;
  createdAt: string;
}

export interface RestoreReceiptRecord {
  restoreId: string;
  ledgerId: string;
  completedAt: string;
}

export interface SyncMetaRecord {
  key: string;
  ledgerId: string;
  value: string;
}

export interface LocalLedgerSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  profiles: ProfileRecord[];
  ledgers: LedgerRecord[];
  members: LedgerMemberRecord[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntryRecord[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
  reminders: Reminder[];
  outbox: OutboxRecord[];
  conflicts: ConflictRecord[];
  restoreReceipts: RestoreReceiptRecord[];
  syncMeta: SyncMetaRecord[];
}

export interface LedgerReadSnapshot {
  ledgerId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  entries: LedgerEntryRecord[];
  budgets: Budget[];
  categoryBudgets: CategoryBudget[];
}

type ChangeMeta = { entityId: string; version: number; tombstone: boolean };
export type ServerChange =
  | (ChangeMeta & { entityType: 'profile'; record: ProfileRecord })
  | (ChangeMeta & { entityType: 'ledger'; record: LedgerRecord })
  | (ChangeMeta & { entityType: 'member'; record: LedgerMemberRecord })
  | (ChangeMeta & { entityType: 'account'; record: Account })
  | (ChangeMeta & { entityType: 'category'; record: Category })
  | (ChangeMeta & { entityType: 'transaction'; record: Transaction })
  | (ChangeMeta & { entityType: 'entry'; record: LedgerEntryRecord })
  | (ChangeMeta & { entityType: 'budget'; record: Budget })
  | (ChangeMeta & { entityType: 'categoryBudget'; record: CategoryBudget })
  | (ChangeMeta & { entityType: 'reminder'; record: Reminder });
