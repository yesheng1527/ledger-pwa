import { validateOperation, type LedgerOperation } from '../domain/operations';
import type {
  Account,
  Budget,
  Category,
  CategoryBudget,
  LedgerEntryRecord,
  Reminder,
  Transaction,
} from '../domain/types';
import type { LedgerReadSnapshot } from '../db/records';
import type { TransactionFilters } from '../view-model/types';

const ids = {
  ledger: '00000000-0000-4000-8000-000000000001',
  otherLedger: '00000000-0000-4000-8000-000000000002',
  bank: '00000000-0000-4000-8000-000000000101',
  cash: '00000000-0000-4000-8000-000000000102',
  credit: '00000000-0000-4000-8000-000000000103',
  archivedAccount: '00000000-0000-4000-8000-000000000104',
  otherLedgerAccount: '00000000-0000-4000-8000-000000000105',
  foodCategory: '00000000-0000-4000-8000-000000000201',
  transportCategory: '00000000-0000-4000-8000-000000000202',
  shoppingCategory: '00000000-0000-4000-8000-000000000203',
  entertainmentCategory: '00000000-0000-4000-8000-000000000204',
  archivedCategory: '00000000-0000-4000-8000-000000000205',
  incomeCategory: '00000000-0000-4000-8000-000000000206',
  housingCategory: '00000000-0000-4000-8000-000000000210',
  dailyCategory: '00000000-0000-4000-8000-000000000211',
  studyCategory: '00000000-0000-4000-8000-000000000212',
  medicalCategory: '00000000-0000-4000-8000-000000000213',
  travelCategory: '00000000-0000-4000-8000-000000000214',
  otherCategory: '00000000-0000-4000-8000-000000000215',
  otherLedgerCategory: '00000000-0000-4000-8000-000000000209',
  incomeTransaction: '00000000-0000-4000-8000-000000000301',
  shoppingTransaction: '00000000-0000-4000-8000-000000000302',
  refundTransaction: '00000000-0000-4000-8000-000000000303',
  foodTransaction: '00000000-0000-4000-8000-000000000304',
  transferTransaction: '00000000-0000-4000-8000-000000000305',
  adjustmentTransaction: '00000000-0000-4000-8000-000000000306',
  deletedTransaction: '00000000-0000-4000-8000-000000000307',
  juneTransaction: '00000000-0000-4000-8000-000000000308',
  otherLedgerTransaction: '00000000-0000-4000-8000-000000000309',
} as const;

export const fixtureNow = new Date(2026, 6, 18, 20);

export const fixtureIds = {
  ledger: ids.ledger,
  bank: ids.bank,
  cash: ids.cash,
  credit: ids.credit,
  archivedAccount: ids.archivedAccount,
  foodCategory: ids.foodCategory,
  archivedCategory: ids.archivedCategory,
  incomeCategory: ids.incomeCategory,
  shoppingTransaction: ids.shoppingTransaction,
  transferTransaction: ids.transferTransaction,
  foodTransaction: ids.foodTransaction,
};

export const fixtureTimes = {
  todayExpense: new Date(2026, 6, 18, 12).toISOString(),
};

export const defaultFilters: TransactionFilters = {
  month: '2026-07',
  accountId: null,
  date: null,
  categoryId: null,
  query: '',
};

const archivedAt = new Date(2026, 5, 1, 8).toISOString();

const accounts: Account[] = [
  {
    id: ids.bank,
    ledgerId: ids.ledger,
    name: '储蓄卡',
    kind: 'debit_card',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 300000,
    sortOrder: 1,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.cash,
    ledgerId: ids.ledger,
    name: '现金',
    kind: 'cash',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 20000,
    sortOrder: 2,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.credit,
    ledgerId: ids.ledger,
    name: '信用卡',
    kind: 'credit_card',
    accountClass: 'liability',
    currency: 'CNY',
    openingBalanceCents: 50000,
    sortOrder: 3,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.archivedAccount,
    ledgerId: ids.ledger,
    name: '已归档账户',
    kind: 'custom',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 0,
    sortOrder: 4,
    version: 2,
    archivedAt,
  },
  {
    id: ids.otherLedgerAccount,
    ledgerId: ids.otherLedger,
    name: '其他账本账户',
    kind: 'cash',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 999900,
    sortOrder: 1,
    version: 1,
    archivedAt: null,
  },
];

