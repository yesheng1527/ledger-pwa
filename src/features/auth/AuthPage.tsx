import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppRuntimeValue } from '../../app/providers';
import { Card } from '../../design-system/components/Card';
import { HandDrawnIcon } from '../../design-system/components/HandDrawnIcon';
import { PrimaryButton } from '../../design-system/components/PrimaryButton';
import { TextField } from '../../design-system/components/TextField';
import { mapAuthError } from './auth-errors';
import styles from './AuthPage.module.css';

export type AuthPageMode = 'login' | 'forgot-password' | 'reset-password';

export type AuthPageCommands = Pick<
  AppRuntimeValue,
  'signIn' | 'requestPasswordReset' | 'updatePassword' | 'finishPasswordRecovery'
>;

type AuthPageProps = {
  mode: AuthPageMode;
  commands: AuthPageCommands;
};

type AuthField = 'email' | 'password' | 'confirmation';
type FieldErrors = Partial<Record<AuthField, string>>;

const AUTH_STATUS_ID = 'auth-status';

const modeContent: Record<AuthPageMode, { title: string; introduction: string }> = {
  login: {
    title: '欢迎回来',
    introduction: '登录后继续记录每一笔日常收支。',
  },
  'forgot-password': {
    title: '找回密码',
    introduction: '输入登录邮箱，我们会向你发送重置邮件。',
  },
  'reset-password': {
    title: '设置新密码',
    introduction: '请设置一个至少包含 8 个字符的新密码。',
  },
};

export function AuthPage({ mode, commands }: AuthPageProps) {
  const [internalMode, setInternalMode] = useState(mode);
  const previousExternalMode = useRef(mode);
  const externalModeChanged = previousExternalMode.current !== mode;
  const currentMode = externalModeChanged ? mode : internalMode;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const requestGeneration = useRef(0);

  useLayoutEffect(() => {
    if (previousExternalMode.current !== mode) {
      requestGeneration.current += 1;
      previousExternalMode.current = mode;
      setInternalMode(mode);
      setBusy(false);
      setPassword('');
      setConfirmation('');
      setFieldErrors({});
      setStatus(null);
    }
  }, [mode]);

  useEffect(() => {
    if (currentMode === 'reset-password') passwordRef.current?.focus();
    else emailRef.current?.focus();
  }, [currentMode]);

  const changeMode = (nextMode: AuthPageMode) => {
    if (busy) return;
    setPassword('');
    setConfirmation('');
    setFieldErrors({});
    setStatus(null);
    setInternalMode(nextMode);
  };

  const clearFieldFeedback = (field: AuthField) => {
    setFieldErrors((currentErrors) => {
      if (!(field in currentErrors)) return currentErrors;
      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
    });
    setStatus(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setFieldErrors({});
    setStatus(null);

    const validationErrors: FieldErrors = {};
    if (currentMode !== 'reset-password' && email.trim() === '') {
      validationErrors.email = '请输入邮箱';
    }
    if (currentMode === 'login' && password === '') {
      validationErrors.password = '请输入密码';
    }
    if (currentMode === 'reset-password') {
      if (password === '') validationErrors.password = '请输入新密码';
      else if (password.length < 8) validationErrors.password = '密码至少需要 8 个字符';

      if (confirmation === '') validationErrors.confirmation = '请再次输入新密码';
      else if (password !== confirmation) validationErrors.confirmation = '两次输入的密码不一致';
    }

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.email) emailRef.current?.focus();
      else if (validationErrors.password) passwordRef.current?.focus();
      else confirmationRef.current?.focus();
      return;
    }

    const generation = ++requestGeneration.current;
    setBusy(true);
    try {
      if (currentMode === 'login') {
        await commands.signIn(email, password);
      } else if (currentMode === 'forgot-password') {
        await commands.requestPasswordReset(email);
        if (requestGeneration.current !== generation) return;
        setStatus({ kind: 'success', message: '重置邮件已发送，请检查邮箱' });
      } else {
        await commands.updatePassword(password);
        if (requestGeneration.current !== generation) return;
        setStatus({ kind: 'success', message: '密码已更新' });
        commands.finishPasswordRecovery();
      }
    } catch (error: unknown) {
      if (requestGeneration.current !== generation) return;
      setStatus({ kind: 'error', message: mapAuthError(error) });
    } finally {
      if (requestGeneration.current === generation) setBusy(false);
    }
  };

  const content = modeContent[currentMode];
  const statusDescriptionId = status?.kind === 'error' ? AUTH_STATUS_ID : undefined;

  return (
    <main className={styles.page}>
      <section className={styles.introduction} aria-label="海风小账本">
        <div className={styles.brand}>
          <HandDrawnIcon asset="brand:shell" label="海风小账本" />
          <span>海风小账本</span>
        </div>
        <div className={styles.illustration} data-ambient-motion>
          <HandDrawnIcon asset="illustration:auth-seaside" decorative />
        </div>
        <p>让收支记录像海风一样轻松、清楚。</p>
      </section>

      <Card className={styles.card}>
        <header className={styles.header}>
          <h1>{content.title}</h1>
          <p>{content.introduction}</p>
        </header>

        <form className={styles.form} onSubmit={submit} noValidate>
          {currentMode !== 'reset-password' ? (
            <TextField
              ref={emailRef}
              id="auth-email"
              label="邮箱"
              type="email"
              autoComplete="email"
              aria-describedby={statusDescriptionId}
              error={fieldErrors.email}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldFeedback('email');
              }}
              required
            />
          ) : (
            <>
              <TextField
                ref={passwordRef}
                id="auth-new-password"
                label="新密码"
                type="password"
                autoComplete="new-password"
                description="至少 8 个字符"
                aria-describedby={statusDescriptionId}
                error={fieldErrors.password}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearFieldFeedback('password');
                }}
                required
              />
              <TextField
                ref={confirmationRef}
                id="auth-password-confirmation"
                label="确认新密码"
                type="password"
                autoComplete="new-password"
                aria-describedby={statusDescriptionId}
                error={fieldErrors.confirmation}
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  clearFieldFeedback('confirmation');
                }}
                required
              />
            </>
          )}

          {currentMode === 'login' ? (
            <TextField
              ref={passwordRef}
              id="auth-password"
              label="密码"
              type="password"
              autoComplete="current-password"
              aria-describedby={statusDescriptionId}
              error={fieldErrors.password}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldFeedback('password');
              }}
              required
            />
          ) : null}

          {status ? (
            <p id={AUTH_STATUS_ID} className={status.kind === 'error' ? styles.error : styles.success} role={status.kind === 'error' ? 'alert' : 'status'}>
              {status.message}
            </p>
          ) : null}

          <PrimaryButton className={styles.submit} type="submit" busy={busy}>
            {currentMode === 'login'
              ? '登录'
              : currentMode === 'forgot-password'
                ? '发送重置邮件'
                : '更新密码'}
          </PrimaryButton>

          {currentMode === 'login' ? (
            <button className={styles.textButton} type="button" aria-label="忘记密码" disabled={busy} onClick={() => changeMode('forgot-password')}>
              忘记密码？
            </button>
          ) : null}
          {currentMode === 'forgot-password' ? (
            <button className={styles.textButton} type="button" disabled={busy} onClick={() => changeMode('login')}>
              返回登录
            </button>
          ) : null}
        </form>
      </Card>
    </main>
  );
}
