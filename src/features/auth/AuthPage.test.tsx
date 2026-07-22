import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAuthError } from './auth-errors';
import { AuthPage, type AuthPageCommands } from './AuthPage';
import authPageCss from './AuthPage.module.css?inline';

afterEach(() => cleanup());

function createCommands(overrides: Partial<AuthPageCommands> = {}): AuthPageCommands {
  return {
    signIn: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    finishPasswordRecovery: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function expectDescribedByIdsToResolve(element: HTMLElement) {
  const ids = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
}

describe('mapAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials' }, '邮箱或密码不正确'],
    [{ code: 'email_not_confirmed' }, '邮箱尚未验证'],
    [{ code: 'over_request_rate_limit' }, '操作太频繁，请稍后再试'],
    [new AuthRetryableFetchError('Failed to fetch', 0), '网络连接失败，请稍后重试'],
    [{ code: 'weak_password' }, '密码至少需要 8 个字符'],
    [new Error('server internals'), '操作失败，请稍后重试'],
  ])('maps auth errors without exposing raw details', (error, message) => {
    expect(mapAuthError(error)).toBe(message);
  });

  it.each(['toString', 'constructor'])('does not accept inherited mapping key %s', (code) => {
    const message = mapAuthError({ code });

    expect(message).toBe('操作失败，请稍后重试');
    expect(typeof message).toBe('string');
  });
});

