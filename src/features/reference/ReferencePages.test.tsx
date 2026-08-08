import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../app/AppShell';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import { resetProfileAvatar } from './profile-preferences';

const viewModel = {} as LedgerViewModel;

afterEach(async () => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  await resetProfileAvatar();
});

describe('reference five-page application', () => {
  it('shows the forced splash screen and lets the user skip it', async () => {
    window.history.replaceState(null, '', '/?splash=1');
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    expect(screen.getByLabelText('开屏页')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '跳过开屏页' }));

    expect(screen.queryByLabelText('开屏页')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '早上好，海风~' })).toBeInTheDocument();
  });

  it('keeps the five navigation destinations in the reference order', () => {
    render(<AppShell viewModel={viewModel} />);

    expect(screen.queryByLabelText('状态栏')).not.toBeInTheDocument();
    expect(screen.queryByText('9:41')).not.toBeInTheDocument();
    expect(screen.getByText('总资产（元）')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '本月预算概览' })).toHaveTextContent('本月预算¥3,000.00');
    expect(screen.getByRole('group', { name: '本月预算概览' })).toHaveTextContent('剩余预算¥1,484.00');
    expect(screen.getByRole('progressbar', { name: '本月剩余预算进度' }))
      .toHaveAttribute('aria-valuenow', '49');
    expect(screen.getByRole('navigation', { name: '主要导航' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['首页', '流水', '记账', '统计', '我的']),
    );
  });

  it('opens each primary page and uses corrected category labels', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(screen.getByRole('heading', { name: '流水' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '记账' }));
    expect(screen.getByLabelText('金额')).toHaveValue('');
    for (const label of ['餐饮', '交通', '购物', '住房', '娱乐', '日用', '学习', '医疗', '旅行', '其他']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: '关闭' }));
    expect(screen.getByRole('heading', { name: '流水' })).toBeInTheDocument();
  });

  it('hides balances and opens quick entry with its category selected', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: '隐藏金额' }));
    expect(screen.queryByText('¥2,468.00')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '显示金额' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /^购物$/ }));
    expect(screen.getByRole('button', { name: /^购物$/ })).toHaveAttribute('data-active', 'true');
  });

  it('opens the asset account list from the home bank-card button', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: '查看资产账户' }));

    expect(screen.getByRole('dialog', { name: '我的资产账户' })).toBeInTheDocument();
    expect(await screen.findByText('资产账户合计')).toBeInTheDocument();
    expect(screen.getByText('现金')).toBeInTheDocument();
    expect(screen.getByText('储蓄卡')).toBeInTheDocument();
    expect(screen.getByText('共 2 个资产账户')).toBeInTheDocument();
  });

  it('hides asset-account amounts independently from the home balance', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: '查看资产账户' }));
    const dialog = screen.getByRole('dialog', { name: '我的资产账户' });
    await user.click(within(dialog).getByRole('button', { name: '隐藏资产账户金额' }));

    expect(within(dialog).getByRole('button', { name: '显示资产账户金额' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).queryByText('¥0.00')).not.toBeInTheDocument();
    expect(screen.getByText('¥2,468.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隐藏金额' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps more than three managed accounts inside a scrollable asset region', async () => {
    localStorage.setItem('seabreeze-profile-accounts', JSON.stringify([
      { id: 'cash', sourceName: '现金', name: '随身现金', balanceCents: 12000, balanceEdited: true },
      { id: 'savings', sourceName: '储蓄卡', name: '工资卡', balanceCents: 280000, balanceEdited: true },
      { id: 'wechat', sourceName: '微信', name: '微信钱包', balanceCents: 3600, balanceEdited: true },
      { id: 'alipay', sourceName: '支付宝', name: '支付宝', balanceCents: 4500, balanceEdited: true },
    ]));
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: '查看资产账户' }));
    const accountList = screen.getByRole('region', { name: '资产账户列表' });

    expect(accountList).toHaveAttribute('tabindex', '0');
    expect(within(accountList).getByText('随身现金')).toBeInTheDocument();
    expect(within(accountList).getByText('工资卡')).toBeInTheDocument();
    expect(within(accountList).getByText('微信钱包')).toBeInTheDocument();
    expect(within(accountList).getByText('支付宝')).toBeInTheDocument();
  });

  it('filters and searches the transaction fixture rows', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^流水$/ }));
    await user.click(screen.getByRole('button', { name: /^娱乐$/ }));
    expect(screen.getByText('没有找到符合条件的流水')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^全部$/ }));
    await user.click(screen.getByRole('button', { name: '搜索' }));
    await user.type(screen.getByRole('textbox', { name: '搜索流水' }), '工资');
    expect(screen.getByRole('button', { name: /工资/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /早餐/ })).not.toBeInTheDocument();
  });

  it('filters transactions by expense and income type', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^流水$/ }));
    await user.click(screen.getByRole('button', { name: '全部类型' }));
    await user.click(screen.getByRole('option', { name: '收入' }));

    expect(screen.getByRole('button', { name: /工资/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /早餐/ })).not.toBeInTheDocument();
  });

  it('filters a selected day and can return to the whole month', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^流水$/ }));
    await user.click(screen.getByRole('button', { name: '2024年5月' }));
    expect(screen.getByRole('dialog', { name: '2024年5月' })).toBeInTheDocument();
    await user.click(screen.getByRole('gridcell', { name: '2024年5月22日' }));
    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(screen.getByRole('button', { name: '2024年5月22日' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /早餐/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /工资/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2024年5月22日' }));
    await user.click(screen.getByRole('button', { name: '改为筛选整月' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(screen.getByRole('button', { name: '2024年5月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /工资/ })).toBeInTheDocument();
  });

  it('opens home transaction details without navigating, then edits a ledger row', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    const homeBreakfastRow = screen.getByRole('button', { name: /早餐.*-¥18\.00/ });
    await user.click(homeBreakfastRow);
    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '首页' })).toHaveAttribute('data-active', 'true');
    expect(screen.queryByRole('button', { name: '编辑流水' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭流水详情' }));
    await waitFor(() => expect(homeBreakfastRow).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '流水' }));
    expect(screen.getByRole('heading', { name: '流水' })).toBeInTheDocument();
    const breakfastRow = screen.getByRole('button', { name: /早餐.*-¥23\.00/ });
    await user.click(breakfastRow);
    expect(screen.getByRole('dialog', { name: '流水详情' })).toBeInTheDocument();
    expect(screen.getByText('现金')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '编辑流水' }));
    expect(screen.getByRole('dialog', { name: '编辑流水' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('流水名称'));
    await user.type(screen.getByLabelText('流水名称'), '早午餐');
    await user.clear(screen.getByLabelText('流水金额'));
    await user.type(screen.getByLabelText('流水金额'), '30.50');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(screen.getByRole('dialog', { name: '流水详情' })).toHaveTextContent('早午餐');
    expect(screen.getByRole('dialog', { name: '流水详情' })).toHaveTextContent('-¥30.50');
    await user.click(screen.getByRole('button', { name: '关闭流水详情' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /早午餐.*-¥30\.50/ })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '全部账户' }));
    expect(screen.getByRole('listbox', { name: '选择账户' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '信用卡' }));
    expect(screen.getByRole('button', { name: '信用卡' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /超市购物/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /公交车/ })).not.toBeInTheDocument();
  });

  it('keeps empty-result filters visible and supports delete undo', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^流水$/ }));
    await user.click(screen.getByRole('button', { name: /^娱乐$/ }));
    expect(screen.getByText('没有找到符合条件的流水')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByRole('button', { name: /^全部$/ })).toHaveAttribute('data-active', 'true');

    await user.click(screen.getByRole('button', { name: /公交车.*-¥2\.00/ }));
    await user.click(screen.getByRole('button', { name: '删除流水' }));
    expect(screen.getByRole('dialog', { name: '确认删除' })).toHaveTextContent('删除后 8 秒内可以撤销');
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect(screen.queryByRole('button', { name: /公交车.*-¥2\.00/ })).not.toBeInTheDocument();
    expect(screen.getByText('已删除“公交车”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByRole('button', { name: /公交车.*-¥2\.00/ })).toBeInTheDocument();
    expect(screen.getByText('删除已撤销')).toBeInTheDocument();
  });

  it('validates entry amounts and saves through the ledger view model', async () => {
    const user = userEvent.setup();
    const getEntryOptions = vi.fn().mockResolvedValue({
      accounts: [{ id: 'account-1', name: '现金', accountClass: 'asset', balanceCents: 123450 }],
      expenseCategories: [{ id: 'category-food', name: '餐饮', iconKey: 'food' }],
      incomeCategories: [{ id: 'category-income', name: '工资', iconKey: 'income' }],
      refundableExpenses: [],
    });
    const createTransaction = vi.fn().mockResolvedValue({ transactionId: 'transaction-1' });
    const interactiveViewModel = { getEntryOptions, createTransaction } as unknown as LedgerViewModel;
    render(<AppShell viewModel={interactiveViewModel} />);

    await user.click(screen.getByRole('button', { name: /^记账$/ }));
    await waitFor(() => expect(getEntryOptions).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: /账户 默认账户/ }));
    expect(screen.getByRole('option', { name: /现金.*剩余 ¥1234\.50/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /现金.*剩余 ¥1234\.50/ }));
    await user.click(screen.getByRole('button', { name: /日期 2024年5月22日/ }));
    expect(screen.getByRole('dialog', { name: '选择日期和时间' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('记账时间'));
    await user.type(screen.getByLabelText('记账时间'), '18:35');
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getByRole('button', { name: /日期 2024年5月22日 今天 18:35/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '0');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('金额必须大于0');

    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '25.50');
    await user.type(screen.getByLabelText('名称'), '午餐');
    await user.type(screen.getByLabelText('备注'), '和小陈一起');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense',
      amountCents: 2550,
      categoryId: 'category-food',
      accountId: 'account-1',
      occurredAt: new Date('2024-05-22T18:35:00').toISOString(),
      name: '午餐',
      note: '和小陈一起',
    })));
    expect(screen.getByText('记账已保存')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已保存' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: '早上好，海风~' })).toBeInTheDocument());
  });

  it('previews CSV rows and errors without writing until explicit import confirmation', async () => {
    const user = userEvent.setup();
    const importFileRows = vi.fn().mockResolvedValue({ imported: 1, duplicates: 0, errors: [] });
    const fileViewModel = {
      getExistingImportOperationIds: vi.fn().mockResolvedValue(new Set<string>()),
      importFileRows,
    } as unknown as LedgerViewModel;
    render(<AppShell viewModel={fileViewModel} />);

    await user.click(screen.getByRole('button', { name: /^流水$/ }));
    await user.click(screen.getByRole('button', { name: '导入导出流水' }));
    const csv = '\uFEFF日期,类型,金额,名称,备注,账户,转入账户,类目,来源,交易单号\n2026-08-08 08:30:00,支出,12.50,"早餐,面包","第一行\n第二行",现金,,餐饮,微信,wx-1\n坏日期,支出,1.00,错误,,现金,,餐饮,微信,wx-2';
    await user.upload(screen.getByLabelText('选择账单文件'), new File([csv], 'wechat.csv', { type: 'text/csv' }));

    expect(await screen.findByText(/预览 1 行/)).toHaveTextContent('尚未写入账本');
    expect(screen.getByText('第3行：日期格式无效')).toBeInTheDocument();
    expect(importFileRows).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认导入非重复流水' }));
    await waitFor(() => expect(importFileRows).toHaveBeenCalledOnce());
    expect(importFileRows.mock.calls[0][0][0]).toMatchObject({ name: '早餐,面包', note: '第一行\n第二行', amountYuan: '12.50', line: 2 });
  });

  it('creates an account transfer with explicit source and destination accounts', async () => {
    const user = userEvent.setup();
    const getEntryOptions = vi.fn().mockResolvedValue({
      accounts: [
        { id: 'account-cash', name: '现金', accountClass: 'asset', balanceCents: 100000 },
        { id: 'account-card', name: '信用卡', accountClass: 'liability', balanceCents: 20000 },
      ],
      expenseCategories: [],
      incomeCategories: [],
      refundableExpenses: [],
    });
    const createTransaction = vi.fn().mockResolvedValue({ transactionId: 'transfer-1' });
    render(<AppShell viewModel={{ getEntryOptions, createTransaction } as unknown as LedgerViewModel} />);

    await user.click(screen.getByRole('button', { name: /^记账$/ }));
    await waitFor(() => expect(getEntryOptions).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: '转账' }));
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '-1');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入有效金额');

    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '1000.01');
    await user.click(screen.getByRole('button', { name: /转入账户 请选择/ }));
    await user.click(screen.getByRole('option', { name: /信用卡/ }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('转出金额不能超过账户可用余额');
    expect(createTransaction).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '88.66');
    await user.click(screen.getByRole('button', { name: /转出账户 默认账户/ }));
    await user.click(screen.getByRole('option', { name: /信用卡/ }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('转出和转入账户不能相同');

    await user.click(screen.getByRole('button', { name: /转出账户 信用卡/ }));
    await user.click(screen.getByRole('option', { name: /现金/ }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'transfer',
      amountCents: 8866,
      fromAccountId: 'account-cash',
      toAccountId: 'account-card',
    })));
    expect(screen.getByText('转账已保存，不计入收支统计')).toBeInTheDocument();
  });

  it('opens repeat and template shortcuts as editable entry prefills', async () => {
    const user = userEvent.setup();
    const getEntryOptions = vi.fn().mockResolvedValue({
      accounts: [{ id: 'account-1', name: '现金', accountClass: 'asset', balanceCents: 100000 }],
      expenseCategories: [{ id: 'category-food', name: '餐饮', iconKey: 'food' }],
      incomeCategories: [], refundableExpenses: [],
    });
    const getEntryShortcuts = vi.fn().mockResolvedValue({
      last: { id: 'last-1', label: '重复上一笔', type: 'expense', amountCents: 2500, accountId: 'account-1', categoryId: 'category-food', name: '工作餐', note: '上次备注' },
      templates: [], recentCategoryIds: ['category-food'],
    });
    const createTransaction = vi.fn().mockResolvedValue({ transactionId: 'new-1' });
    const saveEntryTemplate = vi.fn().mockResolvedValue({ templateId: 'template-1' });
    render(<AppShell viewModel={{ getEntryOptions, getEntryShortcuts, createTransaction, saveEntryTemplate } as unknown as LedgerViewModel} />);

    await user.click(screen.getByRole('button', { name: /^记账$/ }));
    await user.click(await screen.findByRole('button', { name: '重复上一笔' }));
    expect(screen.getByLabelText('金额')).toHaveValue('25.00');
    expect(screen.getByLabelText('名称')).toHaveValue('工作餐');
    expect(screen.getByLabelText('备注')).toHaveValue('上次备注');
    expect(createTransaction).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('金额'));
    await user.type(screen.getByLabelText('金额'), '26.00');
    await user.click(screen.getByRole('button', { name: '保存为模板' }));
    await waitFor(() => expect(saveEntryTemplate).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2600, label: '工作餐' })));
  });

  it('uses a manually edited account balance in the entry account picker', async () => {
    localStorage.setItem('seabreeze-profile-accounts', JSON.stringify([{
      id: 'profile-cash',
      sourceName: '现金',
      name: '随身现金',
      balanceCents: -12345,
      balanceEdited: true,
    }]));
    const getEntryOptions = vi.fn().mockResolvedValue({
      accounts: [{ id: 'account-1', name: '现金', accountClass: 'asset', balanceCents: 26000 }],
      expenseCategories: [],
      incomeCategories: [],
      refundableExpenses: [],
    });
    const user = userEvent.setup();
    render(<AppShell viewModel={{ getEntryOptions } as unknown as LedgerViewModel} />);

    await user.click(screen.getByRole('button', { name: /^记账$/ }));
    await waitFor(() => expect(getEntryOptions).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: /账户 默认账户/ }));

    expect(screen.getByRole('option', { name: /随身现金.*剩余 -¥123\.45/ })).toBeInTheDocument();
  });

  it('adds and edits a custom entry category with an uploaded icon', async () => {
    const user = userEvent.setup();
    const customCategoryId = '00000000-0000-4000-9000-000000000099';
    let expenseCategories = [{ id: 'category-food', name: '餐饮', iconKey: 'food' }];
    const getEntryOptions = vi.fn(async () => ({
      accounts: [{ id: 'account-1', name: '现金', accountClass: 'asset' as const, balanceCents: 0 }],
      expenseCategories,
      incomeCategories: [{ id: 'category-income', name: '工资', iconKey: 'income' }],
      refundableExpenses: [],
    }));
    const createCategory = vi.fn(async (input: { name: string; kind: 'expense' | 'income'; iconKey: string }) => {
      expenseCategories = [...expenseCategories, { id: customCategoryId, name: input.name, iconKey: input.iconKey }];
      return { categoryId: customCategoryId };
    });
    const updateCategory = vi.fn(async (input: { id: string; name: string; iconKey: string }) => {
      expenseCategories = expenseCategories.map((category) => (
        category.id === input.id ? { ...category, name: input.name, iconKey: input.iconKey } : category
      ));
    });
    const categoryViewModel = { getEntryOptions, createCategory, updateCategory } as unknown as LedgerViewModel;
    render(<AppShell viewModel={categoryViewModel} />);

    await user.click(screen.getByRole('button', { name: /^记账$/ }));
    await waitFor(() => expect(getEntryOptions).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: '编辑类目' }));
    expect(screen.getByRole('dialog', { name: '类目管理' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /添加自定义类目/ }));
    expect(screen.getByRole('dialog', { name: '添加自定义类目' })).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText('上传类目图标'),
      new File(['custom-icon'], 'pet.png', { type: 'image/png' }),
    );
    await user.type(screen.getByLabelText('类目名称'), '宠物');
    await user.click(screen.getByRole('button', { name: '添加类目' }));

    await waitFor(() => expect(createCategory).toHaveBeenCalledWith({
      name: '宠物',
      kind: 'expense',
      iconKey: 'custom',
    }));
    expect(screen.getByRole('button', { name: '宠物' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('seabreeze-custom-category-icons') ?? '{}')[customCategoryId])
      .toMatch(/^data:image\/png;base64,/);

    await user.click(screen.getByRole('button', { name: '编辑类目' }));
    await user.click(screen.getByRole('button', { name: '编辑类目 宠物' }));
    await user.clear(screen.getByLabelText('类目名称'));
    await user.type(screen.getByLabelText('类目名称'), '宠物用品');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateCategory).toHaveBeenCalledWith({
      id: customCategoryId,
      name: '宠物用品',
      iconKey: 'custom',
    }));
    expect(screen.getByRole('button', { name: '编辑类目 宠物用品' })).toBeInTheDocument();
    expect(screen.getByText('类目信息已更新')).toBeInTheDocument();
  });

  it('updates statistics periods and opens functional profile subpages', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^统计$/ }));
    await user.click(screen.getByRole('button', { name: /^年$/ }));
    expect(screen.getByText('¥43,520.00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2024年收支趋势' })).toBeInTheDocument();

    const customPeriod = screen.getByRole('button', { name: /^自定义$/ });
    await user.click(customPeriod);
    expect(screen.getByRole('dialog', { name: '自定义统计范围' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('开始日期'));
    await user.type(screen.getByLabelText('开始日期'), '2024-05-20');
    await user.clear(screen.getByLabelText('结束日期'));
    await user.type(screen.getByLabelText('结束日期'), '2024-05-02');
    await user.click(screen.getByRole('button', { name: '应用' }));
    expect(screen.getByRole('alert')).toHaveTextContent('结束日期不能早于开始日期');
    await user.clear(screen.getByLabelText('结束日期'));
    await user.type(screen.getByLabelText('结束日期'), '2024-05-22');
    await user.click(screen.getByRole('button', { name: '应用' }));
    expect(screen.getByRole('button', { name: /5月20日-5月22日/ })).toBeInTheDocument();
    await waitFor(() => expect(customPeriod).toHaveFocus());

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /偏好设置/ }));
    expect(screen.getByRole('heading', { name: '偏好设置' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '默认隐藏金额' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByText('偏好设置已保存')).toBeInTheDocument();
    expect(screen.getByText('海风的小账本')).toBeInTheDocument();
  });

  it('replaces and restores individual page backgrounds from profile settings', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /背景设置/ }));

    expect(screen.getByRole('heading', { name: '背景设置' })).toBeInTheDocument();
    expect(screen.getAllByText('默认背景')).toHaveLength(7);

    const replacement = new File(['home-background'], 'home.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('替换首页背景'), replacement);

    expect(await screen.findByText('首页背景已更新')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复首页默认背景' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '恢复首页默认背景' }));
    expect(await screen.findByText('首页背景已恢复默认')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '恢复首页默认背景' })).not.toBeInTheDocument();
  });

  it('confirms before signing out and prevents duplicate requests', async () => {
    const user = userEvent.setup();
    let resolveSignOut!: () => void;
    const signOutRequest = new Promise<void>((resolve) => { resolveSignOut = resolve; });
    const onSignOut = vi.fn(() => signOutRequest);
    render(<AppShell viewModel={viewModel} onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    expect(screen.getByRole('dialog', { name: '退出登录' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '退出登录' })).not.toBeInTheDocument();
    expect(onSignOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '退出登录' }));
    await user.click(screen.getByRole('button', { name: '确认退出' }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '正在退出...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '关闭退出登录' })).toBeDisabled();

    resolveSignOut();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '退出登录' })).not.toBeInTheDocument());
  });

  it('keeps the sign-out confirmation open when signing out fails', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn().mockRejectedValue(new Error('network unavailable'));
    render(<AppShell viewModel={viewModel} onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: '退出登录' }));
    await user.click(screen.getByRole('button', { name: '确认退出' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('退出登录失败，请检查网络后重试');
    expect(screen.getByRole('dialog', { name: '退出登录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认退出' })).toBeEnabled();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('opens monthly and yearly statistics ranges in a dropdown', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^统计$/ }));
    const monthRange = screen.getByRole('button', { name: '2024年5月' });
    await user.click(monthRange);

    expect(monthRange).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: '选择统计周期' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '选择统计周期' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '2024年4月' }));
    expect(screen.queryByRole('listbox', { name: '选择统计周期' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2024年4月' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^年$/ }));
    const yearRange = screen.getByRole('button', { name: '2024年' });
    await user.click(yearRange);
    expect(screen.getByRole('listbox', { name: '选择统计周期' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: '2023年' }));
    expect(screen.getByRole('button', { name: '2023年' })).toBeInTheDocument();
  });

  it('edits an account name and balance without changing the account manager layout', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /账户管理/ }));
    await user.click(screen.getByRole('button', { name: '编辑账户 现金' }));

    expect(screen.getByRole('dialog', { name: '编辑账户' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('账户名称'));
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入账户名称');

    await user.type(screen.getByLabelText('账户名称'), '储蓄卡');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(screen.getByRole('alert')).toHaveTextContent('账户名称不能重复');

    await user.clear(screen.getByLabelText('账户名称'));
    await user.type(screen.getByLabelText('账户名称'), '日常现金');
    await user.clear(screen.getByLabelText('账户余额'));
    await user.type(screen.getByLabelText('账户余额'), '-100.999');
    await user.click(screen.getByRole('button', { name: '保存修改' }));
    expect(screen.getByRole('alert')).toHaveTextContent('金额最多保留两位小数');

    await user.clear(screen.getByLabelText('账户余额'));
    await user.type(screen.getByLabelText('账户余额'), '-1288.50');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(screen.queryByRole('dialog', { name: '编辑账户' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑账户 日常现金' })).toBeInTheDocument();
    expect(screen.getByText('账户信息已更新')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('seabreeze-profile-accounts') ?? '[]')).toEqual([
      { id: 'profile-cash', sourceName: '现金', name: '日常现金', kind: 'cash', accountClass: 'asset', balanceCents: -128850, balanceEdited: true },
      { id: 'profile-savings', sourceName: '储蓄卡', name: '储蓄卡', kind: 'debit_card', accountClass: 'asset', balanceCents: 0, balanceEdited: false },
    ]);

    await user.click(screen.getByRole('button', { name: '返回我的页面' }));
    await user.click(screen.getByRole('button', { name: /^首页$/ }));
    await user.click(screen.getByRole('button', { name: '查看资产账户' }));

    const assetDialog = screen.getByRole('dialog', { name: '我的资产账户' });
    expect(within(assetDialog).getByText('日常现金')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '资产账户列表' })).getByText('-¥1,288.50')).toBeInTheDocument();
  });

  it('opens a complete account form and forces credit cards to liabilities', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);
    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /账户管理/ }));
    await user.click(screen.getByRole('button', { name: '添加账户' }));

    expect(screen.getByRole('dialog', { name: '添加账户' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑账户 新账户3' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('账户名称'), '海风信用卡');
    await user.selectOptions(screen.getByLabelText('账户种类'), 'credit_card');
    expect(screen.getByLabelText('账户类型')).toHaveValue('liability');
    expect(screen.getByLabelText('账户类型')).toBeDisabled();
    await user.clear(screen.getByLabelText('初始余额'));
    await user.type(screen.getByLabelText('初始余额'), '200.00');
    await user.click(screen.getByRole('button', { name: '创建账户' }));

    expect(screen.getByRole('button', { name: '编辑账户 海风信用卡' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑账户 海风信用卡' })).toHaveTextContent('负债账户');
  });

  it('edits persisted credit-card limit and statement dates through account UI', async () => {
    const user = userEvent.setup();
    const getAccounts = vi.fn().mockResolvedValue([{ id: 'credit-1', name: '海风信用卡', kind: 'credit_card', accountClass: 'liability', balanceCents: -68000, version: 1 }]);
    const getCreditCardProfiles = vi.fn().mockResolvedValue([{
      reminderId: 'reminder-1', accountId: 'credit-1', accountName: '海风信用卡',
      creditLimitCents: 2000000, billingDay: 5, repaymentDay: 20,
      dueCents: 68000, nextRepaymentAt: new Date(2024, 5, 20).toISOString(),
    }]);
    const updateAccount = vi.fn().mockResolvedValue(undefined);
    const saveCreditCardProfile = vi.fn().mockResolvedValue(undefined);
    const creditViewModel = {
      subscribe: () => () => undefined,
      getAccounts, getCreditCardProfiles, updateAccount, saveCreditCardProfile,
      getAccountUsage: vi.fn().mockResolvedValue({ transactionCount: 2, balanceCents: -68000 }),
    } as unknown as LedgerViewModel;
    render(<AppShell viewModel={creditViewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /账户管理/ }));
    await user.click(await screen.findByRole('button', { name: '编辑账户 海风信用卡' }));
    expect(screen.getByLabelText('信用额度')).toHaveValue('20000.00');
    await user.clear(screen.getByLabelText('信用额度'));
    await user.type(screen.getByLabelText('信用额度'), '30000.00');
    await user.clear(screen.getByLabelText('账单日'));
    await user.type(screen.getByLabelText('账单日'), '31');
    await user.clear(screen.getByLabelText('还款日'));
    await user.type(screen.getByLabelText('还款日'), '28');
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(saveCreditCardProfile).toHaveBeenCalledWith({
      accountId: 'credit-1', creditLimitCents: 3000000, billingDay: 31, repaymentDay: 28,
    }));
    expect(updateAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'credit-1', kind: 'credit_card', accountClass: 'liability' }));
  });

  it('operates pending recurring items and creates a rule through reminder UI', async () => {
    const user = userEvent.setup();
    const dueRule = {
      id: 'reminder-due', name: '每月房租', type: 'expense' as const, amountCents: 250000,
      accountId: 'account-1', categoryId: 'category-1', dayOfMonth: 18,
      nextDueAt: new Date(2024, 4, 18, 9).toISOString(), pending: true,
    };
    const getRecurringRules = vi.fn().mockResolvedValueOnce([dueRule]).mockResolvedValue([]);
    const confirmRecurringRule = vi.fn().mockResolvedValue({ transactionId: 'transaction-1' });
    const saveRecurringRule = vi.fn().mockResolvedValue({ reminderId: 'reminder-2' });
    const reminderViewModel = {
      getRecurringRules, confirmRecurringRule, saveRecurringRule,
      skipRecurringRule: vi.fn(), archiveRecurringRule: vi.fn(),
      getEntryOptions: vi.fn().mockResolvedValue({
        accounts: [{ id: 'account-1', name: '现金', accountClass: 'asset', balanceCents: 100000 }],
        expenseCategories: [{ id: 'category-1', name: '住房', iconKey: 'home' }],
        incomeCategories: [{ id: 'category-2', name: '工资', iconKey: 'income' }],
        refundableExpenses: [],
      }),
    } as unknown as LedgerViewModel;
    render(<AppShell viewModel={reminderViewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /记账提醒/ }));
    expect(await screen.findByText('每月房租')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '跳过本期' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认记账' }));
    await waitFor(() => expect(confirmRecurringRule).toHaveBeenCalledWith('reminder-due'));

    await user.type(screen.getByLabelText('周期账单名称'), '固定早餐');
    await user.type(screen.getByLabelText('周期账单金额'), '12.00');
    await user.clear(screen.getByLabelText('每月生成日'));
    await user.type(screen.getByLabelText('每月生成日'), '31');
    await user.click(screen.getByRole('button', { name: '添加周期账单' }));
    await waitFor(() => expect(saveRecurringRule).toHaveBeenCalledWith({
      name: '固定早餐', type: 'expense', amountCents: 1200,
      accountId: 'account-1', categoryId: 'category-1', dayOfMonth: 31,
    }));
  });

  it('edits category budgets and exposes carryover and overspend status in budget UI', async () => {
    const user = userEvent.setup();
    const saveCategoryBudget = vi.fn().mockResolvedValue(undefined);
    const budgetViewModel = {
      subscribe: () => () => undefined,
      getHomeSnapshot: vi.fn().mockResolvedValue({
        totalAssetsCents: 100000, todayExpenseCents: 0, monthIncomeCents: 0, monthExpenseCents: 5000,
        monthBalanceCents: -5000, budget: { amountCents: 100000, usedCents: 5000, remainingCents: 95000 },
        quickCategories: [], recentTransactions: [],
      }),
      getCategoryBudgetStatus: vi.fn().mockResolvedValue([{ categoryId: 'food', name: '餐饮', amountCents: 14000, usedCents: 15000, carriedCents: 10000, overCents: 1000 }]),
      getEntryOptions: vi.fn().mockResolvedValue({
        accounts: [], expenseCategories: [{ id: 'food', name: '餐饮', iconKey: 'food' }], incomeCategories: [], refundableExpenses: [],
      }),
      saveMonthlyBudget: vi.fn(), saveCategoryBudget,
    } as unknown as LedgerViewModel;
    render(<AppShell viewModel={budgetViewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /预算管理/ }));
    expect(await screen.findByText(/结转 ¥100\.00/)).toHaveTextContent('超支 ¥10.00');
    await user.clear(screen.getByLabelText('餐饮分类预算'));
    await user.type(screen.getByLabelText('餐饮分类预算'), '80.00');
    await user.click(within(screen.getByLabelText('餐饮分类预算').closest('div')!).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(saveCategoryBudget).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'food', amountCents: 8000 })));
  });

  it('previews a portable backup before restore and exposes history and conflict choices', async () => {
    const user = userEvent.setup();
    const restorePortableBackup = vi.fn().mockResolvedValue(undefined);
    const backupViewModel = {
      exportPortableBackup: vi.fn().mockResolvedValue('{"schemaVersion":2}'),
      previewPortableBackup: vi.fn().mockResolvedValue({ exportedAt: '2026-08-08T08:00:00.000Z', accounts: 2, transactions: 5, conflicts: 1, summary: '账户 +1 · 流水 +2' }),
      restorePortableBackup,
      getConflictSummaries: vi.fn().mockResolvedValue([{ id: 'conflict-1', entityId: '流水-1', createdAt: '2026-08-08T08:00:00.000Z' }]),
      getVersionHistory: vi.fn().mockResolvedValue([{ id: 'version-1', createdAt: '2026-08-08T07:00:00.000Z', transactions: 4 }]),
      resolveConflict: vi.fn(), restoreVersion: vi.fn(),
    } as unknown as LedgerViewModel;
    render(<AppShell viewModel={backupViewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /备份与恢复/ }));
    expect(await screen.findByText(/待处理同步冲突 1 项/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保留本机' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '恢复此版本' })).toBeInTheDocument();
    await user.upload(screen.getByLabelText('选择账本备份'), new File(['{"schemaVersion":2}'], 'backup.json', { type: 'application/json' }));
    expect(await screen.findByLabelText('恢复预览')).toHaveTextContent('2 个账户 · 5 笔流水 · 1 项版本差异');
    expect(screen.getByLabelText('恢复预览')).toHaveTextContent('变化摘要：账户 +1 · 流水 +2');
    expect(restorePortableBackup).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认恢复此备份' }));
    await waitFor(() => expect(restorePortableBackup).toHaveBeenCalledWith('{"schemaVersion":2}'));
  });

  it('updates and persists the profile avatar and signature', async () => {
    const user = userEvent.setup();
    render(<AppShell viewModel={viewModel} />);

    await user.click(screen.getByRole('button', { name: /^我的$/ }));
    await user.click(screen.getByRole('button', { name: /海风的小账本/ }));

    const avatar = new File(['custom-avatar'], 'avatar.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('更换头像'), avatar);
    expect(await screen.findByText('头像已更新')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('个人签名'));
    await user.type(screen.getByLabelText('个人签名'), '今天也要认真记账');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('个人资料已保存')).toBeInTheDocument();
    expect(screen.getByText('今天也要认真记账')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '我的头像' })).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    expect(JSON.parse(localStorage.getItem('seabreeze-profile-preferences') ?? '{}')).toMatchObject({
      signature: '今天也要认真记账',
    });

    cleanup();
    render(<AppShell viewModel={viewModel} />);
    await user.click(screen.getByRole('button', { name: /^我的$/ }));

    expect(screen.getByText('今天也要认真记账')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('img', { name: '我的头像' }))
      .toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/)));
  });
});
