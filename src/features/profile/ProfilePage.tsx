import { CaretRight } from '@phosphor-icons/react';
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
  detail?: string;
  syncAction?: boolean;
};

const managementGroups: Array<{ title: string; items: ManagementItem[] }> = [
  {
    title: '账本与数据',
    items: [
      { label: '预算管理', asset: 'management:budget' },
      { label: '账户管理', asset: 'management:account', detail: '2个账户' },
      { label: '记账提醒', asset: 'management:reminder', detail: '每天 20:00' },
      { label: '备份与恢复', asset: 'management:backup', syncAction: true },
    ],
  },
  {
    title: '外观与关于',
    items: [
      { label: '主题设置', asset: 'management:theme' },
      { label: '偏好设置', asset: 'management:preferences' },
      { label: '关于我们', asset: 'management:about' },
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
        <HandDrawnIcon
          asset="illustration:profile-seaside"
          decorative
          loading="lazy"
          decoding="async"
        />
        <h1 id="profile-page-title" className={styles.srOnly}>我的</h1>
      </header>

      <Card className={styles.identity}>
        <HandDrawnIcon asset="brand:shell" label="海风小账本" />
        <div>
          <strong>海风的小账本</strong>
          <span>记录生活，遇见美好</span>
        </div>
        <CaretRight size={18} weight="regular" aria-hidden="true" />
      </Card>

      <Card className={styles.budgetCard}>
        <section className={styles.budgetSection}>
          <div>
            <h2>本月预算</h2>
            {query.status === 'ready' && budget ? (
              <strong>¥{(budget.amountCents / 100).toFixed(2)}</strong>
            ) : null}
          </div>
          {query.status === 'loading' ? <p role="status">正在读取预算…</p> : null}
          {query.status === 'error' ? <p>预算暂时无法读取</p> : null}
          {query.status === 'ready' && budget ? (
            <>
              <span className={styles.budgetPercent}>
                {Math.round((budget.usedCents / budget.amountCents) * 100)}%
              </span>
              <ProgressBar
                label="本月预算"
                value={budget.usedCents}
                max={budget.amountCents}
                valueText={budgetText}
                tone={budget.remainingCents < 0 ? 'warning' : 'coral'}
              />
              <p>
                <span>已用 ¥{(budget.usedCents / 100).toFixed(2)}</span>
                <span>剩余 ¥{(budget.remainingCents / 100).toFixed(2)}</span>
              </p>
            </>
          ) : null}
          {query.status === 'ready' && !budget ? <p>本月尚未设置预算</p> : null}
        </section>
      </Card>

      {managementGroups.map((group) => (
        <section
          key={group.title}
          className={styles.management}
          aria-label={group.title}
        >
          <div className={styles.rows}>
            {group.items.map((item) => {
              const isRetry = item.syncAction && syncState.retryable;
              const detail = item.syncAction
                ? `${syncState.label}${pendingCount > 0 ? ` · ${pendingCount} 笔待同步` : ''}`
                : item.detail;
              const accessibleLabel = isRetry
                ? `${item.label} ${syncState.label} ${pendingCount} 笔待同步`
                : `${item.label}${detail ? ` ${detail}` : ''} 暂未开放`;
              return (
                <button
                  key={item.label}
                  type="button"
                  aria-label={accessibleLabel}
                  disabled={!isRetry}
                  aria-disabled={isRetry ? undefined : 'true'}
                  onClick={isRetry ? onRetrySync : undefined}
                >
                  <HandDrawnIcon asset={item.asset} decorative />
                  <span>{item.label}</span>
                  {detail ? <small>{detail}</small> : null}
                  <CaretRight size={16} weight="regular" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