describe('AuthPage', () => {
  it('places dynamic viewport height after the viewport-height fallback', () => {
    expect(authPageCss).toMatch(/min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  });

  it('submits the login email and password', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(commands.signIn).toHaveBeenCalledWith('hello@example.com', 'password123');
  });

  it('shows a fixed mapped login failure without exposing backend details', async () => {
    const user = userEvent.setup();
    const commands = createCommands({
      signIn: vi.fn(async () => {
        throw Object.assign(new Error('auth backend table users_v2'), {
          code: 'invalid_credentials',
        });
      }),
    });
    render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码不正确');
    expect(screen.queryByText(/users_v2/)).not.toBeInTheDocument();
    const status = screen.getByRole('alert');
    expect(status).toHaveAttribute('id', 'auth-status');
    const email = screen.getByRole('textbox', { name: '邮箱' });
    const password = screen.getByLabelText('密码');
    expect(email).toHaveAttribute('aria-describedby', expect.stringContaining('auth-status'));
    expect(password).toHaveAttribute('aria-describedby', expect.stringContaining('auth-status'));
    expectDescribedByIdsToResolve(email);
    expectDescribedByIdsToResolve(password);
  });

  it('requests a reset email and shows the fixed success message', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="forgot-password" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置邮件' }));

    expect(commands.requestPasswordReset).toHaveBeenCalledWith('hello@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent('重置邮件已发送，请检查邮箱');
  });

  it('maps a forgot-password failure', async () => {
    const user = userEvent.setup();
    const commands = createCommands({
      requestPasswordReset: vi.fn(async () => {
        throw { code: 'over_request_rate_limit', message: 'raw rate limit detail' };
      }),
    });
    render(<AuthPage mode="forgot-password" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置邮件' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('操作太频繁，请稍后再试');
    expect(screen.queryByText(/raw rate limit detail/)).not.toBeInTheDocument();
    const status = screen.getByRole('alert');
    expect(status).toHaveAttribute('id', 'auth-status');
    const email = screen.getByRole('textbox', { name: '邮箱' });
    expect(email).toHaveAttribute('aria-describedby', expect.stringContaining('auth-status'));
    expectDescribedByIdsToResolve(email);
  });

  it('requires a new password with at least eight characters', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="reset-password" commands={commands} />);

    await user.type(screen.getByLabelText('新密码'), 'short');
    await user.type(screen.getByLabelText('确认新密码'), 'short');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(screen.getByRole('alert')).toHaveTextContent('密码至少需要 8 个字符');
    expect(commands.updatePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('新密码')).toHaveFocus();
  });

  it('focuses the confirmation field when the passwords do not match', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="reset-password" commands={commands} />);

    await user.type(screen.getByLabelText('新密码'), 'password123');
    await user.type(screen.getByLabelText('确认新密码'), 'password456');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致');
    expect(screen.getByLabelText('确认新密码')).toHaveFocus();
    expect(commands.updatePassword).not.toHaveBeenCalled();
  });

  it.each(['新密码', '确认新密码'])('clears a password mismatch when %s is edited', async (label) => {
    const user = userEvent.setup();
    render(<AuthPage mode="reset-password" commands={createCommands()} />);

    await user.type(screen.getByLabelText('新密码'), 'password123');
    await user.type(screen.getByLabelText('确认新密码'), 'password456');
    await user.click(screen.getByRole('button', { name: '更新密码' }));
    expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument();

    await user.type(screen.getByLabelText(label), 'x');
    expect(screen.queryByText('两次输入的密码不一致')).not.toBeInTheDocument();
  });

  it('updates the password, completes recovery and shows success', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="reset-password" commands={commands} />);

    await user.type(screen.getByLabelText('新密码'), 'password123');
    await user.type(screen.getByLabelText('确认新密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(commands.updatePassword).toHaveBeenCalledWith('password123');
    expect(commands.finishPasswordRecovery).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('密码已更新');
  });

  it('maps an update-password failure', async () => {
    const user = userEvent.setup();
    const commands = createCommands({
      updatePassword: vi.fn(async () => {
        throw { code: 'weak_password', message: 'raw password policy' };
      }),
    });
    render(<AuthPage mode="reset-password" commands={commands} />);

    await user.type(screen.getByLabelText('新密码'), 'password123');
    await user.type(screen.getByLabelText('确认新密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '更新密码' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('密码至少需要 8 个字符');
    expect(screen.queryByText(/raw password policy/)).not.toBeInTheDocument();
    expect(commands.finishPasswordRecovery).not.toHaveBeenCalled();
    const status = screen.getByRole('alert');
    expect(status).toHaveAttribute('id', 'auth-status');
    const password = screen.getByLabelText('新密码');
    const confirmation = screen.getByLabelText('确认新密码');
    expect(password).toHaveAttribute('aria-describedby', expect.stringContaining('auth-status'));
    expect(confirmation).toHaveAttribute('aria-describedby', expect.stringContaining('auth-status'));
    expectDescribedByIdsToResolve(password);
    expectDescribedByIdsToResolve(confirmation);
  });

  it('authors required login errors and resolves every described ID', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="login" commands={commands} />);

    await user.click(screen.getByRole('button', { name: '登录' }));

    const email = screen.getByRole('textbox', { name: '邮箱' });
    const password = screen.getByLabelText('密码');
    expect(screen.getByText('请输入邮箱')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('请输入密码')).toHaveAttribute('role', 'alert');
    expectDescribedByIdsToResolve(email);
    expectDescribedByIdsToResolve(password);
    expect(email).toHaveFocus();
    expect(commands.signIn).not.toHaveBeenCalled();
  });

  it('authors a required forgot-password email error', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="forgot-password" commands={commands} />);

    await user.click(screen.getByRole('button', { name: '发送重置邮件' }));

    const email = screen.getByRole('textbox', { name: '邮箱' });
    expect(screen.getByText('请输入邮箱')).toHaveAttribute('role', 'alert');
    expectDescribedByIdsToResolve(email);
    expect(email).toHaveFocus();
    expect(commands.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('authors required reset-password errors for both visible fields', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    render(<AuthPage mode="reset-password" commands={commands} />);

    await user.click(screen.getByRole('button', { name: '更新密码' }));

    const password = screen.getByLabelText('新密码');
    const confirmation = screen.getByLabelText('确认新密码');
    expect(screen.getByText('请输入新密码')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('请再次输入新密码')).toHaveAttribute('role', 'alert');
    expectDescribedByIdsToResolve(password);
    expectDescribedByIdsToResolve(confirmation);
    expect(password).toHaveFocus();
    expect(commands.updatePassword).not.toHaveBeenCalled();
  });

  it('disables submission while a command is busy', async () => {
    const user = userEvent.setup();
    let finishSignIn: (() => void) | undefined;
    const pendingSignIn = new Promise<void>((resolve) => {
      finishSignIn = resolve;
    });
    const commands = createCommands({ signIn: vi.fn(() => pendingSignIn) });
    render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    const submit = screen.getByRole('button', { name: '登录' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    await user.click(submit);
    expect(commands.signIn).toHaveBeenCalledOnce();

    finishSignIn?.();
    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it('invalidates a pending success when the external mode changes', async () => {
    const user = userEvent.setup();
    const resetRequest = deferred<void>();
    const commands = createCommands({
      requestPasswordReset: vi.fn(() => resetRequest.promise),
    });
    const { rerender } = render(<AuthPage mode="forgot-password" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.click(screen.getByRole('button', { name: '发送重置邮件' }));
    rerender(<AuthPage mode="reset-password" commands={commands} />);

    expect(screen.getByRole('button', { name: '更新密码' })).not.toBeDisabled();
    await act(async () => resetRequest.resolve());
    expect(screen.queryByText('重置邮件已发送，请检查邮箱')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '设置新密码' })).toBeInTheDocument();
  });

  it('invalidates a pending failure when the external mode changes', async () => {
    const user = userEvent.setup();
    const signInRequest = deferred<void>();
    const commands = createCommands({ signIn: vi.fn(() => signInRequest.promise) });
    const { rerender } = render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));
    rerender(<AuthPage mode="reset-password" commands={commands} />);

    await act(async () => signInRequest.reject({ code: 'invalid_credentials' }));
    expect(screen.queryByText('邮箱或密码不正确')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新密码' })).not.toBeDisabled();
  });

  it('keeps internal navigation disabled while a command is busy', async () => {
    const user = userEvent.setup();
    const signInRequest = deferred<void>();
    const commands = createCommands({ signIn: vi.fn(() => signInRequest.promise) });
    render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByRole('textbox', { name: '邮箱' }), 'hello@example.com');
    await user.type(screen.getByLabelText('密码'), 'password123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    const forgotPassword = screen.getByRole('button', { name: '忘记密码' });
    expect(forgotPassword).toBeDisabled();
    await user.click(forgotPassword);
    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();

    await act(async () => signInRequest.resolve());
  });

  it('moves focus after internal mode switches', async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="login" commands={createCommands()} />);

    await waitFor(() => expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: '忘记密码' }));
    expect(screen.getByRole('heading', { name: '找回密码' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '返回登录' }));
    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveFocus());
  });

  it('renders a changed external mode immediately and focuses its first field', async () => {
    const commands = createCommands();
    const { rerender } = render(<AuthPage mode="login" commands={commands} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveFocus());

    rerender(<AuthPage mode="reset-password" commands={commands} />);
    expect(screen.getByRole('heading', { name: '设置新密码' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '欢迎回来' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('新密码')).toHaveFocus());

    rerender(<AuthPage mode="login" commands={commands} />);
    expect(screen.getByRole('heading', { name: '欢迎回来' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: '邮箱' })).toHaveFocus());
  });

  it('clears passwords and confirmation whenever the external mode changes', async () => {
    const user = userEvent.setup();
    const commands = createCommands();
    const { rerender } = render(<AuthPage mode="login" commands={commands} />);

    await user.type(screen.getByLabelText('密码'), 'login-password');
    rerender(<AuthPage mode="reset-password" commands={commands} />);
    expect(screen.getByLabelText('新密码')).toHaveValue('');

    await user.type(screen.getByLabelText('新密码'), 'reset-password');
    await user.type(screen.getByLabelText('确认新密码'), 'reset-password');
    rerender(<AuthPage mode="login" commands={commands} />);
    expect(screen.getByLabelText('密码')).toHaveValue('');
    rerender(<AuthPage mode="reset-password" commands={commands} />);
    expect(screen.getByLabelText('新密码')).toHaveValue('');
    expect(screen.getByLabelText('确认新密码')).toHaveValue('');
  });

  it('clears the password after internal login and forgot-password navigation', async () => {
    const user = userEvent.setup();
    render(<AuthPage mode="login" commands={createCommands()} />);

    await user.type(screen.getByLabelText('密码'), 'login-password');
    await user.click(screen.getByRole('button', { name: '忘记密码' }));
    await user.click(screen.getByRole('button', { name: '返回登录' }));

    expect(screen.getByLabelText('密码')).toHaveValue('');
  });

  it('does not offer a registration control', () => {
    const { container } = render(<AuthPage mode="login" commands={createCommands()} />);

    expect(screen.queryByRole('link', { name: /注册/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /注册/ })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/注册/);
  });
});
