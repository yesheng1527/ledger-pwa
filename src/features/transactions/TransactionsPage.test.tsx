import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import '../../design-system/global.css';
import { LedgerViewModel } from '../../view-model/ledger-view-model';
import type {
  TransactionFilters,
  TransactionListSnapshot,
  TransactionRowModel,
} from '../../view-model/types';
import { TransactionRow } from './TransactionRow';
import { TransactionsPage } from './TransactionsPage';

const transferRow: TransactionRowModel = {
  id: 'transaction-transfer',
  type: 'transfer',
  title: '储蓄卡转到现金',
  categoryName: null,
  categoryIconKey: 'transfer',
  occurredAt: '2026-07-18T00:15:00.000Z',
  timeLabel: '08:15',
  accountLabel: '储蓄卡 → 现金',
  amountCents: 10_000,
  amountLabel: '¥100.00',
  amountTone: 'neutral',
  version: 1,
};

const expenseRow: TransactionRowModel = {
  id: 'transaction-breakfast',
  type: 'expense',
  title: '早餐',
  categoryName: '餐饮',
  categoryIconKey: 'food',
  occurredAt: '2026-07-17T00:30:00.000Z',
  timeLabel: '08:30',
  accountLabel: '储蓄卡',
  amountCents: 5_000,
  amountLabel: '-¥50.00',
  amountTone: 'expense',
  version: 1,
};

const incomeRow: TransactionRowModel = {
  id: 'transaction-salary',
  type: 'income',
  title: '工资',
  categoryName: '工资',
  categoryIconKey: 'income',
  occurredAt: '2026-07-01T01:00:00.000Z',
  timeLabel: '09:00',
  accountLabel: '储蓄卡',
  amountCents: 500_000,
  amountLabel: '+¥5,000.00',
  amountTone: 'income',
  version: 1,
};

const refundRow: TransactionRowModel = {
  id: 'transaction-refund',
  type: 'refund',
  title: '早餐退款',
  categoryName: '餐饮',
  categoryIconKey: 'food',
  occurredAt: '2026-07-19T02:00:00.000Z',
  timeLabel: '10:00',
  accountLabel: '储蓄卡',
  amountCents: 3_000,
  amountLabel: '+¥30.00',
  amountTone: 'refund',
  version: 1,
};

const positiveAdjustmentRow: TransactionRowModel = {
  id: 'transaction-positive-adjustment',
  type: 'adjustment',
  title: '余额校准',
  categoryName: null,
  categoryIconKey: 'adjustment',
  occurredAt: '2026-07-20T03:00:00.000Z',
  timeLabel: '11:00',
  accountLabel: '现金',
  amountCents: 1_234,
  amountLabel: '+¥12.34',
  amountTone: 'adjustment',
  version: 1,
};

