import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerReadSnapshot } from '../db/records';
import type { LedgerOperation } from '../domain/operations';
import type { SyncStatus } from '../sync/sync-engine';
import { LedgerViewModel } from '../view-model/ledger-view-model';
import type { LedgerViewModelOptions } from '../view-model/types';
import { AuthGate } from './AuthGate';
import {
  AppProviders,
  type AppProviderServices,
  type AppRuntimeValue,
  isPasswordRecoveryPath,
  useAppRuntime,
} from './providers';

const ledgerA = '00000000-0000-4000-8000-000000000001';
const ledgerB = '00000000-0000-4000-8000-000000000002';
const idleStatus: SyncStatus = {
  mode: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  message: null,
};

type SessionListener = (event: AuthChangeEvent, session: Session | null) => void | Promise<void>;

let latestRuntime: AppRuntimeValue;

function sessionFor(userId: string): Session {
  return {
    access_token: `access-token-${userId}`,
    refresh_token: `refresh-token-${userId}`,
    expires_in: 3_600,
    expires_at: 1_785_000_000,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${userId}@example.com`,
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
}

function operationFor(targetLedgerId = ledgerA): LedgerOperation {
  return {
    schemaVersion: 1,
    operationId: '00000000-0000-4000-8000-000000000010',
    ledgerId: targetLedgerId,
    createdAt: '2026-07-19T08:00:00.000Z',
    kind: 'transaction.create',
    transaction: {
      id: '00000000-0000-4000-8000-000000000020',
      operationId: '00000000-0000-4000-8000-000000000010',
      ledgerId: targetLedgerId,
      type: 'expense',
      amountCents: 6800,
      categoryId: null,
      occurredAt: '2026-07-19T08:00:00.000Z',
      note: '',
      originalTransactionId: null,
      version: 1,
      deletedAt: null,
    },
    entries: [{
      accountId: '00000000-0000-4000-8000-000000000030',
      deltaCents: -6800,
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createAuthHarness() {
  const listeners = new Set<SessionListener>();
  const unsubscribers: Array<ReturnType<typeof vi.fn>> = [];
  return {
    service: {
      onSessionChange: vi.fn((listener: SessionListener) => {
        listeners.add(listener);
        const unsubscribe = vi.fn(() => listeners.delete(listener));
        unsubscribers.push(unsubscribe);
        return unsubscribe;
      }),
      signUp: vi.fn(async () => undefined),
      signIn: vi.fn(async () => undefined),
      requestPasswordReset: vi.fn(async () => undefined),
      updatePassword: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
    },
    emit(event: AuthChangeEvent, session: Session | null) {
      for (const listener of [...listeners]) void listener(event, session);
    },
    listenerCount: () => listeners.size,
    unsubscribers,
  };
}

function createEngineHarness() {
  const listeners = new Set<(status: SyncStatus) => void>();
  return {
    engine: {
      getStatus: vi.fn(() => idleStatus),
      subscribe: vi.fn((listener: (status: SyncStatus) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      syncNow: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    },
    emit(status: SyncStatus) {
      for (const listener of listeners) listener(status);
    },
    listenerCount: () => listeners.size,
  };
}

function createHarness(options: { online?: boolean; cachedLedgerId?: string | null } = {}) {
  let online = options.online ?? true;
  const auth = createAuthHarness();
  const sync = createEngineHarness();
  const savedOperations: LedgerOperation[] = [];
  const emptySnapshot = (ledgerId: string): LedgerReadSnapshot => ({
    ledgerId,
    accounts: [],
    categories: [],
    transactions: [],
    entries: [],
    budgets: [],
    categoryBudgets: [],
  });
  const repo = {
    getPersonalLedgerId: vi.fn(async () => options.cachedLedgerId ?? null),
    readLedgerSnapshot: vi.fn(async (ledgerId: string) => emptySnapshot(ledgerId)),
    watchLedger: vi.fn(() => () => undefined),
    saveOperation: vi.fn(async (operation: LedgerOperation) => {
      savedOperations.push(operation);
    }),
    undoTransactionDelete: vi.fn(async () => undefined),
  };
  const api = {
    bootstrapPersonalLedger: vi.fn(async () => ledgerA),
  };
  const createSyncEngine = vi.fn(() => sync.engine);
  const viewModels: LedgerViewModel[] = [];
  const createLedgerViewModel = vi.fn((viewModelOptions: LedgerViewModelOptions) => {
    const viewModel = new LedgerViewModel(viewModelOptions);
    vi.spyOn(viewModel, 'dispose');
    viewModels.push(viewModel);
    return viewModel;
  });
  const services = {
    auth: auth.service,
    api,
    repo,
    createSyncEngine,
    createLedgerViewModel,
    isOnline: () => online,
  } satisfies AppProviderServices;
  return {
    auth,
    sync,
    repo,
    api,
    createSyncEngine,
    createLedgerViewModel,
    viewModels,
    services,
    savedOperations,
    setOnline(value: boolean) {
      online = value;
    },
  };
}

function RuntimeProbe({ onRuntime }: { onRuntime?: (runtime: AppRuntimeValue) => void }) {
  const runtime = useAppRuntime();
  useEffect(() => {
    latestRuntime = runtime;
    onRuntime?.(runtime);
  }, [onRuntime, runtime]);
  return (
    <output aria-label="runtime">
      {JSON.stringify({
        userId: runtime.session?.user.id ?? null,
        initializing: runtime.initializing,
        message: runtime.initializationMessage,
        syncMode: runtime.syncStatus.mode,
        ledgerId: runtime.ledgerViewModel?.ledgerId ?? null,
      })}
    </output>
  );
}

function emitSession(auth: ReturnType<typeof createAuthHarness>, session: Session) {
  act(() => auth.emit('SIGNED_IN', session));
}

async function finishInitialization(harness: ReturnType<typeof createHarness>, userId = 'user-a') {
  emitSession(harness.auth, sessionFor(userId));
  await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('AppProviders', () => {
  it('recognizes the root query callback and the legacy base-path recovery route', () => {
    expect(isPasswordRecoveryPath('/ledger-pwa/', '/ledger-pwa/', '?auth=reset')).toBe(true);
    expect(isPasswordRecoveryPath('/ledger-pwa/', '/ledger-pwa/', '?auth=other')).toBe(false);
    expect(isPasswordRecoveryPath('/ledger-pwa/reset-password', '/ledger-pwa/')).toBe(true);
    expect(isPasswordRecoveryPath('/reset-password', '/ledger-pwa/')).toBe(false);
  });

  it('keeps a query recovery attempt after INITIAL_SESSION null and returns to a clean login URL', async () => {
    const user = userEvent.setup();
    const harness = createHarness();
    window.history.replaceState(null, '', `${import.meta.env.BASE_URL}?auth=reset`);
    render(
      <AppProviders services={harness.services}>
        <AuthGate><span>application shell</span></AuthGate>
      </AppProviders>,
    );

    act(() => harness.auth.emit('INITIAL_SESSION', null));
    expect(await screen.findByText('重置链接无效或已过期')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '返回登录' }));
    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(import.meta.env.BASE_URL);
    expect(window.location.search).toBe('');
  });

  it('clears a preserved query recovery attempt on explicit SIGNED_OUT', async () => {
    const harness = createHarness();
    window.history.replaceState(null, '', `${import.meta.env.BASE_URL}?auth=reset`);
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    act(() => harness.auth.emit('INITIAL_SESSION', null));
    await waitFor(() => expect(latestRuntime.passwordRecovery).toBe(true));

    act(() => harness.auth.emit('SIGNED_OUT', null));
    await waitFor(() => expect(latestRuntime.passwordRecovery).toBe(false));
  });

  it('exposes auth commands without storing credentials in the runtime', async () => {
    const harness = createHarness();
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    await latestRuntime.signIn('person@example.com', 'secret-password');
    await latestRuntime.requestPasswordReset('person@example.com');
    await latestRuntime.updatePassword('new-secret-password');
    await latestRuntime.signOut();

    expect(harness.auth.service.signIn).toHaveBeenCalledWith('person@example.com', 'secret-password');
    expect(harness.auth.service.requestPasswordReset).toHaveBeenCalledWith('person@example.com');
    expect(harness.auth.service.updatePassword).toHaveBeenCalledWith('new-secret-password');
    expect(harness.auth.service.signOut).toHaveBeenCalledOnce();
    expect(JSON.stringify(latestRuntime)).not.toContain('secret-password');
  });

  it('tracks PASSWORD_RECOVERY and clears it explicitly', async () => {
    const harness = createHarness();
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    act(() => harness.auth.emit('PASSWORD_RECOVERY', sessionFor('user-a')));
    await waitFor(() => expect(latestRuntime.passwordRecovery).toBe(true));
    expect(latestRuntime.authReady).toBe(true);

    act(() => latestRuntime.finishPasswordRecovery());
    expect(latestRuntime.passwordRecovery).toBe(false);
  });

  it('bootstraps before the first authenticated synchronization', async () => {
    const harness = createHarness();
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));

    await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
    expect(harness.api.bootstrapPersonalLedger).toHaveBeenCalledOnce();
    expect(harness.createSyncEngine).toHaveBeenCalledWith(ledgerA);
    expect(harness.api.bootstrapPersonalLedger.mock.invocationCallOrder[0])
      .toBeLessThan(harness.createSyncEngine.mock.invocationCallOrder[0]);
    expect(harness.createSyncEngine.mock.invocationCallOrder[0])
      .toBeLessThan(harness.sync.engine.syncNow.mock.invocationCallOrder[0]);
  });

  it('publishes one view model only after the personal ledger is initialized', async () => {
    const pendingBootstrap = deferred<string>();
    const harness = createHarness();
    harness.api.bootstrapPersonalLedger.mockReturnValue(pendingBootstrap.promise);
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));
    await waitFor(() => expect(harness.api.bootstrapPersonalLedger).toHaveBeenCalledOnce());
    expect(latestRuntime.ledgerViewModel).toBeNull();
    expect(latestRuntime.initializing).toBe(true);

    pendingBootstrap.resolve(ledgerA);
    await waitFor(() => expect(latestRuntime.ledgerViewModel?.ledgerId).toBe(ledgerA));

    expect(harness.createLedgerViewModel).toHaveBeenCalledOnce();
    expect(latestRuntime.initializing).toBe(false);
  });

  it('disposes each replaced view model exactly once on user replacement and sign-out', async () => {
    const harness = createHarness();
    harness.api.bootstrapPersonalLedger
      .mockResolvedValueOnce(ledgerA)
      .mockResolvedValueOnce(ledgerB);
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));
    await waitFor(() => expect(latestRuntime.ledgerViewModel?.ledgerId).toBe(ledgerA));
    const first = harness.viewModels[0];
    expect(first).toBeDefined();

    emitSession(harness.auth, sessionFor('user-b'));
    await waitFor(() => expect(latestRuntime.ledgerViewModel?.ledgerId).toBe(ledgerB));
    expect(first?.dispose).toHaveBeenCalledOnce();
    const second = harness.viewModels[1];
    expect(second).toBeDefined();

    act(() => harness.auth.emit('SIGNED_OUT', null));
    await waitFor(() => expect(latestRuntime.ledgerViewModel).toBeNull());
    act(() => harness.auth.emit('SIGNED_OUT', null));

    expect(first?.dispose).toHaveBeenCalledOnce();
    expect(second?.dispose).toHaveBeenCalledOnce();
  });

  it('does not make the auth listener wait for authenticated initialization', async () => {
    const pendingBootstrap = deferred<string>();
    const harness = createHarness();
    harness.api.bootstrapPersonalLedger.mockReturnValue(pendingBootstrap.promise);
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);
    const listener = harness.auth.service.onSessionChange.mock.calls[0]?.[0];
    expect(listener).toBeTypeOf('function');
    if (!listener) throw new Error('auth listener was not registered');

    const returnValue = listener('SIGNED_IN', sessionFor('user-a'));
    expect.soft(returnValue).toBeUndefined();
    await waitFor(() => expect(harness.api.bootstrapPersonalLedger).toHaveBeenCalledOnce());

    pendingBootstrap.resolve(ledgerA);
    await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('runtime')).toHaveTextContent(
      '"userId":"user-a","initializing":false,"message":null',
    );
  });

  it('opens an authenticated cached ledger while offline without bootstrapping', async () => {
    const harness = createHarness({ online: false, cachedLedgerId: ledgerA });
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));

    await waitFor(() => expect(harness.createSyncEngine).toHaveBeenCalledWith(ledgerA));
    expect(harness.api.bootstrapPersonalLedger).not.toHaveBeenCalled();
    expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('runtime')).toHaveTextContent(
      '"userId":"user-a","initializing":false,"message":null',
    );
  });

  it('opens an authenticated cached ledger online without waiting for bootstrap', async () => {
    const harness = createHarness({ online: true, cachedLedgerId: ledgerA });
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));

    await waitFor(() => expect(harness.createSyncEngine).toHaveBeenCalledWith(ledgerA));
    expect(harness.api.bootstrapPersonalLedger).not.toHaveBeenCalled();
    expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('runtime')).toHaveTextContent(
      '"userId":"user-a","initializing":false,"message":null',
    );
  });

  it('reports that first login needs a connection when no offline ledger exists', async () => {
    const harness = createHarness({ online: false, cachedLedgerId: null });
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));

    await waitFor(() => expect(screen.getByLabelText('runtime')).toHaveTextContent(
      '首次登录需要联网完成初始化',
    ));
    expect(harness.createSyncEngine).not.toHaveBeenCalled();
    expect(harness.sync.engine.syncNow).not.toHaveBeenCalled();
  });

  it('ignores late initialization results from an older session', async () => {
    const firstBootstrap = deferred<string>();
    const harness = createHarness();
    harness.api.bootstrapPersonalLedger
      .mockImplementationOnce(() => firstBootstrap.promise)
      .mockResolvedValueOnce(ledgerB);
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);

    emitSession(harness.auth, sessionFor('user-a'));
    await waitFor(() => expect(harness.api.bootstrapPersonalLedger).toHaveBeenCalledOnce());
    emitSession(harness.auth, sessionFor('user-b'));

    await waitFor(() => expect(harness.createSyncEngine).toHaveBeenCalledWith(ledgerB));
    firstBootstrap.resolve(ledgerA);
    await act(async () => firstBootstrap.promise);

    expect(harness.createSyncEngine).toHaveBeenCalledTimes(1);
    expect(harness.createSyncEngine).not.toHaveBeenCalledWith(ledgerA);
    expect(harness.createLedgerViewModel).toHaveBeenCalledTimes(1);
    expect(latestRuntime.ledgerViewModel?.ledgerId).toBe(ledgerB);
    expect(screen.getByLabelText('runtime')).toHaveTextContent('"userId":"user-b"');
  });

  it('saves locally before synchronization and keeps the local save when synchronization rejects', async () => {
    const harness = createHarness();
    let runtime: AppRuntimeValue | undefined;
    const order: string[] = [];
    harness.repo.saveOperation.mockImplementation(async (operation) => {
      order.push('local');
      harness.savedOperations.push(operation);
    });
    harness.sync.engine.syncNow
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        order.push('sync');
        throw new Error('network unavailable');
      });
    render(
      <AppProviders services={harness.services}>
        <RuntimeProbe onRuntime={(value) => { runtime = value; }} />
      </AppProviders>,
    );
    await finishInitialization(harness);
    const operation = operationFor();

    await expect(runtime?.saveOperation(operation)).rejects.toThrow('network unavailable');

    expect(order).toEqual(['local', 'sync']);
    expect(harness.savedOperations).toEqual([operation]);
  });

  it('requests synchronization when the browser returns online', async () => {
    const harness = createHarness();
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);
    await finishInitialization(harness);
    harness.sync.engine.syncNow.mockClear();

    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
  });

  it('reuses an offline cached ledger when connectivity recovers', async () => {
    const harness = createHarness({ online: false, cachedLedgerId: ledgerA });
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);
    await finishInitialization(harness);
    harness.sync.engine.syncNow.mockClear();

    harness.setOnline(true);
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
    expect(harness.api.bootstrapPersonalLedger).not.toHaveBeenCalled();
    expect(harness.createSyncEngine).toHaveBeenCalledOnce();
    expect(harness.createLedgerViewModel).toHaveBeenCalledOnce();
    expect(harness.viewModels[0]?.dispose).not.toHaveBeenCalled();
    expect(latestRuntime.ledgerViewModel).toBe(harness.viewModels[0]);
  });

  it('updates a refreshed session without rebuilding the active engine', async () => {
    const harness = createHarness();
    let runtime: AppRuntimeValue | undefined;
    render(
      <AppProviders services={harness.services}>
        <RuntimeProbe onRuntime={(value) => { runtime = value; }} />
      </AppProviders>,
    );
    await finishInitialization(harness);
    harness.api.bootstrapPersonalLedger.mockClear();
    harness.createSyncEngine.mockClear();
    harness.sync.engine.syncNow.mockClear();
    const refreshedSession = { ...sessionFor('user-a'), access_token: 'refreshed-token' };

    await act(async () => {
      harness.auth.emit('TOKEN_REFRESHED', refreshedSession);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtime?.session?.access_token).toBe('refreshed-token');
    expect(harness.api.bootstrapPersonalLedger).not.toHaveBeenCalled();
    expect(harness.createSyncEngine).not.toHaveBeenCalled();
    expect(harness.sync.engine.syncNow).not.toHaveBeenCalled();
  });

  it('synchronizes on visibility changes only when the document is visible', async () => {
    const harness = createHarness();
    render(<AppProviders services={harness.services}><RuntimeProbe /></AppProviders>);
    await finishInitialization(harness);
    harness.sync.engine.syncNow.mockClear();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(harness.sync.engine.syncNow).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(harness.sync.engine.syncNow).toHaveBeenCalledOnce());
  });

  it('cleans up browser, engine, and auth subscriptions under StrictMode', async () => {
    const addWindowSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowSpy = vi.spyOn(window, 'removeEventListener');
    const addDocumentSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentSpy = vi.spyOn(document, 'removeEventListener');
    const harness = createHarness();
    const view = render(
      <StrictMode>
        <AppProviders services={harness.services}><RuntimeProbe /></AppProviders>
      </StrictMode>,
    );

    expect(harness.auth.listenerCount()).toBe(1);
    emitSession(harness.auth, sessionFor('user-a'));
    await waitFor(() => expect(harness.sync.listenerCount()).toBe(1));

    view.unmount();

    expect(harness.auth.listenerCount()).toBe(0);
    expect(harness.sync.listenerCount()).toBe(0);
    expect(harness.viewModels).toHaveLength(1);
    expect(harness.viewModels[0]?.dispose).toHaveBeenCalledOnce();
    expect(harness.auth.unsubscribers).toHaveLength(2);
    expect(harness.auth.unsubscribers.every((unsubscribe) => unsubscribe.mock.calls.length === 1))
      .toBe(true);
    expect(addWindowSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2);
    expect(removeWindowSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2);
    expect(addDocumentSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2);
    expect(removeDocumentSpy.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(2);
  });
});
