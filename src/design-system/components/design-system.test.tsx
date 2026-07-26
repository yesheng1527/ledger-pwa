import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Amount } from './Amount';
import { BottomNavigation, type NavigationItem } from './BottomNavigation';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { HandDrawnIcon } from './HandDrawnIcon';
import { PageHeader } from './PageHeader';
import { PrimaryButton } from './PrimaryButton';
import { ProgressBar } from './ProgressBar';
import { SegmentedControl } from './SegmentedControl';
import { TextField } from './TextField';
import { UndoToast } from './UndoToast';

afterEach(() => cleanup());

describe('design-system accessibility contracts', () => {
  it('formats signed amounts with a Chinese accessible label and tabular numerals', () => {
    render(<Amount cents={-5000} label="今日支出" tone="expense" />);

    const amount = screen.getByLabelText('今日支出，负50.00元');
    expect(amount).toHaveTextContent('-¥50.00');
    expect(amount).toHaveAttribute('data-tone', 'expense');
    expect(amount).toHaveAttribute('data-numeric');
  });

  it('keeps amount tone independent from its numeric sign', () => {
    render(<Amount cents={5000} label="退款" tone="expense" />);

    const amount = screen.getByLabelText('退款，50.00元');
    expect(amount).toHaveTextContent('¥50.00');
    expect(amount).toHaveAttribute('data-tone', 'expense');
  });

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

  it('never marks the central entry action as the current page', () => {
    const items: NavigationItem[] = [
      {
        id: 'entry',
        label: '记账',
        icon: 'nav:entry',
        active: true,
        central: true,
        onActivate: vi.fn(),
      },
    ];

    render(<BottomNavigation items={items} />);

    expect(screen.getByRole('button', { name: '记账' })).not.toHaveAttribute('aria-current');
  });

  it('renders a compact page header with a labeled 44px action', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(
      <PageHeader
        title="流水"
        eyebrow="每一笔，都有迹可循"
        action={{
          label: '搜索流水',
          asset: 'action:search',
          onActivate,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: '流水', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('每一笔，都有迹可循')).toBeInTheDocument();
    const action = screen.getByRole('button', { name: '搜索流水' });
    expect(action.className).toContain('ds-page-header__action');
    await user.click(action);
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it('switches a generic segmented control with pressed-state semantics', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="统计区间"
        value="month"
        options={[
          { value: 'month', label: '月' },
          { value: 'year', label: '年' },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('group', { name: '统计区间' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '月' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '年' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: '年' }));
    expect(onChange).toHaveBeenCalledWith('year');
  });

  it('clamps progress visuals while preserving an authored overspend summary', () => {
    const { container } = render(
      <ProgressBar
        label="本月预算"
        value={12000}
        max={10000}
        valueText="已用120.00元，已超支20.00元"
        tone="warning"
      />,
    );

    const progress = screen.getByRole('progressbar', { name: '本月预算' });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '10000');
    expect(progress).toHaveAttribute('aria-valuenow', '10000');
    expect(progress).toHaveAttribute('aria-valuetext', '已用120.00元，已超支20.00元');
    expect(container.querySelector('.ds-progress-bar__fill')).toHaveStyle({ width: '100%' });
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

  it('announces a recoverable deletion and keeps its actions at least 44px tall', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn(async () => undefined);
    render(
      <UndoToast
        message="流水已删除"
        undoLabel="撤销删除"
        expiresAt={new Date(Date.now() + 8_000).toISOString()}
        onUndo={onUndo}
        onExpire={vi.fn(async () => undefined)}
        onReload={vi.fn()}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    const undo = within(status).getByRole('button', { name: '撤销删除' });
    expect(getComputedStyle(undo).minHeight).toBe('var(--control-height)');
    await user.click(undo);
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
