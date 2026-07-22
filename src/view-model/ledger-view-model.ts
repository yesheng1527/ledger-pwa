import type { LedgerReadSnapshot } from '../db/records';
import { calculateMetrics } from '../domain/metrics';
import { formatYuan } from '../domain/money';
import type {
  Account,
  Category,
  LedgerEntryRecord,
  Transaction,
} from '../domain/types';
import type {
  HomeSnapshot,
  LedgerViewModelOptions,
  TransactionDateGroup,
  TransactionDetail,
  TransactionFilters,
  TransactionListSnapshot,
  TransactionRowModel,
} from './types';

function localRanges(now: Date) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString(),
  };
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localMonthKey(now: Date): string {
  return localDateKey(now.toISOString()).slice(0, 7);
}

function compareBySortOrderThenId(
  left: { sortOrder: number; id: string },
  right: { sortOrder: number; id: string },
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function compareTransactions(left: Transaction, right: Transaction): number {
  return right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id);
}

function scopeSnapshot(snapshot: LedgerReadSnapshot, ledgerId: string): LedgerReadSnapshot {
  const transactions = snapshot.transactions.filter((item) => item.ledgerId === ledgerId);
  const transactionIds = new Set(transactions.map((item) => item.id));
  return {
    ledgerId,
    accounts: snapshot.accounts.filter((item) => item.ledgerId === ledgerId),
    categories: snapshot.categories.filter((item) => item.ledgerId === ledgerId),
    transactions,
    entries: snapshot.entries.filter((item) => (
      item.ledgerId === ledgerId && transactionIds.has(item.transactionId)
    )),
    budgets: snapshot.budgets.filter((item) => item.ledgerId === ledgerId),
    categoryBudgets: snapshot.categoryBudgets.filter((item) => item.ledgerId === ledgerId),
  };
}

function entriesByTransaction(entries: readonly LedgerEntryRecord[]) {
  const result = new Map<string, LedgerEntryRecord[]>();
  for (const entry of entries) {
    const transactionEntries = result.get(entry.transactionId) ?? [];
    transactionEntries.push(entry);
    result.set(entry.transactionId, transactionEntries);
  }
  return result;
}

function amountPresentation(
  transaction: Transaction,
  transactionEntries: readonly LedgerEntryRecord[],
): Pick<TransactionRowModel, 'amountCents' | 'amountLabel' | 'amountTone'> {
  if (transaction.type === 'expense') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `-${formatYuan(transaction.amountCents)}`,
      amountTone: 'expense',
    };
  }
  if (transaction.type === 'income') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `+${formatYuan(transaction.amountCents)}`,
      amountTone: 'income',
    };
  }
  if (transaction.type === 'refund') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `+${formatYuan(transaction.amountCents)}`,
      amountTone: 'refund',
    };
  }
  if (transaction.type === 'transfer') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: formatYuan(transaction.amountCents),
      amountTone: 'neutral',
    };
  }

  const signedAmount = transactionEntries[0]?.deltaCents ?? transaction.amountCents;
  return {
    amountCents: Math.abs(signedAmount),
    amountLabel: `${signedAmount >= 0 ? '+' : '-'}${formatYuan(Math.abs(signedAmount))}`,
    amountTone: 'adjustment',
  };
}

function fallbackTitle(transaction: Transaction, category: Category | undefined): string {
  if (category) return category.name;
  switch (transaction.type) {
    case 'expense': return '支出';
    case 'income': return '收入';
    case 'transfer': return '转账';
    case 'refund': return '退款';
    case 'adjustment': return '余额校准';
  }
}

function toRow(
  transaction: Transaction,
  accountMap: ReadonlyMap<string, Account>,
  categoryMap: ReadonlyMap<string, Category>,
  transactionEntries: readonly LedgerEntryRecord[],
): TransactionRowModel {
  const category = transaction.categoryId
    ? categoryMap.get(transaction.categoryId)
    : undefined;
  const entryAccountNames = transactionEntries.map((entry) => (
    accountMap.get(entry.accountId)?.name ?? '未知账户'
  ));
  const date = new Date(transaction.occurredAt);
  return {
    id: transaction.id,
    type: transaction.type,
    title: transaction.note.trim() || fallbackTitle(transaction, category),
    categoryName: category?.name ?? null,
    categoryIconKey: category?.iconKey ?? transaction.type,
    occurredAt: transaction.occurredAt,
    timeLabel: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    accountLabel: transaction.type === 'transfer'
      ? entryAccountNames.join(' → ')
      : entryAccountNames.join('、'),
    ...amountPresentation(transaction, transactionEntries),
    version: transaction.version,
  };
}

