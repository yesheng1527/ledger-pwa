import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import '../../design-system/global.css';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { TransactionDetail, TransactionEditInput } from '../../view-model/types';
import { TransactionOverlays } from './TransactionOverlays';

const accountOptions: TransactionDetail['accountOptions'] = [
  { id: 'account-card', name: '储蓄卡', accountClass: 'asset' },
  { id: 'account-cash', name: '现金', accountClass: 'asset' },
  { id: 'account-credit', name: '信用卡', accountClass: 'liability' },
];

const categoryOptions: TransactionDetail['categoryOptions'] = [
  { id: 'category-food', name: '餐饮', kind: 'expense' },
  { id: 'category-shopping', name: '购物', kind: 'expense' },
  { id: 'category-salary', name: '工资', kind: 'income' },
];

const expenseDetail: TransactionDetail = {
  id: 'transaction-expense',
  ledgerId: 'ledger-one',
  type: 'expense',
  title: '海边午餐',
  categoryName: '餐饮',
  categoryId: 'category-food',
  categoryIconKey: 'food',
  occurredAt: '2026-07-18T04:30:00.000Z',
  timeLabel: '12:30',
  accountLabel: '储蓄卡',
  amountCents: 6_880,
  amountLabel: '-¥68.80',
  amountTone: 'expense',
  version: 3,
  note: '海边午餐',
  originalTransactionId: null,
  originalTransactionTitle: null,
  entries: [{ accountId: 'account-card', accountName: '储蓄卡', deltaCents: -6_880 }],
  accountOptions,
  categoryOptions,
};

function detailFor(
  type: TransactionDetail['type'],
  overrides: Partial<TransactionDetail> = {},
): TransactionDetail {
  const byType: Record<TransactionDetail['type'], Partial<TransactionDetail>> = {
    expense: {},
    income: {
      id: 'transaction-income',
      title: '工资',
      categoryName: '工资',
      categoryId: 'category-salary',
      categoryIconKey: 'income',
      amountLabel: '+¥68.80',
      amountTone: 'income',
      accountLabel: '储蓄卡',
      entries: [{ accountId: 'account-card', accountName: '储蓄卡', deltaCents: 6_880 }],
    },
    transfer: {
      id: 'transaction-transfer',
      title: '转账',
      categoryName: null,
      categoryId: null,
      categoryIconKey: 'transfer',
      amountLabel: '¥68.80',
      amountTone: 'neutral',
      accountLabel: '储蓄卡 → 现金',
      entries: [
        { accountId: 'account-card', accountName: '储蓄卡', deltaCents: -6_880 },
        { accountId: 'account-cash', accountName: '现金', deltaCents: 6_880 },
      ],
    },
    refund: {
      id: 'transaction-refund',
      title: '午餐退款',
      categoryName: '餐饮',
      categoryId: 'category-food',
      categoryIconKey: 'food',
      amountLabel: '+¥20.00',
      amountCents: 2_000,
      amountTone: 'refund',
      accountLabel: '储蓄卡',
      originalTransactionId: 'transaction-expense',
      originalTransactionTitle: '海边午餐',
      entries: [{ accountId: 'account-card', accountName: '储蓄卡', deltaCents: 2_000 }],
    },
    adjustment: {
      id: 'transaction-adjustment',
      title: '余额校准',
      categoryName: null,
      categoryId: null,
      categoryIconKey: 'adjustment',
      amountLabel: '-¥12.00',
      amountCents: 1_200,
      amountTone: 'adjustment',
      accountLabel: '现金',
      entries: [{ accountId: 'account-cash', accountName: '现金', deltaCents: -1_200 }],
    },
  };
  return { ...expenseDetail, type, ...byType[type], ...overrides };
}

