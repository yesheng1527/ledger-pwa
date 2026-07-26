import { useState } from 'react';
import { CaretRight, Eye, EyeSlash } from '@phosphor-icons/react';
import type { AssetKey } from '../../assets/registry';
import { Amount } from '../../design-system/components/Amount';
import { Card } from '../../design-system/components/Card';
import { EmptyState } from '../../design-system/components/EmptyState';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type {
  HomeSnapshot,
  HomeSyncState,
  TransactionRowModel,
} from '../../view-model/types';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import styles from './HomePage.module.css';

export type HomePageProps = {
  viewModel: LedgerViewModel;
  syncState: HomeSyncState;
  onRetrySync(): void;
  onOpenTransaction(id: string): void;
  onStartEntry(intent: { categoryId: string | null }): void;
};

const categoryAssets: Readonly<Record<string, AssetKey>> = {
  food: 'category:food',
  transport: 'category:transport',
  shopping: 'category:shopping',
  housing: 'category:housing',
  entertainment: 'category:entertainment',
  daily: 'category:daily',
  study: 'category:study',
  medical: 'category:medical',
  travel: 'category:travel',
  income: 'category:income',
  other: 'category:other',
};

function categoryAsset(iconKey: string): AssetKey {
  return categoryAssets[iconKey] ?? 'category:other';
}

function spokenRowAmount(amountLabel: string): string {
  const negative = amountLabel.startsWith('-');
  const positive = amountLabel.startsWith('+');
  const amount = amountLabel.replace(/[+\-¥,]/g, '');
  return `${negative ? '负' : positive ? '正' : ''}${amount}元`;
}

function SyncStatus({
  syncState,
  onRetrySync,
}: Pick<HomePageProps, 'syncState' | 'onRetrySync'>) {
  if (syncState.tone === 'quiet') return null;

  return (
    <div className={styles.syncLine}>
      <p className={styles.syncStatus} data-tone={syncState.tone}>
        {syncState.label}
      </p>
      {syncState.retryable ? (
        <button className={styles.syncRetry} type="button" onClick={onRetrySync}>
          重试同步
        </button>
      ) : null}
    </div>
  );
}

function currentMonthLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
}

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroArt}>
        <HandDrawnIcon asset="illustration:home-seaside" decorative />
      </div>
      <div className={styles.heroContent}>
        <div className={styles.greeting}>
          <h1 id="home-page-title" className={styles.homeTitle}>首页</h1>
          <strong>早上好，海风～</strong>
          <p>今天也要好好生活呀！</p>
        </div>
        <HandDrawnIcon asset="action:reminder" decorative />
      </div>
    </header>
  );
}

function Overview({ snapshot }: { snapshot: HomeSnapshot }) {
  const monthLabel = currentMonthLabel();
  const [amountsHidden, setAmountsHidden] = useState(false);
  const amount = (
    cents: number,
    label: string,
    tone: 'expense' | 'income' | 'balance',
  ) => amountsHidden ? (
    <span
      className={`ds-amount ${styles.hiddenAmount}`}
      data-numeric=""
      data-tone={tone}
      aria-label="金额已隐藏"
    >
      ¥••••••
    </span>
  ) : <Amount cents={cents} label={label} tone={tone} />;

  return (
    <Card>
      <section className={styles.overview} aria-label={`${monthLabel}财务总览`}>
        <div className={styles.overviewHeading}>
          <strong>{monthLabel}</strong>
          <button
            className={styles.privacyAction}
            type="button"
            aria-label={amountsHidden ? '显示金额' : '隐藏金额'}
            onClick={() => setAmountsHidden((hidden) => !hidden)}
          >
            {amountsHidden
              ? <EyeSlash size={18} weight="regular" aria-hidden="true" />
              : <Eye size={18} weight="regular" aria-hidden="true" />}
          </button>
        </div>
        <div className={styles.balanceBlock}>
          <span>本月结余（元）</span>
          {amount(
            snapshot.monthBalanceCents,
            '本月结余',
            snapshot.monthBalanceCents < 0 ? 'expense' : 'balance',
          )}
        </div>
        <div className={styles.overviewBreakdown}>
          <div>
            <span>本月收入</span>
            {amount(snapshot.monthIncomeCents, '本月收入', 'income')}
          </div>
          <div>
            <span>本月支出</span>
            {amount(snapshot.monthExpenseCents, '本月支出', 'expense')}
          </div>
        </div>
      </section>
    </Card>
  );
}