function projectionContext(snapshot: LedgerReadSnapshot) {
  const accountMap = new Map(snapshot.accounts.map((item) => [item.id, item]));
  const categoryMap = new Map(snapshot.categories.map((item) => [item.id, item]));
  const entryMap = entriesByTransaction(snapshot.entries);
  return { accountMap, categoryMap, entryMap };
}

function activeTransactions(snapshot: LedgerReadSnapshot): Transaction[] {
  return snapshot.transactions
    .filter((item) => item.deletedAt === null)
    .sort(compareTransactions);
}

function optionLists(snapshot: LedgerReadSnapshot) {
  return {
    accounts: snapshot.accounts
      .filter((item) => item.archivedAt === null)
      .sort(compareBySortOrderThenId),
    categories: snapshot.categories
      .filter((item) => item.archivedAt === null)
      .sort(compareBySortOrderThenId),
  };
}

export class LedgerViewModel {
  readonly ledgerId: string;
  private readonly repository: LedgerViewModelOptions['repository'];
  private readonly now: LedgerViewModelOptions['now'];
  private readonly listeners = new Set<() => void>();
  private stopWatching: (() => void) | null = null;
  private disposed = false;

  constructor(options: LedgerViewModelOptions) {
    this.ledgerId = options.ledgerId;
    this.repository = options.repository;
    this.now = options.now;
  }

  private async readSnapshot(): Promise<LedgerReadSnapshot> {
    return scopeSnapshot(
      await this.repository.readLedgerSnapshot(this.ledgerId),
      this.ledgerId,
    );
  }

  async getHomeSnapshot(input: { now?: Date } = {}): Promise<HomeSnapshot> {
    const now = input.now ?? this.now();
    const snapshot = await this.readSnapshot();
    const metrics = calculateMetrics(
      snapshot.accounts,
      snapshot.entries,
      snapshot.transactions,
      localRanges(now),
    );
    const month = localMonthKey(now);
    const activeBudget = snapshot.budgets.find((item) => (
      item.month === month && item.archivedAt === null
    ));
    const preferredIcons = ['food', 'transport', 'shopping', 'entertainment'];
    const quickCategories = snapshot.categories
      .filter((item) => item.kind === 'expense' && item.archivedAt === null)
      .sort((left, right) => {
        const leftPreference = preferredIcons.indexOf(left.iconKey);
        const rightPreference = preferredIcons.indexOf(right.iconKey);
        const leftRank = leftPreference === -1 ? preferredIcons.length : leftPreference;
        const rightRank = rightPreference === -1 ? preferredIcons.length : rightPreference;
        return leftRank - rightRank || compareBySortOrderThenId(left, right);
      })
      .slice(0, 4)
      .map(({ id, name, iconKey }) => ({ id, name, iconKey }));
    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const recentTransactions = activeTransactions(snapshot)
      .slice(0, 3)
      .map((transaction) => toRow(
        transaction,
        accountMap,
        categoryMap,
        entryMap.get(transaction.id) ?? [],
      ));

    return {
      totalAssetsCents: metrics.netWorthCents,
      todayExpenseCents: metrics.todayExpenseCents,
      monthIncomeCents: metrics.periodIncomeCents,
      monthExpenseCents: metrics.periodNetExpenseCents,
      monthBalanceCents: metrics.periodBalanceCents,
      budget: activeBudget
        ? {
            amountCents: activeBudget.amountCents,
            usedCents: metrics.periodNetExpenseCents,
            remainingCents: activeBudget.amountCents - metrics.periodNetExpenseCents,
          }
        : null,
      quickCategories,
      recentTransactions,
    };
  }

