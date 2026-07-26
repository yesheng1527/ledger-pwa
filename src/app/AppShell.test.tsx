import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createE2eServices } from '../test/e2e-services';
import { fixtureIds } from '../test/ledger-fixture';
import type { LedgerViewModel } from '../view-model/ledger-view-model';
import type { HomeSyncState } from '../view-model/types';
import { AppShell } from './AppShell';
import { navigationItems } from './navigation';

const quietSyncState: HomeSyncState = {
  label: '已同步',
  tone: 'quiet',
  retryable: false,
};

const createdViewModels: LedgerViewModel[] = [];
let uuidSequence = 9900;

function createViewModel(): LedgerViewModel {
  const services = createE2eServices('logged-in');
  const viewModel = services.createLedgerViewModel({
    ledgerId: fixtureIds.ledger,
    repository: services.repo,
    saveOperation: (operation) => services.repo.saveOperation(operation),
    syncNow: async () => undefined,
    now: () => new Date(),
    makeUuid: () => {
      uuidSequence += 1;
      return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, '0')}`;
    },
  });
  createdViewModels.push(viewModel);
  return viewModel;
}

function renderShell(
  syncState: HomeSyncState = quietSyncState,
  onRetrySync = vi.fn(),
  viewModel = createViewModel(),
) {
  return {
    viewModel,
    ...render(
    <AppShell
      viewModel={viewModel}
      syncState={syncState}
      onRetrySync={onRetrySync}
    />,
    ),
  };
}

afterEach(() => {
  cleanup();
  createdViewModels.splice(0).forEach((viewModel) => viewModel.dispose());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('application navigation model', () => {
  it('keeps the five navigation labels in their fixed order with unique ids', () => {
    expect(navigationItems.map(({ label }) => label)).toEqual([
      '首页',
      '流水',
      '记账',
      '统计',
      '我的',
    ]);
    expect(new Set(navigationItems.map(({ id }) => id)).size).toBe(navigationItems.length);
  });

  it('models only the third navigation item as an entry action', () => {
    expect(navigationItems.map(({ kind }) => kind)).toEqual([
      'tab',
      'tab',
      'entry',
      'tab',
      'tab',
    ]);
  });
});

describe('AppShell', () => {
  it('keeps all four real pages mounted without a global brand header', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const background = container.querySelector<HTMLElement>('[data-shell-background]');

    expect(container.querySelectorAll('[id^="panel-"]')).toHaveLength(4);
    expect(background?.firstElementChild).toHaveAttribute('data-shell-scroll');
    expect(await screen.findByRole('heading', { name: '首页' })).toBeInTheDocument();
    expect(screen.queryByText('首页内容将在下一阶段接入真实账本数据。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(await screen.findByRole('heading', { name: '流水' })).toBeInTheDocument();
    expect(screen.queryByText('流水列表将在下一阶段接入筛选和明细。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '统计' }));
    expect(await screen.findByRole('heading', { name: '统计' })).toBeInTheDocument();
    expect(screen.queryByText('统计图表将在真实数据接口完成后开放。')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(await screen.findByRole('heading', { name: '我的' })).toBeInTheDocument();
    expect(screen.queryByText('账户、分类和备份设置将在后续阶段开放。')).not.toBeInTheDocument();
  });

  it('exposes exactly one main landmark for every active regular panel', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(await screen.findAllByRole('main')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(await screen.findAllByRole('main')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '统计' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(within(screen.getByRole('main')).getByRole('heading', { name: '统计' }))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(within(screen.getByRole('main')).getByRole('heading', { name: '我的' }))
      .toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('heading', { name: '账本管理' }))
      .toBeInTheDocument();
  });

  it('keeps mounted page filters and each regular tab scroll offset', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const scrollContainer = container.querySelector<HTMLElement>('[data-shell-scroll]');
    expect(scrollContainer).not.toBeNull();

    scrollContainer!.scrollTop = 137;
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(scrollContainer!.scrollTop).toBe(0);
    const search = await screen.findByRole('searchbox', { name: '搜索流水' });
    await user.type(search, '午餐');

    scrollContainer!.scrollTop = 42;
    await user.click(screen.getByRole('button', { name: '首页' }));
    expect(scrollContainer!.scrollTop).toBe(137);
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(scrollContainer!.scrollTop).toBe(42);
    expect(screen.getByRole('searchbox', { name: '搜索流水' })).toHaveValue('午餐');
  });

  it('opens one shared detail sheet from a home row and restores source focus on close', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    const source = await screen.findByRole('button', { name: /查看流水：午餐/ });

    await user.click(source);
    const dialog = await screen.findByRole('dialog', { name: '流水详情' });

    expect(dialog).toBeVisible();
    expect(screen.getByRole('button', { name: '编辑流水' })).toHaveFocus();
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: '关闭详情' }));
    expect(screen.queryByRole('dialog', { name: '流水详情' })).not.toBeInTheDocument();
    await waitFor(() => expect(source).toHaveFocus());
    expect(container.querySelector('[data-shell-background]')).not.toHaveAttribute('inert');
  });

  it('passes quick-category intent into the full-screen entry and clears it for center entry', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    const quickEntry = await screen.findByRole('button', { name: '快速记账：餐饮' });
    await user.click(quickEntry);
    await screen.findByRole('button', { name: '餐饮' });
    expect(screen.getByRole('dialog', { name: '记账' })).toBeVisible();
    expect(screen.getByRole('button', { name: '餐饮' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('金额')).toHaveFocus();
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert');
    await user.click(screen.getByRole('button', { name: '关闭记账' }));
    await waitFor(() => expect(quickEntry).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '记账' }));
    await screen.findByRole('button', { name: '娱乐' });
    expect(screen.getByRole('button', { name: '娱乐' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '餐饮' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('金额')).toHaveFocus();
  });

  it('refreshes home and statistics subscribers after a successful entry', async () => {
    const user = userEvent.setup();
    const viewModel = createViewModel();
    const homeQuery = vi.spyOn(viewModel, 'getHomeSnapshot');
    const statisticsQuery = vi.spyOn(viewModel, 'getStatistics');
    renderShell(quietSyncState, vi.fn(), viewModel);

    await screen.findByRole('heading', { name: '首页' });
    await waitFor(() => expect(statisticsQuery).toHaveBeenCalled());
    const homeCallsBeforeSave = homeQuery.mock.calls.length;
    const statisticsCallsBeforeSave = statisticsQuery.mock.calls.length;

    await user.click(screen.getByRole('button', { name: '记账' }));
    await screen.findByLabelText('金额');
    await user.type(screen.getByLabelText('金额'), '12.34');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '记账' })).not.toBeInTheDocument();
      expect(homeQuery.mock.calls.length).toBeGreaterThan(homeCallsBeforeSave);
      expect(statisticsQuery.mock.calls.length).toBeGreaterThan(statisticsCallsBeforeSave);
    });
  });

  it('keeps a visible undo toast outside the inert shell background', async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(await screen.findByRole('button', { name: /查看流水：午餐/ }));
    await screen.findByRole('dialog', { name: '流水详情' });
    await user.click(screen.getByRole('button', { name: '删除流水' }));

    expect(await screen.findByRole('status')).toHaveTextContent('流水已删除');
    expect(container.querySelector('[data-shell-background]')).not.toHaveAttribute('inert');
  });

  it('keeps quiet sync states quiet and exposes retryable authored status', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { container, rerender } = renderShell(quietSyncState, retry);
    const homePanel = container.querySelector<HTMLElement>('#panel-home');
    expect(homePanel).not.toBeNull();

    expect(within(homePanel!).getByText('已同步')).toHaveAttribute('data-tone', 'quiet');
    expect(screen.queryByRole('button', { name: '重试同步' })).not.toBeInTheDocument();

    rerender(
      <AppShell
        viewModel={createdViewModels[0]!}
        syncState={{ label: '当前离线，可继续记账', tone: 'warning', retryable: true }}
        onRetrySync={retry}
      />,
    );
    await user.click(screen.getByRole('button', { name: '重试同步' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <AppShell
        viewModel={createdViewModels[0]!}
        syncState={{ label: '有同步冲突待处理', tone: 'error', retryable: false }}
        onRetrySync={retry}
      />,
    );
    expect(within(homePanel!).getByText('有同步冲突待处理')).toBeVisible();
    expect(screen.queryByRole('button', { name: '重试同步' })).not.toBeInTheDocument();
  });
});