const categories: Category[] = [
  {
    id: ids.transportCategory,
    ledgerId: ids.ledger,
    name: '交通',
    kind: 'expense',
    iconKey: 'transport',
    sortOrder: 20,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.entertainmentCategory,
    ledgerId: ids.ledger,
    name: '娱乐',
    kind: 'expense',
    iconKey: 'entertainment',
    sortOrder: 50,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.shoppingCategory,
    ledgerId: ids.ledger,
    name: '购物',
    kind: 'expense',
    iconKey: 'shopping',
    sortOrder: 30,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.foodCategory,
    ledgerId: ids.ledger,
    name: '餐饮',
    kind: 'expense',
    iconKey: 'food',
    sortOrder: 10,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.archivedCategory,
    ledgerId: ids.ledger,
    name: '已归档分类',
    kind: 'expense',
    iconKey: 'other',
    sortOrder: 0,
    version: 2,
    archivedAt,
  },
  {
    id: ids.housingCategory,
    ledgerId: ids.ledger,
    name: '住房',
    kind: 'expense',
    iconKey: 'housing',
    sortOrder: 40,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.dailyCategory,
    ledgerId: ids.ledger,
    name: '日用',
    kind: 'expense',
    iconKey: 'daily',
    sortOrder: 60,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.studyCategory,
    ledgerId: ids.ledger,
    name: '学习',
    kind: 'expense',
    iconKey: 'study',
    sortOrder: 70,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.medicalCategory,
    ledgerId: ids.ledger,
    name: '医疗',
    kind: 'expense',
    iconKey: 'medical',
    sortOrder: 80,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.travelCategory,
    ledgerId: ids.ledger,
    name: '旅行',
    kind: 'expense',
    iconKey: 'travel',
    sortOrder: 90,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.otherCategory,
    ledgerId: ids.ledger,
    name: '其他',
    kind: 'expense',
    iconKey: 'other',
    sortOrder: 100,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.incomeCategory,
    ledgerId: ids.ledger,
    name: '工资',
    kind: 'income',
    iconKey: 'salary',
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.otherLedgerCategory,
    ledgerId: ids.otherLedger,
    name: 'Foreign category',
    kind: 'expense',
    iconKey: 'other',
    sortOrder: 1,
    version: 1,
    archivedAt: null,
  },
];

function transaction(
  id: string,
  type: Transaction['type'],
  amountCents: number,
  occurredAt: Date,
  note: string,
  categoryId: string | null,
  originalTransactionId: string | null = null,
  deletedAt: string | null = null,
): Transaction {
  return {
    id,
    operationId: id.replace('0003', '0004'),
    ledgerId: ids.ledger,
    type,
    amountCents,
    categoryId,
    occurredAt: occurredAt.toISOString(),
    note,
    originalTransactionId,
    version: 1,
    deletedAt,
  };
}

