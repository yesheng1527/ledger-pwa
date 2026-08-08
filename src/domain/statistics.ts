import type { LedgerReadSnapshot } from '../db/records';
import { calculateMetrics } from './metrics';
import type { Account, Category, Transaction } from './types';

export type StatisticsRange =
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: number }
  | { kind: 'custom'; startDate: string; endDate: string };

export interface StatisticsSnapshot {
  rangeLabel: string;
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  totalBudget: null | {
    amountCents: number;
    usedCents: number;
    remainingCents: number;
  };
  categoryBudgets: Array<{
    categoryId: string;
    name: string;
    amountCents: number;
    usedCents: number;
    carriedCents: number;
    overCents: number;
  }>;
  expenseCategories: Array<{
    categoryId: string;
    name: string;
    cents: number;
    percentage: number;
  }>;
  trend: Array<{
    key: string;
    label: string;
    expenseCents: number;
    incomeCents: number;
  }>;
  monthlyComparison: Array<{
    month: string;
    expenseCents: number;
    incomeCents: number;
    balanceCents: number;
  }>;
  accountDistribution: Array<{
    accountId: string;
    name: string;
    accountClass: Account['accountClass'];
    balanceCents: number;
  }>;
}

type NormalizedRange = {
  start: Date;
  end: Date;
  label: string;
  trendKind: 'day' | 'month';
};

function startOfLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('统计日期范围无效');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new Error('统计日期范围无效');
  }
  return date;
}

function startOfLocalMonth(year: number, monthIndex: number): Date {
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, monthIndex, 1);
  return date;
}

function addLocalDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function addLocalMonths(value: Date, months: number): Date {
  return startOfLocalMonth(value.getFullYear(), value.getMonth() + months);
}

function dateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeRange(range: StatisticsRange): NormalizedRange {
  if (range.kind === 'month') {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(range.month);
    if (!match) throw new Error('统计日期范围无效');
    const year = Number(match[1]);
    if (year < 1) throw new Error('统计日期范围无效');
    const monthIndex = Number(match[2]) - 1;
    const start = startOfLocalMonth(year, monthIndex);
    return {
      start,
      end: addLocalMonths(start, 1),
      label: `${year}年${monthIndex + 1}月`,
      trendKind: 'day',
    };
  }

  if (range.kind === 'year') {
    if (!Number.isSafeInteger(range.year) || range.year < 1 || range.year > 9999) {
      throw new Error('统计日期范围无效');
    }
    const start = startOfLocalMonth(range.year, 0);
    return {
      start,
      end: startOfLocalMonth(range.year + 1, 0),
      label: `${range.year}年`,
      trendKind: 'month',
    };
  }

  const start = startOfLocalDate(range.startDate);
  const finalDay = startOfLocalDate(range.endDate);
  if (finalDay.getTime() < start.getTime()) throw new Error('统计日期范围无效');
  return {
    start,
    end: addLocalDays(finalDay, 1),
    label: `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日—`
      + `${finalDay.getFullYear()}年${finalDay.getMonth() + 1}月${finalDay.getDate()}日`,
    trendKind: 'day',
  };
}

function activeRangeTransaction(
  transaction: Transaction,
  start: number,
  end: number,
): boolean {
  if (transaction.deletedAt !== null) return false;
  const occurredAt = Date.parse(transaction.occurredAt);
  return occurredAt >= start && occurredAt < end;
}

function categoryName(category: Category | undefined): string {
  return category?.name ?? '未分类';
}

