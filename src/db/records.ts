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
  transactionId: string;
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

export type ServerChange =
  | { entityType: 'profile'; record: ProfileRecord }
  | { entityType: 'ledger'; record: LedgerRecord }
  | { entityType: 'member'; record: LedgerMemberRecord }
  | { entityType: 'account'; record: Account }
  | { entityType: 'category'; record: Category }
  | { entityType: 'transaction'; record: Transaction }
  | { entityType: 'entry'; record: LedgerEntryRecord }
  | { entityType: 'budget'; record: Budget }
  | { entityType: 'categoryBudget'; record: CategoryBudget }
  | { entityType: 'reminder'; record: Reminder };
