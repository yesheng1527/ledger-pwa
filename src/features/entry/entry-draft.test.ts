import { describe, expect, it, vi } from 'vitest';
import type { EntryOptions, TransactionCreateInput } from '../../view-model/types';
import {
  createEntryDraftController,
  type EntryPreferencePort,
  type EntryDraftValues,
} from './entry-draft';

const now = new Date(2026, 6, 26, 14, 5, 48);

const options: EntryOptions = {
  accounts: [
    { id: 'bank', name: '银行卡', accountClass: 'asset', balanceCents: 300000 },
    { id: 'cash', name: '现金', accountClass: 'asset', balanceCents: 20000 },
    { id: 'credit', name: '信用卡', accountClass: 'liability', balanceCents: -50000 },
  ],
  expenseCategories: [
    { id: 'food', name: '餐饮', iconKey: 'food' },
    { id: 'travel', name: '旅行', iconKey: 'travel' },
  ],
  incomeCategories: [
    { id: 'salary', name: '工资', iconKey: 'income' },
  ],
  refundableExpenses: [
    {
      id: 'expense-1',
      title: '买衣服',
      accountId: 'credit',
      remainingCents: 18000,
      occurredAt: new Date(2026, 6, 17, 14).toISOString(),
    },
  ],
};

function preference(lastAccountId: string | null = 'cash') {
  return {
    loadLastAccountId: () => lastAccountId,
    saveLastAccountId: vi.fn<(accountId: string) => void>(),
  } satisfies EntryPreferencePort;
}

function harness(input: {
  lastAccountId?: string | null;
  quickCategoryId?: string | null;
  createTransaction?: (value: TransactionCreateInput) => Promise<{ transactionId: string }>;
} = {}) {
  const preferences = preference(input.lastAccountId);
  const createTransaction = vi.fn(
    input.createTransaction
      ?? (async () => ({ transactionId: 'transaction-new' })),
  );
  const controller = createEntryDraftController({
    options,
    quickCategoryId: input.quickCategoryId,
    preferences,
    now: () => new Date(now),
    createTransaction,
  });
  return { controller, createTransaction, preferences };
}

describe('entry draft defaults and retention', () => {
  it('uses the local minute, quick category, last valid account and explicit direction', () => {
    const { controller } = harness({ quickCategoryId: 'travel' });

    expect(controller.getState()).toEqual({
      submitting: false,
      error: null,
      values: {
        type: 'expense',
        amountYuan: '',
        categoryId: 'travel',
        accountId: 'cash',
        fromAccountId: 'cash',
        toAccountId: 'bank',
        originalTransactionId: null,
        adjustmentDirection: 'increase',
        occurredAtLocal: '2026-07-26T14:05',
        note: '',
      },
    });
  });

  it('falls back to the first compatible account and category', () => {
    const { controller } = harness({
      lastAccountId: 'archived',
      quickCategoryId: 'archived',
    });

    expect(controller.getState().values).toMatchObject({
      accountId: 'bank',
      fromAccountId: 'bank',
      toAccountId: 'cash',
      categoryId: 'food',
    });
  });

  it('preserves the authored draft when refreshed options change', () => {
    const { controller } = harness();
    controller.update({
      amountYuan: '68.50',
      note: '周末晚餐',
      categoryId: 'travel',
    });
    const before = controller.getState().values;

    controller.setOptions({
      ...options,
      expenseCategories: options.expenseCategories.filter((item) => item.id !== 'travel'),
    });

    expect(controller.getState().values).toEqual(before);
  });
});

