import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNavigation, type NavigationItem } from './BottomNavigation';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { HandDrawnIcon } from './HandDrawnIcon';
import { PrimaryButton } from './PrimaryButton';
import { TextField } from './TextField';

afterEach(() => cleanup());

describe('design-system accessibility contracts', () => {
  it('gives semantic icons their required accessible label', () => {
    render(<HandDrawnIcon asset="brand:shell" label="海风小账本" />);

    expect(screen.getByRole('img', { name: '海风小账本' })).toBeInTheDocument();
  });

  it('hides decorative illustrations from assistive technology', () => {
    const { container } = render(
      <HandDrawnIcon asset="illustration:auth-seaside" decorative />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('exposes and enforces a button busy state', () => {
    render(<PrimaryButton busy>登录</PrimaryButton>);

    expect(screen.getByRole('button', { name: '登录' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '登录' })).toHaveAttribute('aria-busy', 'true');
  });

  it('does not let caller attributes override the busy accessibility state', () => {
    render(<PrimaryButton busy aria-busy={false}>登录</PrimaryButton>);

    expect(screen.getByRole('button', { name: '登录' })).toHaveAttribute('aria-busy', 'true');
  });

  it('connects field descriptions and errors through aria-describedby', () => {
    render(
      <TextField
        id="email"
        label="邮箱"
        description="请输入常用邮箱"
        error="邮箱格式不正确"
      />,
    );

    const field = screen.getByRole('textbox', { name: '邮箱' });
    expect(field).toHaveAccessibleDescription('请输入常用邮箱 邮箱格式不正确');
    expect(screen.getByText('邮箱格式不正确')).toHaveAttribute('role', 'alert');
  });

  it('forwards the input reference for focus management', () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<TextField ref={inputRef} id="password" label="密码" type="password" />);

    inputRef.current?.focus();
    expect(inputRef.current).toHaveFocus();
  });

  it('renders five navigation targets in the locked order and activates one', async () => {
    const user = userEvent.setup();
    const activateLedger = vi.fn();
    const items: NavigationItem[] = [
      { id: 'home', label: '首页', icon: 'nav:home', active: true, onActivate: vi.fn() },
      { id: 'ledger', label: '流水', icon: 'nav:ledger', active: false, onActivate: activateLedger },
      { id: 'entry', label: '记账', icon: 'nav:entry', active: false, central: true, onActivate: vi.fn() },
      { id: 'statistics', label: '统计', icon: 'nav:statistics', active: false, onActivate: vi.fn() },
      { id: 'profile', label: '我的', icon: 'nav:profile', active: false, onActivate: vi.fn() },
    ];

    render(<BottomNavigation items={items} />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '首页',
      '流水',
      '记账',
      '统计',
      '我的',
    ]);
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(activateLedger).toHaveBeenCalledOnce();
  });

  it('forwards a navigation button reference for focus management', () => {
    const entryButtonRef = createRef<HTMLButtonElement>();
    const items: NavigationItem[] = [
      {
        id: 'entry',
        label: '记账',
        icon: 'nav:entry',
        active: false,
        central: true,
        buttonRef: entryButtonRef,
        onActivate: vi.fn(),
      },
    ];

    render(<BottomNavigation items={items} />);

    entryButtonRef.current?.focus();
    expect(screen.getByRole('button', { name: '记账' })).toHaveFocus();
  });

  it('renders card and empty-state content without emoji presentation characters', () => {
    const { container } = render(
      <Card>
        <EmptyState title="尚无记录" description="下一阶段将接入真实账本数据。" />
      </Card>,
    );

    expect(screen.getByRole('heading', { name: '尚无记录' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
