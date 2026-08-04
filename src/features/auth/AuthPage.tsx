import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EnvelopeSimple } from '@phosphor-icons/react';
import type { AppRuntimeValue } from '../../app/providers';
import eyeIcon from '../../assets/auth-login/eye.svg';
import flowerIcon from '../../assets/auth-login/flower.svg';
import guestIcon from '../../assets/auth-login/guest.svg';
import homeIslandIcon from '../../assets/auth-login/home_island.svg';
import leafIcon from '../../assets/auth-login/leaf.svg';
import lockIcon from '../../assets/auth-login/lock.svg';
import wechatIcon from '../../assets/auth-login/wechat.svg';
import { mapAuthError } from './auth-errors';
import styles from './AuthPage.module.css';

export type AuthPageMode = 'login' | 'forgot-password' | 'reset-password';

type AuthViewMode = AuthPageMode | 'register';

export type AuthPageCommands = Pick<
  AppRuntimeValue,
  'signUp' | 'signIn' | 'requestPasswordReset' | 'updatePassword' | 'finishPasswordRecovery'
>;

type AuthPageProps = {
  mode: AuthPageMode;
  commands: AuthPageCommands;
};

type AuthField = 'email' | 'password' | 'confirmation';
type FieldErrors = Partial<Record<AuthField, string>>;
type PasswordCredentialConstructor = new (data: {
  id: string;
  name: string;
  password: string;
}) => Credential;

