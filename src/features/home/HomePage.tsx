import type { AssetKey } from '../../assets/registry';
import { Amount, type AmountTone } from '../../design-system/components/Amount';
import { Card } from '../../design-system/components/Card';
import { EmptyState } from '../../design-system/components/EmptyState';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import { formatYuan } from '../../domain/money';
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

function metricTone(cents: number): AmountTone {
  return cents < 0 ? 'expense' : 'balance';
}

function SyncStatus({
  syncState,
  onRetrySync,
}: Pick<HomePageProps, 'syncState' | 'onRetrySync'>) {
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

function Hero({
  snapshot,
  syncState,
  onRetrySync,
}: {
  snapshot?: HomeSnapshot;
  syncState: HomeSyncState;
  onRetrySync(): void;
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroArt}>
        <HandDrawnIcon asset="illustration:home-seaside" decorative />
      </div>
      <div className={styles.heroContent}>
        <div className={styles.greeting}>
          <h1 id="home-page-title">首页</h1>
          <p>海风吹来，慢慢记好每一笔。</p>
        </div>
        <SyncStatus syncState={syncState} onRetrySync={onRetrySync} />
        {snapshot ? (
          <div className={styles.totalAssets}>
            <span>总资产</span>
            <Amount cents={snapshot.totalAssetsCents} label="总资产" tone="neutral" />
          </div>
        ) : null}
      </div>
    </header>
  );
}

function Metrics({ snapshot }: { snapshot: HomeSnapshot }) {
  const metrics = [
    { label: '今日支出', cents: snapshot.todayExpenseCents, tone: 'expense' as const },
    {
      label: '本月结余',
      cents: snapshot.monthBalanceCents,
      tone: metricTone(snapshot.monthBalanceCents),
    },
    { label: '本月收入', cents: snapshot.monthIncomeCents, tone: 'income' as const },
    { label: '本月支出', cents: snapshot.monthExpenseCents, tone: 'expense' as const },
  ];

  return (
    <section className={styles.metrics} aria-label="收支概览">
      {metrics.map((metric) => (
        <Card className={styles.metric} key={metric.label}>
          <span>{metric.label}</span>
          <Amount cents={metric.cents} label={metric.label} tone={metric.tone} />
        </Card>
      ))}
    </section>
  );
}

function Budget({ budget }: Pick<HomeSnapshot, 'budget'>) {
  if (budget === null) {
    return (
      <Card>
        <section className={styles.section}>
          <h2>本月预算</h2>
          <p className={styles.muted}>本月尚未设置预算</p>
        </section>
      </Card>
    );
  }

  const progress = budget.amountCents > 0
    ? Math.min(100, Math.max(0, budget.usedCents / budget.amountCents * 100))
    : 100;
  const overspent = budget.remainingCents < 0;
  const progressMax = Math.max(0, budget.amountCents);
  const progressNow = Math.min(progressMax, Math.max(0, budget.usedCents));
  const progressText = overspent
    ? `已用${formatYuan(budget.usedCents)}，已超支${formatYuan(Math.abs(budget.remainingCents))}`
    : `已用${formatYuan(budget.usedCents)}`;

  return (
    <Card>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>本月预算</h2>
          {overspent ? <strong className={styles.overspent}>已超支</strong> : null}
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="本月预算"
          aria-valuemin={0}
          aria-valuemax={progressMax}
          aria-valuenow={progressNow}
          aria-valuetext={progressText}
        >
          <span className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.budgetDetails}>
          <span data-numeric="">已用 {formatYuan(budget.usedCents)}</span>
          <Amount
            cents={budget.remainingCents}
            label="预算剩余"
            tone={overspent ? 'expense' : 'balance'}
          />
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
        <h2>快速记账</h2>
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
        <h2>最近流水</h2>
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
      <Hero
        snapshot={query.status === 'ready' ? query.data : undefined}
        syncState={syncState}
        onRetrySync={onRetrySync}
      />
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
          <Metrics snapshot={query.data} />
          <Budget budget={query.data.budget} />
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
    </main>
  );
}
