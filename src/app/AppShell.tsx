import { useLayoutEffect, useRef, useState } from 'react';
import { BottomNavigation, type NavigationItem } from '../design-system/components/BottomNavigation';
import { EmptyState } from '../design-system/components/EmptyState';
import { HandDrawnIcon } from '../design-system/components/HandDrawnIcon';
import styles from './AppShell.module.css';
import { navigationItems, type RegularTabId } from './navigation';

const panelCopy: Record<RegularTabId, { title: string; description: string }> = {
  home: {
    title: '首页',
    description: '首页内容将在下一阶段接入真实账本数据。',
  },
  transactions: {
    title: '流水',
    description: '流水列表将在下一阶段接入筛选和明细。',
  },
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

export function AppShell() {
  const [activeTab, setActiveTab] = useState<RegularTabId>('home');
  const [entryOpen, setEntryOpen] = useState(false);
  const scrollOffsets = useRef<Record<RegularTabId, number>>({
    home: 0,
    transactions: 0,
    statistics: 0,
    settings: 0,
  });
  const mainRef = useRef<HTMLElement>(null);
  const entryButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
      entryButtonRef.current?.focus();
    }
  }, [entryOpen]);

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
        onActivate: () => setEntryOpen(true),
      };
    }

    return {
      ...item,
      active: item.id === activeTab,
      onActivate: () => activateRegularTab(item.id),
    };
  });

  return (
    <div className={styles.shell}>
      <div
        className={styles.background}
        data-shell-background
        inert={entryOpen ? true : undefined}
        aria-hidden={entryOpen ? 'true' : undefined}
      >
        <header className={styles.header}>
          <HandDrawnIcon asset="brand:shell" decorative />
          <h1>海风小账本</h1>
        </header>

        <main ref={mainRef} className={styles.main}>
          {regularTabIds.map((tabId) => {
            const panel = panelCopy[tabId];
            const active = tabId === activeTab;

            return (
              <div
                key={tabId}
                id={`panel-${tabId}`}
                role="tabpanel"
                hidden={!active}
                aria-hidden={active ? 'false' : 'true'}
              >
                <EmptyState title={panel.title} description={panel.description} />
              </div>
            );
          })}
        </main>

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
            <button ref={closeButtonRef} type="button" onClick={() => setEntryOpen(false)}>
              关闭
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
