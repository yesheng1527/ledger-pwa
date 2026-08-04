import type {
  Account,
  LedgerEntryRecord,
  LedgerMetrics,
  Transaction,
} from './types';

export interface MetricRange {
  start: string;
  end: string;
  todayStart: string;
  todayEnd: string;
}

function isWithin(occurredAt: string, start: string, end: string): boolean {
  const value = Date.parse(occurredAt);
  return value >= Date.parse(start) && value < Date.parse(end);
}

export function calculateMetrics(
  accounts: readonly Account[],
  entries: readonly LedgerEntryRecord[],
  transactions: readonly Transaction[],
  range: MetricRange,
): LedgerMetrics {
  const activeTransactions = new Map(
    transactions.filter((transaction) => transaction.deletedAt === null).map((transaction) => [transaction.id, transaction]),
  );
  const balances = new Map(accounts.map((account) => [account.id, account.openingBalanceCents]));

  for (const entry of entries) {
    if (!activeTransactions.has(entry.transactionId) || !balances.has(entry.accountId)) {
      continue;
    }
    balances.set(entry.accountId, balances.get(entry.accountId)! + entry.deltaCents);
  }

  let netWorthCents = 0;
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? account.openingBalanceCents;
    netWorthCents += account.accountClass === 'asset' ? balance : -balance;
  }

  let todayExpenseCents = 0;
  let periodIncomeCents = 0;
  let periodNetExpenseCents = 0;

  for (const transaction of activeTransactions.values()) {
    if (isWithin(transaction.occurredAt, range.todayStart, range.todayEnd)) {
      if (transaction.type === 'expense') {
        todayExpenseCents += transaction.amountCents;
      } else if (transaction.type === 'refund') {
        todayExpenseCents -= transaction.amountCents;
      }
    }

    if (!isWithin(transaction.occurredAt, range.start, range.end)) {
      continue;
    }
    if (transaction.type === 'income') {
      periodIncomeCents += transaction.amountCents;
    } else if (transaction.type === 'expense') {
      periodNetExpenseCents += transaction.amountCents;
    } else if (transaction.type === 'refund') {
      periodNetExpenseCents -= transaction.amountCents;
    }
  }

  return {
    netWorthCents,
    todayExpenseCents,
    periodIncomeCents,
    periodNetExpenseCents,
    periodBalanceCents: periodIncomeCents - periodNetExpenseCents,
  };
}
