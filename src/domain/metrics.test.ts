import { describe, expect, it } from 'vitest';
import { calculateMetrics } from './metrics';
import type { Account, LedgerEntryRecord, Transaction } from './types';

const ledgerId = '00000000-0000-4000-8000-000000000001';

function account(id: string, accountClass: 'asset' | 'liability', openingBalanceCents: number): Account {
  return {
    id,
    ledgerId,
    name: id,
    kind: accountClass === 'asset' ? 'debit_card' : 'credit_card',
    accountClass,
    currency: 'CNY',
    openingBalanceCents,
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  };
}

function transaction(
  id: string,
  type: Transaction['type'],
  amountCents: number,
  occurredAt = '2026-07-18T08:00:00.000Z',
  deletedAt: string | null = null,
): Transaction {
  return {
    id,
    operationId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
    ledgerId,
    type,
    amountCents,
    categoryId: null,
    occurredAt,
    note: '',
    originalTransactionId: type === 'refund' ? 'expense' : null,
    version: 1,
    deletedAt,
  };
}

function entry(transactionId: string, accountId: string, deltaCents: number): LedgerEntryRecord {
  return { id: `${transactionId}-${accountId}`, ledgerId, transactionId, accountId, deltaCents };
}

describe('calculateMetrics', () => {
  it('separates net worth from income, expense, transfers, refunds and adjustments', () => {
    const transactions = [
      transaction('1', 'income', 50000),
      transaction('2', 'expense', 1000),
      transaction('3', 'refund', 400),
      transaction('4', 'transfer', 2000),
      transaction('5', 'adjustment', 500),
      transaction('6', 'expense', 999, '2026-07-18T09:00:00.000Z', '2026-07-18T10:00:00.000Z'),
    ];
    const entries = [
      entry('1', 'bank', 50000),
      entry('2', 'bank', -1000),
      entry('3', 'bank', 400),
      entry('4', 'bank', -2000),
      entry('4', 'card', -2000),
      entry('5', 'bank', 500),
      entry('6', 'bank', -999),
    ];

    expect(calculateMetrics(
      [account('bank', 'asset', 100000), account('card', 'liability', 20000)],
      entries,
      transactions,
      {
        start: '2026-07-01T00:00:00.000Z',
        end: '2026-08-01T00:00:00.000Z',
        todayStart: '2026-07-18T00:00:00.000Z',
        todayEnd: '2026-07-19T00:00:00.000Z',
      },
    )).toEqual({
      netWorthCents: 129900,
      todayExpenseCents: 600,
      periodIncomeCents: 50000,
      periodNetExpenseCents: 600,
      periodBalanceCents: 49400,
    });
  });

  it('excludes transactions outside the requested period from period metrics', () => {
    const prior = transaction('7', 'expense', 1200, '2026-06-30T23:59:59.000Z');
    expect(calculateMetrics(
      [account('bank', 'asset', 0)],
      [entry('7', 'bank', -1200)],
      [prior],
      {
        start: '2026-07-01T00:00:00.000Z',
        end: '2026-08-01T00:00:00.000Z',
        todayStart: '2026-07-18T00:00:00.000Z',
        todayEnd: '2026-07-19T00:00:00.000Z',
      },
    )).toMatchObject({
      netWorthCents: -1200,
      todayExpenseCents: 0,
      periodIncomeCents: 0,
      periodNetExpenseCents: 0,
      periodBalanceCents: 0,
    });
  });
});
