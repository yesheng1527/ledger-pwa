import { afterEach, describe, expect, it, vi } from 'vitest';
import * as metrics from '../domain/metrics';
import { validateOperation, type LedgerOperation } from '../domain/operations';
import { decodeTransactionText } from '../domain/transaction-text';
import type { LedgerReadSnapshot } from '../db/records';
import {
  createMutableLedgerFixture,
  defaultFilters,
  fixtureIds,
  fixtureNow,
  fixtureTimes,
} from '../test/ledger-fixture';
import { LedgerViewModel } from './ledger-view-model';
import type { TransactionCreateInput, TransactionEditInput } from './types';

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

type CategoryEditInput = Extract<
  TransactionEditInput,
  { type: 'expense' | 'income' }
>;
type TransferEditInput = Extract<TransactionEditInput, { type: 'transfer' }>;
type AdjustmentEditInput = Extract<TransactionEditInput, { type: 'adjustment' }>;

function categoryEditInput(
  repository: ReturnType<typeof createMutableLedgerFixture>,
  type: 'expense' | 'income',
  overrides: Partial<CategoryEditInput> = {},
): CategoryEditInput {
  const current = repository.snapshot.transactions.find((item) => item.type === type)!;
  return {
    id: current.id,
    baseVersion: current.version,
    type,
    amountCents: current.amountCents,
    accountId: fixtureIds.bank,
    categoryId: current.categoryId!,
    occurredAt: current.occurredAt,
    note: current.note,
    ...overrides,
  };
}

function transferEditInput(
  repository: ReturnType<typeof createMutableLedgerFixture>,
  overrides: Partial<TransferEditInput> = {},
): TransferEditInput {
  const current = repository.snapshot.transactions.find((item) => item.type === 'transfer')!;
  return {
    id: current.id,
    baseVersion: current.version,
    type: 'transfer',
    amountCents: current.amountCents,
    fromAccountId: fixtureIds.bank,
    toAccountId: fixtureIds.cash,
    occurredAt: current.occurredAt,
    note: current.note,
    ...overrides,
  };
}

function adjustmentEditInput(
  repository: ReturnType<typeof createMutableLedgerFixture>,
  overrides: Partial<AdjustmentEditInput> = {},
): AdjustmentEditInput {
  const current = repository.snapshot.transactions.find((item) => item.type === 'adjustment')!;
  return {
    id: current.id,
    baseVersion: current.version,
    type: 'adjustment',
    deltaCents: current.amountCents,
    accountId: fixtureIds.bank,
    occurredAt: current.occurredAt,
    note: current.note,
    ...overrides,
  };
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
    expect(snapshot.recentTransactions).toHaveLength(5);
    expect(read).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it('returns no fake progress when the month has no active total budget', async () => {
    const viewModel = createFixtureViewModel({ budgets: [] });
    expect((await viewModel.getHomeSnapshot({ now: fixtureNow })).budget).toBeNull();
  });

  it('creates and updates the selected month budget through ledger operations', async () => {
    const existing = createFixtureViewModelHarness();

    await existing.viewModel.saveMonthlyBudget({ month: '2026-07', amountCents: 75000 });
    expect(existing.saveOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'budget.update',
      budgetId: '00000000-0000-4000-8000-000000000601',
      baseVersion: 1,
      budget: expect.objectContaining({ amountCents: 75000, version: 2 }),
    }));
    expect(existing.repository.snapshot.budgets.find((budget) => (
      budget.id === '00000000-0000-4000-8000-000000000601'
    ))).toMatchObject({ amountCents: 75000, version: 2 });

    const empty = createFixtureViewModelHarness({ budgets: [] });
    await empty.viewModel.saveMonthlyBudget({ month: '2026-07', amountCents: 300000 });
    expect(empty.saveOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'budget.create',
      budget: expect.objectContaining({ month: '2026-07', amountCents: 300000, version: 1 }),
    }));
    await expect(empty.viewModel.saveMonthlyBudget({ month: '2026-07', amountCents: 0 }))
      .rejects.toThrow('本月预算必须大于0');
  });
});