export function selectStatistics(
  snapshot: LedgerReadSnapshot,
  range: StatisticsRange,
): StatisticsSnapshot {
  const normalized = normalizeRange(range);
  const startTime = normalized.start.getTime();
  const endTime = normalized.end.getTime();
  const ledgerId = snapshot.ledgerId;
  const accounts = snapshot.accounts.filter((account) => account.ledgerId === ledgerId);
  const categories = snapshot.categories.filter((category) => category.ledgerId === ledgerId);
  const transactions = snapshot.transactions.filter(
    (transaction) => transaction.ledgerId === ledgerId,
  );
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const entries = snapshot.entries.filter((entry) => (
    entry.ledgerId === ledgerId && transactionIds.has(entry.transactionId)
  ));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const activeTransactionMap = new Map(
    transactions
      .filter((transaction) => transaction.deletedAt === null)
      .map((transaction) => [transaction.id, transaction]),
  );

  const metrics = calculateMetrics(accounts, entries, transactions, {
    start: normalized.start.toISOString(),
    end: normalized.end.toISOString(),
    todayStart: normalized.start.toISOString(),
    todayEnd: normalized.end.toISOString(),
  });

  const trendMap = new Map<string, StatisticsSnapshot['trend'][number]>();
  if (normalized.trendKind === 'month') {
    for (
      let cursor = new Date(normalized.start);
      cursor.getTime() < endTime;
      cursor = addLocalMonths(cursor, 1)
    ) {
      const key = monthKey(cursor);
      trendMap.set(key, {
        key,
        label: `${cursor.getMonth() + 1}月`,
        expenseCents: 0,
        incomeCents: 0,
      });
    }
  } else {
    for (
      let cursor = new Date(normalized.start);
      cursor.getTime() < endTime;
      cursor = addLocalDays(cursor, 1)
    ) {
      const key = dateKey(cursor);
      trendMap.set(key, {
        key,
        label: `${cursor.getMonth() + 1}月${cursor.getDate()}日`,
        expenseCents: 0,
        incomeCents: 0,
      });
    }
  }

  const comparisonMap = new Map<
    string,
    StatisticsSnapshot['monthlyComparison'][number]
  >();
  const firstMonth = startOfLocalMonth(
    normalized.start.getFullYear(),
    normalized.start.getMonth(),
  );
  for (
    let cursor = firstMonth;
    cursor.getTime() < endTime;
    cursor = addLocalMonths(cursor, 1)
  ) {
    const month = monthKey(cursor);
    comparisonMap.set(month, {
      month,
      expenseCents: 0,
      incomeCents: 0,
      balanceCents: 0,
    });
  }

  const categoryTotals = new Map<string, number>();
  for (const transaction of transactions) {
    if (!activeRangeTransaction(transaction, startTime, endTime)) continue;
    const transactionDate = new Date(transaction.occurredAt);
    const trendKey = normalized.trendKind === 'month'
      ? monthKey(transactionDate)
      : dateKey(transactionDate);
    const trend = trendMap.get(trendKey);
    const comparison = comparisonMap.get(monthKey(transactionDate));

    if (transaction.type === 'income') {
      if (trend) trend.incomeCents += transaction.amountCents;
      if (comparison) comparison.incomeCents += transaction.amountCents;
      continue;
    }
    if (transaction.type !== 'expense' && transaction.type !== 'refund') continue;

    const signedCents = transaction.type === 'expense'
      ? transaction.amountCents
      : -transaction.amountCents;
    if (trend) trend.expenseCents += signedCents;
    if (comparison) comparison.expenseCents += signedCents;
    const categoryId = transaction.categoryId ?? 'uncategorized';
    categoryTotals.set(
      categoryId,
      (categoryTotals.get(categoryId) ?? 0) + signedCents,
    );
  }

  comparisonMap.forEach((comparison) => {
    comparison.balanceCents = comparison.incomeCents - comparison.expenseCents;
  });

  const expenseCategories = [...categoryTotals.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([categoryId, cents]) => ({
      categoryId,
      name: categoryName(categoryMap.get(categoryId)),
      cents,
      percentage: metrics.periodNetExpenseCents === 0
        ? 0
        : Math.round(cents / metrics.periodNetExpenseCents * 10_000) / 100,
    }))
    .sort((left, right) => (
      right.cents - left.cents || left.categoryId.localeCompare(right.categoryId)
    ));

  const selectedMonths = new Set(comparisonMap.keys());
  const activeBudgets = snapshot.budgets.filter((budget) => (
    budget.ledgerId === ledgerId
    && budget.archivedAt === null
    && selectedMonths.has(budget.month)
  ));
  const budgetAmountCents = activeBudgets.reduce(
    (total, budget) => total + budget.amountCents,
    0,
  );
  const totalBudget = activeBudgets.length === 0
    ? null
    : {
        amountCents: budgetAmountCents,
        usedCents: metrics.periodNetExpenseCents,
        remainingCents: budgetAmountCents - metrics.periodNetExpenseCents,
      };

  const categoryBudgetAmounts = new Map<string, { amountCents: number; carriedCents: number }>();
  const previousMonthKey = (month: string) => {
    const [year, monthNumber] = month.split('-').map(Number);
    return monthKey(new Date(year, monthNumber - 2, 1));
  };
  const categoryUsedInMonth = (categoryId: string, month: string) => transactions.reduce((total, transaction) => {
    if (transaction.deletedAt !== null || transaction.categoryId !== categoryId || monthKey(new Date(transaction.occurredAt)) !== month) return total;
    if (transaction.type === 'expense') return total + transaction.amountCents;
    if (transaction.type === 'refund') return total - transaction.amountCents;
    return total;
  }, 0);
  for (const budget of snapshot.categoryBudgets) {
    if (
      budget.ledgerId !== ledgerId
      || budget.archivedAt !== null
      || !selectedMonths.has(budget.month)
    ) continue;
    const previousMonth = previousMonthKey(budget.month);
    const previousBudget = snapshot.categoryBudgets.find((item) => (
      item.ledgerId === ledgerId && item.archivedAt === null
      && item.categoryId === budget.categoryId && item.month === previousMonth
    ));
    const carriedCents = previousBudget
      ? Math.max(0, previousBudget.amountCents - Math.max(0, categoryUsedInMonth(budget.categoryId, previousMonth)))
      : 0;
    const current = categoryBudgetAmounts.get(budget.categoryId) ?? { amountCents: 0, carriedCents: 0 };
    categoryBudgetAmounts.set(budget.categoryId, {
      amountCents: current.amountCents + budget.amountCents + carriedCents,
      carriedCents: current.carriedCents + carriedCents,
    });
  }
  const categoryBudgets = [...categoryBudgetAmounts.entries()]
    .map(([categoryId, value]) => {
      const usedCents = Math.max(0, categoryTotals.get(categoryId) ?? 0);
      return {
        categoryId,
        name: categoryName(categoryMap.get(categoryId)),
        amountCents: value.amountCents,
        usedCents,
        carriedCents: value.carriedCents,
        overCents: Math.max(0, usedCents - value.amountCents),
      };
    })
    .sort((left, right) => left.categoryId.localeCompare(right.categoryId));

  const balances = new Map(
    accounts.map((account) => [account.id, account.openingBalanceCents]),
  );
  for (const entry of entries) {
    if (!activeTransactionMap.has(entry.transactionId) || !balances.has(entry.accountId)) {
      continue;
    }
    balances.set(entry.accountId, balances.get(entry.accountId)! + entry.deltaCents);
  }
  const accountDistribution = accounts
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      accountClass: account.accountClass,
      balanceCents: balances.get(account.id) ?? account.openingBalanceCents,
      sortOrder: account.sortOrder,
      archivedAt: account.archivedAt,
    }))
    .filter((account) => account.archivedAt === null || account.balanceCents !== 0)
    .sort((left, right) => (
      (left.accountClass === right.accountClass
        ? 0
        : left.accountClass === 'asset' ? -1 : 1)
      || left.sortOrder - right.sortOrder
      || left.accountId.localeCompare(right.accountId)
    ))
    .map(({ accountId, name, accountClass, balanceCents }) => ({
      accountId,
      name,
      accountClass,
      balanceCents,
    }));

  return {
    rangeLabel: normalized.label,
    expenseCents: metrics.periodNetExpenseCents,
    incomeCents: metrics.periodIncomeCents,
    balanceCents: metrics.periodBalanceCents,
    totalBudget,
    categoryBudgets,
    expenseCategories,
    trend: [...trendMap.values()],
    monthlyComparison: [...comparisonMap.values()],
    accountDistribution,
  };
}
