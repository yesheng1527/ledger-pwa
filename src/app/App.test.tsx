import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncStatus } from '../sync/sync-engine';
import { createE2eServices } from '../test/e2e-services';
import { fixtureIds } from '../test/ledger-fixture';
import type { AppRuntimeValue } from './providers';
import { App, toHomeSyncState } from './App';
import { useAppRuntime } from './providers';

vi.mock('./AuthGate', () => ({
  AuthGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./providers')>();
  return { ...actual, useAppRuntime: vi.fn() };
});

const mockedUseAppRuntime = vi.mocked(useAppRuntime);

function status(
  mode: SyncStatus['mode'],
  pendingCount = 0,
  message: string | null = null,
): SyncStatus {
  return { mode, pendingCount, lastSyncedAt: null, message };
}

describe('toHomeSyncState', () => {
  it.each([
    [status('idle'), { label: '已同步', tone: 'quiet', retryable: false }],
    [status('idle', 3), { label: '3 条待同步', tone: 'quiet', retryable: false }],
    [status('syncing'), { label: '正在同步', tone: 'quiet', retryable: false }],
    [status('offline'), { label: '当前离线，可继续记账', tone: 'warning', retryable: true }],
    [status('error'), { label: '同步失败，稍后重试', tone: 'error', retryable: true }],
    [status('error', 0, '服务器暂不可用'), {
      label: '服务器暂不可用',
      tone: 'error',
      retryable: true,
    }],
    [status('conflict'), { label: '有同步冲突待处理', tone: 'error', retryable: false }],
  ] as const)('maps %o to its home status', (input, expected) => {
    expect(toHomeSyncState(input)).toEqual(expected);
  });
});

describe('App', () => {
  beforeEach(() => {
    const services = createE2eServices('logged-in');
    const ledgerViewModel = services.createLedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository: services.repo,
      saveOperation: (operation) => services.repo.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date(),
      makeUuid: () => '00000000-0000-4000-8000-000000009999',
    });
    mockedUseAppRuntime.mockReturnValue({
      ledgerViewModel,
      syncStatus: status('idle'),
      syncNow: vi.fn(),
    } as unknown as AppRuntimeValue);
  });

  it('composes the authenticated runtime with the real ledger shell', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByText('已同步')).toBeVisible();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['首页', '流水', '记账', '统计', '我的']),
    );
  });

  it('renders no private shell before the runtime view model is ready', () => {
    mockedUseAppRuntime.mockReturnValue({
      ledgerViewModel: null,
      syncStatus: status('idle'),
      syncNow: vi.fn(),
    } as unknown as AppRuntimeValue);

    const { container } = render(<App />);

    expect(container).toBeEmptyDOMElement();
  });
});
