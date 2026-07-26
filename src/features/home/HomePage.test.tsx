import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { HomeSnapshot, HomeSyncState, TransactionRowModel } from '../../view-model/types';
import { HomePage } from './HomePage';

const foodId = 'category-food';

const recentTransactions: TransactionRowModel[] = [
  {
    id: 'transaction-breakfast',
    type: 'expense',
    title: '早餐',
    categoryName: '餐饮',
    categoryIconKey: 'food',
    occurredAt: '2026-07-22T00:30:00.000Z',
    timeLabel: '08:30',
    accountLabel: '储蓄卡',
    amountCents: 1800,
    amountLabel: '-¥18.00',
    amountTone: 'expense',
    version: 1,
  },
  {
    id: 'transaction-salary',
    type: 'income',
    title: '工资',
    categoryName: '收入',
    categoryIconKey: 'income',
    occurredAt: '2026-07-21T01:00:00.000Z',
    timeLabel: '09:00',
    accountLabel: '储蓄卡',
    amountCents: 500_000,
    amountLabel: '+¥5,000.00',
    amountTone: 'income',
    version: 1,
  },
  {
    id: 'transaction-bus',
    type: 'expense',
    title: '公交',
    categoryName: '交通',
    categoryIconKey: 'transport',
    occurredAt: '2026-07-20T10:30:00.000Z',
    timeLabel: '18:30',
    accountLabel: '交通卡',
    amountCents: 200,
    amountLabel: '-¥2.00',
    amountTone: 'expense',
    version: 1,
  },
];

const snapshot: HomeSnapshot = {
  totalAssetsCents: 350_000,
  todayExpenseCents: 5_000,
  monthIncomeCents: 500_000,
  monthExpenseCents: 23_000,
  monthBalanceCents: 477_000,
  budget: { amountCents: 100_000, usedCents: 23_000, remainingCents: 77_000 },
  quickCategories: [
    { id: foodId, name: '餐饮', iconKey: 'food' },
    { id: 'category-transport', name: '交通', iconKey: 'transport' },
    { id: 'category-shopping', name: '购物', iconKey: 'shopping' },
    { id: 'category-entertainment', name: '娱乐', iconKey: 'entertainment' },
  ],
  recentTransactions,
};