const transactions: Transaction[] = [
  transaction(
    ids.incomeTransaction,
    'income',
    100000,
    new Date(2026, 6, 1, 9),
    'July PAYCHECK',
    ids.incomeCategory,
  ),
  transaction(
    ids.shoppingTransaction,
    'expense',
    20000,
    new Date(2026, 6, 17, 14),
    '买衣服',
    ids.shoppingCategory,
  ),
  transaction(
    ids.refundTransaction,
    'refund',
    2000,
    new Date(2026, 6, 17, 16),
    '购物退款',
    ids.shoppingCategory,
    ids.shoppingTransaction,
  ),
  transaction(
    ids.foodTransaction,
    'expense',
    5000,
    new Date(2026, 6, 18, 12),
    '午餐',
    ids.foodCategory,
  ),
  transaction(
    ids.transferTransaction,
    'transfer',
    10000,
    new Date(2026, 6, 18, 11),
    '取现',
    null,
  ),
  transaction(
    ids.adjustmentTransaction,
    'adjustment',
    3000,
    new Date(2026, 6, 18, 10),
    '余额校准',
    null,
  ),
  transaction(
    ids.deletedTransaction,
    'expense',
    9900,
    new Date(2026, 6, 18, 16),
    '已删除流水',
    ids.foodCategory,
    null,
    new Date(2026, 6, 18, 17).toISOString(),
  ),
  transaction(
    ids.juneTransaction,
    'transfer',
    1000,
    new Date(2026, 5, 30, 18),
    '六月转账',
    null,
  ),
  {
    id: ids.otherLedgerTransaction,
    operationId: '00000000-0000-4000-8000-000000000409',
    ledgerId: ids.otherLedger,
    type: 'expense',
    amountCents: 100,
    categoryId: ids.otherLedgerCategory,
    occurredAt: new Date(2026, 6, 18, 9).toISOString(),
    note: 'Foreign transaction',
    originalTransactionId: null,
    version: 1,
    deletedAt: null,
  },
];

function entry(
  suffix: number,
  transactionId: string,
  accountId: string,
  deltaCents: number,
): LedgerEntryRecord {
  return {
    id: `00000000-0000-4000-8000-${String(500 + suffix).padStart(12, '0')}`,
    ledgerId: ids.ledger,
    transactionId,
    accountId,
    deltaCents,
  };
}

const entries: LedgerEntryRecord[] = [
  entry(1, ids.incomeTransaction, ids.bank, 100000),
  entry(2, ids.shoppingTransaction, ids.credit, 20000),
  entry(3, ids.refundTransaction, ids.credit, -2000),
  entry(4, ids.foodTransaction, ids.cash, -5000),
  entry(5, ids.transferTransaction, ids.bank, -10000),
  entry(6, ids.transferTransaction, ids.cash, 10000),
  entry(7, ids.adjustmentTransaction, ids.bank, 3000),
  entry(8, ids.deletedTransaction, ids.cash, -9900),
  entry(9, ids.juneTransaction, ids.bank, -1000),
  entry(10, ids.juneTransaction, ids.cash, 1000),
  {
    id: '00000000-0000-4000-8000-000000000511',
    ledgerId: ids.otherLedger,
    transactionId: ids.otherLedgerTransaction,
    accountId: ids.otherLedgerAccount,
    deltaCents: -100,
  },
];

const budgets: Budget[] = [
  {
    id: '00000000-0000-4000-8000-000000000601',
    ledgerId: ids.ledger,
    month: '2026-07',
    amountCents: 50000,
    version: 1,
    archivedAt: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000602',
    ledgerId: ids.ledger,
    month: '2026-06',
    amountCents: 90000,
    version: 1,
    archivedAt: null,
  },
  {
    id: '00000000-0000-4000-8000-000000000603',
    ledgerId: ids.ledger,
    month: '2026-07',
    amountCents: 1,
    version: 2,
    archivedAt,
  },
  {
    id: '00000000-0000-4000-8000-000000000609',
    ledgerId: ids.otherLedger,
    month: '2026-07',
    amountCents: 1000,
    version: 1,
    archivedAt: null,
  },
];

const categoryBudgets: CategoryBudget[] = [{
  id: '00000000-0000-4000-8000-000000000709',
  ledgerId: ids.otherLedger,
  categoryId: ids.otherLedgerCategory,
  month: '2026-07',
  amountCents: 500,
  version: 1,
  archivedAt: null,
}];

const reminders: Reminder[] = [];

function baseSnapshot(): LedgerReadSnapshot {
  return {
    ledgerId: ids.ledger,
    accounts: structuredClone(accounts),
    categories: structuredClone(categories),
    transactions: structuredClone(transactions),
    entries: structuredClone(entries),
    budgets: structuredClone(budgets),
    categoryBudgets: structuredClone(categoryBudgets),
    reminders: structuredClone(reminders),
  };
}

