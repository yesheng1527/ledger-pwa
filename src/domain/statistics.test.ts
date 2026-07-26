import { describe, expect, it } from 'vitest';
import type { LedgerReadSnapshot } from '../db/records';
import {
  createMutableLedgerFixture,
  fixtureIds,
} from '../test/ledger-fixture';
import { selectStatistics } from './statistics';

function fullFixtureSnapshot(): LedgerReadSnapshot {
  return createMutableLedgerFixture().snapshot;
}

describe('selectStatistics financial semantics', () => {
  it('nets refunds, excludes non-operating types and computes account balances', () => {
    const result = selectStatistics(
      fullFixtureSnapshot(),
      { kind: 'month', month: '2026-07' },
    );

    expect(result).toMatchObject({
      rangeLabel: '2026年7月',
      expenseCents: 23000,
      incomeCents: 100000,
      balanceCents: 77000,
      totalBudget: {
        amountCents: 50000,
        usedCents: 23000,
        remainingCents: 27000,
      },
    });
    expect(result.expenseCategories).toEqual([
      expect.objectContaining({ cents: 18000, percentage: 78.26 }),
      expect.objectContaining({
        categoryId: fixtureIds.foodCategory,
        cents: 5000,
        percentage: 21.74,
      }),
    ]);
    expect(result.expenseCategories.reduce(
      (total, category) => total + category.percentage,
      0,
    )).toBeCloseTo(100, 2);
    expect(result.accountDistribution).toEqual([
      expect.objectContaining({
        accountId: fixtureIds.bank,
        accountClass: 'asset',
        balanceCents: 392000,
      }),
      expect.objectContaining({
        accountId: fixtureIds.cash,
        accountClass: 'asset',
        balanceCents: 26000,
      }),
      expect.objectContaining({
        accountId: fixtureIds.credit,
        accountClass: 'liability',
        balanceCents: 68000,
      }),
    ]);
  });
});

describe('selectStatistics ranges, budgets and trends', () => {
  it('builds a complete daily month trend and matches category budgets', () => {
    const snapshot = fullFixtureSnapshot();
    snapshot.categoryBudgets.push({
      id: '00000000-0000-4000-8000-000000000701',
      ledgerId: fixtureIds.ledger,
      categoryId: fixtureIds.foodCategory,
      month: '2026-07',
      amountCents: 10000,
      version: 1,
      archivedAt: null,
    });

    const result = selectStatistics(snapshot, { kind: 'month', month: '2026-07' });

    expect(result.trend).toHaveLength(31);
    expect(result.trend[0]).toEqual({
      key: '2026-07-01',
      label: '7月1日',
      expenseCents: 0,
      incomeCents: 100000,
    });
    expect(result.trend.find((item) => item.key === '2026-07-17')).toMatchObject({
      expenseCents: 18000,
      incomeCents: 0,
    });
    expect(result.categoryBudgets).toEqual([
      expect.objectContaining({
        categoryId: fixtureIds.foodCategory,
        amountCents: 10000,
        usedCents: 5000,
      }),
    ]);
    expect(result.monthlyComparison).toEqual([
      {
        month: '2026-07',
        expenseCents: 23000,
        incomeCents: 100000,
        balanceCents: 77000,
      },
    ]);
  });

  it('handles leap-year year ranges and stable empty buckets', () => {
    const snapshot: LedgerReadSnapshot = {
      ledgerId: fixtureIds.ledger,
      accounts: [],
      categories: [],
      transactions: [],
      entries: [],
      budgets: [],
      categoryBudgets: [],
    };

    const result = selectStatistics(snapshot, { kind: 'year', year: 2024 });

    expect(result.rangeLabel).toBe('2024年');
    expect(result).toMatchObject({
      expenseCents: 0,
      incomeCents: 0,
      balanceCents: 0,
      totalBudget: null,
      categoryBudgets: [],
      expenseCategories: [],
      accountDistribution: [],
    });
    expect(result.trend).toHaveLength(12);
    expect(result.trend[1]).toEqual({
      key: '2024-02',
      label: '2月',
      expenseCents: 0,
      incomeCents: 0,
    });
    expect(result.monthlyComparison).toHaveLength(12);
  });

  it('treats both custom dates as inclusive and rejects reversed ranges', () => {
    const result = selectStatistics(fullFixtureSnapshot(), {
      kind: 'custom',
      startDate: '2026-07-17',
      endDate: '2026-07-18',
    });

    expect(result.rangeLabel).toBe('2026年7月17日—2026年7月18日');
    expect(result).toMatchObject({
      expenseCents: 23000,
      incomeCents: 0,
      balanceCents: -23000,
    });
    expect(result.trend.map((item) => item.key)).toEqual([
      '2026-07-17',
      '2026-07-18',
    ]);

    expect(() => selectStatistics(fullFixtureSnapshot(), {
      kind: 'custom',
      startDate: '2026-07-19',
      endDate: '2026-07-18',
    })).toThrow('统计日期范围无效');
  });
});
