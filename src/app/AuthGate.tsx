import type { ReactNode } from 'react';
import { AuthPage } from '../features/auth/AuthPage';
import { Card } from '../design-system/components/Card';
import { HandDrawnIcon } from '../design-system/components/HandDrawnIcon';
import { PrimaryButton } from '../design-system/components/PrimaryButton';
import { type AppRuntimeValue, useAppRuntime } from './providers';
import styles from './AuthGate.module.css';

type AuthGateViewProps = {
  runtime: AppRuntimeValue;
  children: ReactNode;
};

function BrandedLoadingState({ label }: { label: string }) {
  return (
    <main className={styles.page} aria-busy="true">
      <Card className={styles.stateCard} role="status" aria-live="polite">
        <HandDrawnIcon asset="brand:shell" label="海风小账本" />
        <span className={styles.loadingMark} aria-hidden="true" />
        <p>{label}</p>
      </Card>
    </main>
  );
}

function RecoveryLinkError({ onReturnToLogin }: { onReturnToLogin: () => void }) {
  return (
    <main className={styles.page}>
      <Card className={styles.stateCard}>
        <HandDrawnIcon asset="brand:shell" label="海风小账本" />
        <h1>无法重置密码</h1>
        <p role="alert">重置链接无效或已过期</p>
        <PrimaryButton type="button" onClick={onReturnToLogin}>
          返回登录
        </PrimaryButton>
        <p>请返回登录页，重新发送一封重置邮件。</p>
      </Card>
    </main>
  );
}

function InitializationErrorState({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <main className={styles.page}>
      <Card className={styles.stateCard}>
        <HandDrawnIcon asset="brand:shell" label="海风小账本" />
        <h1>账本暂未准备好</h1>
        <p role="alert">{message}</p>
        <PrimaryButton onClick={() => void onRetry()}>重试</PrimaryButton>
      </Card>
    </main>
  );
}

export function AuthGateView({ runtime, children }: AuthGateViewProps) {
  if (!runtime.authReady) return <BrandedLoadingState label="正在检查登录状态" />;
  if (runtime.guestMode && runtime.ledgerViewModel) return <>{children}</>;
  if (runtime.passwordRecovery && !runtime.session) {
    return <RecoveryLinkError onReturnToLogin={runtime.finishPasswordRecovery} />;
  }
  if (runtime.passwordRecovery) return <AuthPage mode="reset-password" commands={runtime} />;
  if (!runtime.session) return <AuthPage mode="login" commands={runtime} />;
  if (runtime.initializing) return <BrandedLoadingState label="正在准备个人账本" />;
  if (runtime.initializationMessage) {
    return <InitializationErrorState message={runtime.initializationMessage} onRetry={runtime.syncNow} />;
  }
  if (!runtime.ledgerViewModel) {
    return <BrandedLoadingState label="正在准备个人账本" />;
  }
  return <>{children}</>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const runtime = useAppRuntime();
  return <AuthGateView runtime={runtime}>{children}</AuthGateView>;
}
