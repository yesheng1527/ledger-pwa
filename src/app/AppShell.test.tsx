import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
) {
  return render(
    <AppShell
      viewModel={createViewModel()}
      syncState={syncState}
      onRetrySync={onRetrySync}
    />,
  );
}

afterEach(() => {
  cleanup();
  createdViewModels.splice(0).forEach((viewModel) => viewModel.dispose());
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
  it('replaces only home and transactions while keeping every regular panel mounted', async () => {
    const { container } = renderShell();

    expect(container.querySelectorAll('[id^="panel-"]')).toHaveLength(4);
    expect(await screen.findByRole('heading', { name: '首页' })).toBeInTheDocument();
    expect(screen.queryByText('首页内容将在下一阶段接入真实账本数据。')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '流水' }));
    expect(await screen.findByRole('heading', { name: '流水' })).toBeInTheDocument();
    expect(screen.queryByText('流水列表将在下一阶段接入筛选和明细。')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '统计' }));
    expect(screen.getByText('统计图表将在真实数据接口完成后开放。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('账户、分类和备份设置将在后续阶段开放。')).toBeInTheDocument();
  });

  it('exposes exactly one main landmark for every active regular panel', async () => {
    const user = userEvent.setup();
    renderShell();

    expect(await screen.findAllByRole('main')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(await screen.findAllByRole('main')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '统计' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent(
      '统计图表将在真实数据接口完成后开放。',
    );

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent(
      '账户、分类和备份设置将在后续阶段开放。',
    );
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

  it('passes a quick category intent without changing the approved center dialog', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(await screen.findByRole('button', { name: '快速记账：餐饮' }));
    expect(screen.getByRole('dialog', { name: '记账功能建设中' })).toBeVisible();
    expect(screen.getByText('已预选：餐饮')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭' }));

    await user.click(screen.getByRole('button', { name: '记账' }));
    expect(screen.getByRole('dialog', { name: '记账功能建设中' })).toBeVisible();
    expect(screen.queryByText(/已预选：/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
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
    const { rerender } = renderShell(quietSyncState, retry);

    expect(screen.getByText('已同步')).toHaveAttribute('data-tone', 'quiet');
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
    expect(screen.getByText('有同步冲突待处理')).toBeVisible();
    expect(screen.queryByRole('button', { name: '重试同步' })).not.toBeInTheDocument();
  });
});
