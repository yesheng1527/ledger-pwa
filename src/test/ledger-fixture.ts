import type { LedgerOperation } from '../domain/operations';
import type {
  Account,
  Budget,
  Category,
  LedgerEntryRecord,
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
  incomeTransaction: '00000000-0000-4000-8000-000000000301',
  shoppingTransaction: '00000000-0000-4000-8000-000000000302',
  refundTransaction: '00000000-0000-4000-8000-000000000303',
  foodTransaction: '00000000-0000-4000-8000-000000000304',
  transferTransaction: '00000000-0000-4000-8000-000000000305',
  adjustmentTransaction: '00000000-0000-4000-8000-000000000306',
  deletedTransaction: '00000000-0000-4000-8000-000000000307',
  juneTransaction: '00000000-0000-4000-8000-000000000308',
} as const;

export const fixtureNow = new Date(2026, 6, 18, 20);

export const fixtureIds = {
  ledger: ids.ledger,
  bank: ids.bank,
  cash: ids.cash,
  credit: ids.credit,
  foodCategory: ids.foodCategory,
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
    sortOrder: 40,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.entertainmentCategory,
    ledgerId: ids.ledger,
    name: '娱乐',
    kind: 'expense',
    iconKey: 'entertainment',
    sortOrder: 10,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.shoppingCategory,
    ledgerId: ids.ledger,
    name: '购物',
    kind: 'expense',
    iconKey: 'shopping',
    sortOrder: 20,
    version: 1,
    archivedAt: null,
  },
  {
    id: ids.foodCategory,
    ledgerId: ids.ledger,
    name: '餐饮',
    kind: 'expense',
    iconKey: 'food',
    sortOrder: 30,
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
    id: ids.incomeCategory,
    ledgerId: ids.ledger,
    name: '工资',
    kind: 'income',
    iconKey: 'salary',
    sortOrder: 0,
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
];

function baseSnapshot(): LedgerReadSnapshot {
  return {
    ledgerId: ids.ledger,
    accounts: structuredClone(accounts),
    categories: structuredClone(categories),
    transactions: structuredClone(transactions),
    entries: structuredClone(entries),
    budgets: structuredClone(budgets),
    categoryBudgets: [],
  };
}

export interface MutableLedgerFixture {
  snapshot: LedgerReadSnapshot;
  readLedgerSnapshot(ledgerId: string): Promise<LedgerReadSnapshot>;
  watchLedger(ledgerId: string, listener: () => void): () => void;
  saveOperation(operation: LedgerOperation): Promise<void>;
  undoTransactionDelete(transactionId: string, now: string): Promise<void>;
}

export function createMutableLedgerFixture(
  overrides: Partial<LedgerReadSnapshot> = {},
): MutableLedgerFixture {
  const listeners = new Set<() => void>();
  const fixture: MutableLedgerFixture = {
    snapshot: { ...baseSnapshot(), ...structuredClone(overrides) },
    async readLedgerSnapshot(ledgerId) {
      if (ledgerId !== ids.ledger) {
        return {
          ledgerId,
          accounts: [],
          categories: [],
          transactions: [],
          entries: [],
          budgets: [],
          categoryBudgets: [],
        };
      }
      return structuredClone(fixture.snapshot);
    },
    watchLedger(ledgerId, listener) {
      if (ledgerId !== ids.ledger) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async saveOperation(operation) {
      if (operation.kind === 'transaction.create') {
        fixture.snapshot.transactions.push(structuredClone(operation.transaction));
        operation.entries.forEach((item, index) => {
          fixture.snapshot.entries.push({
            ...structuredClone(item),
            id: `${operation.transaction.id}:${index}`,
            ledgerId: operation.ledgerId,
            transactionId: operation.transaction.id,
          });
        });
      } else if (operation.kind === 'transaction.update') {
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId ? structuredClone(operation.transaction) : item
        ));
        fixture.snapshot.entries = fixture.snapshot.entries.filter(
          (item) => item.transactionId !== operation.transactionId,
        );
        operation.entries.forEach((item, index) => {
          fixture.snapshot.entries.push({
            ...structuredClone(item),
            id: `${operation.transaction.id}:${index}`,
            ledgerId: operation.ledgerId,
            transactionId: operation.transaction.id,
          });
        });
      } else if (operation.kind === 'transaction.delete') {
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId
            ? { ...item, deletedAt: operation.deletedAt, version: item.version + 1 }
            : item
        ));
      } else if (operation.kind === 'transaction.restore') {
        fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
          item.id === operation.transactionId
            ? { ...item, deletedAt: null, version: item.version + 1 }
            : item
        ));
      }
      listeners.forEach((listener) => listener());
    },
    async undoTransactionDelete(transactionId) {
      fixture.snapshot.transactions = fixture.snapshot.transactions.map((item) => (
        item.id === transactionId ? { ...item, deletedAt: null } : item
      ));
      listeners.forEach((listener) => listener());
    },
  };
  return fixture;
}