describe('entry draft validation', () => {
  it('returns the authored amount error for empty and invalid amounts', () => {
    const { controller } = harness();
    expect(controller.validate()).toEqual({
      field: 'amount',
      message: '请输入大于 0 的金额',
    });
    controller.update({ amountYuan: '1.001' });
    expect(controller.validate()).toEqual({
      field: 'amount',
      message: '请输入大于 0 的金额',
    });
  });

  it('validates transfer direction and account class', () => {
    const { controller } = harness();
    controller.changeType('transfer');
    controller.update({
      amountYuan: '80',
      fromAccountId: 'bank',
      toAccountId: 'bank',
    });
    expect(controller.validate()).toEqual({
      field: 'toAccount',
      message: '转出和转入账户不能相同',
    });

    controller.update({ fromAccountId: 'credit', toAccountId: 'bank' });
    expect(controller.validate()).toEqual({
      field: 'fromAccount',
      message: '负债账户不能作为转出账户',
    });
  });

  it('requires a refundable expense and enforces its remaining amount', () => {
    const { controller } = harness();
    controller.changeType('refund');
    controller.update({ amountYuan: '20' });
    expect(controller.validate()).toEqual({
      field: 'originalExpense',
      message: '请选择原支出',
    });

    controller.update({
      originalTransactionId: 'expense-1',
      amountYuan: '180.01',
    });
    expect(controller.validate()).toEqual({
      field: 'amount',
      message: '退款金额不能超过原支出剩余可退金额',
    });
  });

  it('uses the explicit direction for a non-zero adjustment', () => {
    const { controller } = harness();
    controller.changeType('adjustment');
    controller.update({ amountYuan: '0' });
    expect(controller.validate()).toEqual({
      field: 'amount',
      message: '余额校准金额不能为 0',
    });

    controller.update({
      amountYuan: '36',
      accountId: 'cash',
      adjustmentDirection: 'decrease',
    });
    expect(controller.validate()).toEqual({
      input: {
        type: 'adjustment',
        deltaCents: -3600,
        accountId: 'cash',
        occurredAt: new Date(2026, 6, 26, 14, 5).toISOString(),
        note: '',
      },
    });
  });
});

describe('entry draft submission', () => {
  it('keeps the draft while saving and resets only after success', async () => {
    let resolveSave!: (value: { transactionId: string }) => void;
    const pending = new Promise<{ transactionId: string }>((resolve) => {
      resolveSave = resolve;
    });
    const { controller, createTransaction, preferences } = harness({
      createTransaction: () => pending,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.update({ amountYuan: '68', note: ' 晚餐 ' });

    const submitting = controller.submit();
    expect(controller.getState()).toMatchObject({
      submitting: true,
      values: { amountYuan: '68', note: ' 晚餐 ' },
    });
    expect(createTransaction).toHaveBeenCalledWith({
      type: 'expense',
      amountCents: 6800,
      accountId: 'cash',
      categoryId: 'food',
      occurredAt: new Date(2026, 6, 26, 14, 5).toISOString(),
      note: ' 晚餐 ',
    });

    resolveSave({ transactionId: 'transaction-new' });
    await expect(submitting).resolves.toEqual({ transactionId: 'transaction-new' });
    expect(preferences.saveLastAccountId).toHaveBeenCalledWith('cash');
    expect(controller.getState()).toMatchObject({
      submitting: false,
      error: null,
      values: { type: 'expense', amountYuan: '', note: '', accountId: 'cash' },
    });
    expect(listener).toHaveBeenCalled();
  });

  it('preserves every value and maps stale and unknown save failures', async () => {
    const stale = harness({
      createTransaction: async () => {
        throw new Error('账户不存在或已归档');
      },
    });
    const authored: Partial<EntryDraftValues> = {
      amountYuan: '68',
      note: '不能丢',
      categoryId: 'travel',
    };
    stale.controller.update(authored);
    await expect(stale.controller.submit()).rejects.toThrow();
    expect(stale.controller.getState()).toMatchObject({
      submitting: false,
      error: {
        field: 'account',
        message: '账户、分类或原支出已经变化，请重新选择',
      },
      values: authored,
    });

    const unknown = harness({
      createTransaction: async () => {
        throw new Error('network unavailable');
      },
    });
    unknown.controller.update({ amountYuan: '68' });
    await expect(unknown.controller.submit()).rejects.toThrow();
    expect(unknown.controller.getState().error).toEqual({
      field: 'amount',
      message: '保存失败，请稍后重试',
    });
  });
});