const quietSyncState: HomeSyncState = {
  label: '刚刚已同步',
  tone: 'quiet',
  retryable: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeViewModel(load: () => Promise<HomeSnapshot>): LedgerViewModel {
  const viewModel = new LedgerViewModel({
    ledgerId: 'ledger-home',
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
  vi.spyOn(viewModel, 'getHomeSnapshot').mockImplementation(load);
  return viewModel;
}

function renderHome(
  load: () => Promise<HomeSnapshot> = async () => snapshot,
  syncState: HomeSyncState = quietSyncState,
) {
  const viewModel = makeViewModel(load);
  const onRetrySync = vi.fn();
  const onOpenTransaction = vi.fn();
  const onStartEntry = vi.fn();
  const view = render(
    <HomePage
      viewModel={viewModel}
      syncState={syncState}
      onRetrySync={onRetrySync}
      onOpenTransaction={onOpenTransaction}
      onStartEntry={onStartEntry}
    />,
  );
  return { viewModel, onRetrySync, onOpenTransaction, onStartEntry, ...view };
}

afterEach(() => cleanup());

describe('HomePage', () => {
  it('renders the reference greeting, monthly overview, quick actions and recent rows', async () => {
    renderHome();

    expect(await screen.findByRole('heading', { name: '首页', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('早上好，海风～')).toBeInTheDocument();
    expect(screen.getByText('今天也要好好生活呀！')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /财务总览/ })).toBeInTheDocument();
    expect(screen.getByLabelText('本月收入，5000.00元')).toHaveTextContent('¥5,000.00');
    expect(screen.getByLabelText('本月支出，230.00元')).toHaveTextContent('¥230.00');
    expect(screen.getByLabelText('本月结余，4770.00元')).toHaveTextContent('¥4,770.00');
    expect(screen.getAllByRole('button', { name: /快速记账/ })).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /查看流水/ })).toHaveLength(3);

    const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(sectionHeadings.map((heading) => heading.textContent)).toEqual([
      '快速记账',
      '最近流水',
    ]);
    expect(screen.queryByText('刚刚已同步')).not.toBeInTheDocument();
  });

  it('orders monthly amounts for reading as balance, income, then expense', async () => {
    renderHome();

    await screen.findByLabelText('本月结余，4770.00元');
    const metricLabels = screen
      .getAllByLabelText(/^(本月结余|本月收入|本月支出)，/)
      .map((amount) => amount.getAttribute('aria-label')?.split('，')[0]);

    expect(metricLabels).toEqual(['本月结余', '本月收入', '本月支出']);
  });

  it('lets the overview privacy action hide and restore monthly amounts', async () => {
    const user = userEvent.setup();
    renderHome();

    await screen.findByLabelText('本月结余，4770.00元');
    await user.click(screen.getByRole('button', { name: '隐藏金额' }));
    expect(screen.getAllByLabelText('金额已隐藏')).toHaveLength(3);
    expect(screen.queryByText('¥4,770.00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '显示金额' }));
    expect(screen.getByLabelText('本月结余，4770.00元')).toHaveTextContent('¥4,770.00');
  });

  it('starts category and uncategorized entries from the five quick actions', async () => {
    const user = userEvent.setup();
    const { onStartEntry } = renderHome();

    await screen.findByRole('button', { name: '快速记账：餐饮' });
    await user.click(screen.getByRole('button', { name: '快速记账：餐饮' }));
    expect(onStartEntry).toHaveBeenLastCalledWith({ categoryId: foodId });

    await user.click(screen.getByRole('button', { name: '快速记账：更多' }));
    expect(onStartEntry).toHaveBeenLastCalledWith({ categoryId: null });
  });

  it('opens a recent transaction from its row', async () => {
    const user = userEvent.setup();
    const { onOpenTransaction } = renderHome();

    await user.click(await screen.findByRole('button', { name: /查看流水：早餐/ }));
    expect(onOpenTransaction).toHaveBeenCalledWith('transaction-breakfast');
  });

  it('shows loading while the home snapshot is pending', () => {
    const pending = deferred<HomeSnapshot>();
    renderHome(() => pending.promise);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载首页');
    expect(screen.queryByLabelText(/总资产/)).not.toBeInTheDocument();
  });

  it('shows a query error and reloads the snapshot on retry', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderHome(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return snapshot;
    });

    const retry = await screen.findByRole('button', { name: '重试加载' });
    expect(screen.getByRole('alert')).toHaveTextContent('首页加载失败');
    await user.click(retry);
    expect(await screen.findByLabelText('本月结余，4770.00元')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('keeps the home hierarchy independent from whether a budget exists', async () => {
    renderHome(async () => ({ ...snapshot, budget: null }));

    expect(await screen.findByRole('region', { name: /财务总览/ })).toBeInTheDocument();
    expect(screen.queryByText('本月预算')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: '本月预算' })).not.toBeInTheDocument();
  });

  it('renders an empty recent-transactions state when all ledger metrics are zero', async () => {
    renderHome(async () => ({
      ...snapshot,
      totalAssetsCents: 0,
      todayExpenseCents: 0,
      monthIncomeCents: 0,
      monthExpenseCents: 0,
      monthBalanceCents: 0,
      budget: null,
      recentTransactions: [],
    }));

    expect(await screen.findByLabelText('本月结余，0.00元')).toHaveTextContent('¥0.00');
    expect(screen.getByRole('heading', { name: '还没有流水' })).toBeInTheDocument();
  });

  it('marks a negative monthly balance as an expense amount', async () => {
    renderHome(async () => ({
      ...snapshot,
      monthBalanceCents: -23_000,
    }));

    expect(await screen.findByLabelText('本月结余，负230.00元')).toHaveAttribute(
      'data-tone',
      'expense',
    );
  });

  it.each([
    { label: '有 2 笔等待同步', tone: 'warning' as const },
    { label: '同步失败，请检查网络', tone: 'error' as const },
  ])('keeps $tone sync status secondary without hiding assets', async ({ label, tone }) => {
    renderHome(async () => snapshot, { label, tone, retryable: false });

    const status = screen.getByText(label);
    expect(status).toHaveAttribute('data-tone', tone);
    expect(await screen.findByLabelText('本月结余，4770.00元')).toBeVisible();
  });

  it('hides quiet sync metadata from the reference home screen', async () => {
    renderHome();

    expect(screen.queryByText('刚刚已同步')).not.toBeInTheDocument();
    expect(await screen.findByLabelText('本月结余，4770.00元')).toBeVisible();
  });

  it('retries synchronization from an accessible 44px action', async () => {
    const user = userEvent.setup();
    const { onRetrySync } = renderHome(async () => snapshot, {
      label: '同步失败，请检查网络',
      tone: 'error',
      retryable: true,
    });

    const retry = screen.getByRole('button', { name: '重试同步' });
    expect(retry.className).toMatch(/syncRetry/);
    expect(getComputedStyle(retry).minHeight).toBe('var(--control-height)');
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--control-height').trim(),
    ).toBe('44px');
    await user.click(retry);
    expect(onRetrySync).toHaveBeenCalledOnce();
  });

  it('does not update after an abandoned pending request resolves', async () => {
    const pending = deferred<HomeSnapshot>();
    const { unmount } = renderHome(() => pending.promise);
    unmount();

    await act(async () => pending.resolve(snapshot));
    await waitFor(() => expect(screen.queryByLabelText(/总资产/)).not.toBeInTheDocument());
  });
});
