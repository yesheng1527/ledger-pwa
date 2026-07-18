import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { LedgerDatabase } from '../db/local-db';
import { LocalLedgerRepository } from '../db/local-repository';
import type { LedgerOperation } from '../domain/operations';
import { AuthService, type SessionChangeListener } from '../services/auth-service';
import { LedgerApi } from '../services/ledger-api';
import { SyncEngine, type SyncStatus } from '../sync/sync-engine';

const FIRST_LOGIN_OFFLINE_MESSAGE = '首次登录需要联网完成初始化';
const INITIALIZATION_ERROR_MESSAGE = '初始化失败，请稍后重试';
const idleStatus: SyncStatus = {
  mode: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  message: null,
};

type RuntimeAuthService = {
  onSessionChange(listener: SessionChangeListener): () => void;
};

type RuntimeLedgerApi = {
  bootstrapPersonalLedger(): Promise<string>;
};

type RuntimeLedgerRepository = {
  getPersonalLedgerId(userId: string): Promise<string | null>;
  saveOperation(operation: LedgerOperation): Promise<void>;
};

type RuntimeSyncEngine = {
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  syncNow(): Promise<void>;
};

export type AppProviderServices = {
  auth: RuntimeAuthService;
  api: RuntimeLedgerApi;
  repo: RuntimeLedgerRepository;
  createSyncEngine(ledgerId: string): RuntimeSyncEngine;
  isOnline(): boolean;
};

export type AppRuntimeValue = {
  session: Session | null;
  initializing: boolean;
  initializationMessage: string | null;
  syncStatus: SyncStatus;
  syncNow(): Promise<void>;
  saveOperation(operation: LedgerOperation): Promise<void>;
};

const AppRuntimeContext = createContext<AppRuntimeValue | null>(null);

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function createDefaultServices(): AppProviderServices {
  const auth = new AuthService();
  const api = new LedgerApi();
  const repo = new LocalLedgerRepository(new LedgerDatabase());
  const isOnline = browserIsOnline;
  return {
    auth,
    api,
    repo,
    isOnline,
    createSyncEngine: (ledgerId) => new SyncEngine(ledgerId, repo, api, isOnline),
  };
}

export function AppProviders({
  children,
  services,
}: PropsWithChildren<{ services?: AppProviderServices }>) {
  const servicesRef = useRef<AppProviderServices | null>(null);
  if (servicesRef.current === null) servicesRef.current = services ?? createDefaultServices();
  const resolvedServices = servicesRef.current;

  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [initializationMessage, setInitializationMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(idleStatus);
  const sessionRef = useRef<Session | null>(null);
  const engineRef = useRef<RuntimeSyncEngine | null>(null);
  const engineBootstrappedRef = useRef(false);
  const stopEngineStatusRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const initializeRef = useRef<(
    nextSession: Session,
    force?: boolean,
  ) => Promise<void>>(async () => undefined);

  const syncNow = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      const activeSession = sessionRef.current;
      if (!engineBootstrappedRef.current && resolvedServices.isOnline() && activeSession) {
        await initializeRef.current(activeSession, true);
        return;
      }
      await engine.syncNow();
      return;
    }
    const activeSession = sessionRef.current;
    if (activeSession) await initializeRef.current(activeSession, true);
  }, [resolvedServices]);

  const saveOperation = useCallback(async (operation: LedgerOperation) => {
    await resolvedServices.repo.saveOperation(operation);
    await syncNow();
  }, [resolvedServices, syncNow]);

  useEffect(() => {
    const stopEngineStatus = () => {
      stopEngineStatusRef.current?.();
      stopEngineStatusRef.current = null;
      engineRef.current = null;
      engineBootstrappedRef.current = false;
    };

    const initializeSession = async (nextSession: Session | null, force = false) => {
      if (!force && nextSession && sessionRef.current?.user.id === nextSession.user.id) {
        sessionRef.current = nextSession;
        setSession(nextSession);
        return;
      }
      const generation = ++generationRef.current;
      stopEngineStatus();
      sessionRef.current = nextSession;
      setSession(nextSession);
      setInitializing(nextSession !== null);
      setInitializationMessage(null);
      setSyncStatus(idleStatus);
      if (nextSession === null) return;

      try {
        const cachedLedgerId = await resolvedServices.repo.getPersonalLedgerId(nextSession.user.id);
        if (generation !== generationRef.current) return;

        let ledgerId = cachedLedgerId;
        let bootstrapped = false;
        if (resolvedServices.isOnline()) {
          ledgerId = await resolvedServices.api.bootstrapPersonalLedger();
          bootstrapped = true;
          if (generation !== generationRef.current) return;
        } else if (ledgerId === null) {
          setInitializing(false);
          setInitializationMessage(FIRST_LOGIN_OFFLINE_MESSAGE);
          return;
        }

        const engine = resolvedServices.createSyncEngine(ledgerId);
        if (generation !== generationRef.current) return;
        engineRef.current = engine;
        engineBootstrappedRef.current = bootstrapped;
        stopEngineStatusRef.current = engine.subscribe((status) => {
          if (generation === generationRef.current) setSyncStatus(status);
        });
        setSyncStatus(engine.getStatus());
        setInitializing(false);
        setInitializationMessage(null);
        try {
          await engine.syncNow();
        } catch {
          // Local data remains available; the engine owns synchronization error status.
        }
      } catch {
        if (generation !== generationRef.current) return;
        setInitializing(false);
        setInitializationMessage(INITIALIZATION_ERROR_MESSAGE);
      }
    };

    initializeRef.current = initializeSession;
    const unsubscribeAuth = resolvedServices.auth.onSessionChange((_event, nextSession) => {
      void initializeSession(nextSession);
    });
    const handleOnline = () => {
      void syncNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      generationRef.current += 1;
      initializeRef.current = async () => undefined;
      sessionRef.current = null;
      stopEngineStatus();
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeAuth();
    };
  }, [resolvedServices, syncNow]);

  const value: AppRuntimeValue = {
    session,
    initializing,
    initializationMessage,
    syncStatus,
    syncNow,
    saveOperation,
  };
  return <AppRuntimeContext.Provider value={value}>{children}</AppRuntimeContext.Provider>;
}

export function useAppRuntime(): AppRuntimeValue {
  const runtime = useContext(AppRuntimeContext);
  if (runtime === null) throw new Error('useAppRuntime must be used within AppProviders');
  return runtime;
}
