import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { navigationItems } from './navigation';

const regularTabs = [
  ['首页', '首页内容将在下一阶段接入真实账本数据。'],
  ['流水', '流水列表将在下一阶段接入筛选和明细。'],
  ['统计', '统计图表将在真实数据接口完成后开放。'],
  ['我的', '账户、分类和备份设置将在后续阶段开放。'],
] as const;

afterEach(() => cleanup());

describe('application navigation model', () => {
  it('keeps the five navigation labels in their fixed order with unique ids', () => {
    expect(navigationItems.map(({ label }) => label)).toEqual([
      '首页',
      '流水',
      '记账',
      '统计',
      '我的',
    ]);
    expect(new Set(navigationItems.map(({ id }) => id)).size).toBe(navigationItems.length);
  });

  it('models only the third navigation item as an entry action', () => {
    expect(navigationItems.map(({ kind }) => kind)).toEqual([
      'tab',
      'tab',
      'entry',
      'tab',
      'tab',
    ]);
  });
});

describe('AppShell', () => {
  it('starts on home while keeping all four regular panels mounted', () => {
    render(<AppShell />);

    expect(screen.getByRole('heading', { name: '海风小账本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('aria-current', 'page');

    regularTabs.forEach(([label, description], index) => {
      const panel = screen.getByText(description).closest('[role="tabpanel"]');

      expect(panel).toBeInTheDocument();
      expect(panel).toHaveAttribute('aria-hidden', index === 0 ? 'false' : 'true');
      if (index === 0) {
        expect(panel).not.toHaveAttribute('hidden');
      } else {
        expect(panel).toHaveAttribute('hidden');
      }
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  it('switches among all regular tabs with exactly one current page', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    for (const [label, description] of regularTabs.slice(1)) {
      await user.click(screen.getByRole('button', { name: label }));

      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByText(description).closest('[role="tabpanel"]')).not.toHaveAttribute('hidden');
      expect(screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-current'))).toHaveLength(1);
    }
  });

  it('restores the saved scroll offset for each regular tab', async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    const main = screen.getByRole('main');

    main.scrollTop = 137;
    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(main.scrollTop).toBe(0);

    main.scrollTop = 42;
    await user.click(screen.getByRole('button', { name: '首页' }));
    expect(main.scrollTop).toBe(137);

    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(main.scrollTop).toBe(42);
  });

  it('opens the independent entry dialog and moves focus into it', async () => {
    const user = userEvent.setup();
    const { container } = render(<AppShell />);
    const homeButton = screen.getByRole('button', { name: '首页' });
    const entryButton = screen.getByRole('button', { name: '记账' });

    await user.click(entryButton);

    const dialog = screen.getByRole('dialog', { name: '记账功能建设中' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('[inert]')).toBeNull();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    expect(container.querySelector('[data-shell-background]')).toHaveAttribute('inert');
    expect(homeButton).toHaveAttribute('aria-current', 'page');
    expect(entryButton).not.toHaveAttribute('aria-current');
  });

  it('returns to the originating regular tab and restores entry focus after closing', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: '流水' }));
    await user.click(screen.getByRole('button', { name: '记账' }));
    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '流水' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '记账' })).toHaveFocus();
    expect(screen.getByRole('button', { name: '记账' })).not.toHaveAttribute('aria-current');
  });

  it('closes the entry dialog with Escape and restores focus to the entry button', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.click(screen.getByRole('button', { name: '记账' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '记账' })).toHaveFocus();
  });
});