describe('LedgerViewModel statistics projection', () => {
  it('reads one scoped snapshot and delegates the selected range', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const read = vi.spyOn(repository, 'readLedgerSnapshot');

    const statistics = await viewModel.getStatistics({
      kind: 'month',
      month: '2026-07',
    });

    expect(statistics).toMatchObject({
      rangeLabel: '2026年7月',
      expenseCents: 23000,
      incomeCents: 100000,
      balanceCents: 77000,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('LedgerViewModel category management', () => {
  it('creates and edits a synced custom category', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();

    const created = await viewModel.createCategory({
      name: ' 宠物 ',
      kind: 'expense',
      iconKey: 'custom',
    });
    expect(saveOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'category.create',
      category: expect.objectContaining({
        id: created.categoryId,
        name: '宠物',
        kind: 'expense',
        iconKey: 'custom',
      }),
    }));

    await viewModel.updateCategory({
      id: created.categoryId,
      name: '宠物用品',
      iconKey: 'custom',
    });
    expect(saveOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'category.update',
      categoryId: created.categoryId,
      baseVersion: 1,
      category: expect.objectContaining({ name: '宠物用品', version: 2 }),
    }));
    expect(repository.snapshot.categories.find((category) => category.id === created.categoryId))
      .toMatchObject({ name: '宠物用品', iconKey: 'custom', version: 2 });
  });

  it('rejects duplicate category names within the same type', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();

    await expect(viewModel.createCategory({
      name: '餐饮',
      kind: 'expense',
      iconKey: 'custom',
    })).rejects.toThrow('同类型下的类目名称不能重复');
    expect(saveOperation).not.toHaveBeenCalled();
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
      .toEqual(['餐饮']);
  });

  it('searches note, category and entry account names case-insensitively', async () => {
    const viewModel = createFixtureViewModel();
    const noteResult = await viewModel.getTransactions({ ...defaultFilters, query: ' paycheck ' });
    const categoryResult = await viewModel.getTransactions({ ...defaultFilters, query: '餐饮' });
    const accountResult = await viewModel.getTransactions({ ...defaultFilters, query: '现金' });

    expect(noteResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['工资']);
    expect(categoryResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['餐饮']);
    expect(accountResult.groups.flatMap((group) => group.rows).map((row) => row.title))
      .toEqual(['餐饮', '转账']);
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

describe('LedgerViewModel reminders and credit cards', () => {
  it('stores credit limit and statement days in a synced reminder and derives the outstanding amount', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();

    await viewModel.saveCreditCardProfile({
      accountId: fixtureIds.credit,
      creditLimitCents: 2000000,
      billingDay: 5,
      repaymentDay: 20,
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reminder.create',
      reminder: expect.objectContaining({
        accountId: fixtureIds.credit,
        amountCents: 2000000,
        recurrence: 'credit-card:v1:billing=5;repayment=20',
      }),
    }));
    const reloaded = new LedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository,
      saveOperation: (operation) => repository.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(fixtureNow),
      makeUuid: sequentialUuidFactory(),
    });
    expect(await reloaded.getCreditCardProfiles()).toEqual([
      expect.objectContaining({
        accountId: fixtureIds.credit,
        creditLimitCents: 2000000,
        billingDay: 5,
        repaymentDay: 20,
        dueCents: 68000,
      }),
    ]);
  });

  it('updates credit-card due amount after purchase, refund, and repayment postings', async () => {
    const { viewModel } = createFixtureViewModelHarness();
    expect((await viewModel.getCreditCardProfiles())[0]?.dueCents).toBe(68000);

    const purchase = await viewModel.createTransaction({
      type: 'expense', amountCents: 10000, accountId: fixtureIds.credit,
      categoryId: fixtureIds.foodCategory, occurredAt: fixtureTimes.todayExpense, note: '',
    });
    expect((await viewModel.getCreditCardProfiles())[0]?.dueCents).toBe(78000);
    await viewModel.createTransaction({
      type: 'refund', amountCents: 3000, originalTransactionId: purchase.transactionId,
      occurredAt: fixtureTimes.todayExpense, note: '',
    });
    expect((await viewModel.getCreditCardProfiles())[0]?.dueCents).toBe(75000);
    await viewModel.createTransaction({
      type: 'transfer', amountCents: 10000, fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.credit, occurredAt: fixtureTimes.todayExpense, note: '还款',
    });
    expect((await viewModel.getCreditCardProfiles())[0]?.dueCents).toBe(65000);
  });

  it('clamps day 31 to the month end and rejects impossible reminder days', async () => {
    const repository = createMutableLedgerFixture();
    const now = new Date(2027, 0, 31, 10);
    const viewModel = new LedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository,
      saveOperation: (operation) => repository.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(now),
      makeUuid: sequentialUuidFactory(),
    });
    await viewModel.saveCreditCardProfile({
      accountId: fixtureIds.credit, creditLimitCents: 1000000, billingDay: 31, repaymentDay: 31,
    });
    expect((await viewModel.getCreditCardProfiles())[0]).toMatchObject({
      billingDay: 31,
      repaymentDay: 31,
      nextRepaymentAt: new Date(2027, 1, 28, 9).toISOString(),
    });
    await expect(viewModel.saveCreditCardProfile({
      accountId: fixtureIds.credit, creditLimitCents: 1000000, billingDay: 0, repaymentDay: 20,
    })).rejects.toThrow('账单日必须是1至31日');
    await expect(viewModel.saveCreditCardProfile({
      accountId: fixtureIds.credit, creditLimitCents: 1000000, billingDay: 5, repaymentDay: 32,
    })).rejects.toThrow('还款日必须是1至31日');
  });

  it('creates due recurring items as pending and advances only after confirmation', async () => {
    const reminderId = '00000000-0000-4000-8000-000000000750';
    const { repository, viewModel } = createFixtureViewModelHarness({
      reminders: [{
        id: reminderId,
        ledgerId: fixtureIds.ledger,
        name: '每月房租',
        amountCents: 250000,
        categoryId: fixtureIds.foodCategory,
        accountId: fixtureIds.bank,
        recurrence: 'recurring:v1:expense:monthly:18',
        nextDueAt: new Date(2026, 6, 18, 9).toISOString(),
        version: 1,
        archivedAt: null,
      }],
    });

    expect(await viewModel.getRecurringRules()).toEqual([
      expect.objectContaining({ id: reminderId, pending: true, amountCents: 250000 }),
    ]);
    const result = await viewModel.confirmRecurringRule(reminderId);
    expect(repository.snapshot.transactions.find((item) => item.id === result.transactionId))
      .toMatchObject({ type: 'expense', amountCents: 250000, categoryId: fixtureIds.foodCategory });
    expect(repository.snapshot.reminders.find((item) => item.id === reminderId))
      .toMatchObject({ nextDueAt: new Date(2026, 7, 18, 9).toISOString(), version: 2 });

    const reloaded = new LedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository,
      saveOperation: (operation) => repository.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(fixtureNow),
      makeUuid: sequentialUuidFactory(),
    });
    expect((await reloaded.getRecurringRules())[0]).toMatchObject({ pending: false });
  });

  it('deduplicates a recurring occurrence when confirmation is retried after a partial failure', async () => {
    const reminderId = '00000000-0000-4000-8000-000000000751';
    const repository = createMutableLedgerFixture({ reminders: [{
      id: reminderId, ledgerId: fixtureIds.ledger, name: '固定早餐', amountCents: 1200,
      categoryId: fixtureIds.foodCategory, accountId: fixtureIds.cash,
      recurrence: 'recurring:v1:expense:monthly:18',
      nextDueAt: new Date(2026, 6, 18, 9).toISOString(), version: 1, archivedAt: null,
    }] });
    let failReminderUpdate = true;
    const saveOperation = vi.fn(async (operation: LedgerOperation) => {
      if (operation.kind === 'reminder.update' && failReminderUpdate) {
        failReminderUpdate = false;
        throw new Error('simulated interruption');
      }
      await repository.saveOperation(operation);
    });
    const viewModel = new LedgerViewModel({
      ledgerId: fixtureIds.ledger, repository, saveOperation, syncNow: async () => undefined,
      now: () => new Date(fixtureNow), makeUuid: sequentialUuidFactory(),
    });

    await expect(viewModel.confirmRecurringRule(reminderId)).rejects.toThrow('simulated interruption');
    await expect(viewModel.confirmRecurringRule(reminderId)).resolves.toEqual({ transactionId: expect.any(String) });
    expect(repository.snapshot.transactions.filter((item) => (
      decodeTransactionText(item.id, item.note).name === '固定早餐'
    ))).toHaveLength(1);
    expect((await viewModel.getRecurringRules())[0]).toMatchObject({ pending: false });
  });

  it('skips or deletes a due recurring rule without creating transactions', async () => {
    const due = (id: string) => ({
      id, ledgerId: fixtureIds.ledger, name: '待处理固定支出', amountCents: 1000,
      categoryId: fixtureIds.foodCategory, accountId: fixtureIds.cash,
      recurrence: 'recurring:v1:expense:monthly:18',
      nextDueAt: new Date(2026, 6, 18, 9).toISOString(), version: 1, archivedAt: null,
    });
    const firstId = '00000000-0000-4000-8000-000000000752';
    const secondId = '00000000-0000-4000-8000-000000000753';
    const { repository, viewModel } = createFixtureViewModelHarness({ reminders: [due(firstId), due(secondId)] });
    const transactionCount = repository.snapshot.transactions.length;

    await viewModel.skipRecurringRule(firstId);
    await viewModel.archiveRecurringRule(secondId);

    expect(repository.snapshot.transactions).toHaveLength(transactionCount);
    expect((await viewModel.getRecurringRules()).find((item) => item.id === firstId)).toMatchObject({ pending: false });
    expect((await viewModel.getRecurringRules()).some((item) => item.id === secondId)).toBe(false);
  });

  it('validates credit card and recurring rule inputs before queuing operations', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();
    await expect(viewModel.saveCreditCardProfile({
      accountId: fixtureIds.bank, creditLimitCents: 100000, billingDay: 5, repaymentDay: 20,
    })).rejects.toThrow('只有信用卡负债账户');
    await expect(viewModel.saveRecurringRule({
      name: '工资', type: 'income', amountCents: 100000,
      accountId: fixtureIds.credit, categoryId: fixtureIds.incomeCategory, dayOfMonth: 8,
    })).rejects.toThrow('周期收入只能存入资产账户');
    expect(saveOperation).not.toHaveBeenCalled();
  });
});

