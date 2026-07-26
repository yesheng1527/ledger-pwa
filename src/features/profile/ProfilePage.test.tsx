import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import '../../design-system/global.css';
import { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { HomeSnapshot, HomeSyncState } from '../../view-model/types';
import { ProfilePage } from './ProfilePage';

const home: HomeSnapshot = {
  totalAssetsCents: 350000,
  todayExpenseCents: 5000,
  monthIncomeCents: 100000,
  monthExpenseCents: 23000,
  monthBalanceCents: 77000,
  budget: { amountCents: 50000, usedCents: 23000, remainingCents: 27000 },
  quickCategories: [],
  recentTransactions: [],
};

const syncState: HomeSyncState = {
  label: '同步失败，可以重试',
  tone: 'error',
  retryable: true,
};

function makeViewModel() {
  const viewModel = new LedgerViewModel({
    ledgerId: 'ledger-profile',
    repository: {
      readLedgerSnapshot: vi.fn(),
      watchLedger: vi.fn(() => () => undefined),
      undoTransactionDelete: vi.fn(),
    },
    saveOperation: vi.fn(),
    syncNow: vi.fn(),
    now: () => new Date('2026-07-26T08:00:00.000Z'),
    makeUuid: () => 'operation-id',
  });
  vi.spyOn(viewModel, 'getHomeSnapshot').mockResolvedValue(home);
  return viewModel;
}

afterEach(() => cleanup());

describe('ProfilePage', () => {
  it('renders identity, real sync state, pending count and budget summary', async () => {
    const onRetrySync = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ProfilePage
        viewModel={makeViewModel()}
        displayName="小海"
        ledgerName="我们的生活账本"
        syncState={syncState}
        pendingCount={2}
        onRetrySync={onRetrySync}
      />,
    );

    expect(await screen.findByRole('heading', { name: '我的', level: 1 }))
      .toBeInTheDocument();
    expect(screen.getByRole('img', { name: '海风小账本' })).toBeInTheDocument();
    expect(container.querySelector('img[src*="profile-seaside"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('小海')).toBeInTheDocument();
    expect(screen.getByText('我们的生活账本')).toBeInTheDocument();
    expect(screen.getByText('同步失败，可以重试')).toBeInTheDocument();
    expect(screen.getByText('2 笔待同步')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '本月预算' })).toHaveAttribute(
      'aria-valuenow',
      '23000',
    );

    await user.click(screen.getByRole('button', { name: '重试同步' }));
    expect(onRetrySync).toHaveBeenCalledOnce();
  });

  it('groups management entries and honestly marks future work unavailable', async () => {
    render(
      <ProfilePage
        viewModel={makeViewModel()}
        displayName="小海"
        ledgerName="我们的生活账本"
        syncState={{ label: '刚刚已同步', tone: 'quiet', retryable: false }}
        pendingCount={0}
        onRetrySync={vi.fn()}
      />,
    );
    await screen.findByText('小海');

    expect(screen.getByRole('heading', { name: '账本管理' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '数据与偏好' })).toBeInTheDocument();
    const futureRows = screen.getAllByRole('button', { name: /后续阶段开放/ });
    expect(futureRows.length).toBeGreaterThanOrEqual(7);
    futureRows.forEach((row) => {
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toBeDisabled();
    });
    expect(screen.queryByRole('button', { name: '重试同步' })).not.toBeInTheDocument();
    expect(screen.queryByText(/成功|访问令牌|密码/)).not.toBeInTheDocument();
  });
});
