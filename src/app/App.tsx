import type { SyncStatus } from '../sync/sync-engine';
import type { HomeSyncState } from '../view-model/types';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { useAppRuntime } from './providers';

export function toHomeSyncState(status: SyncStatus): HomeSyncState {
  switch (status.mode) {
    case 'idle':
      return {
        label: status.pendingCount > 0 ? `${status.pendingCount} 条待同步` : '已同步',
        tone: 'quiet',
        retryable: false,
      };
    case 'syncing':
      return { label: '正在同步', tone: 'quiet', retryable: false };
    case 'offline':
      return { label: '当前离线，可继续记账', tone: 'warning', retryable: true };
    case 'error':
      return {
        label: status.message || '同步失败，稍后重试',
        tone: 'error',
        retryable: true,
      };
    case 'conflict':
      return { label: '有同步冲突待处理', tone: 'error', retryable: false };
  }
}

function AuthenticatedShell() {
  const {
    ledgerViewModel,
    session,
    syncStatus,
    syncNow,
  } = useAppRuntime();
  if (!ledgerViewModel) return null;

  const metadataName = session?.user.user_metadata?.display_name;
  const displayName = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim()
    : session?.user.email?.split('@')[0] || '记账人';

  return (
    <AppShell
      viewModel={ledgerViewModel}
      syncState={toHomeSyncState(syncStatus)}
      pendingCount={syncStatus.pendingCount}
      displayName={displayName}
      ledgerName="个人生活账本"
      onRetrySync={() => void syncNow()}
    />
  );
}

export function App() {
  return (
    <AuthGate>
      <AuthenticatedShell />
    </AuthGate>
  );
}
