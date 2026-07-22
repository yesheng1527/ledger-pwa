import { afterEach, describe, expect, it, vi } from 'vitest';
import * as metrics from '../domain/metrics';
import type { LedgerOperation } from '../domain/operations';
import type { LedgerReadSnapshot } from '../db/records';
import {
  createMutableLedgerFixture,
  defaultFilters,
  fixtureIds,
  fixtureNow,
  fixtureTimes,
} from '../test/ledger-fixture';
import { LedgerViewModel } from './ledger-view-model';

function sequentialUuidFactory() {
  let sequence = 900;
  return () => `00000000-0000-4000-9000-${String(sequence++).padStart(12, '0')}`;
}

function createFixtureViewModelHarness(overrides?: Partial<LedgerReadSnapshot>) {
  const repository = createMutableLedgerFixture(overrides);
  const saveOperation = vi.fn((operation: LedgerOperation) => repository.saveOperation(operation));
  const syncNow = vi.fn(async () => undefined);
  const viewModel = new LedgerViewModel({
    ledgerId: fixtureIds.ledger,
    repository,
    saveOperation,
    syncNow,
    now: () => new Date(fixtureNow),
    makeUuid: sequentialUuidFactory(),
  });
  return { repository, saveOperation, syncNow, viewModel };
}

function createFixtureViewModel(overrides?: Partial<LedgerReadSnapshot>) {
  return createFixtureViewModelHarness(overrides).viewModel;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LedgerViewModel home projection', () => {
  it('returns all home figures from one consistent snapshot', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const read = vi.spyOn(repository, 'readLedgerSnapshot');
    const calculate = vi.spyOn(metrics, 'calculateMetrics');
    const snapshot = await viewModel.getHomeSnapshot({ now: fixtureNow });

    expect(snapshot).toMatchObject({
      totalAssetsCents: 350000,
      todayExpenseCents: 5000,
      monthIncomeCents: 100000,
      monthExpenseCents: 23000,
      monthBalanceCents: 77000,
      budget: { amountCents: 50000, usedCents: 23000, remainingCents: 27000 },
    });
    expect(snapshot.quickCategories.map((item) => item.name))
      .toEqual(['餐饮', '交通', '购物', '娱乐']);
    expect(snapshot.recentTransactions).toHaveLength(3);
    expect(read).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it('returns no fake progress when the month has no active total budget', async () => {
    const viewModel = createFixtureViewModel({ budgets: [] });
    expect((await viewModel.getHomeSnapshot({ now: fixtureNow })).budget).toBeNull();
  });
});

