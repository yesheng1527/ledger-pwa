import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { BottomNavigation, type NavigationItem } from '../design-system/components/BottomNavigation';
import { EmptyState } from '../design-system/components/EmptyState';
import { HandDrawnIcon } from '../design-system/components/HandDrawnIcon';
import { HomePage } from '../features/home/HomePage';
import { TransactionOverlays } from '../features/transactions/TransactionOverlays';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import type { LedgerViewModel } from '../view-model/ledger-view-model';
import type { HomeSyncState } from '../view-model/types';
import styles from './AppShell.module.css';
import { navigationItems, type RegularTabId } from './navigation';

type AppShellProps = {
  viewModel: LedgerViewModel;
  syncState: HomeSyncState;
  onRetrySync(): void;
};

type EntryIntent = {
  categoryId: string | null;
};

const panelCopy: Record<'statistics' | 'settings', { title: string; description: string }> = {
  statistics: {
    title: '统计',
    description: '统计图表将在真实数据接口完成后开放。',
  },
  settings: {
    title: '我的',
    description: '账户、分类和备份设置将在后续阶段开放。',
  },
};

const regularTabIds = navigationItems
  .filter((item) => item.kind === 'tab')
  .map((item) => item.id);

function EntryIntentLabel({
  viewModel,
  intent,
}: {
  viewModel: LedgerViewModel;
  intent: EntryIntent;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useLayoutEffect(() => {
    let active = true;
    if (intent.categoryId === null) {
      setLabel(null);
      return () => {
        active = false;
      };
    }
    void viewModel.getHomeSnapshot().then((snapshot) => {
      if (!active) return;
      const category = snapshot.quickCategories.find((item) => item.id === intent.categoryId);
      setLabel(category?.name ?? null);
    });
    return () => {
      active = false;
    };
  }, [intent.categoryId, viewModel]);

  return label ? <p className={styles.entryIntent}>已预选：{label}</p> : null;
}

export function AppShell({
  viewModel,
  syncState,
  onRetrySync,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<RegularTabId>('home');
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryIntent, setEntryIntent] = useState<EntryIntent | null>(null);
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const entrySourceRef = useRef<HTMLElement | null>(null);
  const entryWasOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = scrollOffsets.current[activeTab];
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    if (entryOpen) {
      entryWasOpenRef.current = true;
      closeButtonRef.current?.focus();
      return;
    }

    if (entryWasOpenRef.current) {
      entryWasOpenRef.current = false;
      const source = entrySourceRef.current;
      entrySourceRef.current = null;
      setEntryIntent(null);
      queueMicrotask(() => source?.focus());
    }
  }, [entryOpen]);

  const openEntry = useCallback((intent: EntryIntent | null) => {
    entrySourceRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : entryButtonRef.current;
    setEntryIntent(intent);
    setEntryOpen(true);
  }, []);

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

  const modalOpen = entryOpen || detailOpen;

  return (
    <div className={styles.shell}>
      <div
        className={styles.background}
        data-shell-background
        inert={modalOpen ? true : undefined}
        aria-hidden={modalOpen ? 'true' : undefined}
      >
        <header className={styles.header}>
          <HandDrawnIcon asset="brand:shell" decorative />
          <span className={styles.brandName}>海风小账本</span>
        </header>

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
                {tabId === 'statistics' || tabId === 'settings' ? (
                  <EmptyState
                    title={panelCopy[tabId].title}
                    description={panelCopy[tabId].description}
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

      {entryOpen ? (
        <div
          className={styles.entryLayer}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setEntryOpen(false);
            }
          }}
        >
          <div className={styles.backdrop} aria-hidden="true" />
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-dialog-title"
          >
            <h2 id="entry-dialog-title">记账功能建设中</h2>
            {entryIntent ? (
              <EntryIntentLabel viewModel={viewModel} intent={entryIntent} />
            ) : null}
            <button ref={closeButtonRef} type="button" onClick={() => setEntryOpen(false)}>
              关闭
            </button>
          </section>
        </div>
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
