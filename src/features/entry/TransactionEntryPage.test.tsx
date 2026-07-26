import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import '../../design-system/global.css';
import type { EntryOptions, TransactionCreateInput } from '../../view-model/types';
import {
  createEntryDraftController,
  type EntryPreferencePort,
} from './entry-draft';
import stylesText from './TransactionEntryPage.module.css?raw';
import { TransactionEntryPage } from './TransactionEntryPage';

const options: EntryOptions = {
  accounts: [
    { id: 'bank', name: '银行卡', accountClass: 'asset' },
    { id: 'cash', name: '现金', accountClass: 'asset' },
    { id: 'credit', name: '信用卡', accountClass: 'liability' },
  ],
  expenseCategories: [
    { id: 'food', name: '餐饮', iconKey: 'food' },
    { id: 'travel', name: '旅行', iconKey: 'travel' },
  ],
  incomeCategories: [
    { id: 'salary', name: '工资', iconKey: 'income' },
  ],
  refundableExpenses: [
    {
      id: 'expense-1',
      title: '买衣服',
      accountId: 'credit',
      remainingCents: 18000,
      occurredAt: '2026-07-17T06:00:00.000Z',
    },
  ],
};

const preferences: EntryPreferencePort = {
  loadLastAccountId: () => 'cash',
  saveLastAccountId: vi.fn(),
};

function renderEntry(
  createTransaction: (
    input: TransactionCreateInput,
  ) => Promise<{ transactionId: string }> = async () => ({
    transactionId: 'transaction-new',
  }),
) {
  const controller = createEntryDraftController({
    options,
    preferences,
    now: () => new Date(2026, 6, 26, 14, 5),
    createTransaction,
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <TransactionEntryPage
      controller={controller}
      options={options}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { controller, onClose, onSaved };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('transaction entry page hierarchy', () => {
  it('renders the full five-type form and focuses the decimal amount', async () => {
    renderEntry();

    const dialog = screen.getByRole('dialog', { name: '记账' });
    expect(within(dialog).getByRole('heading', { name: '记账', level: 1 }))
      .toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '关闭记账' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: '主要记账类型' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '支出' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: '收入' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '转账' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: '更多类型' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '退款' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '余额校准' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: '支出分类' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: '备注' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('发生时间')).toHaveAttribute(
      'type',
      'datetime-local',
    );
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText('金额')).toHaveFocus());
    expect(within(dialog).getByLabelText('金额')).toHaveAttribute('inputmode', 'decimal');
  });

  it('switches compatible categories, account fields, refund copy and adjustment direction', async () => {
    const user = userEvent.setup();
    renderEntry();

    await user.click(screen.getByRole('button', { name: '收入' }));
    expect(screen.getByRole('group', { name: '收入分类' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '工资' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '收入账户' })).not.toHaveTextContent('信用卡');

    await user.click(screen.getByRole('button', { name: '转账' }));
    expect(screen.getByRole('combobox', { name: '转出账户' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '转入账户' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '退款' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '原支出' }), 'expense-1');
    expect(screen.getByText('退款原账户：信用卡')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '余额校准' }));
    expect(screen.getByRole('radio', { name: '增加余额' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '减少余额' })).toBeInTheDocument();
  });
});

describe('transaction entry page focus and submission', () => {
  it('focuses the responsible field after validation', async () => {
    const user = userEvent.setup();
    renderEntry();

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入大于 0 的金额');
    expect(screen.getByLabelText('金额')).toHaveFocus();
  });

  it('closes on Escape only while not submitting', async () => {
    const idle = renderEntry();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(idle.onClose).toHaveBeenCalledOnce();
    cleanup();

    let resolveSave!: (result: { transactionId: string }) => void;
    const pending = new Promise<{ transactionId: string }>((resolve) => {
      resolveSave = resolve;
    });
    const saving = renderEntry(() => pending);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('金额'), '68');
    await user.click(screen.getByRole('button', { name: '保存' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(saving.onClose).not.toHaveBeenCalled();

    resolveSave({ transactionId: 'transaction-new' });
    await waitFor(() => expect(saving.onSaved).toHaveBeenCalledWith('transaction-new'));
  });

  it('traps Tab inside the full-screen layer', async () => {
    renderEntry();
    const close = screen.getByRole('button', { name: '关闭记账' });
    const save = screen.getByRole('button', { name: '保存' });

    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('preserves inputs on failure and reports success once', async () => {
    const failing = renderEntry(async () => {
      throw new Error('network unavailable');
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('金额'), '68.50');
    await user.type(screen.getByRole('textbox', { name: '备注' }), '周末晚餐');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败，请稍后重试');
    expect(screen.getByLabelText('金额')).toHaveValue('68.50');
    expect(screen.getByRole('textbox', { name: '备注' })).toHaveValue('周末晚餐');
    expect(failing.onSaved).not.toHaveBeenCalled();
    cleanup();

    const successful = renderEntry();
    await user.type(screen.getByLabelText('金额'), '68');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(successful.onSaved).toHaveBeenCalledTimes(1));
  });

  it('locks every form control to the shared 44px contract', () => {
    renderEntry();
    const dialog = screen.getByRole('dialog');
    const controls = dialog.querySelectorAll('button, input, select, textarea');

    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((control) => {
      expect(control).toHaveAttribute('data-entry-control', 'true');
    });
    expect(stylesText).toContain('min-height: var(--control-min-size)');
    expect(stylesText).toContain('min-width: var(--control-min-size)');
  });
});