describe('LedgerViewModel transaction projections', () => {
  it('combines month account date category and trimmed search filters', async () => {
    const result = await createFixtureViewModel().getTransactions({
      month: '2026-07',
      accountId: fixtureIds.cash,
      date: '2026-07-18',
      categoryId: fixtureIds.foodCategory,
      query: ' 午餐 ',
    });
    expect(result.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['午餐']);
  });

  it('searches note, category and entry account names case-insensitively', async () => {
    const viewModel = createFixtureViewModel();
    const noteResult = await viewModel.getTransactions({ ...defaultFilters, query: ' paycheck ' });
    const categoryResult = await viewModel.getTransactions({ ...defaultFilters, query: '餐饮' });
    const accountResult = await viewModel.getTransactions({ ...defaultFilters, query: '现金' });

    expect(noteResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['July PAYCHECK']);
    expect(categoryResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['午餐']);
    expect(accountResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['午餐', '取现']);
  });

  it('returns no rows when the selected date is outside the selected month', async () => {
    const result = await createFixtureViewModel().getTransactions({
      ...defaultFilters,
      date: '2026-06-30',
    });
    expect(result.groups).toEqual([]);
  });

  it('groups by local date and excludes transfer adjustment deleted and refund from wrong totals', async () => {
    const result = await createFixtureViewModel().getTransactions(defaultFilters);
    expect(result.groups.map((group) => group.dateKey)).toEqual(['2026-07-18', '2026-07-17', '2026-07-01']);
    expect(result.groups[0]).toMatchObject({ expenseCents: 5000, incomeCents: 0 });
    expect(result.groups[1]).toMatchObject({ expenseCents: 18000, incomeCents: 0 });
    expect(result.groups[2]).toMatchObject({ expenseCents: 0, incomeCents: 100000 });
    expect(result.groups.flatMap((group) => group.rows).map((row) => row.title))
      .not.toContain('已删除流水');
  });

  it('sorts rows by occurred time descending and then id', async () => {
    const repository = createMutableLedgerFixture();
    const sharedTime = fixtureTimes.todayExpense;
    const transactions = repository.snapshot.transactions.map((item) => (
      item.id === fixtureIds.foodTransaction || item.id === fixtureIds.transferTransaction
        ? { ...item, occurredAt: sharedTime }
        : item
    ));
    const result = await createFixtureViewModel({ transactions }).getTransactions(defaultFilters);
    expect(result.groups[0].rows.slice(0, 2).map((row) => row.id))
      .toEqual([fixtureIds.foodTransaction, fixtureIds.transferTransaction]);
  });

  it('renders expense income refund transfer and adjustment amount semantics', async () => {
    const rows = (await createFixtureViewModel().getTransactions(defaultFilters))
      .groups.flatMap((group) => group.rows);

    expect(rows.find((row) => row.type === 'expense' && row.id === fixtureIds.foodTransaction))
      .toMatchObject({ amountCents: 5000, amountLabel: '-¥50.00', amountTone: 'expense' });
    expect(rows.find((row) => row.type === 'income'))
      .toMatchObject({ amountCents: 100000, amountLabel: '+¥1000.00', amountTone: 'income' });
    expect(rows.find((row) => row.type === 'refund'))
      .toMatchObject({ amountCents: 2000, amountLabel: '+¥20.00', amountTone: 'refund' });
    expect(rows.find((row) => row.type === 'adjustment'))
      .toMatchObject({ amountCents: 3000, amountLabel: '+¥30.00', amountTone: 'adjustment' });
  });

  it('renders transfers with both account names and neutral amount semantics', async () => {
    const rows = (await createFixtureViewModel().getTransactions(defaultFilters))
      .groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.type === 'transfer')).toMatchObject({
      accountLabel: '储蓄卡 → 现金',
      amountCents: 10000,
      amountLabel: '¥100.00',
      amountTone: 'neutral',
    });
  });

  it('normalizes transfer direction for rows and detail when entries arrive reversed', async () => {
    const repository = createMutableLedgerFixture();
    const transferEntries = repository.snapshot.entries
      .filter((item) => item.transactionId === fixtureIds.transferTransaction)
      .reverse();
    const otherEntries = repository.snapshot.entries
      .filter((item) => item.transactionId !== fixtureIds.transferTransaction);
    const viewModel = createFixtureViewModel({ entries: [...otherEntries, ...transferEntries] });

    const rows = (await viewModel.getTransactions(defaultFilters))
      .groups.flatMap((group) => group.rows);
    const detail = await viewModel.getTransactionDetail(fixtureIds.transferTransaction);

    expect.soft(rows.find((row) => row.id === fixtureIds.transferTransaction)?.accountLabel)
      .toBe('储蓄卡 → 现金');
    expect.soft(detail?.entries).toEqual([
      { accountId: fixtureIds.bank, accountName: '储蓄卡', deltaCents: -10000 },
      { accountId: fixtureIds.cash, accountName: '现金', deltaCents: 10000 },
    ]);
  });

  it('normalizes asset-to-liability transfers when both reversed entries are negative', async () => {
    const repository = createMutableLedgerFixture();
    const originalTransfer = repository.snapshot.transactions
      .find((item) => item.id === fixtureIds.transferTransaction)!;
    const repaymentId = '00000000-0000-4000-8000-000000000390';
    const repayment = {
      ...originalTransfer,
      id: repaymentId,
      operationId: '00000000-0000-4000-8000-000000000490',
      amountCents: 3000,
      occurredAt: new Date(2026, 6, 18, 13).toISOString(),
      note: '信用卡还款',
    };
    const reversedRepaymentEntries = [
      {
        id: '00000000-0000-4000-8000-000000000590',
        ledgerId: fixtureIds.ledger,
        transactionId: repaymentId,
        accountId: fixtureIds.credit,
        deltaCents: -3000,
      },
      {
        id: '00000000-0000-4000-8000-000000000591',
        ledgerId: fixtureIds.ledger,
        transactionId: repaymentId,
        accountId: fixtureIds.bank,
        deltaCents: -3000,
      },
    ];
    const viewModel = createFixtureViewModel({
      transactions: [...repository.snapshot.transactions, repayment],
      entries: [...repository.snapshot.entries, ...reversedRepaymentEntries],
    });

    const rows = (await viewModel.getTransactions(defaultFilters))
      .groups.flatMap((group) => group.rows);
    const detail = await viewModel.getTransactionDetail(repaymentId);

    expect.soft(rows.find((row) => row.id === repaymentId)?.accountLabel)
      .toBe('储蓄卡 → 信用卡');
    expect.soft(detail?.entries).toEqual([
      { accountId: fixtureIds.bank, accountName: '储蓄卡', deltaCents: -3000 },
      { accountId: fixtureIds.credit, accountName: '信用卡', deltaCents: -3000 },
    ]);
  });

  it('omits archived options but keeps archived references readable in rows', async () => {
    const result = await createFixtureViewModel().getTransactions(defaultFilters);
    expect(result.accounts.map((item) => item.name)).not.toContain('已归档账户');
    expect(result.accounts.map((item) => item.name)).not.toContain('其他账本账户');
    expect(result.categories.map((item) => item.name)).not.toContain('已归档分类');
  });

  it('returns complete transfer detail and active edit options', async () => {
    const detail = await createFixtureViewModel().getTransactionDetail(fixtureIds.transferTransaction);
    expect(detail).toMatchObject({
      type: 'transfer',
      entries: [
        { accountName: '储蓄卡', deltaCents: -10000 },
        { accountName: '现金', deltaCents: 10000 },
      ],
    });
    expect(detail?.accountOptions.map((item) => item.name)).not.toContain('已归档账户');
  });

  it('returns null for deleted, foreign and unknown transaction details', async () => {
    const repository = createMutableLedgerFixture();
    const deleted = repository.snapshot.transactions.find((item) => item.deletedAt !== null)!;
    const foreign = {
      ...repository.snapshot.transactions[0],
      id: '00000000-0000-4000-8000-000000000399',
      ledgerId: '00000000-0000-4000-8000-000000000002',
    };
    const viewModel = createFixtureViewModel({
      transactions: [...repository.snapshot.transactions, foreign],
    });

    expect(await viewModel.getTransactionDetail(deleted.id)).toBeNull();
    expect(await viewModel.getTransactionDetail(foreign.id)).toBeNull();
    expect(await viewModel.getTransactionDetail('00000000-0000-4000-8000-999999999999')).toBeNull();
  });
});