export interface MutableLedgerFixture {
  snapshot: LedgerReadSnapshot;
  readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot>;
  watchLedger(ledgerId: string, listener: () => void): () => void;
  saveOperation(operation: LedgerOperation): Promise<void>;
  undoTransactionDelete(transactionId: string, now?: string): Promise<void>;
}

export function createMutableLedgerFixture(
  overrides: Partial<LedgerReadSnapshot> = {},
): MutableLedgerFixture {
  const listenersByLedger = new Map<string, Set<() => void>>();
  const pendingDeletes: Array<{ ledgerId: string; transaction: Transaction }> = [];
  const notifyWatchers = (ledgerId: string) => (
    listenersByLedger.get(ledgerId)?.forEach((listener) => listener())
  );
  const entryId = (transactionId: string, index: number) => (
    `${transactionId.slice(0, -2)}${String(index + 1).padStart(2, '0')}`
  );
  const fixture: MutableLedgerFixture = {
    snapshot: { ...baseSnapshot(), ...structuredClone(overrides) },
    async readLedgerSnapshot(ledgerId) {
      return structuredClone({
        ledgerId,
        accounts: fixture.snapshot.accounts.filter((item) => item.ledgerId === ledgerId),
        categories: fixture.snapshot.categories.filter((item) => item.ledgerId === ledgerId),
        transactions: fixture.snapshot.transactions.filter((item) => item.ledgerId === ledgerId),
        entries: fixture.snapshot.entries.filter((item) => item.ledgerId === ledgerId),
        budgets: fixture.snapshot.budgets.filter((item) => item.ledgerId === ledgerId),
        categoryBudgets: fixture.snapshot.categoryBudgets.filter(
          (item) => item.ledgerId === ledgerId,
        ),
        reminders: fixture.snapshot.reminders.filter((item) => item.ledgerId === ledgerId),
      });
    },
    watchLedger(ledgerId, listener) {
      const listeners = listenersByLedger.get(ledgerId) ?? new Set<() => void>();
      listeners.add(listener);
      listenersByLedger.set(ledgerId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) listenersByLedger.delete(ledgerId);
      };
    },
    async saveOperation(input) {
      const operation = validateOperation(input);
      if (operation.kind === 'transaction.create') {
        fixture.snapshot.transactions.push(structuredClone(operation.transaction));
        operation.entries.forEach((item, index) => {
          fixture.snapshot.entries.push({
            ...structuredClone(item),
            id: entryId(operation.transaction.id, index),
            ledgerId: operation.ledgerId,
            transactionId: operation.transaction.id,
          });
        });
      } else if (operation.kind === 'transaction.update') {
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.transaction)
            : item
        ));
        fixture.snapshot.entries = fixture.snapshot.entries.filter(
          (item) => (
            item.transactionId !== operation.transactionId
            || item.ledgerId !== operation.ledgerId
          ),
        );
        operation.entries.forEach((item, index) => {
          fixture.snapshot.entries.push({
            ...structuredClone(item),
            id: entryId(operation.transaction.id, index),
            ledgerId: operation.ledgerId,
            transactionId: operation.transaction.id,
          });
        });
      } else if (operation.kind === 'transaction.delete') {
        const current = fixture.snapshot.transactions.find(
          (item) => (
            item.id === operation.transactionId && item.ledgerId === operation.ledgerId
          ),
        );
        if (current && current.deletedAt === null) {
          const existingIndex = pendingDeletes.findIndex((item) => (
            item.transaction.id === operation.transactionId
            && item.ledgerId === operation.ledgerId
          ));
          if (existingIndex !== -1) pendingDeletes.splice(existingIndex, 1);
          pendingDeletes.push({
            ledgerId: operation.ledgerId,
            transaction: structuredClone(current),
          });
        }
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId && item.ledgerId === operation.ledgerId
            ? { ...item, deletedAt: operation.deletedAt, version: item.version + 1 }
            : item
        ));
      } else if (operation.kind === 'transaction.restore') {
        const pendingIndex = pendingDeletes.findIndex((item) => (
          item.transaction.id === operation.transactionId
          && item.ledgerId === operation.ledgerId
        ));
        if (pendingIndex !== -1) pendingDeletes.splice(pendingIndex, 1);
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId && item.ledgerId === operation.ledgerId
            ? { ...item, deletedAt: null, version: item.version + 1 }
            : item
        ));
      } else if (operation.kind === 'account.create') {
        fixture.snapshot.accounts.push(structuredClone(operation.account));
      } else if (operation.kind === 'account.update') {
        fixture.snapshot.accounts = fixture.snapshot.accounts.map((item) => (
          item.id === operation.accountId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.account)
            : item
        ));
      } else if (operation.kind === 'account.archive') {
        fixture.snapshot.accounts = fixture.snapshot.accounts.map((item) => (
          item.id === operation.accountId && item.ledgerId === operation.ledgerId
            ? { ...item, archivedAt: operation.archivedAt, version: item.version + 1 }
            : item
        ));
      } else if (operation.kind === 'category.create') {
        fixture.snapshot.categories.push(structuredClone(operation.category));
      } else if (operation.kind === 'category.update') {
        fixture.snapshot.categories = fixture.snapshot.categories.map((item) => (
          item.id === operation.categoryId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.category)
            : item
        ));
      } else if (operation.kind === 'budget.create') {
        fixture.snapshot.budgets.push(structuredClone(operation.budget));
      } else if (operation.kind === 'budget.update') {
        fixture.snapshot.budgets = fixture.snapshot.budgets.map((item) => (
          item.id === operation.budgetId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.budget)
            : item
        ));
      } else if (operation.kind === 'category-budget.create') {
        fixture.snapshot.categoryBudgets.push(structuredClone(operation.categoryBudget));
      } else if (operation.kind === 'category-budget.update') {
        fixture.snapshot.categoryBudgets = fixture.snapshot.categoryBudgets.map((item) => (
          item.id === operation.categoryBudgetId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.categoryBudget)
            : item
        ));
      } else if (operation.kind === 'reminder.create') {
        fixture.snapshot.reminders.push(structuredClone(operation.reminder));
      } else if (operation.kind === 'reminder.update') {
        fixture.snapshot.reminders = fixture.snapshot.reminders.map((item) => (
          item.id === operation.reminderId && item.ledgerId === operation.ledgerId
            ? structuredClone(operation.reminder)
            : item
        ));
      } else if (operation.kind === 'reminder.archive') {
        fixture.snapshot.reminders = fixture.snapshot.reminders.map((item) => (
          item.id === operation.reminderId && item.ledgerId === operation.ledgerId
            ? { ...item, archivedAt: operation.archivedAt, version: item.version + 1 }
            : item
        ));
      }
      notifyWatchers(operation.ledgerId);
    },
    async undoTransactionDelete(transactionId) {
      let pendingIndex = -1;
      for (let index = pendingDeletes.length - 1; index >= 0; index -= 1) {
        if (pendingDeletes[index]?.transaction.id === transactionId) {
          pendingIndex = index;
          break;
        }
      }
      const pendingDelete = pendingIndex === -1 ? undefined : pendingDeletes[pendingIndex];
      if (pendingDelete) {
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === transactionId && item.ledgerId === pendingDelete.ledgerId
            ? structuredClone(pendingDelete.transaction)
            : item
        ));
        pendingDeletes.splice(pendingIndex, 1);
        notifyWatchers(pendingDelete.ledgerId);
        return;
      }
      let deletedTransaction: Transaction | undefined;
      for (let index = fixture.snapshot.transactions.length - 1; index >= 0; index -= 1) {
        const candidate = fixture.snapshot.transactions[index];
        if (candidate?.id === transactionId && candidate.deletedAt !== null) {
          deletedTransaction = candidate;
          break;
        }
      }
      if (!deletedTransaction) return;
      fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
        item.id === transactionId && item.ledgerId === deletedTransaction.ledgerId
          ? { ...item, deletedAt: null, version: item.version + 1 }
          : item
      ));
      notifyWatchers(deletedTransaction.ledgerId);
    },
  };
  return fixture;
}
