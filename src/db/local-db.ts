import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Budget,
  Category,
  CategoryBudget,
  LedgerEntryRecord,
  Reminder,
  Transaction,
} from '../domain/types';
import type {
  ConflictRecord,
  LedgerMemberRecord,
  LedgerRecord,
  OutboxRecord,
  ProfileRecord,
  RestoreReceiptRecord,
  SyncMetaRecord,
} from './records';

export class LedgerDatabase extends Dexie {
  profiles!: Table<ProfileRecord, string>;
  ledgers!: Table<LedgerRecord, string>;
  members!: Table<LedgerMemberRecord, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  entries!: Table<LedgerEntryRecord, string>;
  budgets!: Table<Budget, string>;
  categoryBudgets!: Table<CategoryBudget, string>;
  reminders!: Table<Reminder, string>;
  outbox!: Table<OutboxRecord, string>;
  conflicts!: Table<ConflictRecord, string>;
  restoreReceipts!: Table<RestoreReceiptRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor(name = 'seabreeze-ledger-v2') {
    super(name);
    this.version(1).stores({
      profiles: 'id',
      ledgers: 'id, ownerUserId',
      members: 'id, userId, ledgerId, [userId+ledgerId]',
      accounts: 'id, ledgerId, archivedAt',
      categories: 'id, ledgerId, kind, sortOrder, archivedAt',
      transactions: 'id, operationId, ledgerId, occurredAt, type, deletedAt',
      entries: 'id, ledgerId, transactionId, accountId',
      budgets: 'id, ledgerId, month',
      categoryBudgets: 'id, ledgerId, month, categoryId',
      reminders: 'id, ledgerId, nextDueAt, archivedAt',
      outbox: 'operationId, ledgerId, createdAt, notBefore, status',
      conflicts: 'id, ledgerId, entityId, createdAt',
      restoreReceipts: 'restoreId, ledgerId, completedAt',
      syncMeta: 'key, ledgerId',
    });
  }
}