describe('LedgerViewModel transaction commands', () => {
  it('updates an expense with one new operation id and a regenerated posting', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find(
      (item) => item.id === fixtureIds.foodTransaction,
    )!;

    await viewModel.updateTransaction({
      id: fixtureIds.foodTransaction,
      baseVersion: 1,
      type: 'expense',
      amountCents: 6800,
      accountId: fixtureIds.bank,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: ' 晚餐 ',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transaction.update',
      operationId: '00000000-0000-4000-9000-000000000900',
      transactionId: fixtureIds.foodTransaction,
      baseVersion: 1,
      transaction: {
        ...current,
        operationId: '00000000-0000-4000-9000-000000000900',
        amountCents: 6800,
        occurredAt: fixtureTimes.todayExpense,
        note: '晚餐',
        version: 2,
        deletedAt: null,
      },
      entries: [{ accountId: fixtureIds.bank, deltaCents: -6800 }],
    }));
  });

  it('updates income with an asset-account posting', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'income')!;

    await viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'income',
      amountCents: 120000,
      accountId: fixtureIds.bank,
      categoryId: current.categoryId!,
      occurredAt: current.occurredAt,
      note: '七月工资',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transaction.update',
      transactionId: current.id,
      entries: [{ accountId: fixtureIds.bank, deltaCents: 120000 }],
      transaction: expect.objectContaining({ amountCents: 120000, version: 2 }),
    }));
  });

  it('rejects income edited to a liability account without saving', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'income')!;

    await expect(viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'income',
      amountCents: current.amountCents,
      accountId: fixtureIds.credit,
      categoryId: current.categoryId!,
      occurredAt: current.occurredAt,
      note: current.note,
    })).rejects.toThrow('收入只能存入资产账户');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('updates a transfer with regenerated directional postings', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find(
      (item) => item.id === fixtureIds.transferTransaction,
    )!;

    await viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'transfer',
      amountCents: 2500,
      fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.credit,
      occurredAt: current.occurredAt,
      note: '信用卡还款',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transaction.update',
      transactionId: current.id,
      entries: [
        { accountId: fixtureIds.bank, deltaCents: -2500 },
        { accountId: fixtureIds.credit, deltaCents: -2500 },
      ],
      transaction: expect.objectContaining({ amountCents: 2500, version: 2 }),
    }));
  });

  it('rejects a same-account transfer without saving', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find(
      (item) => item.id === fixtureIds.transferTransaction,
    )!;

    await expect(viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'transfer',
      amountCents: current.amountCents,
      fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.bank,
      occurredAt: current.occurredAt,
      note: current.note,
    })).rejects.toThrow('转出和转入账户不能相同');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('updates a refund on the original expense account and excludes itself from the cumulative total', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'refund')!;

    await viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'refund',
      amountCents: 20000,
      occurredAt: current.occurredAt,
      note: '全额退款',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transaction.update',
      transactionId: current.id,
      entries: [{ accountId: fixtureIds.credit, deltaCents: -20000 }],
      transaction: expect.objectContaining({
        amountCents: 20000,
        originalTransactionId: current.originalTransactionId,
        version: 2,
      }),
    }));
  });

  it('rejects a refund edit when other active refunds make the cumulative amount exceed the expense', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'refund')!;
    repository.snapshot.transactions.push({
      ...current,
      id: '00000000-0000-4000-8000-000000000399',
      operationId: '00000000-0000-4000-8000-000000000499',
      amountCents: 3000,
    });

    await expect(viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'refund',
      amountCents: 18000,
      occurredAt: current.occurredAt,
      note: current.note,
    })).rejects.toThrow('退款总额不能超过原支出');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('updates a signed adjustment while storing its absolute transaction amount', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'adjustment')!;

    await viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'adjustment',
      deltaCents: -4500,
      accountId: fixtureIds.cash,
      occurredAt: current.occurredAt,
      note: '校准减少',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'transaction.update',
      transactionId: current.id,
      entries: [{ accountId: fixtureIds.cash, deltaCents: -4500 }],
      transaction: expect.objectContaining({ amountCents: 4500, version: 2 }),
    }));
  });

  it('rejects a stale edit from a fresh snapshot without saving', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    repository.snapshot.transactions = repository.snapshot.transactions.map((item) => (
      item.id === fixtureIds.foodTransaction ? { ...item, version: 2 } : item
    ));

    await expect(viewModel.updateTransaction({
      id: fixtureIds.foodTransaction,
      baseVersion: 1,
      type: 'expense',
      amountCents: 5000,
      accountId: fixtureIds.cash,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: '午餐',
    })).rejects.toThrow('流水已更新，请刷新后重试');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('rejects changing a transaction type without saving', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();

    await expect(viewModel.updateTransaction({
      id: fixtureIds.foodTransaction,
      baseVersion: 1,
      type: 'income',
      amountCents: 5000,
      accountId: fixtureIds.bank,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: '午餐',
    })).rejects.toThrow('流水类型不能修改');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('rejects an unknown transaction without saving', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();

    await expect(viewModel.updateTransaction({
      id: '00000000-0000-4000-8000-999999999999',
      baseVersion: 1,
      type: 'expense',
      amountCents: 5000,
      accountId: fixtureIds.cash,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: '午餐',
    })).rejects.toThrow('流水不存在或已删除');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('rejects editing a deleted transaction without saving', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const deleted = repository.snapshot.transactions.find((item) => item.deletedAt !== null)!;

    await expect(viewModel.updateTransaction({
      id: deleted.id,
      baseVersion: deleted.version,
      type: 'expense',
      amountCents: deleted.amountCents,
      accountId: fixtureIds.cash,
      categoryId: fixtureIds.foodCategory,
      occurredAt: deleted.occurredAt,
      note: deleted.note,
    })).rejects.toThrow('流水不存在或已删除');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('soft-deletes an active transaction and returns an eight-second undo boundary', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();
    const deletedAt = fixtureNow.toISOString();

    await expect(viewModel.deleteTransaction(fixtureIds.foodTransaction)).resolves.toEqual({
      undoUntil: new Date(fixtureNow.getTime() + 8_000).toISOString(),
    });
    expect(saveOperation).toHaveBeenCalledWith({
      schemaVersion: 1,
      operationId: '00000000-0000-4000-9000-000000000900',
      ledgerId: fixtureIds.ledger,
      createdAt: deletedAt,
      kind: 'transaction.delete',
      transactionId: fixtureIds.foodTransaction,
      baseVersion: 1,
      deletedAt,
    });
  });

  it('rejects deleting a missing or already deleted transaction without saving', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const deleted = repository.snapshot.transactions.find((item) => item.deletedAt !== null)!;

    await expect(viewModel.deleteTransaction(deleted.id)).rejects.toThrow('流水不存在或已删除');
    await expect(viewModel.deleteTransaction('00000000-0000-4000-8000-999999999999'))
      .rejects.toThrow('流水不存在或已删除');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('delegates undo to the repository with the current timestamp', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const undo = vi.spyOn(repository, 'undoTransactionDelete');

    await viewModel.undoTransactionDelete(fixtureIds.foodTransaction);

    expect(undo).toHaveBeenCalledWith(fixtureIds.foodTransaction, fixtureNow.toISOString());
  });

  it('flushes a pending delete by synchronizing now', async () => {
    const { syncNow, viewModel } = createFixtureViewModelHarness();

    await viewModel.flushPendingDelete();

    expect(syncNow).toHaveBeenCalledOnce();
  });
});

describe('LedgerViewModel subscriptions', () => {
  it('reference-counts duplicate listener subscriptions without leaking repository watches', () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const stopWatch = vi.fn();
    let repositoryListener: (() => void) | undefined;
    const watch = vi.spyOn(repository, 'watchLedger').mockImplementation((_ledgerId, listener) => {
      repositoryListener = listener;
      return stopWatch;
    });
    const listener = vi.fn();

    const unsubscribeFirst = viewModel.subscribe(listener);
    const unsubscribeSecond = viewModel.subscribe(listener);
    expect(watch).toHaveBeenCalledTimes(1);

    repositoryListener?.();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    repositoryListener?.();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(stopWatch).not.toHaveBeenCalled();

    unsubscribeSecond();
    expect(stopWatch).toHaveBeenCalledTimes(1);

    const unsubscribeThird = viewModel.subscribe(listener);
    expect(watch).toHaveBeenCalledTimes(2);
    unsubscribeThird();
    expect(stopWatch).toHaveBeenCalledTimes(2);
  });

  it('shares one repository watch and releases it after the final subscriber', () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const stopWatch = vi.fn();
    let repositoryListener: (() => void) | undefined;
    const watch = vi.spyOn(repository, 'watchLedger').mockImplementation((_ledgerId, listener) => {
      repositoryListener = listener;
      return stopWatch;
    });
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = viewModel.subscribe(first);
    const unsubscribeSecond = viewModel.subscribe(second);
    expect(watch).toHaveBeenCalledTimes(1);
    repositoryListener?.();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(stopWatch).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(stopWatch).toHaveBeenCalledTimes(1);
  });

  it('dispose stops watching and drops all listeners', () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const stopWatch = vi.fn();
    const watch = vi.spyOn(repository, 'watchLedger').mockReturnValue(stopWatch);

    viewModel.subscribe(vi.fn());
    viewModel.subscribe(vi.fn());
    viewModel.dispose();
    expect(watch).toHaveBeenCalledTimes(1);
    expect(stopWatch).toHaveBeenCalledTimes(1);

    viewModel.subscribe(vi.fn());
    expect(watch).toHaveBeenCalledTimes(1);
  });
});