  async getTransactions(filters: TransactionFilters): Promise<TransactionListSnapshot> {
    const snapshot = await this.readSnapshot();
    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const query = filters.query.trim().toLocaleLowerCase();
    const dateMatchesMonth = filters.date === null || filters.date.slice(0, 7) === filters.month;
    const filteredTransactions = dateMatchesMonth
      ? activeTransactions(snapshot).filter((transaction) => {
          if (localDateKey(transaction.occurredAt).slice(0, 7) !== filters.month) return false;
          if (filters.date !== null && localDateKey(transaction.occurredAt) !== filters.date) return false;
          if (filters.categoryId !== null && transaction.categoryId !== filters.categoryId) return false;
          const transactionEntries = entryMap.get(transaction.id) ?? [];
          if (
            filters.accountId !== null
            && !transactionEntries.some((entry) => entry.accountId === filters.accountId)
          ) return false;
          if (query.length === 0) return true;
          const categoryName = transaction.categoryId
            ? categoryMap.get(transaction.categoryId)?.name ?? ''
            : '';
          const accountNames = transactionEntries.map((entry) => (
            accountMap.get(entry.accountId)?.name ?? ''
          ));
          return [transaction.note, categoryName, ...accountNames]
            .some((value) => value.toLocaleLowerCase().includes(query));
        })
      : [];

    const groups = new Map<string, TransactionDateGroup>();
    for (const transaction of filteredTransactions) {
      const dateKey = localDateKey(transaction.occurredAt);
      const date = new Date(transaction.occurredAt);
      const group = groups.get(dateKey) ?? {
        dateKey,
        dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
        expenseCents: 0,
        incomeCents: 0,
        rows: [],
      };
      if (transaction.type === 'expense') group.expenseCents += transaction.amountCents;
      else if (transaction.type === 'refund') group.expenseCents -= transaction.amountCents;
      else if (transaction.type === 'income') group.incomeCents += transaction.amountCents;
      group.rows.push(toRow(
        transaction,
        accountMap,
        categoryMap,
        entryMap.get(transaction.id) ?? [],
      ));
      groups.set(dateKey, group);
    }

    const options = optionLists(snapshot);
    return {
      groups: [...groups.values()],
      accounts: options.accounts.map(({ id, name }) => ({ id, name })),
      categories: options.categories.map(({ id, name, iconKey }) => ({ id, name, iconKey })),
    };
  }

  async getTransactionDetail(id: string): Promise<TransactionDetail | null> {
    const snapshot = await this.readSnapshot();
    const transaction = snapshot.transactions.find((item) => (
      item.id === id && item.deletedAt === null
    ));
    if (!transaction) return null;

    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const transactionEntries = entryMap.get(transaction.id) ?? [];
    const originalTransaction = transaction.originalTransactionId
      ? snapshot.transactions.find((item) => item.id === transaction.originalTransactionId)
      : undefined;
    const originalCategory = originalTransaction?.categoryId
      ? categoryMap.get(originalTransaction.categoryId)
      : undefined;
    const options = optionLists(snapshot);
    return {
      ...toRow(transaction, accountMap, categoryMap, transactionEntries),
      ledgerId: transaction.ledgerId,
      categoryId: transaction.categoryId,
      note: transaction.note,
      originalTransactionId: transaction.originalTransactionId,
      originalTransactionTitle: originalTransaction
        ? originalTransaction.note.trim() || fallbackTitle(originalTransaction, originalCategory)
        : null,
      entries: transactionEntries.map((entry) => ({
        accountId: entry.accountId,
        accountName: accountMap.get(entry.accountId)?.name ?? '未知账户',
        deltaCents: entry.deltaCents,
      })),
      accountOptions: options.accounts.map(({ id: accountId, name, accountClass }) => ({
        id: accountId,
        name,
        accountClass,
      })),
      categoryOptions: options.categories.map(({ id: categoryId, name, kind }) => ({
        id: categoryId,
        name,
        kind,
      })),
    };
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.stopWatching = this.repository.watchLedger(this.ledgerId, () => {
        [...this.listeners].forEach((currentListener) => currentListener());
      });
    }
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopWatching?.();
        this.stopWatching = null;
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWatching?.();
    this.stopWatching = null;
    this.listeners.clear();
  }
}

export type {
  HomeSnapshot,
  LedgerViewModelOptions,
  TransactionDetail,
  TransactionFilters,
  TransactionListSnapshot,
  TransactionRowModel,
} from './types';
