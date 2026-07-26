import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BottomNavigation, type NavigationItem } from '../design-system/components/BottomNavigation';
import {
  createEntryDraftController,
  type EntryDraftController,
  type EntryPreferencePort,
} from '../features/entry/entry-draft';
import { TransactionEntryPage } from '../features/entry/TransactionEntryPage';
import { HomePage } from '../features/home/HomePage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { StatisticsPage } from '../features/statistics/StatisticsPage';
import { TransactionOverlays } from '../features/transactions/TransactionOverlays';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import type { LedgerViewModel } from '../view-model/ledger-view-model';
import type { EntryOptions, HomeSyncState } from '../view-model/types';
import styles from './AppShell.module.css';
import { navigationItems, type RegularTabId } from './navigation';

export type AppShellProps = {
  viewModel: LedgerViewModel;
  syncState: HomeSyncState;
  pendingCount?: number;
  displayName?: string;
  ledgerName?: string;
  onRetrySync(): void;
};

type EntryIntent = {
  categoryId: string | null;
};

type EntryLayerState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      controller: EntryDraftController;
      options: EntryOptions;
    };

const regularTabIds = navigationItems
  .filter((item) => item.kind === 'tab')
  .map((item) => item.id);

function lastAccountPreferences(ledgerId: string): EntryPreferencePort {
  const key = `seabreeze:last-entry-account:${ledgerId}`;
  return {
    loadLastAccountId() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    saveLastAccountId(accountId) {
      try {
        localStorage.setItem(key, accountId);
      } catch {
        // Remembering this convenience choice must never block a saved transaction.
      }
    },
  };
}