const snapshot: TransactionListSnapshot = {
  groups: [
    {
      dateKey: '2026-07-01',
      dateLabel: '7月1日',
      expenseCents: 0,
      incomeCents: 500_000,
      rows: [incomeRow],
    },
    {
      dateKey: '2026-07-18',
      dateLabel: '7月18日',
      expenseCents: 0,
      incomeCents: 0,
      rows: [transferRow],
    },
    {
      dateKey: '2026-07-17',
      dateLabel: '7月17日',
      expenseCents: 5_000,
      incomeCents: 0,
      rows: [expenseRow],
    },
  ],
  accounts: [
    { id: 'account-savings', name: '储蓄卡' },
    { id: 'account-cash', name: '现金' },
  ],
  categories: [
    { id: 'category-food', name: '餐饮', iconKey: 'food' },
    { id: 'category-income', name: '工资', iconKey: 'income' },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function makeViewModel(load: (filters: TransactionFilters) => Promise<TransactionListSnapshot>) {
  const viewModel = new LedgerViewModel({
    ledgerId: 'ledger-transactions',
    repository: {
      readLedgerSnapshot: vi.fn(),
      watchLedger: vi.fn(() => () => undefined),
      undoTransactionDelete: vi.fn(),
    },
    saveOperation: vi.fn(),
    syncNow: vi.fn(),
    now: () => new Date('2026-07-22T08:00:00.000Z'),
    makeUuid: () => 'operation-id',
  });
  vi.spyOn(viewModel, 'getTransactions').mockImplementation(load);
  return viewModel;
}

function renderPage(
  load: (filters: TransactionFilters) => Promise<TransactionListSnapshot> = async () => snapshot,
) {
  const viewModel = makeViewModel(load);
  const onOpenTransaction = vi.fn();
  const view = render(
    <TransactionsPage
      viewModel={viewModel}
      onOpenTransaction={onOpenTransaction}
    />,
  );
  return { viewModel, onOpenTransaction, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 22, 12));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TransactionsPage filters', () => {
  it('renders the complete compact filter surface for the local current month', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    expect(screen.getByRole('heading', { name: '流水' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: '搜索流水' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '搜索流水' }));
    expect(screen.getByRole('searchbox', { name: '搜索流水' })).toBeInTheDocument();
    expect(screen.getByLabelText('月份')).toHaveValue('2026-07');
    expect(await screen.findByLabelText('账户')).toBeInTheDocument();
    expect(screen.getByLabelText('日期')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '分类筛选' })).toBeInTheDocument();
  });

  it('clears an active text filter when the search field is closed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { viewModel } = renderPage();
    const getTransactions = vi.mocked(viewModel.getTransactions);

    await screen.findByLabelText('账户');
    await user.click(screen.getByRole('button', { name: '搜索流水' }));
    await user.type(screen.getByRole('searchbox', { name: '搜索流水' }), '早餐');
    await waitFor(() => expect(getTransactions).toHaveBeenLastCalledWith({
      month: '2026-07',
      accountId: null,
      date: null,
      categoryId: null,
      query: '早餐',
    }));

    await user.click(screen.getByRole('button', { name: '搜索流水' }));

    expect(screen.queryByRole('searchbox', { name: '搜索流水' })).not.toBeInTheDocument();
    await waitFor(() => expect(getTransactions).toHaveBeenLastCalledWith({
      month: '2026-07',
      accountId: null,
      date: null,
      categoryId: null,
      query: '',
    }));
  });

  it('uses the actual last calendar day as the selected month date limit', async () => {
    vi.setSystemTime(new Date(2026, 1, 15, 12));
    renderPage();

    await screen.findByLabelText('账户');
    expect(screen.getByLabelText('日期')).toHaveAttribute('max', '2026-02-28');
  });

  it('rejects an empty month without changing date bounds or querying invalid filters', async () => {
    const { viewModel } = renderPage();
    const getTransactions = vi.mocked(viewModel.getTransactions);

    await screen.findByLabelText('账户');
    expect(getTransactions).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '' } });

    expect(screen.getByLabelText('月份')).toHaveValue('2026-07');
    expect(screen.getByLabelText('日期')).toHaveAttribute('min', '2026-07-01');
    expect(screen.getByLabelText('日期')).toHaveAttribute('max', '2026-07-31');
    expect(getTransactions).toHaveBeenCalledTimes(1);
  });

  it('makes exactly one complete combined-filter call for each control change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { viewModel } = renderPage();
    const getTransactions = vi.mocked(viewModel.getTransactions);

    await screen.findByRole('button', { name: /储蓄卡转到现金/ });
    expect(getTransactions).toHaveBeenCalledTimes(1);
    expect(getTransactions.mock.calls[0]?.[0]).toEqual({
      month: '2026-07',
      accountId: null,
      date: null,
      categoryId: null,
      query: '',
    });

    await user.selectOptions(screen.getByLabelText('账户'), 'account-savings');
    await waitFor(() => expect(getTransactions).toHaveBeenCalledTimes(2));
    expect(getTransactions.mock.calls[1]?.[0]).toEqual({
      month: '2026-07',
      accountId: 'account-savings',
      date: null,
      categoryId: null,
      query: '',
    });

    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-07-17' } });
    await waitFor(() => expect(getTransactions).toHaveBeenCalledTimes(3));
    expect(getTransactions.mock.calls[2]?.[0]).toEqual({
      month: '2026-07',
      accountId: 'account-savings',
      date: '2026-07-17',
      categoryId: null,
      query: '',
    });

    await user.click(screen.getByRole('button', { name: '餐饮' }));
    await waitFor(() => expect(getTransactions).toHaveBeenCalledTimes(4));
    expect(getTransactions.mock.calls[3]?.[0]).toEqual({
      month: '2026-07',
      accountId: 'account-savings',
      date: '2026-07-17',
      categoryId: 'category-food',
      query: '',
    });

    await user.click(screen.getByRole('button', { name: '搜索流水' }));
    fireEvent.change(
      screen.getByRole('searchbox', { name: '搜索流水' }),
      { target: { value: '早餐' } },
    );
    await waitFor(() => expect(getTransactions).toHaveBeenCalledTimes(5));
    expect(getTransactions.mock.calls[4]?.[0]).toEqual({
      month: '2026-07',
      accountId: 'account-savings',
      date: '2026-07-17',
      categoryId: 'category-food',
      query: '早餐',
    });

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '2026-08' } });
    await waitFor(() => expect(getTransactions).toHaveBeenCalledTimes(6));
    expect(getTransactions.mock.calls[5]?.[0]).toEqual({
      month: '2026-08',
      accountId: 'account-savings',
      date: null,
      categoryId: 'category-food',
      query: '早餐',
    });
    expect(screen.getByLabelText('日期')).toHaveValue('');
  });
});