const AUTH_STATUS_ID = 'auth-status';
const REMEMBERED_IDENTIFIER_KEY = 'seabreeze-remembered-identifier';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const modeContent: Record<AuthViewMode, { title: string; introduction: string }> = {
  login: {
    title: '登录',
    introduction: '',
  },
  register: {
    title: '注册账号',
    introduction: '使用邮箱创建你的海风小账本。',
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

function rememberedIdentifier() {
  if (typeof window === 'undefined') return '';
  const remembered = window.localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) ?? '';
  return EMAIL_PATTERN.test(remembered) ? remembered : '';
}

async function rememberPasswordInBrowser(email: string, password: string) {
  const PasswordCredentialClass = (
    globalThis as typeof globalThis & { PasswordCredential?: PasswordCredentialConstructor }
  ).PasswordCredential;
  if (!PasswordCredentialClass || !navigator.credentials?.store) return;

  try {
    await navigator.credentials.store(new PasswordCredentialClass({
      id: email,
      name: email,
      password,
    }));
  } catch {
    // Password-manager support and user approval vary by browser.
  }
}

export function AuthPage({ mode, commands }: AuthPageProps) {
  const [internalMode, setInternalMode] = useState<AuthViewMode>(mode);
  const previousExternalMode = useRef(mode);
  const externalModeChanged = previousExternalMode.current !== mode;
  const currentMode = externalModeChanged ? mode : internalMode;
  const [email, setEmail] = useState(rememberedIdentifier);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [rememberMe, setRememberMe] = useState(() => rememberedIdentifier() !== '');
  const [passwordVisible, setPasswordVisible] = useState(false);
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
      setPasswordVisible(false);
      setFieldErrors({});
      setStatus(null);
    }
  }, [mode]);

  useEffect(() => {
    if (currentMode === 'reset-password') passwordRef.current?.focus();
    else emailRef.current?.focus();
  }, [currentMode]);

  const changeMode = (nextMode: AuthViewMode) => {
    if (busy) return;
    setPassword('');
    setConfirmation('');
    setPasswordVisible(false);
    setFieldErrors({});
    setStatus(null);
    setInternalMode(nextMode);
  };

  const clearFieldFeedback = (...fields: AuthField[]) => {
    setFieldErrors((currentErrors) => {
      if (!fields.some((field) => field in currentErrors)) return currentErrors;
      const nextErrors = { ...currentErrors };
      for (const field of fields) delete nextErrors[field];
      return nextErrors;
    });
    setStatus(null);
  };

  const describedBy = (field: AuthField) => {
    const ids = [fieldErrors[field] ? `auth-${field}-error` : null, status?.kind === 'error' ? AUTH_STATUS_ID : null]
      .filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setFieldErrors({});
    setStatus(null);

    const validationErrors: FieldErrors = {};
    if (currentMode !== 'reset-password' && email.trim() === '') {
      validationErrors.email = '请输入邮箱';
    } else if (currentMode !== 'reset-password' && !EMAIL_PATTERN.test(email.trim())) {
      validationErrors.email = '请输入有效邮箱';
    }
    if (currentMode !== 'forgot-password' && password === '') {
      validationErrors.password = currentMode === 'reset-password' ? '请输入新密码' : '请输入密码';
    }
    if ((currentMode === 'register' || currentMode === 'reset-password') && password !== '' && password.length < 8) {
      validationErrors.password = '密码至少需要 8 个字符';
    }
    if (currentMode === 'register' || currentMode === 'reset-password') {
      if (confirmation === '') {
        validationErrors.confirmation = currentMode === 'reset-password' ? '请再次输入新密码' : '请再次输入密码';
      }
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
        await commands.signIn(email.trim(), password);
        if (rememberMe) {
          window.localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, email.trim());
          await rememberPasswordInBrowser(email.trim(), password);
        } else {
          window.localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
        }
      } else if (currentMode === 'register') {
        await commands.signUp(email.trim(), password);
        if (requestGeneration.current !== generation) return;
        setStatus({ kind: 'success', message: '注册申请已提交，请按提示完成验证' });
      } else if (currentMode === 'forgot-password') {
        await commands.requestPasswordReset(email.trim());
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
  const submitLabel = currentMode === 'login'
    ? '登录'
    : currentMode === 'register'
      ? '注册账号'
      : currentMode === 'forgot-password'
        ? '发送重置邮件'
        : '更新密码';

  const showNotice = (message: string) => {
    setFieldErrors({});
    setStatus({ kind: 'success', message });
  };

  return (
    <main className={styles.page} data-mode={currentMode} data-ambient-motion>
      <div className={styles.content}>
        <div className={styles.loginCluster}>
          <section className={styles.brand} aria-label="海风小账本">
            <img className={styles.homeIsland} src={homeIslandIcon} alt="" />
            <div className={styles.brandTitle}>
              <img src={flowerIcon} alt="" />
              <span>海风小账本</span>
              <img src={leafIcon} alt="" />
            </div>
            <p><i />记录生活，遇见美好<i /></p>
          </section>

          <section className={styles.card}>
          <header className={currentMode === 'login' ? styles.visuallyHidden : styles.modeHeader}>
            <h1>{content.title}</h1>
            {content.introduction ? <p>{content.introduction}</p> : null}
          </header>

          <form className={styles.form} onSubmit={submit} autoComplete="on" noValidate>
            {currentMode !== 'reset-password' ? (
              <div className={styles.fieldGroup}>
                <div className={styles.field} data-invalid={fieldErrors.email ? 'true' : 'false'}>
                  <EnvelopeSimple aria-hidden="true" weight="duotone" />
                  <label className={styles.visuallyHidden} htmlFor="auth-email">邮箱</label>
                  <input
                    ref={emailRef}
                    id="auth-email"
                    name="username"
                    type="email"
                    inputMode="email"
                    autoComplete={currentMode === 'login' ? 'username' : 'email'}
                    aria-describedby={describedBy('email')}
                    aria-invalid={fieldErrors.email ? 'true' : undefined}
                    placeholder="邮箱"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearFieldFeedback('email');
                    }}
                    required
                  />
                </div>
                {fieldErrors.email ? <small id="auth-email-error" className={styles.fieldError} role="alert">{fieldErrors.email}</small> : null}
              </div>
            ) : null}

            {currentMode !== 'forgot-password' ? (
              <div className={styles.fieldGroup}>
                <div className={styles.field} data-invalid={fieldErrors.password ? 'true' : 'false'}>
                  <img src={lockIcon} alt="" />
                  <label className={styles.visuallyHidden} htmlFor="auth-password">
                    {currentMode === 'reset-password' ? '新密码' : '密码'}
                  </label>
                  <input
                    ref={passwordRef}
                    id="auth-password"
                    name="password"
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete={currentMode === 'login' ? 'current-password' : 'new-password'}
                    aria-describedby={describedBy('password')}
                    aria-invalid={fieldErrors.password ? 'true' : undefined}
                    placeholder={currentMode === 'reset-password' ? '新密码' : '密码'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearFieldFeedback('password', 'confirmation');
                    }}
                    required
                  />
                  <button
                    className={styles.eyeButton}
                    type="button"
                    aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                    aria-pressed={passwordVisible}
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    <img src={eyeIcon} alt="" />
                  </button>
                </div>
                {fieldErrors.password ? <small id="auth-password-error" className={styles.fieldError} role="alert">{fieldErrors.password}</small> : null}
              </div>
            ) : null}

            {currentMode === 'register' || currentMode === 'reset-password' ? (
              <div className={styles.fieldGroup}>
                <div className={styles.field} data-invalid={fieldErrors.confirmation ? 'true' : 'false'}>
                  <img src={lockIcon} alt="" />
                  <label className={styles.visuallyHidden} htmlFor="auth-password-confirmation">
                    {currentMode === 'reset-password' ? '确认新密码' : '确认密码'}
                  </label>
                  <input
                    ref={confirmationRef}
                    id="auth-password-confirmation"
                    type={passwordVisible ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-describedby={describedBy('confirmation')}
                    aria-invalid={fieldErrors.confirmation ? 'true' : undefined}
                    placeholder={currentMode === 'reset-password' ? '确认新密码' : '确认密码'}
                    value={confirmation}
                    onChange={(event) => {
                      setConfirmation(event.target.value);
                      clearFieldFeedback('confirmation');
                    }}
                    required
                  />
                </div>
                {fieldErrors.confirmation ? <small id="auth-confirmation-error" className={styles.fieldError} role="alert">{fieldErrors.confirmation}</small> : null}
              </div>
            ) : null}

            {currentMode === 'login' ? (
              <div className={styles.optionsRow}>
                <label className={styles.rememberControl}>
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                  <span>记住我</span>
                </label>
                <button type="button" aria-label="忘记密码" disabled={busy} onClick={() => changeMode('forgot-password')}>忘记密码？</button>
              </div>
            ) : null}

            {status ? (
              <p id={AUTH_STATUS_ID} className={status.kind === 'error' ? styles.error : styles.success} role={status.kind === 'error' ? 'alert' : 'status'}>
                {status.message}
              </p>
            ) : null}

            <button className={styles.submit} type="submit" disabled={busy} aria-busy={busy}>{submitLabel}</button>

            {currentMode === 'login' ? (
              <button className={styles.secondary} type="button" disabled={busy} onClick={() => changeMode('register')}>注册账号</button>
            ) : null}
            {currentMode === 'register' || currentMode === 'forgot-password' ? (
              <button className={styles.secondary} type="button" disabled={busy} onClick={() => changeMode('login')}>返回登录</button>
            ) : null}
          </form>
          </section>

          {currentMode === 'login' ? (
            <section className={styles.alternativeLogin} aria-label="其他登录方式">
              <div className={styles.divider}><span>或</span></div>
              <div className={styles.socialButtons}>
                <button type="button" onClick={() => showNotice('微信登录暂未配置')}><img src={wechatIcon} alt="" />微信登录</button>
                <button type="button" onClick={() => showNotice('游客体验将在正式环境开放')}><img src={guestIcon} alt="" />游客体验</button>
              </div>
            </section>
          ) : null}
        </div>

        {currentMode === 'login' ? (
          <p className={styles.agreement}>
            登录即表示同意
            <button type="button" onClick={() => showNotice('用户协议将在正式发布前补充')}>《用户协议》</button>
            和
            <button type="button" onClick={() => showNotice('隐私政策将在正式发布前补充')}>《隐私政策》</button>
          </p>
        ) : null}
      </div>
    </main>
  );
}
