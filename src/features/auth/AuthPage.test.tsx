import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapAuthError } from './auth-errors';
import { AuthPage, type AuthPageCommands } from './AuthPage';

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

describe('mapAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials' }, '邮箱或密码不正确'],
    [{ code: 'email_not_confirmed' }, '邮箱尚未验证'],
    [{ code: 'over_request_rate_limit' }, '操作太频繁，请稍后再试'],
    [new TypeError('Failed to fetch'), '网络连接失败，请稍后重试'],
    [{ code: 'weak_password' }, '密码至少需要 8 个字符'],
    [new Error('server internals'), '操作失败，请稍后重试'],
  ])('maps auth errors without exposing raw details', (error, message) => {
    expect(mapAuthError(error)).toBe(message);
  });
});

describe('AuthPage', () => {
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

  it('does not offer a registration control', () => {
    const { container } = render(<AuthPage mode="login" commands={createCommands()} />);

    expect(screen.queryByRole('link', { name: /注册/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /注册/ })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/注册/);
  });
});
