import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppRuntimeValue } from './providers';
import { LedgerViewModel } from '../view-model/ledger-view-model';
import { createMutableLedgerFixture, fixtureIds } from '../test/ledger-fixture';
import { AuthGateView } from './AuthGate';

afterEach(() => cleanup());

const session: Session = {
  access_token: 'access-token-user-1',
  refresh_token: 'refresh-token-user-1',
  expires_in: 3_600,
  expires_at: 1_785_000_000,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'user-1@example.com',
    email_confirmed_at: '2026-07-19T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-07-19T00:00:00.000Z',
    last_sign_in_at: '2026-07-19T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    is_anonymous: false,
  },
};

function createRuntime(overrides: Partial<AppRuntimeValue> = {}): AppRuntimeValue {
  return {
    session: null,
    authReady: false,
    passwordRecovery: false,
    initializing: false,
    initializationMessage: null,
    ledgerViewModel: null,
    syncStatus: {
      mode: 'idle',
      pendingCount: 0,
      lastSyncedAt: null,
      message: null,
    },
    signUp: vi.fn(async () => undefined),
    signIn: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    finishPasswordRecovery: vi.fn(),
    syncNow: vi.fn(async () => undefined),
    saveOperation: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createReadyViewModel(): LedgerViewModel {
  const repository = createMutableLedgerFixture();
  return new LedgerViewModel({
    ledgerId: fixtureIds.ledger,
    repository,
    saveOperation: (operation) => repository.saveOperation(operation),
    syncNow: async () => undefined,
    now: () => new Date('2026-07-18T12:00:00.000Z'),
    makeUuid: () => '00000000-0000-4000-8000-000000009999',
  });
}

describe('AuthGateView', () => {
  it('shows branded loading while authentication is not ready', () => {
    render(
      <AuthGateView runtime={createRuntime()}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByText('正在检查登录状态')).toBeInTheDocument();
    expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
  });

  it('shows an expired recovery link and returns to login explicitly', async () => {
    const user = userEvent.setup();
    const runtime = createRuntime({ authReady: true, passwordRecovery: true });
    render(
      <AuthGateView runtime={runtime}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByText('重置链接无效或已过期')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回登录' }));
    expect(runtime.finishPasswordRecovery).toHaveBeenCalledOnce();
  });

  it('shows reset password before the authenticated shell during recovery', () => {
    const runtime = createRuntime();
    render(
      <AuthGateView runtime={{ ...runtime, session, authReady: true, passwordRecovery: true }}>
        <span>应用框架</span>
      </AuthGateView>,
    );
    expect(screen.getByRole('heading', { name: '设置新密码' })).toBeInTheDocument();
    expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
  });

  it('shows login while logged out', () => {
    render(
      <AuthGateView runtime={createRuntime({ authReady: true })}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
  });

  it('shows loading while the personal ledger initializes', () => {
    render(
      <AuthGateView runtime={createRuntime({ session, authReady: true, initializing: true })}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByText('正在准备个人账本')).toBeInTheDocument();
    expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
  });

  it('keeps the branded loading state while the ledger view model is missing', () => {
    render(
      <AuthGateView runtime={createRuntime({ session, authReady: true, initializing: false })}>
        <span>搴旂敤妗嗘灦</span>
      </AuthGateView>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('正在准备个人账本');
    expect(screen.queryByText('搴旂敤妗嗘灦')).not.toBeInTheDocument();
  });

  it('shows the first-login offline explanation instead of the shell', () => {
    const runtime = createRuntime();
    render(
      <AuthGateView runtime={{ ...runtime, session, authReady: true, initializationMessage: '首次登录需要联网完成初始化' }}>
        <span>应用框架</span>
      </AuthGateView>,
    );
    expect(screen.getByText('首次登录需要联网完成初始化')).toBeInTheDocument();
  });

  it('shows a generic initialization failure and retries it', async () => {
    const user = userEvent.setup();
    const runtime = createRuntime({
      session,
      authReady: true,
      initializationMessage: '初始化失败，请稍后重试',
    });
    render(
      <AuthGateView runtime={runtime}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByText('初始化失败，请稍后重试')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(runtime.syncNow).toHaveBeenCalledOnce();
    expect(screen.queryByText('应用框架')).not.toBeInTheDocument();
  });

  it('renders the authenticated shell after initialization', () => {
    render(
      <AuthGateView runtime={createRuntime({
        session,
        authReady: true,
        ledgerViewModel: createReadyViewModel(),
      })}>
        <span>应用框架</span>
      </AuthGateView>,
    );

    expect(screen.getByText('应用框架')).toBeInTheDocument();
  });
});
