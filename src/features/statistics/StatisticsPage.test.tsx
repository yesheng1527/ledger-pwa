import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../design-system/tokens.css';
import '../../design-system/global.css';
import { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { StatisticsSnapshot } from '../../view-model/types';
import { StatisticsPage, statisticsCsv } from './StatisticsPage';

const snapshot: StatisticsSnapshot = {
  rangeLabel: '2026年7月',
  expenseCents: 23000,
  incomeCents: 100000,
  balanceCents: 77000,
  totalBudget: { amountCents: 50000, usedCents: 23000, remainingCents: 27000 },
  categoryBudgets: [
    {
      categoryId: 'food',
      name: '餐饮',
      amountCents: 10000,
      usedCents: 5000,
    },
  ],
  expenseCategories: [
    { categoryId: 'shopping', name: '购物', cents: 18000, percentage: 78.26 },
    { categoryId: 'food', name: '餐饮', cents: 5000, percentage: 21.74 },
  ],
  trend: [
    { key: '2026-07-01', label: '7月1日', expenseCents: 0, incomeCents: 100000 },
    { key: '2026-07-17', label: '7月17日', expenseCents: 18000, incomeCents: 0 },
    { key: '2026-07-18', label: '7月18日', expenseCents: 5000, incomeCents: 0 },
  ],
  monthlyComparison: [
    { month: '2026-07', expenseCents: 23000, incomeCents: 100000, balanceCents: 77000 },
  ],
  accountDistribution: [
    { accountId: 'bank', name: '银行卡', accountClass: 'asset', balanceCents: 392000 },
    { accountId: 'cash', name: '现金', accountClass: 'asset', balanceCents: 26000 },
    { accountId: 'credit', name: '信用卡', accountClass: 'liability', balanceCents: 68000 },
  ],
};

function viewModelFor(result: StatisticsSnapshot = snapshot) {
  const viewModel = new LedgerViewModel({
    ledgerId: 'ledger-statistics',
    repository: {
      readLedgerSnapshot: vi.fn(),
      watchLedger: vi.fn(() => () => undefined),
      undoTransactionDelete: vi.fn(),
    },
    saveOperation: vi.fn(),
    syncNow: vi.fn(),
    now: () => new Date('2026-07-26T08:00:00.000Z'),
    makeUuid: () => 'operation-id',
  });
  vi.spyOn(viewModel, 'getStatistics').mockResolvedValue(result);
  return viewModel;
}

afterEach(() => cleanup());

describe('StatisticsPage', () => {
  it('neutralizes spreadsheet formulas in user-authored export cells', () => {
    const csv = statisticsCsv({
      ...snapshot,
      expenseCategories: [
        { categoryId: 'equals', name: '=HYPERLINK("https://example.test")', cents: 100, percentage: 25 },
        { categoryId: 'plus', name: '+SUM(1,1)', cents: 100, percentage: 25 },
        { categoryId: 'minus', name: '-1+2', cents: 100, percentage: 25 },
        { categoryId: 'at', name: '@cmd', cents: 100, percentage: 25 },
      ],
    });

    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"")"`);
    expect(csv).toContain(`"'+SUM(1,1)"`);
    expect(csv).toContain(`"'-1+2"`);
    expect(csv).toContain(`"'@cmd"`);
  });

  it('renders the reference summary, export action and text equivalents for every chart', async () => {
    render(<StatisticsPage viewModel={viewModelFor()} />);

    expect(await screen.findByRole('heading', { name: '统计', level: 1 }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出统计' })).toBeInTheDocument();
    expect(screen.getByText('2026年7月')).toBeInTheDocument();
    expect(screen.getByLabelText('支出 230.00 元')).toHaveTextContent('¥230.00');
    expect(screen.getByLabelText('收入 1000.00 元')).toHaveTextContent('¥1,000.00');
    expect(screen.getByLabelText('结余 770.00 元')).toHaveTextContent('¥770.00');
    expect(screen.queryByRole('heading', { name: '预算执行' })).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '支出分类' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '支出分类数据' })).toHaveTextContent(
      '购物¥180.0078.26%',
    );
    expect(screen.getByRole('heading', { name: '收支趋势' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '收支趋势数据' })).toHaveTextContent(
      '7月17日¥180.00¥0.00',
    );
    expect(screen.getByRole('heading', { name: '月度对比' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '月度对比数据' })).toHaveTextContent(
      '2026-07¥230.00¥1,000.00',
    );
    expect(screen.getByRole('heading', { name: '账户分布' })).toBeInTheDocument();
    const accountDistribution = screen.getByRole('list', { name: '账户分布数据' });
    expect(accountDistribution).toHaveTextContent('银行卡资产¥3,920.00');
    expect(accountDistribution).toHaveTextContent('信用卡负债¥680.00');
    screen.getAllByTestId('decorative-chart').forEach((chart) => {
      expect(chart).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('loads month, year and inclusive custom ranges from authored controls', async () => {
    const user = userEvent.setup();
    const viewModel = viewModelFor();
    render(<StatisticsPage viewModel={viewModel} />);
    await screen.findByText('2026年7月');

    await user.click(screen.getByRole('button', { name: '年' }));
    const year = screen.getByRole('spinbutton', { name: '年份' });
    await user.clear(year);
    await user.type(year, '2025');
    await waitFor(() => expect(viewModel.getStatistics).toHaveBeenCalledWith({
      kind: 'year',
      year: 2025,
    }));

    await user.click(screen.getByRole('button', { name: '自定义' }));
    await user.clear(screen.getByLabelText('开始日期'));
    await user.type(screen.getByLabelText('开始日期'), '2026-07-17');
    await user.clear(screen.getByLabelText('结束日期'));
    await user.type(screen.getByLabelText('结束日期'), '2026-07-18');
    await waitFor(() => expect(viewModel.getStatistics).toHaveBeenCalledWith({
      kind: 'custom',
      startDate: '2026-07-17',
      endDate: '2026-07-18',
    }));
  });

  it('uses authored empty copy instead of malformed zero-value chart paths', async () => {
    render(
      <StatisticsPage
        viewModel={viewModelFor({
          ...snapshot,
          expenseCents: 0,
          incomeCents: 0,
          balanceCents: 0,
          totalBudget: null,
          categoryBudgets: [],
          expenseCategories: [],
          trend: [],
          monthlyComparison: [],
          accountDistribution: [],
        })}
      />,
    );

    expect((await screen.findAllByText('暂无可展示的统计数据')).length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('decorative-chart')).not.toBeInTheDocument();
  });
});
