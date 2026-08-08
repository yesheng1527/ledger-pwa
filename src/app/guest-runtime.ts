import { LedgerDatabase } from '../db/local-db';
import { LocalLedgerRepository } from '../db/local-repository';
import type { Account, Budget, Category, LedgerEntryRecord, Transaction } from '../domain/types';
import { encodeTransactionText } from '../domain/transaction-text';
import { LedgerViewModel } from '../view-model/ledger-view-model';

export const GUEST_DATABASE_NAME = 'seabreeze-ledger-guest-v1';
export const GUEST_LEDGER_ID = '10000000-0000-4000-8000-000000000001';
const GUEST_USER_ID = '10000000-0000-4000-8000-000000000002';

const ids = {
  cash: '10000000-0000-4000-8000-000000000101',
  bank: '10000000-0000-4000-8000-000000000102',
  credit: '10000000-0000-4000-8000-000000000103',
  food: '10000000-0000-4000-8000-000000000201',
  transport: '10000000-0000-4000-8000-000000000202',
  salary: '10000000-0000-4000-8000-000000000203',
};

function fixture(now: Date) {
  const accounts: Account[] = [
    { id: ids.cash, ledgerId: GUEST_LEDGER_ID, name: '现金', kind: 'cash', accountClass: 'asset', currency: 'CNY', openingBalanceCents: 88000, sortOrder: 0, version: 1, archivedAt: null },
    { id: ids.bank, ledgerId: GUEST_LEDGER_ID, name: '海风储蓄卡', kind: 'debit_card', accountClass: 'asset', currency: 'CNY', openingBalanceCents: 520000, sortOrder: 1, version: 1, archivedAt: null },
    { id: ids.credit, ledgerId: GUEST_LEDGER_ID, name: '旅行信用卡', kind: 'credit_card', accountClass: 'liability', currency: 'CNY', openingBalanceCents: 12600, sortOrder: 2, version: 1, archivedAt: null },
  ];
  const categories: Category[] = [
    { id: ids.food, ledgerId: GUEST_LEDGER_ID, name: '餐饮', kind: 'expense', iconKey: 'food', sortOrder: 0, version: 1, archivedAt: null },
    { id: ids.transport, ledgerId: GUEST_LEDGER_ID, name: '交通', kind: 'expense', iconKey: 'transport', sortOrder: 1, version: 1, archivedAt: null },
    { id: ids.salary, ledgerId: GUEST_LEDGER_ID, name: '工资', kind: 'income', iconKey: 'income', sortOrder: 0, version: 1, archivedAt: null },
  ];
  const transaction = (suffix: number, type: 'expense' | 'income', amountCents: number, accountId: string, categoryId: string, daysAgo: number, name: string, note: string) => {
    const id = `10000000-0000-4000-8000-${String(300 + suffix).padStart(12, '0')}`;
    const occurredAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12 + suffix).toISOString();
    const row: Transaction = { id, operationId: id, ledgerId: GUEST_LEDGER_ID, type, amountCents, categoryId, occurredAt, note: encodeTransactionText(id, name, note), originalTransactionId: null, version: 1, deletedAt: null };
    const entry: LedgerEntryRecord = { id: `${id}:0`, ledgerId: GUEST_LEDGER_ID, transactionId: id, accountId, deltaCents: type === 'expense' ? (accountId === ids.credit ? amountCents : -amountCents) : amountCents };
    return { row, entry };
  };
  const samples = [
    transaction(1, 'income', 680000, ids.bank, ids.salary, 6, '本月工资', '游客示例数据'),
    transaction(2, 'expense', 3860, ids.cash, ids.food, 1, '海边午餐', '和朋友一起'),
    transaction(3, 'expense', 450, ids.credit, ids.transport, 0, '地铁通勤', ''),
  ];
  const budget: Budget = { id: '10000000-0000-4000-8000-000000000401', ledgerId: GUEST_LEDGER_ID, month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, amountCents: 300000, version: 1, archivedAt: null };
  return { accounts, categories, transactions: samples.map((item) => item.row), entries: samples.map((item) => item.entry), budget };
}

export async function createGuestLedgerViewModel(now = new Date()): Promise<LedgerViewModel> {
  const db = new LedgerDatabase(GUEST_DATABASE_NAME);
  const repository = new LocalLedgerRepository(db);
  const current = await db.ledgers.get(GUEST_LEDGER_ID);
  if (!current) {
    const sample = fixture(now);
    await db.transaction('rw', [db.profiles, db.ledgers, db.members, db.accounts, db.categories, db.transactions, db.entries, db.budgets], async () => {
      await db.profiles.put({ id: GUEST_USER_ID, displayName: '游客', settings: { guest: true } });
      await db.ledgers.put({ id: GUEST_LEDGER_ID, ownerUserId: GUEST_USER_ID, name: '游客演示账本', currency: 'CNY', version: 1 });
      await db.members.put({ id: '10000000-0000-4000-8000-000000000003', userId: GUEST_USER_ID, ledgerId: GUEST_LEDGER_ID, role: 'owner', version: 1 });
      await db.accounts.bulkPut(sample.accounts);
      await db.categories.bulkPut(sample.categories);
      await db.transactions.bulkPut(sample.transactions);
      await db.entries.bulkPut(sample.entries);
      await db.budgets.put(sample.budget);
    });
  }
  return new LedgerViewModel({
    ledgerId: GUEST_LEDGER_ID,
    repository,
    async saveOperation(operation) {
      await repository.saveOperation(operation);
      await repository.markOperationSynced(operation.operationId);
    },
    async syncNow() {},
    now: () => new Date(),
    makeUuid: () => crypto.randomUUID(),
  });
}