type ViewModelDouble = {
  getTransactionDetail: ReturnType<typeof vi.fn>;
  updateTransaction: ReturnType<typeof vi.fn>;
  deleteTransaction: ReturnType<typeof vi.fn>;
  undoTransactionDelete: ReturnType<typeof vi.fn>;
  flushPendingDelete: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

function makeViewModel(
  detail: TransactionDetail = expenseDetail,
  overrides: Partial<ViewModelDouble> = {},
) {
  const methods: ViewModelDouble = {
    getTransactionDetail: vi.fn(async (id: string) => (
      id === detail.id ? detail : { ...detail, id }
    )),
    updateTransaction: vi.fn(async (_input: TransactionEditInput) => undefined),
    deleteTransaction: vi.fn(async () => ({
      undoUntil: new Date(Date.now() + 8_000).toISOString(),
    })),
    undoTransactionDelete: vi.fn(async () => undefined),
    flushPendingDelete: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    ...overrides,
  };
  return Object.assign(methods as unknown as LedgerViewModel, methods);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function OverlayHarness({
  viewModel,
  initialId = null,
  onDetailOpenChange = vi.fn(),
  onReload = vi.fn(),
}: {
  viewModel: LedgerViewModel;
  initialId?: string | null;
  onDetailOpenChange?: (open: boolean) => void;
  onReload?: () => void;
}) {
  const [transactionId, setTransactionId] = useState<string | null>(initialId);
  return (
    <>
      <button type="button" onClick={() => setTransactionId(expenseDetail.id)}>
        打开流水
      </button>
      <button type="button" onClick={() => setTransactionId('transaction-second')}>
        打开第二笔流水
      </button>
      <TransactionOverlays
        viewModel={viewModel}
        transactionId={transactionId}
        onCloseDetail={() => setTransactionId(null)}
        onDetailOpenChange={onDetailOpenChange}
        onReload={onReload}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TransactionOverlays detail and focus', () => {
  it('shows loading instead of a closed-state null result while the first detail request is pending', async () => {
    const user = userEvent.setup();
    const pending = deferred<TransactionDetail | null>();
    const viewModel = makeViewModel(expenseDetail, {
      getTransactionDetail: vi.fn(() => pending.promise),
    });
    render(<OverlayHarness viewModel={viewModel} />);

    await act(async () => undefined);
    await user.click(screen.getByRole('button', { name: '打开流水' }));

    expect(screen.getByRole('status')).toHaveTextContent('正在读取流水详情');
    expect(screen.queryByText('这笔流水已不存在或已删除')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑流水' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除流水' })).not.toBeInTheDocument();
  });

  it('never exposes or mutates stale detail while switching from transaction A to B', async () => {
    const user = userEvent.setup();
    const first = deferred<TransactionDetail | null>();
    const second = deferred<TransactionDetail | null>();
    const secondDetail = detailFor('income', {
      id: 'transaction-second',
      title: '第二笔记录',
      note: '第二笔记录',
    });
    const viewModel = makeViewModel(expenseDetail, {
      getTransactionDetail: vi.fn((id: string) => (
        id === expenseDetail.id ? first.promise : second.promise
      )),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await act(async () => first.resolve(expenseDetail));
    expect(await screen.findByRole('button', { name: '编辑流水' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '打开第二笔流水' }));

    const staleDelete = screen.queryByRole('button', { name: '删除流水' });
    staleDelete?.click();
    expect(screen.getByRole('status')).toHaveTextContent('正在读取流水详情');
    expect(screen.queryByRole('button', { name: '编辑流水' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除流水' })).not.toBeInTheDocument();
    expect(viewModel.deleteTransaction).not.toHaveBeenCalled();
    expect(viewModel.updateTransaction).not.toHaveBeenCalled();

    await act(async () => second.resolve(secondDetail));
    expect(await screen.findByText('第二笔记录')).toBeInTheDocument();
  });

  it('moves focus into the dialog while detail loading is still pending', async () => {
    const pending = deferred<TransactionDetail | null>();
    const viewModel = makeViewModel(expenseDetail, {
      getTransactionDetail: vi.fn(() => pending.promise),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    });
    pending.resolve(expenseDetail);
  });

  it('shows complete detail, traps focus, closes with Escape and restores the source row', async () => {
    const user = userEvent.setup();
    render(<OverlayHarness viewModel={makeViewModel()} />);
    const sourceRow = screen.getByRole('button', { name: '打开流水' });

    await user.click(sourceRow);

    const dialog = await screen.findByRole('dialog', { name: '流水详情' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('支出')).toBeInTheDocument();
    expect(within(dialog).getByText('-¥68.80')).toBeInTheDocument();
    expect(within(dialog).getByText('餐饮')).toBeInTheDocument();
    expect(within(dialog).getByText('储蓄卡')).toBeInTheDocument();
    expect(within(dialog).getByText('2026年7月18日 12:30')).toBeInTheDocument();
    expect(within(dialog).getByText('海边午餐')).toBeInTheDocument();
    expect(within(dialog).getByText('版本 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑流水' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: '删除流水' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sourceRow).toHaveFocus();
  });
});

describe('TransactionOverlays editing', () => {
  it('parses yuan, preserves expense type and emits selected account/category choices', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '12.34');
    await user.selectOptions(screen.getByLabelText('账户'), 'account-cash');
    await user.selectOptions(screen.getByLabelText('分类'), 'category-shopping');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '购物袋');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(viewModel.updateTransaction).toHaveBeenCalledWith({
      id: expenseDetail.id,
      baseVersion: 3,
      type: 'expense',
      amountCents: 1_234,
      accountId: 'account-cash',
      categoryId: 'category-shopping',
      occurredAt: '2026-07-18T04:30:00.000Z',
      note: '购物袋',
    }));
    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
  });

  it('keeps fields after a stale save and never exposes the raw error', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel(expenseDetail, {
      updateTransaction: vi.fn(async () => {
        throw new Error('流水已更新，请刷新后重试：secret stale row details');
      }),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '99.50');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '保留这段文字');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('流水已更新，请刷新后重试');
    expect(screen.getByLabelText('金额')).toHaveValue('99.50');
    expect(screen.getByLabelText('备注')).toHaveValue('保留这段文字');
    expect(screen.queryByText(/secret stale row details/i)).not.toBeInTheDocument();
  });

  it('keeps the opened edit version and field values across a subscription refresh', async () => {
    const user = userEvent.setup();
    let currentDetail = expenseDetail;
    let notify: () => void = () => undefined;
    const updateTransaction = vi.fn(async (input: TransactionEditInput) => {
      if (input.baseVersion === expenseDetail.version) {
        throw new Error('流水已更新，请刷新后重试');
      }
    });
    const viewModel = makeViewModel(expenseDetail, {
      getTransactionDetail: vi.fn(async () => currentDetail),
      updateTransaction,
      subscribe: vi.fn((listener: () => void) => {
        notify = listener;
        return () => undefined;
      }),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '77.70');
    await user.clear(screen.getByLabelText('备注'));
    await user.type(screen.getByLabelText('备注'), '不要重置');

    currentDetail = { ...expenseDetail, version: 4, note: '后台新备注' };
    await act(async () => notify());
    await waitFor(() => expect(viewModel.getTransactionDetail).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText('金额')).toHaveValue('77.70');
    expect(screen.getByLabelText('备注')).toHaveValue('不要重置');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(updateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      baseVersion: 3,
      amountCents: 7_770,
      note: '不要重置',
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent('流水已更新，请刷新后重试');
  });

  it('rejects malformed yuan text and focuses the amount field', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '1.001');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(screen.getByRole('alert')).toHaveTextContent('金额最多保留两位小数');
    expect(screen.getByLabelText('金额')).toHaveFocus();
    expect(viewModel.updateTransaction).not.toHaveBeenCalled();
  });

  it('maps a server-side category validation failure and focuses the category choice', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel(expenseDetail, {
      updateTransaction: vi.fn(async () => {
        throw new Error('分类不存在、已归档或类型不匹配');
      }),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('分类不可用，请重新选择');
    expect(screen.getByLabelText('分类')).toHaveFocus();
  });

  it('prevents a same-account transfer and focuses the receiving account', async () => {
    const user = userEvent.setup();
    const detail = detailFor('transfer');
    const viewModel = makeViewModel(detail);
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.selectOptions(screen.getByLabelText('转入账户'), 'account-card');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(screen.getByRole('alert')).toHaveTextContent('转出和转入账户不能相同');
    expect(screen.getByLabelText('转入账户')).toHaveFocus();
    expect(viewModel.updateTransaction).not.toHaveBeenCalled();
  });

  it('maps an invalid transfer source without exposing raw errors and focuses the source', async () => {
    const user = userEvent.setup();
    const detail = detailFor('transfer');
    const viewModel = makeViewModel(detail, {
      updateTransaction: vi.fn(async () => {
        throw new Error('转出账户必须是资产账户：secret posting details');
      }),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('转出账户不可用，请重新选择');
    expect(screen.getByLabelText('转出账户')).toHaveFocus();
    expect(screen.queryByText(/secret posting details/i)).not.toBeInTheDocument();
  });

  it('rejects notes over 500 characters locally and focuses the note field', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    fireEvent.change(screen.getByLabelText('备注'), {
      target: { value: '海'.repeat(501) },
    });
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(screen.getByRole('alert')).toHaveTextContent('备注不能超过 500 个字');
    expect(screen.getByLabelText('备注')).toHaveFocus();
    expect(viewModel.updateTransaction).not.toHaveBeenCalled();
  });

  it('offers only asset accounts and income categories for an income edit', async () => {
    const user = userEvent.setup();
    const detail = detailFor('income');
    render(<OverlayHarness viewModel={makeViewModel(detail)} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));

    expect(within(screen.getByLabelText('账户')).getAllByRole('option').map(
      (option) => (option as HTMLOptionElement).value,
    )).toEqual(['account-card', 'account-cash']);
    expect(within(screen.getByLabelText('分类')).getAllByRole('option').map(
      (option) => (option as HTMLOptionElement).value,
    )).toEqual(['category-salary']);
  });

  it('excludes liabilities only from the transfer source choices', async () => {
    const user = userEvent.setup();
    const detail = detailFor('transfer');
    render(<OverlayHarness viewModel={makeViewModel(detail)} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));

    expect(within(screen.getByLabelText('转出账户')).queryByRole(
      'option',
      { name: '信用卡' },
    )).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('转入账户')).getByRole(
      'option',
      { name: '信用卡' },
    )).toBeInTheDocument();
  });

  it('keeps the refund account fixed and preserves the refund origin on save', async () => {
    const user = userEvent.setup();
    const detail = detailFor('refund');
    const viewModel = makeViewModel(detail);
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    expect(screen.queryByRole('combobox', { name: /账户/ })).not.toBeInTheDocument();
    expect(screen.getByText('退款账户：储蓄卡')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(viewModel.updateTransaction).toHaveBeenCalledWith({
      id: detail.id,
      baseVersion: 3,
      type: 'refund',
      amountCents: 2_000,
      occurredAt: '2026-07-18T04:30:00.000Z',
      note: '海边午餐',
    });
  });

  it('preserves seconds and milliseconds when an unchanged local time is saved', async () => {
    const user = userEvent.setup();
    const detail = detailFor('refund', {
      occurredAt: '2026-07-18T04:30:45.123Z',
    });
    const viewModel = makeViewModel(detail);
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(viewModel.updateTransaction).toHaveBeenCalledWith(expect.objectContaining({
      occurredAt: '2026-07-18T04:30:45.123Z',
    }));
  });

  it('maps the known refund limit failure to the amount field', async () => {
    const user = userEvent.setup();
    const detail = detailFor('refund');
    const viewModel = makeViewModel(detail, {
      updateTransaction: vi.fn(async () => {
        throw new Error('退款总额不能超过原支出');
      }),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('退款金额超过原支出可退款余额');
    expect(screen.getByLabelText('金额')).toHaveFocus();
  });

  it('turns the explicit adjustment direction into a signed delta', async () => {
    const user = userEvent.setup();
    const detail = detailFor('adjustment');
    const viewModel = makeViewModel(detail);
    render(<OverlayHarness viewModel={viewModel} initialId={detail.id} />);

    await user.click(await screen.findByRole('button', { name: '编辑流水' }));
    expect(screen.getByRole('radio', { name: '减少余额' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: '增加余额' }));
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(viewModel.updateTransaction).toHaveBeenCalledWith({
      id: detail.id,
      baseVersion: 3,
      type: 'adjustment',
      deltaCents: 1_200,
      accountId: 'account-cash',
      occurredAt: '2026-07-18T04:30:00.000Z',
      note: '海边午餐',
    });
  });
});

describe('TransactionOverlays recoverable deletion', () => {
  it('acquires the delete lock synchronously before the mutation promise settles', async () => {
    const pendingDelete = deferred<{ undoUntil: string }>();
    const viewModel = makeViewModel(expenseDetail, {
      deleteTransaction: vi.fn(() => pendingDelete.promise),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);
    const deleteButton = await screen.findByRole('button', { name: '删除流水' });
    const editButton = screen.getByRole('button', { name: '编辑流水' });

    act(() => {
      deleteButton.click();
      editButton.click();
      deleteButton.click();
    });

    expect(viewModel.deleteTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
  });

  it('keeps one protected undo window when A deletion resolves after opening B', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pendingDelete = deferred<{ undoUntil: string }>();
    const viewModel = makeViewModel(expenseDetail, {
      deleteTransaction: vi.fn(() => pendingDelete.promise),
    });
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '删除流水' }));
    await user.click(screen.getByRole('button', { name: '打开第二笔流水' }));

    const editSecond = await screen.findByRole('button', { name: '编辑流水' });
    const deleteSecond = screen.getByRole('button', { name: '删除流水' });
    expect(editSecond).toBeDisabled();
    expect(deleteSecond).toBeDisabled();
    deleteSecond.click();
    expect(viewModel.deleteTransaction).toHaveBeenCalledTimes(1);

    await act(async () => pendingDelete.resolve({
      undoUntil: '2026-07-22T08:00:08.000Z',
    }));

    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('流水已删除');
    expect(viewModel.deleteTransaction).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(viewModel.flushPendingDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog and source row when deletion fails without exposing raw errors', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel(expenseDetail, {
      deleteTransaction: vi.fn(async () => {
        throw new Error('secret delete failure');
      }),
    });
    render(<OverlayHarness viewModel={viewModel} />);
    const sourceRow = screen.getByRole('button', { name: '打开流水' });

    await user.click(sourceRow);
    await user.click(await screen.findByRole('button', { name: '删除流水' }));

    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
    expect(sourceRow).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('删除失败，请稍后重试');
    expect(screen.queryByText(/secret delete failure/i)).not.toBeInTheDocument();
  });

  it('undoes within eight seconds and cancels expiration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '删除流水' }));
    expect(viewModel.deleteTransaction).toHaveBeenCalledWith(expenseDetail.id);
    await user.click(screen.getByRole('button', { name: '撤销删除' }));
    expect(viewModel.undoTransactionDelete).toHaveBeenCalledWith(expenseDetail.id);
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(viewModel.flushPendingDelete).not.toHaveBeenCalled();
  });

  it('flushes once when the undo window expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-22T08:00:00.000Z'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '删除流水' }));
    expect(viewModel.deleteTransaction).toHaveBeenCalledWith(expenseDetail.id);
    expect(screen.getByRole('status')).toHaveTextContent('流水已删除');
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(viewModel.flushPendingDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps an undo failure visible and exposes reload without raw errors', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const viewModel = makeViewModel(expenseDetail, {
      undoTransactionDelete: vi.fn(async () => {
        throw new Error('secret undo failure');
      }),
    });
    render(
      <OverlayHarness
        viewModel={viewModel}
        initialId={expenseDetail.id}
        onReload={onReload}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '删除流水' }));
    await user.click(screen.getByRole('button', { name: '撤销删除' }));

    expect(await screen.findByRole('status')).toHaveTextContent('撤销失败，请重新加载');
    expect(screen.queryByText(/secret undo failure/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('blocks a second tombstone while the first undo window is active', async () => {
    const user = userEvent.setup();
    const viewModel = makeViewModel();
    render(<OverlayHarness viewModel={viewModel} initialId={expenseDetail.id} />);

    await user.click(await screen.findByRole('button', { name: '删除流水' }));
    await user.click(screen.getByRole('button', { name: '打开第二笔流水' }));

    expect(await screen.findByText('请先处理上一笔删除的撤销机会')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除流水' })).toBeDisabled();
    expect(viewModel.deleteTransaction).toHaveBeenCalledTimes(1);
  });
});