describe('TransactionsPage list', () => {
  it('orders date groups newest first and shows each daily expense and income total', async () => {
    renderPage();

    await screen.findByRole('button', { name: /储蓄卡转到现金/ });
    expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent))
      .toEqual(['7月18日', '7月17日', '7月1日']);
    expect(screen.getByText('当日支出 ¥50.00')).toBeInTheDocument();
    expect(screen.getByText('当日收入 ¥5,000.00')).toBeInTheDocument();
  });

  it('exposes complete row names, keeps transfers neutral and opens the selected row', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenTransaction } = renderPage();

    const transfer = await screen.findByRole('button', {
      name: /储蓄卡转到现金.*08:15.*储蓄卡.*现金.*100.00元/,
    });
    expect(transfer).toHaveAttribute('data-tone', 'neutral');
    await user.click(transfer);
    expect(onOpenTransaction).toHaveBeenCalledWith('transaction-transfer');

    expect(screen.getByRole('button', {
      name: /早餐.*餐饮.*08:30.*储蓄卡.*负50.00元/,
    })).toHaveAttribute('data-tone', 'expense');
  });

  it('keeps every filter, chip and transaction action at least 44px tall', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const searchAction = screen.getByRole('button', { name: '搜索流水' });
    await user.click(searchAction);
    const controls = [
      searchAction,
      screen.getByRole('searchbox', { name: '搜索流水' }),
      screen.getByLabelText('月份'),
      await screen.findByLabelText('账户'),
      screen.getByLabelText('日期'),
      screen.getByRole('button', { name: '全部' }),
      screen.getByRole('button', { name: '餐饮' }),
      screen.getByRole('button', { name: /储蓄卡转到现金/ }),
    ];
    for (const control of controls) {
      expect(getComputedStyle(control).minHeight).toBe('var(--control-height)');
    }
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--control-height').trim(),
    ).toBe('44px');
  });
});

describe('TransactionRow amount semantics', () => {
  it.each([
    {
      label: 'income',
      row: incomeRow,
      visibleAmount: '+¥5,000.00',
      accessibleAmount: /收入正5000.00元/,
    },
    {
      label: 'refund',
      row: refundRow,
      visibleAmount: '+¥30.00',
      accessibleAmount: /退款正30.00元/,
    },
    {
      label: 'positive adjustment',
      row: positiveAdjustmentRow,
      visibleAmount: '+¥12.34',
      accessibleAmount: /调增正12.34元/,
    },
  ])('preserves the authoritative positive sign and $label semantics', ({
    row,
    visibleAmount,
    accessibleAmount,
  }) => {
    render(<TransactionRow row={row} onOpen={vi.fn()} />);

    const button = screen.getByRole('button', { name: accessibleAmount });
    expect(within(button).getByText(visibleAmount)).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('TransactionsPage query states', () => {
  it('shows a loading status while transactions are pending', () => {
    const pending = deferred<TransactionListSnapshot>();
    renderPage(() => pending.promise);

    expect(screen.getByRole('status')).toHaveTextContent('正在读取流水');
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('shows a safe error and retries without exposing the exception', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let attempts = 0;
    renderPage(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('secret database failure');
      return snapshot;
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('流水暂时无法读取');
    expect(alert).not.toHaveTextContent('secret database failure');
    const retry = within(alert).getByRole('button', { name: '重试' });
    expect(getComputedStyle(retry).minHeight).toBe('var(--control-height)');
    await user.click(retry);

    expect(await screen.findByRole('button', { name: /储蓄卡转到现金/ })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('uses the empty-ledger illustration when no date group matches', async () => {
    const { container } = renderPage(async () => ({ ...snapshot, groups: [] }));

    expect(await screen.findByRole('heading', { name: '没有找到流水' })).toBeInTheDocument();
    expect(container.querySelector('.ds-empty-state img')).toHaveAttribute(
      'src',
      expect.stringContaining('empty-ledger'),
    );
  });
});
