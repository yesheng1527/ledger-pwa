import type { AssetKey } from '../../assets/registry';
import { Card } from '../../design-system/components/Card';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { HomeSyncState } from '../../view-model/types';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import styles from './ProfilePage.module.css';

type ManagementItem = {
  label: string;
  asset: AssetKey;
};

const managementGroups: Array<{ title: string; items: ManagementItem[] }> = [
  {
    title: '账本管理',
    items: [
      { label: '预算管理', asset: 'management:budget' },
      { label: '账户管理', asset: 'management:account' },
      { label: '账单提醒', asset: 'management:reminder' },
    ],
  },
  {
    title: '数据与偏好',
    items: [
      { label: '备份与恢复', asset: 'management:backup' },
      { label: '主题外观', asset: 'management:theme' },
      { label: '记账偏好', asset: 'management:preferences' },
      { label: '关于海风', asset: 'management:about' },
    ],
  },
];

export type ProfilePageProps = {
  viewModel: LedgerViewModel;
  displayName: string;
  ledgerName: string;
  syncState: HomeSyncState;
  pendingCount: number;
  onRetrySync(): void;
};

export function ProfilePage({
  viewModel,
  displayName,
  ledgerName,
  syncState,
  pendingCount,
  onRetrySync,
}: ProfilePageProps) {
  const query = useLedgerQuery(
    viewModel,
    'profile:home-summary',
    () => viewModel.getHomeSnapshot(),
  );
  const budget = query.status === 'ready' ? query.data.budget : null;
  const budgetText = budget
    ? `已用 ${(budget.usedCents / 100).toFixed(2)} 元，预算 `
      + `${(budget.amountCents / 100).toFixed(2)} 元`
    : '';

  return (
    <main className={styles.page} aria-labelledby="profile-page-title">
      <header className={styles.hero}>
        <HandDrawnIcon asset="illustration:profile-seaside" decorative />
        <div className={styles.heroContent}>
          <HandDrawnIcon asset="brand:shell" label="海风小账本" />
          <div>
            <p className={styles.eyebrow}>慢慢记，也认真生活</p>
            <h1 id="profile-page-title">我的</h1>
          </div>
        </div>
      </header>

      <Card className={styles.identity}>
        <strong>{displayName}</strong>
        <span>{ledgerName}</span>
      </Card>

      <Card>
        <section className={styles.syncSection}>
          <div>
            <h2>同步状态</h2>
            <p data-tone={syncState.tone}>{syncState.label}</p>
            <span>{pendingCount} 笔待同步</span>
          </div>
          {syncState.retryable ? (
            <button type="button" onClick={onRetrySync}>重试同步</button>
          ) : null}
        </section>
      </Card>

      <Card>
        <section className={styles.budgetSection}>
          <h2>本月预算</h2>
          {query.status === 'loading' ? <p role="status">正在读取预算…</p> : null}
          {query.status === 'error' ? <p>预算暂时无法读取</p> : null}
          {query.status === 'ready' && budget ? (
            <>
              <ProgressBar
                label="本月预算"
                value={budget.usedCents}
                max={budget.amountCents}
                valueText={budgetText}
                tone={budget.remainingCents < 0 ? 'warning' : 'coral'}
              />
              <p>剩余 {(budget.remainingCents / 100).toFixed(2)} 元</p>
            </>
          ) : null}
          {query.status === 'ready' && !budget ? <p>本月尚未设置预算</p> : null}
        </section>
      </Card>

      {managementGroups.map((group) => (
        <section key={group.title} className={styles.management}>
          <h2>{group.title}</h2>
          <div className={styles.rows}>
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled
                aria-disabled="true"
              >
                <HandDrawnIcon asset={item.asset} decorative />
                <span>{item.label}</span>
                <small>后续阶段开放</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