describe('LedgerViewModel transaction commands', () => {
  it('builds active entry options and remaining refundable expenses from one snapshot', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const read = vi.spyOn(repository, 'readLedgerSnapshot');

    const options = await viewModel.getEntryOptions();

    expect(options.accounts.map((item) => [item.id, item.accountClass])).toEqual([
      [fixtureIds.bank, 'asset'],
      [fixtureIds.cash, 'asset'],
      [fixtureIds.credit, 'liability'],
    ]);
    expect(options.accounts.map((item) => [item.id, item.balanceCents])).toEqual([
      [fixtureIds.bank, 392000],
      [fixtureIds.cash, 26000],
      [fixtureIds.credit, -68000],
    ]);
    expect(options.accounts.map((item) => item.id)).not.toContain(fixtureIds.archivedAccount);
    expect(options.expenseCategories.map((item) => item.id))
      .not.toContain(fixtureIds.archivedCategory);
    expect(options.incomeCategories).toEqual([
      expect.objectContaining({ id: fixtureIds.incomeCategory }),
    ]);
    expect(options.refundableExpenses).toEqual([
      expect.objectContaining({
        id: fixtureIds.foodTransaction,
        accountId: fixtureIds.cash,
        remainingCents: 5000,
      }),
      expect.objectContaining({
        id: fixtureIds.shoppingTransaction,
        accountId: fixtureIds.credit,
        remainingCents: 18000,
      }),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('persists account names and signed balances through account operations', async () => {
    const { viewModel } = createFixtureViewModelHarness();

    expect((await viewModel.getAccounts()).find((item) => item.id === fixtureIds.bank))
      .toMatchObject({ name: '储蓄卡', balanceCents: 392000 });

    await viewModel.updateAccount({
      id: fixtureIds.bank,
      name: '工资卡',
      balanceCents: -12345,
    });
    expect((await viewModel.getAccounts()).find((item) => item.id === fixtureIds.bank))
      .toMatchObject({ name: '工资卡', balanceCents: -12345, version: 2 });

    const created = await viewModel.createAccount({
      name: '旅行金',
      openingBalanceCents: 50000,
    });
    expect((await viewModel.getAccounts()).find((item) => item.id === created.accountId))
      .toMatchObject({ name: '旅行金', balanceCents: 50000 });

    await viewModel.archiveAccount(created.accountId);
    expect((await viewModel.getAccounts()).map((item) => item.id)).not.toContain(created.accountId);
  });

  it('forces credit cards to liabilities and blocks permanent deletion with linked transactions', async () => {
    const { viewModel } = createFixtureViewModelHarness();
    const created = await viewModel.createAccount({
      name: '海风信用卡',
      kind: 'credit_card',
      accountClass: 'asset',
      openingBalanceCents: 12345,
    });
    expect((await viewModel.getAccounts()).find((item) => item.id === created.accountId))
      .toMatchObject({ kind: 'credit_card', accountClass: 'liability', balanceCents: -12345 });

    await expect(viewModel.deleteAccountPermanently(fixtureIds.cash))
      .rejects.toThrow(/关联 .* 笔流水/);
    await expect(viewModel.deleteAccountPermanently(created.accountId)).resolves.toBeUndefined();
  });

  it('creates an expense with a shared transaction and operation id and a trimmed note', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();
    const input: TransactionCreateInput = {
      type: 'expense',
      amountCents: 2500,
      accountId: fixtureIds.credit,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: ' 晚餐 ',
    };

    await expect(viewModel.createTransaction(input)).resolves.toEqual({
      transactionId: '00000000-0000-4000-9000-000000000900',
    });
    expect(saveOperation).toHaveBeenCalledWith({
      schemaVersion: 1,
      operationId: '00000000-0000-4000-9000-000000000900',
      ledgerId: fixtureIds.ledger,
      createdAt: fixtureNow.toISOString(),
      kind: 'transaction.create',
      transaction: {
        id: '00000000-0000-4000-9000-000000000900',
        operationId: '00000000-0000-4000-9000-000000000900',
        ledgerId: fixtureIds.ledger,
        type: 'expense',
        amountCents: 2500,
        categoryId: fixtureIds.foodCategory,
        occurredAt: fixtureTimes.todayExpense,
        note: '晚餐',
        originalTransactionId: null,
        version: 1,
        deletedAt: null,
      },
      entries: [{ accountId: fixtureIds.credit, deltaCents: 2500 }],
    });
  });

  it('stores a named transaction in one envelope and presents name and note separately', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();
    const created = await viewModel.createTransaction({
      type: 'expense',
      amountCents: 2500,
      accountId: fixtureIds.cash,
      categoryId: fixtureIds.foodCategory,
      occurredAt: fixtureTimes.todayExpense,
      name: '海边午餐 🍜',
      note: '第一行\n“第二行”',
    });
    const operation = saveOperation.mock.calls[0][0];
    expect(operation.kind).toBe('transaction.create');
    if (operation.kind !== 'transaction.create') throw new Error('unexpected operation');
    expect(decodeTransactionText(created.transactionId, operation.transaction.note)).toEqual({
      name: '海边午餐 🍜',
      note: '第一行\n“第二行”',
      legacy: false,
    });
    await expect(viewModel.getTransactionDetail(created.transactionId)).resolves.toMatchObject({
      title: '海边午餐 🍜',
      note: '第一行\n“第二行”',
    });
  });

  it('creates income on an asset and rejects a liability destination', async () => {
    const success = createFixtureViewModelHarness();
    await success.viewModel.createTransaction({
      type: 'income',
      amountCents: 120000,
      accountId: fixtureIds.bank,
      categoryId: fixtureIds.incomeCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: ' 七月工资 ',
    });
    expect(success.saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      entries: [{ accountId: fixtureIds.bank, deltaCents: 120000 }],
      transaction: expect.objectContaining({
        type: 'income',
        categoryId: fixtureIds.incomeCategory,
        note: '七月工资',
      }),
    }));

    const rejected = createFixtureViewModelHarness();
    await expect(rejected.viewModel.createTransaction({
      type: 'income',
      amountCents: 120000,
      accountId: fixtureIds.credit,
      categoryId: fixtureIds.incomeCategory,
      occurredAt: fixtureTimes.todayExpense,
      note: '',
    })).rejects.toThrow();
    expect(rejected.saveOperation).not.toHaveBeenCalled();
  });

  it('creates ordered transfer entries and rejects a liability source', async () => {
    const success = createFixtureViewModelHarness();
    await success.viewModel.createTransaction({
      type: 'transfer',
      amountCents: 8000,
      fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.credit,
      occurredAt: fixtureTimes.todayExpense,
      note: '信用卡还款',
    });
    expect(success.saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      entries: [
        { accountId: fixtureIds.bank, deltaCents: -8000 },
        { accountId: fixtureIds.credit, deltaCents: -8000 },
      ],
      transaction: expect.objectContaining({
        type: 'transfer',
        categoryId: null,
        originalTransactionId: null,
      }),
    }));

    const rejected = createFixtureViewModelHarness();
    await expect(rejected.viewModel.createTransaction({
      type: 'transfer',
      amountCents: 8000,
      fromAccountId: fixtureIds.credit,
      toAccountId: fixtureIds.bank,
      occurredAt: fixtureTimes.todayExpense,
      note: '',
    })).rejects.toThrow();
    expect(rejected.saveOperation).not.toHaveBeenCalled();
  });

  it('keeps net worth, income, expense, category statistics, and budget unchanged after a persisted transfer', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const beforeHome = await viewModel.getHomeSnapshot({ now: fixtureNow });
    const beforeStatistics = await viewModel.getStatistics({ kind: 'month', month: '2026-07' });
    const beforeAccounts = new Map((await viewModel.getEntryOptions()).accounts.map((item) => [item.id, item.balanceCents]));

    await viewModel.createTransaction({
      type: 'transfer',
      amountCents: 10000,
      fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.cash,
      occurredAt: fixtureTimes.todayExpense,
      note: '验收转账',
    });

    const reloaded = new LedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository,
      saveOperation: (operation) => repository.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(fixtureNow),
      makeUuid: sequentialUuidFactory(),
    });
    const afterHome = await reloaded.getHomeSnapshot({ now: fixtureNow });
    const afterStatistics = await reloaded.getStatistics({ kind: 'month', month: '2026-07' });
    const afterAccounts = new Map((await reloaded.getEntryOptions()).accounts.map((item) => [item.id, item.balanceCents]));

    expect(afterAccounts.get(fixtureIds.bank)).toBe(beforeAccounts.get(fixtureIds.bank)! - 10000);
    expect(afterAccounts.get(fixtureIds.cash)).toBe(beforeAccounts.get(fixtureIds.cash)! + 10000);
    expect(afterHome).toMatchObject({
      totalAssetsCents: beforeHome.totalAssetsCents,
      monthIncomeCents: beforeHome.monthIncomeCents,
      monthExpenseCents: beforeHome.monthExpenseCents,
      monthBalanceCents: beforeHome.monthBalanceCents,
      budget: beforeHome.budget,
    });
    expect(afterStatistics).toMatchObject({
      expenseCents: beforeStatistics.expenseCents,
      incomeCents: beforeStatistics.incomeCents,
      balanceCents: beforeStatistics.balanceCents,
      totalBudget: beforeStatistics.totalBudget,
      categoryBudgets: beforeStatistics.categoryBudgets,
      expenseCategories: beforeStatistics.expenseCategories,
      trend: beforeStatistics.trend,
      monthlyComparison: beforeStatistics.monthlyComparison,
    });
  });

  it('persists balance calibration as adjustment without changing income, expense, categories, or budget', async () => {
    const { repository, viewModel } = createFixtureViewModelHarness();
    const beforeHome = await viewModel.getHomeSnapshot({ now: fixtureNow });
    const beforeStatistics = await viewModel.getStatistics({ kind: 'month', month: '2026-07' });
    const beforeAccounts = new Map((await viewModel.getEntryOptions()).accounts.map((item) => [item.id, item.balanceCents]));

    await viewModel.createTransaction({
      type: 'adjustment',
      deltaCents: 2500,
      accountId: fixtureIds.cash,
      occurredAt: fixtureTimes.todayExpense,
      note: '验收校准',
    });

    const reloaded = new LedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository,
      saveOperation: (operation) => repository.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(fixtureNow),
      makeUuid: sequentialUuidFactory(),
    });
    const afterHome = await reloaded.getHomeSnapshot({ now: fixtureNow });
    const afterStatistics = await reloaded.getStatistics({ kind: 'month', month: '2026-07' });
    const afterAccounts = new Map((await reloaded.getEntryOptions()).accounts.map((item) => [item.id, item.balanceCents]));

    expect(afterAccounts.get(fixtureIds.cash)).toBe(beforeAccounts.get(fixtureIds.cash)! + 2500);
    expect(afterAccounts.get(fixtureIds.bank)).toBe(beforeAccounts.get(fixtureIds.bank));
    expect(afterHome).toMatchObject({
      totalAssetsCents: beforeHome.totalAssetsCents + 2500,
      monthIncomeCents: beforeHome.monthIncomeCents,
      monthExpenseCents: beforeHome.monthExpenseCents,
      monthBalanceCents: beforeHome.monthBalanceCents,
      budget: beforeHome.budget,
    });
    expect(afterStatistics).toMatchObject({
      expenseCents: beforeStatistics.expenseCents,
      incomeCents: beforeStatistics.incomeCents,
      balanceCents: beforeStatistics.balanceCents,
      totalBudget: beforeStatistics.totalBudget,
      categoryBudgets: beforeStatistics.categoryBudgets,
      expenseCategories: beforeStatistics.expenseCategories,
      trend: beforeStatistics.trend,
      monthlyComparison: beforeStatistics.monthlyComparison,
    });
  });

  it('rejects transfers that exceed the current asset balance', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();
    const bank = (await viewModel.getEntryOptions()).accounts.find((item) => item.id === fixtureIds.bank)!;

    await expect(viewModel.createTransaction({
      type: 'transfer',
      amountCents: bank.balanceCents + 1,
      fromAccountId: fixtureIds.bank,
      toAccountId: fixtureIds.cash,
      occurredAt: fixtureTimes.todayExpense,
      note: '',
    })).rejects.toThrow('转出金额不能超过账户可用余额');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('creates a refund with inherited account and category and enforces the remaining amount', async () => {
    const success = createFixtureViewModelHarness();
    await success.viewModel.createTransaction({
      type: 'refund',
      amountCents: 3000,
      originalTransactionId: fixtureIds.shoppingTransaction,
      occurredAt: fixtureTimes.todayExpense,
      note: '补充退款',
    });
    expect(success.saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      entries: [{ accountId: fixtureIds.credit, deltaCents: -3000 }],
      transaction: expect.objectContaining({
        type: 'refund',
        amountCents: 3000,
        categoryId: success.repository.snapshot.transactions.find(
          (item) => item.id === fixtureIds.shoppingTransaction,
        )?.categoryId,
        originalTransactionId: fixtureIds.shoppingTransaction,
      }),
    }));

    const rejected = createFixtureViewModelHarness();
    await expect(rejected.viewModel.createTransaction({
      type: 'refund',
      amountCents: 18001,
      originalTransactionId: fixtureIds.shoppingTransaction,
      occurredAt: fixtureTimes.todayExpense,
      note: '',
    })).rejects.toThrow();
    expect(rejected.saveOperation).not.toHaveBeenCalled();
  });

  it('creates a signed adjustment while storing its absolute amount', async () => {
    const { saveOperation, viewModel } = createFixtureViewModelHarness();

    await viewModel.createTransaction({
      type: 'adjustment',
      deltaCents: -3600,
      accountId: fixtureIds.cash,
      occurredAt: fixtureTimes.todayExpense,
      note: ' 盘点修正 ',
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      entries: [{ accountId: fixtureIds.cash, deltaCents: -3600 }],
      transaction: expect.objectContaining({
        type: 'adjustment',
        amountCents: 3600,
        categoryId: null,
        originalTransactionId: null,
        note: '盘点修正',
      }),
    }));
  });

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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
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

  it('requires expense and income accounts to exist', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type, {
        accountId: '00000000-0000-4000-8000-999999999998',
      }))).rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income accounts to belong to the current ledger', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const account = repository.snapshot.accounts.find((item) => item.id === fixtureIds.bank)!;
      account.ledgerId = '00000000-0000-4000-8000-000000000002';
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type)))
        .rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income accounts to be active', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const account = repository.snapshot.accounts.find((item) => item.id === fixtureIds.bank)!;
      account.archivedAt = fixtureNow.toISOString();
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type)))
        .rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income categories to exist', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type, {
        categoryId: '00000000-0000-4000-8000-999999999997',
      }))).rejects.toThrow('分类不存在、已归档或类型不匹配');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income categories to belong to the current ledger', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const current = repository.snapshot.transactions.find((item) => item.type === type)!;
      const category = repository.snapshot.categories.find(
        (item) => item.id === current.categoryId,
      )!;
      category.ledgerId = '00000000-0000-4000-8000-000000000002';
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type)))
        .rejects.toThrow('分类不存在、已归档或类型不匹配');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income categories to be active', async () => {
    for (const type of ['expense', 'income'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const current = repository.snapshot.transactions.find((item) => item.type === type)!;
      const category = repository.snapshot.categories.find(
        (item) => item.id === current.categoryId,
      )!;
      category.archivedAt = fixtureNow.toISOString();
      await expect(viewModel.updateTransaction(categoryEditInput(repository, type)))
        .rejects.toThrow('分类不存在、已归档或类型不匹配');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires expense and income categories to match the transaction type', async () => {
    const { repository: expenseRepository, saveOperation: expenseSave, viewModel: expenseViewModel }
      = createFixtureViewModelHarness();
    const incomeCategoryId = expenseRepository.snapshot.transactions
      .find((item) => item.type === 'income')!.categoryId!;
    await expect(expenseViewModel.updateTransaction(categoryEditInput(
      expenseRepository,
      'expense',
      { categoryId: incomeCategoryId },
    ))).rejects.toThrow('分类不存在、已归档或类型不匹配');
    expect(expenseSave).not.toHaveBeenCalled();

    const { repository: incomeRepository, saveOperation: incomeSave, viewModel: incomeViewModel }
      = createFixtureViewModelHarness();
    await expect(incomeViewModel.updateTransaction(categoryEditInput(
      incomeRepository,
      'income',
      { categoryId: fixtureIds.foodCategory },
    ))).rejects.toThrow('分类不存在、已归档或类型不匹配');
    expect(incomeSave).not.toHaveBeenCalled();
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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
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

  it('requires both transfer accounts to exist', async () => {
    for (const field of ['fromAccountId', 'toAccountId'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const overrides: Partial<TransferEditInput> = {
        [field]: '00000000-0000-4000-8000-999999999996',
      };
      await expect(viewModel.updateTransaction(transferEditInput(repository, overrides)))
        .rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires both transfer accounts to belong to the current ledger', async () => {
    for (const field of ['fromAccountId', 'toAccountId'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const accountId = field === 'fromAccountId' ? fixtureIds.bank : fixtureIds.cash;
      const account = repository.snapshot.accounts.find((item) => item.id === accountId)!;
      account.ledgerId = '00000000-0000-4000-8000-000000000002';
      await expect(viewModel.updateTransaction(transferEditInput(repository)))
        .rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
  });

  it('requires both transfer accounts to be active', async () => {
    for (const field of ['fromAccountId', 'toAccountId'] as const) {
      const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
      const accountId = field === 'fromAccountId' ? fixtureIds.bank : fixtureIds.cash;
      const account = repository.snapshot.accounts.find((item) => item.id === accountId)!;
      account.archivedAt = fixtureNow.toISOString();
      await expect(viewModel.updateTransaction(transferEditInput(repository)))
        .rejects.toThrow('账户不存在或已归档');
      expect(saveOperation).not.toHaveBeenCalled();
    }
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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
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

  it('rejects a refund whose original entry account no longer exists', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'refund')!;
    const originalEntry = repository.snapshot.entries.find(
      (item) => item.transactionId === current.originalTransactionId,
    )!;
    repository.snapshot.accounts = repository.snapshot.accounts.filter(
      (item) => item.id !== originalEntry.accountId,
    );

    await expect(viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'refund',
      amountCents: current.amountCents,
      occurredAt: current.occurredAt,
      note: current.note,
    })).rejects.toThrow('原支出账户不存在');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('rejects a refund whose original entry account belongs to another ledger', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'refund')!;
    const originalEntry = repository.snapshot.entries.find(
      (item) => item.transactionId === current.originalTransactionId,
    )!;
    const originalAccount = repository.snapshot.accounts.find(
      (item) => item.id === originalEntry.accountId,
    )!;
    originalAccount.ledgerId = '00000000-0000-4000-8000-000000000002';

    await expect(viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'refund',
      amountCents: current.amountCents,
      occurredAt: current.occurredAt,
      note: current.note,
    })).rejects.toThrow('原支出账户不存在');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('keeps an archived original expense account usable for its historical refund link', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const current = repository.snapshot.transactions.find((item) => item.type === 'refund')!;
    const originalEntry = repository.snapshot.entries.find(
      (item) => item.transactionId === current.originalTransactionId,
    )!;
    const originalAccount = repository.snapshot.accounts.find(
      (item) => item.id === originalEntry.accountId,
    )!;
    originalAccount.archivedAt = fixtureNow.toISOString();

    await viewModel.updateTransaction({
      id: current.id,
      baseVersion: current.version,
      type: 'refund',
      amountCents: current.amountCents,
      occurredAt: current.occurredAt,
      note: current.note,
    });

    expect(saveOperation).toHaveBeenCalledWith(expect.objectContaining({
      entries: [{ accountId: originalAccount.id, deltaCents: -current.amountCents }],
    }));
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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
  });

  it('requires an adjustment account to exist', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    await expect(viewModel.updateTransaction(adjustmentEditInput(repository, {
      accountId: '00000000-0000-4000-8000-999999999995',
    }))).rejects.toThrow('账户不存在或已归档');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('requires an adjustment account to belong to the current ledger', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const account = repository.snapshot.accounts.find((item) => item.id === fixtureIds.bank)!;
    account.ledgerId = '00000000-0000-4000-8000-000000000002';
    await expect(viewModel.updateTransaction(adjustmentEditInput(repository)))
      .rejects.toThrow('账户不存在或已归档');
    expect(saveOperation).not.toHaveBeenCalled();
  });

  it('requires an adjustment account to be active', async () => {
    const { repository, saveOperation, viewModel } = createFixtureViewModelHarness();
    const account = repository.snapshot.accounts.find((item) => item.id === fixtureIds.bank)!;
    account.archivedAt = fixtureNow.toISOString();
    await expect(viewModel.updateTransaction(adjustmentEditInput(repository)))
      .rejects.toThrow('账户不存在或已归档');
    expect(saveOperation).not.toHaveBeenCalled();
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
    expect(() => validateOperation(saveOperation.mock.calls[0][0])).not.toThrow();
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