export function AppShell({
  viewModel,
  syncState,
  pendingCount = 0,
  displayName = '记账人',
  ledgerName = '个人生活账本',
  onRetrySync,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<RegularTabId>('home');
  const [entryLayer, setEntryLayer] = useState<EntryLayerState | null>(null);
  const [detailTransactionId, setDetailTransactionId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const scrollOffsets = useRef<Record<RegularTabId, number>>({
    home: 0,
    transactions: 0,
    statistics: 0,
    settings: 0,
  });
  const mainRef = useRef<HTMLDivElement>(null);
  const entryButtonRef = useRef<HTMLButtonElement>(null);
  const entrySourceRef = useRef<HTMLElement | null>(null);
  const entryWasOpenRef = useRef(false);
  const entryRequestId = useRef(0);
  const entryPreferences = useMemo(
    () => lastAccountPreferences(viewModel.ledgerId),
    [viewModel.ledgerId],
  );

  useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = scrollOffsets.current[activeTab];
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    if (entryLayer) {
      entryWasOpenRef.current = true;
      return;
    }
    if (!entryWasOpenRef.current) return;

    entryWasOpenRef.current = false;
    const source = entrySourceRef.current;
    entrySourceRef.current = null;
    queueMicrotask(() => source?.focus());
  }, [entryLayer]);

  useEffect(() => {
    if (entryLayer?.status !== 'ready') return;
    const { controller } = entryLayer;
    let active = true;
    const refreshOptions = () => {
      void viewModel.getEntryOptions().then((options) => {
        if (!active) return;
        controller.setOptions(options);
        setEntryLayer((current) => (
          current?.status === 'ready' && current.controller === controller
            ? { ...current, options }
            : current
        ));
      });
    };
    const unsubscribe = viewModel.subscribe(refreshOptions);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [entryLayer, viewModel]);

  const closeEntry = useCallback(() => {
    entryRequestId.current += 1;
    setEntryLayer(null);
  }, []);

  const openEntry = useCallback((intent: EntryIntent | null) => {
    entrySourceRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : entryButtonRef.current;
    const requestId = ++entryRequestId.current;
    setEntryLayer({ status: 'loading' });
    void viewModel.getEntryOptions().then(
      (options) => {
        if (requestId !== entryRequestId.current) return;
        const controller = createEntryDraftController({
          options,
          quickCategoryId: intent?.categoryId ?? null,
          preferences: entryPreferences,
          createTransaction: (input) => viewModel.createTransaction(input),
          now: () => new Date(),
        });
        setEntryLayer({ status: 'ready', controller, options });
      },
      () => {
        if (requestId === entryRequestId.current) setEntryLayer({ status: 'error' });
      },
    );
  }, [entryPreferences, viewModel]);

  function activateRegularTab(nextTab: RegularTabId) {
    if (nextTab === activeTab) return;
    if (mainRef.current) {
      scrollOffsets.current[activeTab] = mainRef.current.scrollTop;
    }
    setActiveTab(nextTab);
  }

  const bottomNavigationItems: NavigationItem[] = navigationItems.map((item) => {
    if (item.kind === 'entry') {
      return {
        ...item,
        active: false,
        central: true,
        buttonRef: entryButtonRef,
        onActivate: () => openEntry(null),
      };
    }
    return {
      ...item,
      active: item.id === activeTab,
      onActivate: () => activateRegularTab(item.id),
    };
  });

  const modalOpen = entryLayer !== null || detailOpen;

  return (
    <div className={styles.shell}>
      <div
        className={styles.background}
        data-shell-background
        inert={modalOpen ? true : undefined}
        aria-hidden={modalOpen ? 'true' : undefined}
      >
        <div ref={mainRef} className={styles.main} data-shell-scroll>
          {regularTabIds.map((tabId) => {
            const active = tabId === activeTab;
            return (
              <div
                key={tabId}
                id={`panel-${tabId}`}
                hidden={!active}
                aria-hidden={active ? 'false' : 'true'}
              >
                {tabId === 'home' ? (
                  <HomePage
                    viewModel={viewModel}
                    syncState={syncState}
                    onRetrySync={onRetrySync}
                    onOpenTransaction={setDetailTransactionId}
                    onStartEntry={openEntry}
                  />
                ) : null}
                {tabId === 'transactions' ? (
                  <TransactionsPage
                    viewModel={viewModel}
                    onOpenTransaction={setDetailTransactionId}
                  />
                ) : null}
                {tabId === 'statistics' ? <StatisticsPage viewModel={viewModel} /> : null}
                {tabId === 'settings' ? (
                  <ProfilePage
                    viewModel={viewModel}
                    displayName={displayName}
                    ledgerName={ledgerName}
                    syncState={syncState}
                    pendingCount={pendingCount}
                    onRetrySync={onRetrySync}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className={styles.navigation}>
          <BottomNavigation items={bottomNavigationItems} />
        </div>
      </div>

      {entryLayer?.status === 'loading' ? (
        <section
          className={styles.entryFeedback}
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-loading-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeEntry();
          }}
        >
          <h1 id="entry-loading-title">记账</h1>
          <p role="status">正在准备记账选项…</p>
          <button type="button" onClick={closeEntry}>关闭记账</button>
        </section>
      ) : null}

      {entryLayer?.status === 'error' ? (
        <section
          className={styles.entryFeedback}
          role="dialog"
          aria-modal="true"
          aria-labelledby="entry-error-title"
        >
          <h1 id="entry-error-title">记账</h1>
          <p role="alert">记账选项暂时无法读取</p>
          <button type="button" onClick={closeEntry}>关闭记账</button>
        </section>
      ) : null}

      {entryLayer?.status === 'ready' ? (
        <TransactionEntryPage
          controller={entryLayer.controller}
          options={entryLayer.options}
          onClose={closeEntry}
          onSaved={closeEntry}
        />
      ) : null}

      <TransactionOverlays
        viewModel={viewModel}
        transactionId={detailTransactionId}
        onCloseDetail={() => setDetailTransactionId(null)}
        onDetailOpenChange={setDetailOpen}
        onReload={() => window.location.reload()}
      />
    </div>
  );
}
