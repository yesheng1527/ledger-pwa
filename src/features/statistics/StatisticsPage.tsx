import { useMemo, useState } from 'react';
import { Card } from '../../design-system/components/Card';
import { PageHeader } from '../../design-system/components/PageHeader';
import { ProgressBar } from '../../design-system/components/ProgressBar';
import { SegmentedControl } from '../../design-system/components/SegmentedControl';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type {
  StatisticsRange,
  StatisticsSnapshot,
} from '../../view-model/types';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import { AccessibleDonutChart } from './AccessibleDonutChart';
import { AccessibleTrendChart } from './AccessibleTrendChart';
import styles from './StatisticsPage.module.css';

function formatCny(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}¥${value}`;
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

type RangeMode = StatisticsRange['kind'];

function Summary({ snapshot }: { snapshot: StatisticsSnapshot }) {
  const items = [
    { label: '支出', cents: snapshot.expenseCents, tone: 'expense' },
    { label: '收入', cents: snapshot.incomeCents, tone: 'income' },
    { label: '结余', cents: snapshot.balanceCents, tone: 'balance' },
  ] as const;
  return (
    <section className={styles.summary} aria-label="统计摘要">
      {items.map((item) => (
        <Card key={item.label} className={styles.summaryCard}>
          <span>{item.label}</span>
          <strong
            data-tone={item.tone}
            aria-label={`${item.label} ${(item.cents / 100).toFixed(2)} 元`}
          >
            {formatCny(item.cents)}
          </strong>
        </Card>
      ))}
    </section>
  );
}

function StatisticsContent({ snapshot }: { snapshot: StatisticsSnapshot }) {
  const budgetText = snapshot.totalBudget
    ? `已用 ${formatCny(snapshot.totalBudget.usedCents)}，预算 `
      + `${formatCny(snapshot.totalBudget.amountCents)}`
    : '';
  return (
    <>
      <p className={styles.rangeLabel}>{snapshot.rangeLabel}</p>
      <Summary snapshot={snapshot} />

      <Card>
        <section className={styles.section}>
          <h2>预算执行</h2>
          {snapshot.totalBudget ? (
            <>
              <ProgressBar
                label="总预算"
                value={snapshot.totalBudget.usedCents}
                max={snapshot.totalBudget.amountCents}
                valueText={budgetText}
                tone={snapshot.totalBudget.remainingCents < 0 ? 'warning' : 'coral'}
              />
              <p>
                剩余 {formatCny(snapshot.totalBudget.remainingCents)}
              </p>
              {snapshot.categoryBudgets.length > 0 ? (
                <ul aria-label="分类预算">
                  {snapshot.categoryBudgets.map((budget) => (
                    <li key={budget.categoryId}>
                      {budget.name}
                      {formatCny(budget.usedCents)} / {formatCny(budget.amountCents)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : <p>当前区间尚未设置预算</p>}
        </section>
      </Card>

      <Card className={styles.chartCard}>
        <AccessibleDonutChart
          title="支出分类"
          segments={snapshot.expenseCategories.map((category) => ({
            id: category.categoryId,
            label: category.name,
            valueCents: category.cents,
            percentage: category.percentage,
          }))}
        />
      </Card>

      <Card className={styles.chartCard}>
        <AccessibleTrendChart title="收支趋势" data={snapshot.trend} />
      </Card>

      <Card className={styles.chartCard}>
        <AccessibleTrendChart
          title="月度对比"
          data={snapshot.monthlyComparison.map((month) => ({
            key: month.month,
            label: month.month,
            expenseCents: month.expenseCents,
            incomeCents: month.incomeCents,
          }))}
        />
      </Card>

      <Card className={styles.chartCard}>
        <AccessibleDonutChart
          title="账户分布"
          segments={snapshot.accountDistribution.map((account) => ({
            id: account.accountId,
            label: `${account.name}${account.accountClass === 'asset' ? '资产' : '负债'}`,
            valueCents: Math.abs(account.balanceCents),
          }))}
        />
      </Card>
    </>
  );
}

export type StatisticsPageProps = { viewModel: LedgerViewModel };

export function StatisticsPage({ viewModel }: StatisticsPageProps) {
  const today = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<RangeMode>('month');
  const [month, setMonth] = useState(monthKey(today));
  const [year, setYear] = useState(today.getFullYear());
  const [startDate, setStartDate] = useState(dateKey(today));
  const [endDate, setEndDate] = useState(dateKey(today));
  const range: StatisticsRange = mode === 'month'
    ? { kind: 'month', month }
    : mode === 'year'
      ? { kind: 'year', year }
      : { kind: 'custom', startDate, endDate };
  const queryKey = JSON.stringify(range);
  const query = useLedgerQuery(
    viewModel,
    `statistics:${queryKey}`,
    () => viewModel.getStatistics(range),
  );

  return (
    <main className={styles.page} aria-labelledby="statistics-page-title">
      <PageHeader title="统计" titleId="statistics-page-title" eyebrow="看见钱流向哪里" />
      <div className={styles.controls}>
        <SegmentedControl<RangeMode>
          label="统计区间"
          value={mode}
          options={[
            { value: 'month', label: '月' },
            { value: 'year', label: '年' },
            { value: 'custom', label: '自定义' },
          ]}
          onChange={setMode}
        />
        {mode === 'month' ? (
          <label>
            <span>月份</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        ) : null}
        {mode === 'year' ? (
          <label>
            <span>年份</span>
            <input
              type="number"
              min="1"
              max="9999"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </label>
        ) : null}
        {mode === 'custom' ? (
          <div className={styles.customDates}>
            <label>
              <span>开始日期</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>结束日期</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>

      {query.status === 'loading' ? <p role="status">正在整理统计数据…</p> : null}
      {query.status === 'error' ? (
        <section className={styles.error}>
          <p>统计数据暂时无法读取</p>
          <button type="button" onClick={query.retry}>重试</button>
        </section>
      ) : null}
      {query.status === 'ready' ? <StatisticsContent snapshot={query.data} /> : null}
    </main>
  );
}
