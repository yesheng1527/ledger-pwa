import { useState } from 'react';
import { Card } from '../../design-system/components/Card';
import { EmptyState } from '../../design-system/components/EmptyState';
import { PageHeader } from '../../design-system/components/PageHeader';
import { formatYuan } from '../../domain/money';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { TransactionDateGroup } from '../../view-model/types';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import { TransactionRow } from './TransactionRow';
import styles from './TransactionsPage.module.css';

export type TransactionsPageProps = {
  viewModel: LedgerViewModel;
  onOpenTransaction: (id: string) => void;
};

function currentLocalMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function lastDateOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

function groupedYuan(cents: number): string {
  return formatYuan(cents).replace(/\d+(?=\.)/, (yuan) =>
    yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  );
}

function DailyTotals({ group }: { group: TransactionDateGroup }) {
  return (
    <div className={styles.dailyTotals}>
      {group.expenseCents !== 0 ? (
        <span data-numeric="">当日支出 {groupedYuan(group.expenseCents)}</span>
      ) : null}
      {group.incomeCents !== 0 ? (
        <span data-numeric="">当日收入 {groupedYuan(group.incomeCents)}</span>
      ) : null}
    </div>
  );
}

export function TransactionsPage({
  viewModel,
  onOpenTransaction,
}: TransactionsPageProps) {
  const [month, setMonth] = useState(currentLocalMonth);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const queryKey = JSON.stringify({ month, accountId, date, categoryId, query });
  const result = useLedgerQuery(
    viewModel,
    queryKey,
    () => viewModel.getTransactions({ month, accountId, date, categoryId, query }),
  );

  const changeMonth = (nextMonth: string) => {
    if (!isValidMonth(nextMonth)) return;
    setMonth(nextMonth);
    setDate((currentDate) => (
      currentDate !== null && currentDate.slice(0, 7) !== nextMonth ? null : currentDate
    ));
  };

  const toggleSearch = () => {
    if (searchOpen) setQuery('');
    setSearchOpen((open) => !open);
  };

  const snapshot = result.status === 'ready' ? result.data : null;
  const groups = snapshot
    ? [...snapshot.groups].sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    : [];

  return (
    <main className={styles.page} aria-labelledby="transactions-page-title">
      <PageHeader
        title="流水"
        titleId="transactions-page-title"
        action={{
          label: '搜索流水',
          asset: 'action:search',
          onActivate: toggleSearch,
        }}
      />

      {searchOpen ? (
        <label className={styles.searchField}>
          <span>搜索流水</span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索备注、分类或账户"
          />
        </label>
      ) : null}

      <section className={styles.filters} aria-label="流水筛选">
        <div className={styles.filterGrid}>
          <label className={styles.filterField}>
            <span>月份</span>
            <input
              type="month"
              value={month}
              required
              onChange={(event) => changeMonth(event.target.value)}
            />
          </label>
          <label className={styles.filterField}>
            <span>账户</span>
            <select
              value={accountId ?? ''}
              onChange={(event) => setAccountId(event.target.value || null)}
            >
              <option value="">全部账户</option>
              {snapshot?.accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span>日期</span>
            <input
              type="date"
              value={date ?? ''}
              min={`${month}-01`}
              max={lastDateOfMonth(month)}
              onChange={(event) => setDate(event.target.value || null)}
            />
          </label>
        </div>

        <div
          className={styles.categoryScroller}
          role="group"
          aria-label="分类筛选"
        >
          <button
            type="button"
            aria-pressed={categoryId === null}
            onClick={() => setCategoryId(null)}
          >
            全部
          </button>
          {snapshot?.categories.map((category) => (
            <button
              type="button"
              key={category.id}
              aria-pressed={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {result.status === 'loading' ? (
        <Card className={styles.feedback} role="status">
          正在读取流水…
        </Card>
      ) : null}

      {result.status === 'error' ? (
        <Card className={styles.feedback} role="alert">
          <strong>流水暂时无法读取</strong>
          <span>请稍后再试。</span>
          <button type="button" onClick={result.retry}>重试</button>
        </Card>
      ) : null}

      {snapshot && groups.length === 0 ? (
        <Card>
          <EmptyState
            title="没有找到流水"
            description="换个筛选条件看看，或记下新的一笔。"
            illustration="illustration:empty-ledger"
          />
        </Card>
      ) : null}

      {snapshot && groups.length > 0 ? (
        <div className={styles.groupList}>
          {groups.map((group) => (
            <Card className={styles.dateGroup} key={group.dateKey}>
              <section aria-labelledby={`transactions-${group.dateKey}`}>
                <div className={styles.groupHeading}>
                  <h3 id={`transactions-${group.dateKey}`}>{group.dateLabel}</h3>
                  <DailyTotals group={group} />
                </div>
                <div className={styles.rows}>
                  {group.rows.map((row) => (
                    <TransactionRow
                      key={row.id}
                      row={row}
                      onOpen={onOpenTransaction}
                    />
                  ))}
                </div>
              </section>
            </Card>
          ))}
        </div>
      ) : null}
    </main>
  );
}