function QuickEntry({
  categories,
  onStartEntry,
}: {
  categories: HomeSnapshot['quickCategories'];
  onStartEntry: HomePageProps['onStartEntry'];
}) {
  const actions = categories.slice(0, 4).map((category) => ({
    id: category.id,
    label: category.name,
    asset: categoryAsset(category.iconKey),
  }));

  return (
    <Card>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>快速记账</h2>
          <span className={styles.sectionLink}>
            全部
            <CaretRight aria-hidden="true" weight="bold" />
          </span>
        </div>
        <div className={styles.quickGrid}>
          {actions.map((action) => (
            <button
              className={styles.quickButton}
              type="button"
              aria-label={`快速记账：${action.label}`}
              key={action.id}
              onClick={() => onStartEntry({ categoryId: action.id })}
            >
              <HandDrawnIcon asset={action.asset} decorative />
              <span>{action.label}</span>
            </button>
          ))}
          <button
            className={styles.quickButton}
            type="button"
            aria-label="快速记账：更多"
            onClick={() => onStartEntry({ categoryId: null })}
          >
            <HandDrawnIcon asset="category:other" decorative />
            <span>更多</span>
          </button>
        </div>
      </section>
    </Card>
  );
}

function RecentRow({
  row,
  onOpenTransaction,
}: {
  row: TransactionRowModel;
  onOpenTransaction: HomePageProps['onOpenTransaction'];
}) {
  return (
    <li>
      <button
        className={styles.recentButton}
        type="button"
        aria-label={`查看流水：${row.title}，${spokenRowAmount(row.amountLabel)}`}
        onClick={() => onOpenTransaction(row.id)}
      >
        <HandDrawnIcon asset={categoryAsset(row.categoryIconKey)} decorative />
        <span className={styles.recentCopy}>
          <strong>{row.title}</strong>
          <span>{row.timeLabel} · {row.accountLabel}</span>
        </span>
        <span aria-hidden="true" data-numeric="" data-tone={row.amountTone}>
          {row.amountLabel}
        </span>
      </button>
    </li>
  );
}

function RecentTransactions({
  transactions,
  onOpenTransaction,
}: {
  transactions: HomeSnapshot['recentTransactions'];
  onOpenTransaction: HomePageProps['onOpenTransaction'];
}) {
  return (
    <Card>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>最近流水</h2>
          <span className={styles.sectionLink}>
            更多
            <CaretRight aria-hidden="true" weight="bold" />
          </span>
        </div>
        {transactions.length === 0 ? (
          <EmptyState
            title="还没有流水"
            description="记下第一笔收支，首页会在这里展示最近流水。"
            illustration="illustration:empty-ledger"
          />
        ) : (
          <ul className={styles.recentList}>
            {transactions.slice(0, 3).map((row) => (
              <RecentRow
                key={row.id}
                row={row}
                onOpenTransaction={onOpenTransaction}
              />
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}

export function HomePage({
  viewModel,
  syncState,
  onRetrySync,
  onOpenTransaction,
  onStartEntry,
}: HomePageProps) {
  const query = useLedgerQuery(
    viewModel,
    'home',
    () => viewModel.getHomeSnapshot(),
  );

  return (
    <main className={styles.page} aria-labelledby="home-page-title">
      <Hero />
      {query.status === 'loading' ? (
        <Card className={styles.feedback} role="status">
          正在加载首页…
        </Card>
      ) : null}
      {query.status === 'error' ? (
        <Card className={styles.feedback} role="alert">
          <strong>首页加载失败</strong>
          <span>请检查网络后重试。</span>
          <button className={styles.stateAction} type="button" onClick={query.retry}>
            重试加载
          </button>
        </Card>
      ) : null}
      {query.status === 'ready' ? (
        <>
          <Overview snapshot={query.data} />
          <QuickEntry
            categories={query.data.quickCategories}
            onStartEntry={onStartEntry}
          />
          <RecentTransactions
            transactions={query.data.recentTransactions}
            onOpenTransaction={onOpenTransaction}
          />
        </>
      ) : null}
      <SyncStatus syncState={syncState} onRetrySync={onRetrySync} />
    </main>
  );
}
