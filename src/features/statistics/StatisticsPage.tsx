import { useMemo, useState } from 'react';
import { Export } from '@phosphor-icons/react';
import { Card } from '../../design-system/components/Card';
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

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function statisticsCsv(snapshot: StatisticsSnapshot): string {
  const rows = [
    ['区间', snapshot.rangeLabel],
    ['支出', formatCny(snapshot.expenseCents)],
    ['收入', formatCny(snapshot.incomeCents)],
    ['结余', formatCny(snapshot.balanceCents)],
    [],
    ['分类', '金额', '占比'],
    ...snapshot.expenseCategories.map((category) => [
      category.name,
      formatCny(category.cents),
      `${category.percentage.toFixed(2)}%`,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

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

function MonthlyComparison({ snapshot }: { snapshot: StatisticsSnapshot }) {
  return (
    <Card className={`${styles.chartCard} ${styles.monthlyCard}`}>
      <section>
        <h2>月度对比</h2>
        <div className={styles.monthlyGrid}>
          {snapshot.monthlyComparison.slice(-2).map((month) => (
            <article key={month.month}>
              <strong>{month.month.slice(5)}月</strong>
              <span>
                结余
                <b data-tone={month.balanceCents >= 0 ? 'income' : 'expense'}>
                  {formatCny(month.balanceCents)}
                </b>
              </span>
            </article>
          ))}
        </div>
        {snapshot.monthlyComparison.length > 0 ? (
          <table aria-label="月度对比数据">
            <thead>
              <tr><th scope="col">时间</th><th scope="col">支出</th><th scope="col">收入</th></tr>
            </thead>
            <tbody>
              {snapshot.monthlyComparison.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{month.month}</th>
                  <td>{formatCny(month.expenseCents)}</td>
                  <td>{formatCny(month.incomeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>暂无可展示的统计数据</p>}
      </section>
    </Card>
  );
}

function StatisticsContent({ snapshot }: { snapshot: StatisticsSnapshot }) {
  return (
    <>
      <p className={styles.rangeLabel}>{snapshot.rangeLabel}</p>
      <Summary snapshot={snapshot} />

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

      <MonthlyComparison snapshot={snapshot} />

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
  const exportStatistics = () => {
    if (query.status !== 'ready') return;
    const snapshot = query.data;
    const csv = statisticsCsv(snapshot);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `海风小账本-${snapshot.rangeLabel}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.page} aria-labelledby="statistics-page-title">
      <header className={styles.header}>
        <span aria-hidden="true" />
        <h1 id="statistics-page-title">统计</h1>
        <button
          type="button"
          aria-label="导出统计"
          disabled={query.status !== 'ready'}
          onClick={exportStatistics}
        >
          <Export size={21} weight="regular" aria-hidden="true" />
        </button>
      </header>
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
