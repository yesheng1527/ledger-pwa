import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  SignOut,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import type { AppPage } from '../../app/navigation';
import { navigationItems } from '../../app/navigation';
import { formatYuan, parsePositiveYuan, parseYuan } from '../../domain/money';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import type {
  HomeSnapshot,
  ManagedAccount,
  StatisticsRange,
  StatisticsSnapshot,
  TransactionDetail,
  TransactionListSnapshot,
  TransactionRowModel,
} from '../../view-model/types';
import homeBackground from '../../assets/reference-ui-v2/home-background.webp';
import transactionsBackground from '../../assets/reference-ui-v2/transactions-background.webp';
import entryBackground from '../../assets/reference-ui-v2/entry-background.webp';
import statisticsBackground from '../../assets/reference-ui-v2/statistics-background.webp';
import profileBackground from '../../assets/reference-ui-v2/profile-background.webp';
import profileSubpageBackground from '../../assets/reference-ui-v2/profile-subpage-background.webp';
import splashBackground from '../../assets/reference-ui-v2/splash-background.webp';
import afternoonTeaArt from '../../assets/reference-ui-v2/afternoon-tea.webp';
import bankCardArt from '../../assets/reference-ui-v2/bank-card.webp';
import budgetProgressIslandEmptyArt from '../../assets/reference-ui-v2/budget-progress-empty-island-v4.webp';
import budgetProgressIslandFillArt from '../../assets/reference-ui-v2/budget-progress-fill-v4.webp';
import calendarArt from '../../assets/reference-ui-v2/calendar.webp';
import monthPickerFrame from '../../assets/reference-ui-v2/month-picker-frame.webp';
import dailyArt from '../../assets/reference-ui-v2/daily.webp';
import entertainmentArt from '../../assets/reference-ui-v2/entertainment.webp';
import entryArt from '../../assets/reference-ui-v2/entry.webp';
import exportArt from '../../assets/reference-ui-v2/export.webp';
import expenseArt from '../../assets/reference-ui-v2/expense.webp';
import foodArt from '../../assets/reference-ui-v2/food.webp';
import homeArt from '../../assets/reference-ui-v2/home.webp';
import ledgerArt from '../../assets/reference-ui-v2/ledger.webp';
import medicalArt from '../../assets/reference-ui-v2/medical.webp';
import otherArt from '../../assets/reference-ui-v2/other.webp';
import profileArt from '../../assets/reference-ui-v2/profile.webp';
import salaryArt from '../../assets/reference-ui-v2/salary.webp';
import searchArt from '../../assets/reference-ui-v2/search.webp';
import settingsArt from '../../assets/reference-ui-v2/settings.webp';
import shoppingArt from '../../assets/reference-ui-v2/shopping.webp';
import statisticsArt from '../../assets/reference-ui-v2/statistics.webp';
import transportArt from '../../assets/reference-ui-v2/transport.webp';
import travelArt from '../../assets/reference-ui-v2/travel.webp';
import type { BackgroundOverrides, BackgroundSlot } from './background-preferences';
import {
  loadProfileAvatar,
  loadProfileTextPreferences,
  resetProfileAvatar,
  saveProfileAvatar,
  saveProfileTextPreferences,
} from './profile-preferences';
import styles from './ReferencePages.module.css';

type NavigateProps = {
  viewModel: LedgerViewModel;
  backgrounds: BackgroundOverrides;
  onNavigate(page: AppPage): void;
  onFeedback(message: string, tone?: 'info' | 'success' | 'error'): void;
};

type CategoryKey =
  | 'coffee'
  | 'food'
  | 'transport'
  | 'shopping'
  | 'home'
  | 'entertainment'
  | 'income'
  | 'daily'
  | 'study'
  | 'medical'
  | 'travel'
  | 'other';

const silentLedgerSubscription: Pick<LedgerViewModel, 'subscribe'> = {
  subscribe: () => () => undefined,
};

function isStaticReferenceMode(): boolean {
  return import.meta.env.MODE === 'test'
    || document.documentElement.dataset.visualTest === 'true';
}

function supportsLedgerQuery(
  viewModel: LedgerViewModel,
  method: keyof LedgerViewModel,
): boolean {
  const candidate = viewModel as Partial<LedgerViewModel>;
  return !isStaticReferenceMode()
    && typeof candidate.subscribe === 'function'
    && typeof candidate[method] === 'function';
}

function ledgerSubscription(viewModel: LedgerViewModel): Pick<LedgerViewModel, 'subscribe'> {
  return typeof (viewModel as Partial<LedgerViewModel>).subscribe === 'function'
    ? viewModel
    : silentLedgerSubscription;
}

function formatReferenceYuan(cents: number): string {
  const formatted = formatYuan(cents);
  const sign = formatted.startsWith('-') ? '-' : '';
  const unsigned = sign ? formatted.slice(1) : formatted;
  const [yuan, fen] = unsigned.slice(1).split('.');
  return `${sign}¥${Number(yuan).toLocaleString('en-US')}.${fen}`;
}

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function referenceNow(): Date {
  return isStaticReferenceMode() ? new Date(2024, 4, 22, 12, 0) : new Date();
}

function monthKey(date: Date): string {
  return localDateInput(date).slice(0, 7);
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return `${year}年${month}月`;
}

function monthKeyFromLabel(value: string): string | null {
  const match = /^(\d{4})年(\d{1,2})月$/.exec(value);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

function shiftedMonth(value: string, offset: number): string {
  const [year, month] = value.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

function monthOptions(center: string): Array<{ value: string; label: string }> {
  return [-1, 0, 1].map((offset) => {
    const value = shiftedMonth(center, offset);
    return { value: monthLabel(value), label: monthLabel(value) };
  });
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function monthDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function calendarDays(month: string): Array<{ dateKey: string; day: number; inMonth: boolean }> {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, monthNumber - 1, index - firstDay + 1);
    return {
      dateKey: localDateInput(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthNumber - 1,
    };
  });
}

function transactionDateHeading(value: string, now: Date): string {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  const suffix = dayDifference === 0
    ? '今天'
    : dayDifference === 1
      ? '昨天'
      : `周${'日一二三四五六'[date.getDay()]}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${suffix}`;
}

function transactionTone(row: TransactionRowModel): 'expense' | 'income' {
  return row.amountTone === 'income' || row.amountTone === 'refund' ? 'income' : 'expense';
}

function transactionPresentation(row: TransactionRowModel): TransactionPresentation {
  const categoryLabel = row.categoryName
    ?? ({
      expense: '支出',
      income: '收入',
      transfer: '转账',
      refund: '退款',
      adjustment: '余额校准',
    } satisfies Record<TransactionRowModel['type'], string>)[row.type];
  return {
    id: row.id,
    category: categoryKeyFor(row.categoryIconKey, categoryLabel),
    title: row.title,
    meta: `${categoryLabel}　${row.timeLabel}`,
    amount: row.amountLabel.replace(/¥([\d]+)/, (_, yuan: string) => `¥${Number(yuan).toLocaleString('en-US')}`),
    tone: transactionTone(row),
    account: row.accountLabel,
    source: row,
  };
}

const categorySprites: Record<CategoryKey, string> = {
  coffee: afternoonTeaArt,
  food: foodArt,
  transport: transportArt,
  shopping: shoppingArt,
  home: homeArt,
  entertainment: entertainmentArt,
  income: salaryArt,
  daily: dailyArt,
  study: ledgerArt,
  medical: medicalArt,
  travel: travelArt,
  other: otherArt,
};

const navigationArt: Record<AppPage, string> = {
  home: homeArt,
  transactions: ledgerArt,
  entry: entryArt,
  statistics: statisticsArt,
  profile: profileArt,
};

function CategoryArt({ category }: { category: CategoryKey }) {
  return (
    <span className={styles.categoryArt} aria-hidden="true">
      <img src={categorySprites[category]} alt="" />
    </span>
  );
}

function NavIcon({ page }: { page: AppPage }) {
  return <img src={navigationArt[page]} alt="" />;
}

let lastNavigationIndex = 0;

function BottomNavigation({ active, onNavigate }: { active: AppPage; onNavigate(page: AppPage): void }) {
  const activeIndex = navigationItems.findIndex((item) => item.id === active);
  const [visualIndex, setVisualIndex] = useState(lastNavigationIndex);

  useEffect(() => {
    if (visualIndex === activeIndex) {
      lastNavigationIndex = activeIndex;
      return undefined;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setVisualIndex(activeIndex);
      lastNavigationIndex = activeIndex;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeIndex, visualIndex]);

  return (
    <nav
      className={styles.bottomNav}
      data-active-index={visualIndex}
      aria-label="主要导航"
    >
      {navigationItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === 'entry' ? styles.entryNavButton : styles.navButton}
          data-active={item.id === active ? 'true' : 'false'}
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span className={styles.navIcon}><NavIcon page={item.id} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function PageFrame({
  background,
  children,
  className = '',
}: {
  background: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`${styles.page} ${className}`}
      style={{ backgroundImage: `url(${background})` }}
    >
      {children}
    </main>
  );
}

function ReferenceSheet({
  title,
  children,
  onClose,
  dismissDisabled = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose(): void;
  dismissDisabled?: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const dismissDisabledRef = useRef(dismissDisabled);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  onCloseRef.current = onClose;
  dismissDisabledRef.current = dismissDisabled;

  function requestClose() {
    if (closingRef.current || dismissDisabledRef.current) return;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticTestMode = import.meta.env.MODE === 'test'
      || document.documentElement.dataset.visualTest === 'true';
    if (reducedMotion || staticTestMode) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 180);
  }

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    queueMicrotask(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => triggerRef.current?.focus());
    };
  }, []);

  return (
    <div
      className={styles.overlayBackdrop}
      data-closing={closing ? 'true' : 'false'}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <section className={styles.actionSheet} role="dialog" aria-modal="true" aria-labelledby="reference-sheet-title">
        <header className={styles.sheetHeader}>
          <h2 id="reference-sheet-title">{title}</h2>
          <button ref={closeButtonRef} type="button" aria-label={`关闭${title}`} disabled={dismissDisabled} onClick={requestClose}><X /></button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
      </section>
    </div>
  );
}

function ChoiceSheet({
  title,
  value,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; detail?: string }>;
  onSelect(value: string): void;
  onClose(): void;
}) {
  return (
    <ReferenceSheet title={title} onClose={onClose}>
      <div className={styles.choiceList} role="listbox" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={value === option.value}
            data-active={value === option.value ? 'true' : 'false'}
            onClick={() => {
              onSelect(option.value);
              onClose();
            }}
          >
            <span><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
            {value === option.value ? <Check /> : <span />}
          </button>
        ))}
      </div>
    </ReferenceSheet>
  );
}

function FilterDropdown({
  title,
  anchor,
  value,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  anchor: 'month' | 'type' | 'account' | 'statistics';
  value: string;
  options: ReadonlyArray<{ value: string; label: string; detail?: string }>;
  onSelect(value: string): void;
  onClose(): void;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  onCloseRef.current = onClose;

  function requestClose() {
    if (closingRef.current) return;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticTestMode = import.meta.env.MODE === 'test'
      || document.documentElement.dataset.visualTest === 'true';
    if (reducedMotion || staticTestMode) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 140);
  }

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      queueMicrotask(() => triggerRef.current?.focus());
    };
  }, []);

  return (
    <div
      className={styles.filterDropdownLayer}
      data-closing={closing ? 'true' : 'false'}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) requestClose();
      }}
    >
      <div className={styles.filterDropdown} data-anchor={anchor} role="listbox" aria-label={title}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={value === option.value}
            data-active={value === option.value ? 'true' : 'false'}
            onClick={() => {
              onSelect(option.value);
              requestClose();
            }}
          >
            <span><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
            {value === option.value ? <Check /> : <span />}
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthDatePicker({
  initialMonth,
  initialDate,
  onApply,
  onClose,
}: {
  initialMonth: string;
  initialDate: string | null;
  onApply(month: string, date: string | null): void;
  onClose(): void;
}) {
  const [draftMonth, setDraftMonth] = useState(initialMonth);
  const [draftDate, setDraftDate] = useState(initialDate);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const days = useMemo(() => calendarDays(draftMonth), [draftMonth]);

  useEffect(() => {
    cancelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function moveMonth(offset: number) {
    setDraftMonth((current) => shiftMonth(current, offset));
    setDraftDate(null);
  }

  return (
    <div
      className={styles.monthPickerBackdrop}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className={styles.monthPicker} role="dialog" aria-modal="true" aria-labelledby="month-picker-title">
        <img className={styles.monthPickerFrame} src={monthPickerFrame} alt="" />
        <div className={styles.monthPickerPanel}>
          <header>
            <button type="button" aria-label="上一年" onClick={() => moveMonth(-12)}><CaretLeft /><CaretLeft /></button>
            <button type="button" aria-label="上个月" onClick={() => moveMonth(-1)}><CaretLeft /></button>
            <h2 id="month-picker-title">{monthLabel(draftMonth)}</h2>
            <button type="button" aria-label="下个月" onClick={() => moveMonth(1)}><CaretRight /></button>
            <button type="button" aria-label="下一年" onClick={() => moveMonth(12)}><CaretRight /><CaretRight /></button>
          </header>
          <div className={styles.calendarWeekdays} aria-hidden="true">
            {['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className={styles.calendarGrid} role="grid" aria-label={`${monthLabel(draftMonth)}日期`}>
            {days.map((item) => (
              <button
                key={item.dateKey}
                type="button"
                role="gridcell"
                aria-label={monthDateLabel(item.dateKey)}
                aria-selected={draftDate === item.dateKey}
                data-outside={item.inMonth ? 'false' : 'true'}
                data-selected={draftDate === item.dateKey ? 'true' : 'false'}
                onClick={() => {
                  if (!item.inMonth) setDraftMonth(item.dateKey.slice(0, 7));
                  setDraftDate(item.dateKey);
                }}
              >
                {item.day}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.wholeMonthButton}
            data-active={draftDate === null ? 'true' : 'false'}
            onClick={() => setDraftDate(null)}
          >
            {draftDate === null ? '已选择整月' : '改为筛选整月'}
          </button>
          <footer>
            <button ref={cancelRef} type="button" onClick={onClose}>取消</button>
            <button type="button" onClick={() => onApply(draftMonth, draftDate)}>确定</button>
          </footer>
        </div>
      </section>
    </div>
  );
}

function MiniCategory({
  category,
  label,
  onClick,
}: {
  category: CategoryKey;
  label: string;
  onClick(): void;
}) {
  return (
    <button type="button" className={styles.miniCategory} onClick={onClick}>
      <CategoryArt category={category} />
      <span>{label}</span>
    </button>
  );
}

function TransactionIcon({ category }: { category: CategoryKey }) {
  return <CategoryArt category={category} />;
}

const recentRows = [
  { id: 'home-breakfast', category: 'food', title: '早餐', meta: '餐饮　今天 08:30', amount: '-¥18.00', tone: 'expense', account: '现金' },
  { id: 'home-salary', category: 'income', title: '工资', meta: '收入　昨天 18:00', amount: '+¥6,800.00', tone: 'income', account: '储蓄卡' },
  { id: 'home-taxi', category: 'transport', title: '打车', meta: '交通　5月21日', amount: '-¥32.00', tone: 'expense', account: '信用卡' },
  { id: 'home-shopping', category: 'shopping', title: '超市购物', meta: '购物　5月20日 19:30', amount: '-¥128.00', tone: 'expense', account: '信用卡' },
  { id: 'home-dinner', category: 'food', title: '晚餐', meta: '餐饮　5月20日 18:30', amount: '-¥40.00', tone: 'expense', account: '现金' },
] as const satisfies ReadonlyArray<{
  category: CategoryKey;
  title: string;
  meta: string;
  amount: string;
  tone: 'expense' | 'income';
  account: string;
  id: string;
}>;

type TransactionPresentation = {
  category: CategoryKey;
  title: string;
  meta: string;
  amount: string;
  tone: 'expense' | 'income';
  account: string;
  id: string;
  note?: string;
  source?: TransactionRowModel;
};

function TransactionDetailPanel({
  transaction,
  dateLabel,
  onEdit,
  onDelete,
  onCopy,
}: {
  transaction: TransactionPresentation;
  dateLabel?: string;
  onEdit?(): void;
  onDelete?(): void;
  onCopy?(): void;
}) {
  const categoryLabel = transaction.meta.split('　')[0];
  const timeLabel = transaction.meta.split('　')[1] ?? '';
  return (
    <div className={styles.transactionDetailPanel}>
      <div className={styles.transactionDetailHero}>
        <CategoryArt category={transaction.category} />
        <span><small>{transaction.tone === 'income' ? '收入' : '支出'}</small><strong data-tone={transaction.tone}>{transaction.amount}</strong></span>
      </div>
      <dl>
        <div><dt>名称</dt><dd>{transaction.title}</dd></div>
        <div><dt>分类</dt><dd>{categoryLabel}</dd></div>
        <div><dt>账户</dt><dd>{transaction.account}</dd></div>
        <div><dt>时间</dt><dd>{dateLabel ? `${dateLabel}　${timeLabel}` : timeLabel}</dd></div>
        <div><dt>备注</dt><dd>{transaction.note || '无备注'}</dd></div>
      </dl>
      {onEdit || onDelete || onCopy ? (
        <div className={styles.detailActions}>
          {onEdit ? <button type="button" onClick={onEdit}>编辑流水</button> : null}
          {onCopy ? <button type="button" onClick={onCopy}>复制流水</button> : null}
          {onDelete ? <button type="button" onClick={onDelete}>删除流水</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function TransactionEditPanel({
  transaction,
  categoryOptions,
  accountOptions,
  onCancel,
  onSave,
}: {
  transaction: TransactionPresentation;
  categoryOptions?: string[];
  accountOptions?: string[];
  onCancel(): void;
  onSave(transaction: TransactionPresentation): void;
}) {
  const [title, setTitle] = useState(transaction.title);
  const [amount, setAmount] = useState(transaction.amount.replace(/[^\d.]/g, ''));
  const [category, setCategory] = useState(transaction.meta.split('　')[0]);
  const [account, setAccount] = useState(transaction.account);
  const [note, setNote] = useState(transaction.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const categories = categoryOptions?.length
    ? categoryOptions
    : transaction.tone === 'income'
      ? ['收入']
      : ['餐饮', '交通', '购物', '住房', '娱乐', '日用', '学习', '医疗', '旅行', '其他'];
  const accounts = accountOptions?.length
    ? accountOptions
    : ['现金', '储蓄卡', '信用卡', '交通卡'];
  const categoryKeys: Record<string, CategoryKey> = {
    餐饮: 'food',
    交通: 'transport',
    购物: 'shopping',
    住房: 'home',
    娱乐: 'entertainment',
    日用: 'daily',
    学习: 'study',
    医疗: 'medical',
    旅行: 'travel',
    其他: 'other',
    收入: 'income',
  };

  return (
    <form className={styles.sheetEditForm} onSubmit={(event) => {
      event.preventDefault();
      let amountCents: number;
      try {
        amountCents = parsePositiveYuan(amount);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '请输入有效金额');
        return;
      }
      onSave({
        ...transaction,
        title: title.trim() || transaction.title,
        category: categoryKeys[category] ?? transaction.category,
        amount: `${transaction.tone === 'income' ? '+' : '-'}${formatYuan(amountCents).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
        meta: `${category}　${transaction.meta.split('　')[1] ?? ''}`,
        account,
        note: note.trim(),
      });
    }}>
      <label><span>名称</span><input autoFocus aria-label="流水名称" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label><span>金额</span><input aria-label="流水金额" inputMode="decimal" maxLength={11} value={amount} onChange={(event) => { setAmount(event.target.value); setError(null); }} /></label>
      <label><span>分类</span><select aria-label="流水分类" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>账户</span><select aria-label="流水账户" value={account} onChange={(event) => setAccount(event.target.value)}>{accounts.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>备注</span><input aria-label="流水备注" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error ? <p className={styles.sheetFormError} role="alert">{error}</p> : null}
      <div className={styles.sheetFormActions}><button type="button" onClick={onCancel}>取消</button><button type="submit">保存修改</button></div>
    </form>
  );
}

function TransactionRow({
  category,
  title,
  meta,
  amount,
  tone,
  onClick,
}: {
  category: CategoryKey;
  title: string;
  meta: string;
  amount: string;
  tone: 'expense' | 'income';
  onClick?(): void;
}) {
  return (
    <button type="button" className={styles.transactionRow} onClick={onClick}>
      <TransactionIcon category={category} />
      <span className={styles.transactionCopy}>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <span className={styles.amount} data-tone={tone}>{amount}</span>
    </button>
  );
}

export function HomePage({
  viewModel,
  backgrounds,
  displayName,
  onNavigate,
  onOpenEntry,
}: NavigateProps & { displayName: string; onOpenEntry(category?: string): void }) {
  const [now] = useState(referenceNow);
  const useLiveHome = supportsLedgerQuery(viewModel, 'getHomeSnapshot');
  const homeQuery = useLedgerQuery<HomeSnapshot>(
    ledgerSubscription(viewModel),
    `reference-home-${localDateInput(now)}`,
    () => useLiveHome
      ? viewModel.getHomeSnapshot({ now })
      : Promise.resolve({
          totalAssetsCents: 0,
          todayExpenseCents: 0,
          monthIncomeCents: 0,
          monthExpenseCents: 0,
          monthBalanceCents: 0,
          budget: null,
          quickCategories: [],
          recentTransactions: [],
        }),
  );
  const useLiveAccounts = supportsLedgerQuery(viewModel, 'getAccounts');
  const homeAccountsQuery = useLedgerQuery<ManagedAccount[]>(
    ledgerSubscription(viewModel),
    'reference-home-asset-accounts',
    () => useLiveAccounts
      ? viewModel.getAccounts()
      : Promise.resolve(loadManagedProfileAccounts()),
  );
  const [amountsHidden, setAmountsHidden] = useState(() => localStorage.getItem('seabreeze-hide-amounts') === 'true');
  const [assetAmountsHidden, setAssetAmountsHidden] = useState(false);
  const [homeSheet, setHomeSheet] = useState<'asset-accounts' | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionPresentation | null>(null);
  const amount = (value: string) => amountsHidden ? '••••••' : value;
  const assetAmount = (value: string) => assetAmountsHidden ? '••••••' : value;
  const homeData = useLiveHome && homeQuery.status === 'ready' ? homeQuery.data : null;
  const homeRows = homeData
    ? homeData.recentTransactions.map(transactionPresentation)
    : useLiveHome ? [] : recentRows;
  const assetAccounts = homeAccountsQuery.status === 'ready'
    ? homeAccountsQuery.data.filter((account) => account.accountClass === 'asset')
    : [];
  const assetAccountTotal = assetAccounts.reduce((total, account) => total + account.balanceCents, 0);
  const quickCategories = homeData
    ? homeData.quickCategories.map((item) => ({
        category: categoryKeyFor(item.iconKey, item.name),
        label: item.name,
      }))
    : [
        { category: 'food' as const, label: '餐饮' },
        { category: 'transport' as const, label: '交通' },
        { category: 'shopping' as const, label: '购物' },
        { category: 'entertainment' as const, label: '娱乐' },
      ];
  const totalAssets = homeData ? formatReferenceYuan(homeData.totalAssetsCents) : useLiveHome ? '¥0.00' : '¥2,468.00';
  const income = homeData ? formatReferenceYuan(homeData.monthIncomeCents) : useLiveHome ? '¥0.00' : '¥6,800.00';
  const expense = homeData ? formatReferenceYuan(homeData.monthExpenseCents) : useLiveHome ? '¥0.00' : '¥4,332.00';
  const defaultBudgetUsedCents = homeData?.monthExpenseCents ?? (useLiveHome ? 0 : 151600);
  const budget = homeData?.budget ?? {
    amountCents: 300000,
    usedCents: defaultBudgetUsedCents,
    remainingCents: 300000 - defaultBudgetUsedCents,
  };
  const remainingBudgetProgress = budget.amountCents > 0
    ? Math.min(100, Math.max(0, (budget.remainingCents / budget.amountCents) * 100))
    : 0;
  const budgetProgressFadeStart = Math.max(0, remainingBudgetProgress - 1.6);
  const budgetProgressFadeEnd = Math.min(100, remainingBudgetProgress + 1.6);
  const budgetProgressMask = remainingBudgetProgress <= 0
    ? 'linear-gradient(transparent, transparent)'
    : remainingBudgetProgress >= 100
      ? 'none'
      : `linear-gradient(to right, black 0%, black ${budgetProgressFadeStart}%, transparent ${budgetProgressFadeEnd}%, transparent 100%)`;
  const budgetProgressLabel = amountsHidden
    ? '金额已隐藏'
    : `剩余 ${formatReferenceYuan(budget.remainingCents)}，预算 ${formatReferenceYuan(budget.amountCents)}`;
  return (
    <PageFrame background={backgrounds.home ?? homeBackground} className={styles.homePage}>
      <header className={styles.homeGreeting}>
        <div>
          <h1>早上好，{displayName}~</h1>
          <p>今天也要好好生活呀！</p>
        </div>
        <button type="button" aria-label="查看资产账户" onClick={() => setHomeSheet('asset-accounts')}><img className={styles.actionArt} src={bankCardArt} alt="" /></button>
      </header>

      <section className={`${styles.card} ${styles.balanceCard}`}>
        <div className={styles.cardTopline}>
          <strong>{useLiveHome ? monthLabel(monthKey(now)) : '2024年5月'}</strong>
          <button
            type="button"
            aria-label={amountsHidden ? '显示金额' : '隐藏金额'}
            aria-pressed={amountsHidden}
            onClick={() => setAmountsHidden((hidden) => !hidden)}
          >
            {amountsHidden ? <EyeSlash /> : <Eye />}
          </button>
        </div>
        <div className={styles.balanceMain}>
          <span>总资产（元）</span>
          <strong>{amount(totalAssets)}</strong>
        </div>
        <div className={styles.balanceSplit}>
          <span><small>本月收入</small><strong>{amount(income)}</strong></span>
          <span><small>本月支出</small><strong>{amount(expense)}</strong></span>
        </div>
        <div className={styles.homeBudgetBlock} role="group" aria-label="本月预算概览">
          <div className={styles.homeBudgetRow}>
            <span><small>本月预算</small><strong>{amount(formatReferenceYuan(budget.amountCents))}</strong></span>
            <span><small>剩余预算</small><strong data-negative={budget.remainingCents < 0 ? 'true' : 'false'}>{amount(formatReferenceYuan(budget.remainingCents))}</strong></span>
          </div>
          <div
            className={styles.homeBudgetProgress}
            role="progressbar"
            aria-label="本月剩余预算进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(remainingBudgetProgress)}
            aria-valuetext={budgetProgressLabel}
          >
            <img className={styles.homeBudgetProgressEmpty} src={budgetProgressIslandEmptyArt} alt="" />
            <img
              className={styles.homeBudgetProgressFill}
              src={budgetProgressIslandFillArt}
              alt=""
              aria-hidden="true"
              style={{ WebkitMaskImage: budgetProgressMask, maskImage: budgetProgressMask }}
            />
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.quickCard}`}>
        <div className={styles.sectionTitle}><h2>快捷记账</h2><button type="button" onClick={() => onOpenEntry()}>全部 <CaretRight /></button></div>
        <div className={styles.quickGrid}>
          {quickCategories.slice(0, 4).map((item) => (
            <MiniCategory key={item.label} category={item.category} label={item.label} onClick={() => onOpenEntry(item.label)} />
          ))}
          <MiniCategory category="other" label="更多" onClick={() => onOpenEntry('其他')} />
        </div>
      </section>

      <section className={`${styles.card} ${styles.recentCard}`}>
        <div className={styles.sectionTitle}><h2>最近交易</h2><button type="button" onClick={() => onNavigate('transactions')}>更多 <CaretRight /></button></div>
        <div>{homeRows.map((row) => (
          <TransactionRow key={row.id} {...row} onClick={() => setSelectedTransaction({ ...row })} />
        ))}</div>
      </section>
      <BottomNavigation active="home" onNavigate={onNavigate} />
      {homeSheet === 'asset-accounts' ? (
        <ReferenceSheet title="我的资产账户" onClose={() => setHomeSheet(null)}>
          <div className={styles.assetAccountSummary}>
            <div className={styles.assetAccountSummaryTopline}>
              <span>资产账户合计</span>
              <button
                type="button"
                aria-label={assetAmountsHidden ? '显示资产账户金额' : '隐藏资产账户金额'}
                aria-pressed={assetAmountsHidden}
                onClick={() => setAssetAmountsHidden((hidden) => !hidden)}
              >
                {assetAmountsHidden ? <EyeSlash /> : <Eye />}
              </button>
            </div>
            <strong>{assetAmount(formatReferenceYuan(assetAccountTotal))}</strong>
            <small>共 {assetAccounts.length} 个资产账户</small>
          </div>
          {homeAccountsQuery.status === 'loading' ? <p role="status" className={styles.sheetStatus}>正在读取账户...</p> : null}
          {homeAccountsQuery.status === 'error' ? (
            <div className={styles.sheetStatus} role="alert">
              <span>账户读取失败</span>
              <button type="button" onClick={homeAccountsQuery.retry}>重试</button>
            </div>
          ) : null}
          {homeAccountsQuery.status === 'ready' && assetAccounts.length === 0 ? (
            <div className={styles.sheetEmptyState}>
              <img src={bankCardArt} alt="" />
              <strong>还没有资产账户</strong>
              <span>可以在“我的 - 账户管理”中添加</span>
            </div>
          ) : null}
          {assetAccounts.length > 0 ? (
            <div
              className={styles.assetAccountList}
              role="region"
              aria-label="资产账户列表"
              tabIndex={assetAccounts.length > 3 ? 0 : undefined}
            >
              {assetAccounts.map((account) => (
                <div key={account.id}>
                  <img src={bankCardArt} alt="" />
                  <span><strong>{account.name}</strong><small>资产账户</small></span>
                  <strong>{assetAmount(formatReferenceYuan(account.balanceCents))}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </ReferenceSheet>
      ) : null}
      {selectedTransaction ? (
        <ReferenceSheet title="流水详情" onClose={() => setSelectedTransaction(null)}>
          <TransactionDetailPanel transaction={selectedTransaction} />
        </ReferenceSheet>
      ) : null}
    </PageFrame>
  );
}

const transactionGroups = [
  {
    date: '5月22日 今天', summary: '支出：¥50.00　 收入：¥0.00', rows: [
      { id: 'coffee-0522', category: 'coffee' as const, title: '咖啡', meta: '餐饮　08:46', amount: '-¥25.00', tone: 'expense' as const, account: '现金' },
      { id: 'bus-0522', category: 'transport' as const, title: '公交车', meta: '交通　08:15', amount: '-¥2.00', tone: 'expense' as const, account: '交通卡' },
      { id: 'breakfast-0522', category: 'food' as const, title: '早餐', meta: '餐饮　08:00', amount: '-¥23.00', tone: 'expense' as const, account: '现金' },
    ],
  },
  {
    date: '5月21日 昨天', summary: '支出：¥32.00　 收入：¥6,800.00', rows: [
      { id: 'salary-0521', category: 'income' as const, title: '工资', meta: '收入　18:00', amount: '+¥6,800.00', tone: 'income' as const, account: '储蓄卡' },
      { id: 'taxi-0521', category: 'transport' as const, title: '打车', meta: '交通　13:20', amount: '-¥32.00', tone: 'expense' as const, account: '信用卡' },
    ],
  },
  {
    date: '5月20日 周一', summary: '支出：¥168.00　 收入：¥0.00', rows: [
      { id: 'shopping-0520', category: 'shopping' as const, title: '超市购物', meta: '购物　19:30', amount: '-¥128.00', tone: 'expense' as const, account: '信用卡' },
      { id: 'dinner-0520', category: 'food' as const, title: '晚餐', meta: '餐饮　18:30', amount: '-¥40.00', tone: 'expense' as const, account: '现金' },
    ],
  },
];

function groupSummary(rows: TransactionPresentation[]): string {
  const totals = rows.reduce((result, row) => {
    const value = Number(row.amount.replace(/[^\d.]/g, ''));
    result[row.tone] += value;
    return result;
  }, { expense: 0, income: 0 });
  return `支出：¥${totals.expense.toFixed(2)}　 收入：¥${totals.income.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export function TransactionsPage({ viewModel, backgrounds, onNavigate, onFeedback }: NavigateProps) {
  const [now] = useState(referenceNow);
  const initialMonth = monthKey(now);
  const useLiveTransactions = supportsLedgerQuery(viewModel, 'getTransactions');
  const [category, setCategory] = useState('全部');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(() => useLiveTransactions ? monthLabel(initialMonth) : '2024年5月');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [transactionType, setTransactionType] = useState('全部类型');
  const [account, setAccount] = useState('全部账户');
  const [filterSheet, setFilterSheet] = useState<'type' | 'account' | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<{
    row: TransactionPresentation;
    date: string;
    detail?: TransactionDetail;
  } | null>(null);
  const [detailMode, setDetailMode] = useState<'detail' | 'edit' | 'delete'>('detail');
  const [transactionOverrides, setTransactionOverrides] = useState<Record<string, TransactionPresentation>>({});
  const [deletedTransactionIds, setDeletedTransactionIds] = useState<Set<string>>(() => new Set());
  const [undoTransaction, setUndoTransaction] = useState<{ row: TransactionPresentation; date: string } | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const activeMonthKey = monthKeyFromLabel(month) ?? initialMonth;
  const transactionsQuery = useLedgerQuery<TransactionListSnapshot>(
    ledgerSubscription(viewModel),
    `reference-transactions-${activeMonthKey}`,
    () => useLiveTransactions
      ? viewModel.getTransactions({
          month: activeMonthKey,
          accountId: null,
          date: null,
          categoryId: null,
          query: '',
        })
      : Promise.resolve({ groups: [], accounts: [], categories: [] }),
  );
  const transactionData = useLiveTransactions && transactionsQuery.status === 'ready'
    ? transactionsQuery.data
    : null;
  const categoryFilters = useMemo(() => {
    if (!transactionData) return ['全部', '餐饮', '交通', '购物', '娱乐', '收入'];
    return [...new Set(['全部', ...transactionData.categories.map((item) => item.name), '收入'])];
  }, [transactionData]);
  const sourceGroups = useMemo(() => transactionData
    ? transactionData.groups.map((group) => ({
        date: transactionDateHeading(group.dateKey, now),
        dateKey: group.dateKey,
        rows: group.rows.map(transactionPresentation),
      }))
    : useLiveTransactions ? [] : transactionGroups.map((group) => {
        const [, monthNumber = '1', day = '1'] = group.date.match(/(\d+)月(\d+)日/) ?? [];
        return {
          ...group,
          dateKey: `2024-${monthNumber.padStart(2, '0')}-${day.padStart(2, '0')}`,
        };
      }),
  [now, transactionData, useLiveTransactions]);

  useEffect(() => () => {
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
  }, []);

  const filteredGroups = useMemo(() => sourceGroups.flatMap((group) => {
    if (!useLiveTransactions && month !== '2024年5月') return [];
    if (selectedDate) {
      const [, selectedMonth, selectedDay] = selectedDate.split('-').map(Number);
      const dateMatches = group.dateKey === selectedDate
        || group.date.startsWith(`${selectedMonth}月${selectedDay}日`);
      if (!dateMatches) return [];
    }
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    const rows = group.rows.map((row) => transactionOverrides[row.id] ?? row).filter((row) => {
      if (deletedTransactionIds.has(row.id)) return false;
      const categoryMatches = category === '全部'
        || (category === '收入' ? row.tone === 'income' : row.meta.startsWith(category));
      const typeMatches = transactionType === '全部类型'
        || (transactionType === '支出' ? row.tone === 'expense' : row.tone === 'income');
      const accountMatches = account === '全部账户' || row.account === account;
      const queryMatches = normalizedQuery === ''
        || `${row.title} ${row.meta}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery);
      return categoryMatches && typeMatches && accountMatches && queryMatches;
    });
    return rows.length === 0 ? [] : [{ ...group, rows }];
  }), [account, category, deletedTransactionIds, month, query, selectedDate, sourceGroups, transactionOverrides, transactionType, useLiveTransactions]);

  function toggleSearch() {
    if (searchOpen) setQuery('');
    setSearchOpen((open) => !open);
  }

  function clearFilters() {
    setCategory('全部');
    setQuery('');
    setSearchOpen(false);
    setMonth(useLiveTransactions ? monthLabel(initialMonth) : '2024年5月');
    setSelectedDate(null);
    setTransactionType('全部类型');
    setAccount('全部账户');
  }

  function closeTransactionSheet() {
    setSelectedTransaction(null);
    setDetailMode('detail');
  }

  function openTransaction(row: TransactionPresentation, dateLabel: string) {
    setSelectedTransaction({ row, date: dateLabel });
    setDetailMode('detail');
    if (!useLiveTransactions || typeof viewModel.getTransactionDetail !== 'function') return;
    void viewModel.getTransactionDetail(row.id).then((detail) => {
      if (!detail) return;
      setSelectedTransaction((current) => current?.row.id === row.id
        ? { ...current, detail, row: { ...transactionPresentation(detail), note: detail.note } }
        : current);
    }).catch(() => onFeedback('流水详情加载失败，请重试', 'error'));
  }

  async function saveTransactionEdit(transaction: TransactionPresentation) {
    if (!useLiveTransactions) {
      setTransactionOverrides((current) => ({ ...current, [transaction.id]: transaction }));
      setSelectedTransaction((current) => current ? { ...current, row: transaction } : current);
      setDetailMode('detail');
      onFeedback('流水已更新', 'success');
      return;
    }

    try {
      const detail = selectedTransaction?.detail
        ?? await viewModel.getTransactionDetail(transaction.id);
      if (!detail || (detail.type !== 'expense' && detail.type !== 'income')) {
        throw new Error('当前流水暂不支持修改');
      }
      const categoryName = transaction.meta.split('　')[0];
      const categoryOption = detail.categoryOptions.find((item) => (
        item.kind === detail.type && item.name === categoryName
      ));
      const accountOption = detail.accountOptions.find((item) => item.name === transaction.account);
      if (!categoryOption || !accountOption) throw new Error('请选择有效的分类和账户');
      const amountCents = parseYuan(transaction.amount.replace(/[^\d.]/g, ''));
      await viewModel.updateTransaction({
        id: detail.id,
        baseVersion: detail.version,
        type: detail.type,
        amountCents,
        accountId: accountOption.id,
        categoryId: categoryOption.id,
        occurredAt: detail.occurredAt,
        name: transaction.title,
        note: transaction.note?.trim() || '',
      });
      const refreshed = await viewModel.getTransactionDetail(detail.id);
      setSelectedTransaction((current) => refreshed && current
        ? { ...current, detail: refreshed, row: { ...transactionPresentation(refreshed), note: refreshed.note } }
        : current);
      setDetailMode('detail');
      onFeedback('流水已更新', 'success');
    } catch (caught) {
      onFeedback(caught instanceof Error ? caught.message : '流水更新失败，请重试', 'error');
    }
  }

  async function deleteSelectedTransaction() {
    if (!selectedTransaction) return;
    const deleted = selectedTransaction;
    try {
      if (useLiveTransactions) await viewModel.deleteTransaction(deleted.row.id);
      else setDeletedTransactionIds((current) => new Set(current).add(deleted.row.id));
    } catch (caught) {
      onFeedback(caught instanceof Error ? caught.message : '流水删除失败，请重试', 'error');
      return;
    }
    setUndoTransaction(deleted);
    closeTransactionSheet();
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setUndoTransaction(null);
      undoTimerRef.current = null;
      if (useLiveTransactions && typeof viewModel.flushPendingDelete === 'function') {
        void viewModel.flushPendingDelete();
      }
    }, 8_000);
  }

  async function undoDelete() {
    if (!undoTransaction) return;
    try {
      if (useLiveTransactions) await viewModel.undoTransactionDelete(undoTransaction.row.id);
      else {
        setDeletedTransactionIds((current) => {
          const next = new Set(current);
          next.delete(undoTransaction.row.id);
          return next;
        });
      }
    } catch (caught) {
      onFeedback(caught instanceof Error ? caught.message : '撤销失败，请重试', 'error');
      return;
    }
    setUndoTransaction(null);
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = null;
    onFeedback('删除已撤销', 'success');
  }

  async function copySelectedTransaction() {
    if (!selectedTransaction) return;
    try {
      if (useLiveTransactions) await viewModel.duplicateTransaction(selectedTransaction.row.id);
      closeTransactionSheet();
      onFeedback('流水已复制，时间更新为现在', 'success');
    } catch (caught) {
      onFeedback(caught instanceof Error ? caught.message : '流水复制失败，请重试', 'error');
    }
  }

  return (
    <PageFrame background={backgrounds.transactions ?? transactionsBackground} className={styles.transactionsPage}>
      <header className={styles.simpleHeader} data-search={searchOpen ? 'true' : 'false'}>
        {searchOpen ? (
          <label className={styles.searchField}>
            <img src={searchArt} alt="" aria-hidden="true" />
            <input
              autoFocus
              aria-label="搜索流水"
              placeholder="搜索流水"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : <h1>流水</h1>}
        <button type="button" aria-label={searchOpen ? '关闭搜索' : '搜索'} onClick={toggleSearch}>
          {searchOpen ? <X /> : <img className={styles.actionArt} src={searchArt} alt="" />}
        </button>
      </header>
      <div className={styles.filterRow}>
        <button type="button" aria-haspopup="dialog" aria-expanded={monthPickerOpen} onClick={() => setMonthPickerOpen(true)}><img className={styles.actionArt} src={calendarArt} alt="" /> {selectedDate ? monthDateLabel(selectedDate) : month} <CaretDown /></button>
        <button type="button" aria-haspopup="listbox" aria-expanded={filterSheet === 'type'} onClick={() => setFilterSheet((current) => current === 'type' ? null : 'type')}>{transactionType} <CaretDown /></button>
        <button type="button" aria-haspopup="listbox" aria-expanded={filterSheet === 'account'} onClick={() => setFilterSheet((current) => current === 'account' ? null : 'account')}>{account} <CaretDown /></button>
      </div>
      <div className={styles.chipRow} role="group" aria-label="类目筛选">
        {categoryFilters.map((item) => (
          <button key={item} type="button" data-active={item === category} onClick={() => setCategory(item)}>{item}</button>
        ))}
      </div>
      <div className={styles.ledgerList}>
        {filteredGroups.map((group) => (
          <section key={group.date} className={styles.dayGroup}>
            <div className={styles.dayHeading}><strong>{group.date}</strong><span>{groupSummary(group.rows)}</span></div>
            <div className={styles.card}>
              {group.rows.map((row) => (
                <TransactionRow key={row.id} {...row} onClick={() => openTransaction(row, group.date)} />
              ))}
            </div>
          </section>
        ))}
        {filteredGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <span role="status">没有找到符合条件的流水</span>
            <button type="button" onClick={clearFilters}>清除筛选</button>
          </div>
        ) : null}
      </div>
      <BottomNavigation active="transactions" onNavigate={onNavigate} />
      {monthPickerOpen ? (
        <MonthDatePicker
          initialMonth={activeMonthKey}
          initialDate={selectedDate}
          onApply={(nextMonth, nextDate) => {
            setMonth(monthLabel(nextMonth));
            setSelectedDate(nextDate);
            setMonthPickerOpen(false);
          }}
          onClose={() => setMonthPickerOpen(false)}
        />
      ) : null}
      {filterSheet === 'type' ? (
        <FilterDropdown
          title="选择收支类型"
          anchor="type"
          value={transactionType}
          options={['全部类型', '支出', '收入'].map((value) => ({ value, label: value }))}
          onSelect={setTransactionType}
          onClose={() => setFilterSheet(null)}
        />
      ) : null}
      {filterSheet === 'account' ? (
        <FilterDropdown
          title="选择账户"
          anchor="account"
          value={account}
          options={(transactionData
            ? ['全部账户', ...transactionData.accounts.map((item) => item.name)]
            : ['全部账户', '现金', '储蓄卡', '信用卡', '交通卡'])
            .map((value) => ({ value, label: value }))}
          onSelect={setAccount}
          onClose={() => setFilterSheet(null)}
        />
      ) : null}
      {selectedTransaction ? (
        <ReferenceSheet title={detailMode === 'detail' ? '流水详情' : detailMode === 'edit' ? '编辑流水' : '确认删除'} onClose={closeTransactionSheet}>
          {detailMode === 'detail' ? (
            <TransactionDetailPanel
              transaction={selectedTransaction.row}
              dateLabel={selectedTransaction.date.split(' ')[0]}
              onEdit={!useLiveTransactions || (
                selectedTransaction.detail?.type === 'expense'
                || selectedTransaction.detail?.type === 'income'
              ) ? () => setDetailMode('edit') : undefined}
              onCopy={!useLiveTransactions || selectedTransaction.detail
                ? () => void copySelectedTransaction()
                : undefined}
              onDelete={!useLiveTransactions || selectedTransaction.detail
                ? () => setDetailMode('delete')
                : undefined}
            />
          ) : detailMode === 'edit' ? (
            <TransactionEditPanel
              transaction={selectedTransaction.row}
              categoryOptions={selectedTransaction.detail?.categoryOptions
                .filter((item) => item.kind === selectedTransaction.detail?.type)
                .map((item) => item.name)}
              accountOptions={selectedTransaction.detail?.accountOptions.map((item) => item.name)}
              onCancel={() => setDetailMode('detail')}
              onSave={(transaction) => void saveTransactionEdit(transaction)}
            />
          ) : (
            <div className={styles.logoutConfirmation}>
              <p>确定删除“{selectedTransaction.row.title}”吗？删除后 8 秒内可以撤销。</p>
              <div className={styles.sheetFormActions}>
                <button type="button" onClick={() => setDetailMode('detail')}>取消</button>
                <button type="button" onClick={() => void deleteSelectedTransaction()}>确认删除</button>
              </div>
            </div>
          )}
        </ReferenceSheet>
      ) : null}
      {undoTransaction ? (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span>已删除“{undoTransaction.row.title}”</span>
          <button type="button" onClick={() => void undoDelete()}>撤销</button>
        </div>
      ) : null}
    </PageFrame>
  );
}

const entryCategories: Array<{ key: CategoryKey; label: string }> = [
  { key: 'food', label: '餐饮' },
  { key: 'transport', label: '交通' },
  { key: 'shopping', label: '购物' },
  { key: 'home', label: '住房' },
  { key: 'entertainment', label: '娱乐' },
  { key: 'daily', label: '日用' },
  { key: 'study', label: '学习' },
  { key: 'medical', label: '医疗' },
  { key: 'travel', label: '旅行' },
  { key: 'other', label: '其他' },
];

const entryIncomeCategories: Array<{ key: CategoryKey; label: string }> = [
  { key: 'income', label: '工资' },
];

const customCategoryIconsStorageKey = 'seabreeze-custom-category-icons';
const maximumCategoryIconBytes = 1024 * 1024;

type EntryCategoryOption = {
  id: string | null;
  label: string;
  iconKey: string;
  categoryKey: CategoryKey;
  iconUrl?: string;
};

type CategoryEditorState = {
  mode: 'create' | 'edit';
  kind?: 'expense' | 'income';
  category?: EntryCategoryOption & { kind: 'expense' | 'income' };
};

function categoryKeyFor(iconKey: string, label: string): CategoryKey {
  if (iconKey in categorySprites) return iconKey as CategoryKey;
  const byLabel: Record<string, CategoryKey> = {
    餐饮: 'food',
    交通: 'transport',
    购物: 'shopping',
    住房: 'home',
    娱乐: 'entertainment',
    日用: 'daily',
    学习: 'study',
    医疗: 'medical',
    旅行: 'travel',
    工资: 'income',
  };
  return byLabel[label] ?? 'other';
}

function loadCustomCategoryIcons(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(customCategoryIconsStorageKey) ?? '{}') as unknown;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(entry[1])
    )));
  } catch {
    return {};
  }
}

function readCategoryIcon(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('请选择 PNG、JPG 或 WebP 图片'));
  }
  if (file.size > maximumCategoryIconBytes) {
    return Promise.reject(new Error('图标图片不能超过1 MB'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('图标读取失败'));
    reader.onerror = () => reject(new Error('图标读取失败'));
    reader.readAsDataURL(file);
  });
}

function EntryCategoryArt({ category, iconUrl }: { category: CategoryKey; iconUrl?: string }) {
  return iconUrl ? (
    <span className={styles.categoryArt} aria-hidden="true"><img src={iconUrl} alt="" /></span>
  ) : <CategoryArt category={category} />;
}

function CategoryEditorForm({
  editor,
  existingNames,
  onCancel,
  onSave,
}: {
  editor: CategoryEditorState;
  existingNames: string[];
  onCancel(): void;
  onSave(value: { name: string; kind: 'expense' | 'income'; iconKey: string; iconUrl?: string }): Promise<void>;
}) {
  const category = editor.category;
  const [name, setName] = useState(category?.label ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(category?.kind ?? editor.kind ?? 'expense');
  const [iconUrl, setIconUrl] = useState(category?.iconUrl);
  const [iconChanged, setIconChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError('请输入类目名称');
      return;
    }
    if (nextName.length > 30) {
      setError('类目名称不能超过30个字符');
      return;
    }
    if (existingNames.some((item) => item.toLocaleLowerCase() === nextName.toLocaleLowerCase())) {
      setError('同类型下的类目名称不能重复');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: nextName,
        kind,
        iconKey: category?.iconKey ?? 'custom',
        iconUrl: iconChanged ? iconUrl : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '类目保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <form className={styles.categoryEditorForm} onSubmit={(event) => void submit(event)}>
      <div className={styles.categoryIconEditor}>
        <span className={styles.categoryIconPreview}>
          <EntryCategoryArt category={category?.categoryKey ?? 'other'} iconUrl={iconUrl} />
        </span>
        <label className={styles.categoryUploadButton}>
          <UploadSimple />
          <span>上传图标</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="上传类目图标"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void readCategoryIcon(file).then((result) => {
                setIconUrl(result);
                setIconChanged(true);
                setError(null);
              }).catch((caught) => {
                setError(caught instanceof Error ? caught.message : '图标读取失败');
              });
            }}
          />
        </label>
      </div>
      <label className={styles.sheetInputField}>
        <span>类目名称</span>
        <input autoFocus aria-label="类目名称" maxLength={30} value={name} onChange={(event) => { setName(event.target.value); setError(null); }} />
      </label>
      <fieldset className={styles.categoryKindField}>
        <legend>类目类型</legend>
        <div>
          {(['expense', 'income'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-active={kind === value ? 'true' : 'false'}
              disabled={editor.mode === 'edit'}
              onClick={() => setKind(value)}
            >
              {value === 'expense' ? '支出' : '收入'}
            </button>
          ))}
        </div>
      </fieldset>
      {error ? <p className={styles.sheetFormError} role="alert">{error}</p> : null}
      <div className={styles.sheetFormActions}>
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" disabled={saving}>{saving ? '保存中...' : editor.mode === 'create' ? '添加类目' : '保存修改'}</button>
      </div>
    </form>
  );
}

type ReferenceEntryOptions = Awaited<ReturnType<LedgerViewModel['getEntryOptions']>>;

export function EntryPage({
  viewModel,
  backgrounds,
  initialCategory,
  onClose,
  onFeedback,
}: {
  viewModel: LedgerViewModel;
  backgrounds: BackgroundOverrides;
  initialCategory?: string;
  onClose(): void;
  onFeedback(message: string, tone?: 'info' | 'success' | 'error'): void;
}) {
  const [entryNow] = useState(referenceNow);
  const [type, setType] = useState<'支出' | '收入'>('支出');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(initialCategory ?? '餐饮');
  const [note, setNote] = useState('');
  const [options, setOptions] = useState<ReferenceEntryOptions | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [occurredDate, setOccurredDate] = useState(() => localDateInput(entryNow));
  const [occurredTime, setOccurredTime] = useState(() => localTimeInput(entryNow));
  const [entrySheet, setEntrySheet] = useState<'date' | 'account' | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [categoryManagerKind, setCategoryManagerKind] = useState<'expense' | 'income'>('expense');
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState | null>(null);
  const [customCategoryIcons, setCustomCategoryIcons] = useState(loadCustomCategoryIcons);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const useLiveEntryAccounts = supportsLedgerQuery(viewModel, 'getEntryOptions');
  const profileAccounts = useMemo(
    () => useLiveEntryAccounts ? [] : loadProfileAccounts(),
    [useLiveEntryAccounts],
  );

  useEffect(() => {
    const getEntryOptions = (viewModel as Partial<LedgerViewModel>).getEntryOptions;
    if (typeof getEntryOptions !== 'function') return;
    let cancelled = false;
    void getEntryOptions.call(viewModel).then((nextOptions) => {
      if (!cancelled) setOptions(nextOptions);
    }).catch(() => {
      if (!cancelled) setOptions(null);
    });
    return () => { cancelled = true; };
  }, [viewModel]);

  const entryAccountOptions = useMemo(() => options?.accounts.map((account) => {
    const profileAccount = profileAccounts.find((item) => item.sourceName === account.name);
    const balanceCents = profileAccount?.balanceEdited
      ? profileAccount.balanceCents
      : account.balanceCents;
    return {
      value: account.id,
      label: profileAccount?.name ?? account.name,
      detail: `${account.accountClass === 'asset' ? '资产账户' : '负债账户'} · 剩余 ${formatYuan(balanceCents)}`,
    };
  }) ?? [], [options, profileAccounts]);
  const entryCategoryOptions = useMemo<EntryCategoryOption[]>(() => {
    const categoryKind = type === '支出' ? 'expense' : 'income';
    const loadedCategories = categoryKind === 'expense' ? options?.expenseCategories : options?.incomeCategories;
    if (loadedCategories) {
      return loadedCategories.map((category) => ({
        id: category.id,
        label: category.name,
        iconKey: category.iconKey,
        categoryKey: categoryKeyFor(category.iconKey, category.name),
        iconUrl: customCategoryIcons[category.id],
      }));
    }
    const fallback = categoryKind === 'expense' ? entryCategories : entryIncomeCategories;
    return fallback.map((category) => ({
      id: null,
      label: category.label,
      iconKey: category.key,
      categoryKey: category.key,
    }));
  }, [customCategoryIcons, options, type]);
  const managedCategoryOptions = useMemo(() => {
    const categories = categoryManagerKind === 'expense' ? options?.expenseCategories : options?.incomeCategories;
    return categories?.map((category) => ({
      id: category.id,
      label: category.name,
      iconKey: category.iconKey,
      categoryKey: categoryKeyFor(category.iconKey, category.name),
      iconUrl: customCategoryIcons[category.id],
      kind: categoryManagerKind,
    })) ?? [];
  }, [categoryManagerKind, customCategoryIcons, options]);

  useEffect(() => {
    if (entryCategoryOptions.length > 0 && !entryCategoryOptions.some((category) => category.label === selected)) {
      setSelected(entryCategoryOptions[0]!.label);
    }
  }, [entryCategoryOptions, selected]);

  const accountName = entryAccountOptions.find((account) => account.value === accountId)?.label ?? '默认账户';
  const occurredDateLabel = `${Number(occurredDate.slice(0, 4))}年${Number(occurredDate.slice(5, 7))}月${Number(occurredDate.slice(8, 10))}日`;

  function selectEntryType(nextType: '支出' | '收入') {
    const categories = nextType === '支出' ? options?.expenseCategories : options?.incomeCategories;
    const fallback = nextType === '支出' ? entryCategories : entryIncomeCategories;
    setType(nextType);
    setSelected(categories?.[0]?.name ?? fallback[0]?.label ?? '其他');
    setError(null);
  }

  async function refreshEntryOptions() {
    const getEntryOptions = (viewModel as Partial<LedgerViewModel>).getEntryOptions;
    if (typeof getEntryOptions !== 'function') return;
    setOptions(await getEntryOptions.call(viewModel));
  }

  function storeCustomCategoryIcon(categoryId: string, iconUrl: string) {
    const nextIcons = { ...customCategoryIcons, [categoryId]: iconUrl };
    localStorage.setItem(customCategoryIconsStorageKey, JSON.stringify(nextIcons));
    setCustomCategoryIcons(nextIcons);
  }

  async function saveCategory(value: { name: string; kind: 'expense' | 'income'; iconKey: string; iconUrl?: string }) {
    if (categoryEditor?.mode === 'edit' && categoryEditor.category?.id) {
      const updateCategory = (viewModel as Partial<LedgerViewModel>).updateCategory;
      if (typeof updateCategory !== 'function') throw new Error('当前账本暂不支持编辑类目');
      const previousName = categoryEditor.category.label;
      await updateCategory.call(viewModel, {
        id: categoryEditor.category.id,
        name: value.name,
        iconKey: value.iconKey,
      });
      if (value.iconUrl) {
        try {
          storeCustomCategoryIcon(categoryEditor.category.id, value.iconUrl);
        } catch {
          onFeedback('类目已更新，但图标保存失败，请换一张更小的图片', 'info');
        }
      }
      await refreshEntryOptions();
      if (selected === previousName) setSelected(value.name);
      setCategoryEditor(null);
      onFeedback('类目信息已更新', 'success');
      return;
    }

    const createCategory = (viewModel as Partial<LedgerViewModel>).createCategory;
    if (typeof createCategory !== 'function') throw new Error('当前账本暂不支持添加类目');
    const created = await createCategory.call(viewModel, {
      name: value.name,
      kind: value.kind,
      iconKey: value.iconKey,
    });
    if (value.iconUrl) {
      try {
        storeCustomCategoryIcon(created.categoryId, value.iconUrl);
      } catch {
        onFeedback('类目已添加，但图标保存失败，请换一张更小的图片', 'info');
      }
    }
    await refreshEntryOptions();
    setType(value.kind === 'expense' ? '支出' : '收入');
    setSelected(value.name);
    setCategoryEditor(null);
    setCategoryManagerOpen(false);
    onFeedback('自定义类目已添加', 'success');
  }

  async function saveEntry() {
    if (saveState !== 'idle') return;
    let amountCents: number;
    let occurredAt: string;
    try {
      amountCents = parsePositiveYuan(amount);
      const occurredDateTime = new Date(`${occurredDate}T${occurredTime}:00`);
      if (!occurredDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(occurredTime) || Number.isNaN(occurredDateTime.getTime())) {
        throw new Error('请选择有效的日期和时间');
      }
      occurredAt = occurredDateTime.toISOString();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '请输入有效金额';
      setError(message);
      onFeedback(message, 'error');
      return;
    }

    setSaveState('saving');
    setError(null);
    try {
      const createTransaction = (viewModel as Partial<LedgerViewModel>).createTransaction;
      if (typeof createTransaction === 'function') {
        if (!options) throw new Error('账户信息正在加载，请稍后再试');
        const transactionType = type === '支出' ? 'expense' : 'income';
        const categories = transactionType === 'expense'
          ? options.expenseCategories
          : options.incomeCategories;
        const category = categories.find((item) => item.name === selected) ?? categories[0];
        const account = options.accounts.find((item) => item.id === accountId)
          ?? options.accounts.find((item) => transactionType === 'expense' || item.accountClass === 'asset');
        if (!category) throw new Error(`暂无可用的${type}分类`);
        if (!account) throw new Error('暂无可用账户');
        await createTransaction.call(viewModel, {
          type: transactionType,
          amountCents,
          categoryId: category.id,
          accountId: account.id,
          occurredAt,
          name,
          note,
        });
      }
      setSaveState('saved');
      onFeedback(navigator.onLine ? '记账已保存' : '已保存到本机，等待同步', 'success');
      window.setTimeout(onClose, 560);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '保存失败，请重试';
      setError(message);
      onFeedback(message, 'error');
      setSaveState('idle');
    }
  }

  return (
    <PageFrame background={backgrounds.entry ?? entryBackground} className={styles.entryPage}>
      <header className={styles.entryHeader}>
        <button type="button" aria-label="关闭" onClick={onClose}><X /></button>
        <div className={styles.segmented}>
          {(['支出', '收入'] as const).map((item) => (
            <button key={item} type="button" data-active={type === item} onClick={() => selectEntryType(item)}>{item}</button>
          ))}
        </div>
        <span />
      </header>
      <label className={styles.amountInput}>
        <span>¥</span>
        <input
          autoFocus
          aria-label="金额"
          aria-invalid={error ? 'true' : undefined}
          inputMode="decimal"
          maxLength={11}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setError(null);
          }}
        />
      </label>
      <button
        type="button"
        className={styles.categoryManageButton}
        aria-label="编辑类目"
        title="编辑类目"
        onClick={() => {
          setCategoryManagerKind(type === '支出' ? 'expense' : 'income');
          setCategoryManagerOpen(true);
        }}
      >
        <PencilSimple />
      </button>
      <div className={styles.entryCategoryGrid}>
        {entryCategoryOptions.map((item) => (
          <button key={item.label} type="button" data-active={selected === item.label} onClick={() => {
            setSelected(item.label);
            setError(null);
          }}>
            <EntryCategoryArt category={item.categoryKey} iconUrl={item.iconUrl} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <section className={`${styles.card} ${styles.entryDetails}`}>
        <label><strong>名称</strong><input aria-label="名称" maxLength={80} placeholder="例如：午餐、地铁" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><strong>备注</strong><input aria-label="备注" placeholder="点击写备注..." value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <button type="button" onClick={() => setEntrySheet('date')}><strong>日期</strong><span>{occurredDateLabel}{occurredDate === localDateInput(entryNow) ? ' 今天' : ''} {occurredTime} <CaretRight /></span></button>
        <button type="button" onClick={() => setEntrySheet('account')}><strong>账户</strong><span>{accountName} <CaretRight /></span></button>
      </section>
      {error ? <p className={styles.entryError} role="alert">{error}</p> : null}
      <button type="button" className={styles.saveButton} disabled={saveState !== 'idle'} data-state={saveState} onClick={() => void saveEntry()}>
        {saveState === 'saved' ? <><Check weight="bold" /> 已保存</> : saveState === 'saving' ? '保存中...' : '保存'}
      </button>
      {entrySheet === 'date' ? (
        <ReferenceSheet title="选择日期和时间" onClose={() => setEntrySheet(null)}>
          <div className={styles.entryDateTimeFields}>
            <label className={styles.sheetInputField}>
              <span>记账日期</span>
              <input type="date" aria-label="记账日期" value={occurredDate} onChange={(event) => setOccurredDate(event.target.value)} />
            </label>
            <label className={styles.sheetInputField}>
              <span>记账时间</span>
              <input type="time" step="60" aria-label="记账时间" value={occurredTime} onInput={(event) => setOccurredTime(event.currentTarget.value)} />
            </label>
          </div>
          <button type="button" className={styles.sheetPrimaryButton} onClick={() => setEntrySheet(null)}>完成</button>
        </ReferenceSheet>
      ) : null}
      {entrySheet === 'account' ? (
        <ChoiceSheet
          title="选择账户"
          value={accountId ?? ''}
          options={entryAccountOptions.length
            ? entryAccountOptions
            : [{ value: '', label: '默认账户', detail: '余额加载中' }]}
          onSelect={(value) => setAccountId(value || null)}
          onClose={() => setEntrySheet(null)}
        />
      ) : null}
      {categoryManagerOpen && !categoryEditor ? (
        <ReferenceSheet title="类目管理" onClose={() => setCategoryManagerOpen(false)}>
          <div className={styles.categoryManagerKinds} aria-label="类目类型">
            {(['expense', 'income'] as const).map((kind) => (
              <button key={kind} type="button" data-active={categoryManagerKind === kind ? 'true' : 'false'} onClick={() => setCategoryManagerKind(kind)}>
                {kind === 'expense' ? '支出类目' : '收入类目'}
              </button>
            ))}
          </div>
          <div className={styles.categoryManagerList}>
            {managedCategoryOptions.map((category) => (
              <div key={category.id}>
                <EntryCategoryArt category={category.categoryKey} iconUrl={category.iconUrl} />
                <span><strong>{category.label}</strong><small>{categoryManagerKind === 'expense' ? '支出类目' : '收入类目'}</small></span>
                <button type="button" aria-label={`编辑类目 ${category.label}`} title={`编辑${category.label}`} onClick={() => setCategoryEditor({ mode: 'edit', category })}>
                  <PencilSimple />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={styles.sheetPrimaryButton} onClick={() => setCategoryEditor({ mode: 'create', kind: categoryManagerKind })}>
            <Plus /> 添加自定义类目
          </button>
        </ReferenceSheet>
      ) : null}
      {categoryEditor ? (
        <ReferenceSheet title={categoryEditor.mode === 'create' ? '添加自定义类目' : '编辑类目'} onClose={() => setCategoryEditor(null)}>
          <CategoryEditorForm
            editor={categoryEditor}
            existingNames={managedCategoryOptions
              .filter((category) => category.id !== categoryEditor.category?.id)
              .map((category) => category.label)}
            onCancel={() => setCategoryEditor(null)}
            onSave={saveCategory}
          />
        </ReferenceSheet>
      ) : null}
    </PageFrame>
  );
}

function DonutChart({
  label,
  percentages,
}: {
  label: string;
  percentages?: number[];
}) {
  const colors = ['#fb654d', '#ffad2f', '#56c4bd', '#817bd3', '#ced1c8'];
  let cursor = 0;
  const background = percentages
    ? `conic-gradient(${percentages.map((percentage, index) => {
        const start = cursor;
        cursor += percentage;
        const end = index === percentages.length - 1 ? 100 : cursor;
        return `${colors[index] ?? colors[colors.length - 1]} ${start}% ${end}%`;
      }).join(', ')})`
    : undefined;
  return <div className={styles.donutChart} style={background ? { background } : undefined} role="img" aria-label={label} />;
}

function TrendChart({
  label,
  data,
}: {
  label: string;
  data?: StatisticsSnapshot['trend'];
}) {
  const fallbackExpensePoints: Array<[number, number]> = [[32, 106], [54, 82], [75, 76], [96, 80], [117, 100], [139, 98], [160, 94], [181, 116], [202, 100], [223, 112], [244, 88], [266, 80], [288, 48], [310, 69]];
  const fallbackIncomePoints: Array<[number, number]> = [[32, 118], [54, 92], [75, 55], [96, 58], [117, 90], [139, 86], [160, 82], [181, 116], [202, 90], [223, 105], [244, 110], [266, 72], [288, 79], [310, 42]];
  const maxCents = data
    ? Math.max(0, ...data.flatMap((item) => [item.expenseCents, item.incomeCents]))
    : 0;
  const xAt = (index: number, total: number) => total <= 1 ? 160 : 32 + (278 * index) / (total - 1);
  const yAt = (cents: number) => maxCents === 0 ? 140 : 140 - (98 * cents) / maxCents;
  const expensePoints: Array<[number, number]> = data
    ? data.map((item, index) => [xAt(index, data.length), yAt(item.expenseCents)])
    : fallbackExpensePoints;
  const incomePoints: Array<[number, number]> = data
    ? data.map((item, index) => [xAt(index, data.length), yAt(item.incomeCents)])
    : fallbackIncomePoints;
  const axisLabels = data
    ? [1, 0.75, 0.5, 0.25, 0].map((ratio) => {
        const yuan = (maxCents * ratio) / 100;
        return yuan >= 1000 ? `${Number((yuan / 1000).toFixed(1))}k` : `${Math.round(yuan)}`;
      })
    : ['2k', '1.5k', '1k', '500', '0'];
  const xLabelIndexes = data?.length
    ? [...new Set([0, 1, 2, 3, 4, 5].map((slot) => Math.round((data.length - 1) * slot / 5)))]
    : [];
  return (
    <svg className={styles.trendChart} viewBox="0 0 320 150" role="img" aria-label={label}>
      {[20, 50, 80, 110, 140].map((y) => <line key={y} x1="28" x2="312" y1={y} y2={y} className={styles.gridLine} />)}
      <polyline points={expensePoints.map((point) => point.join(',')).join(' ')} className={styles.expenseLine} />
      <polyline points={incomePoints.map((point) => point.join(',')).join(' ')} className={styles.incomeLine} />
      {expensePoints.map(([x, y], index) => <circle key={`e-${index}`} cx={x} cy={y} r="2.5" className={styles.expensePoint} />)}
      {incomePoints.map(([x, y], index) => <circle key={`i-${index}`} cx={x} cy={y} r="2.5" className={styles.incomePoint} />)}
      {axisLabels.map((axisLabel, index) => <text key={`${axisLabel}-${index}`} x="1" y={23 + index * 29}>{axisLabel}</text>)}
      {(data
        ? xLabelIndexes.map((index) => ({ label: data[index]!.label.replace('月', '/').replace('日', ''), x: xAt(index, data.length) }))
        : ['5/1', '5/7', '5/13', '5/19', '5/25', '5/31'].map((item, index) => ({ label: item, x: 32 + index * 55.5 })))
        .map((item, index, items) => (
          <text key={`${item.label}-${index}`} x={item.x} y="148" textAnchor={index === items.length - 1 ? 'end' : 'middle'}>{item.label}</text>
        ))}
    </svg>
  );
}

const statisticsPeriodData = {
  月: {
    range: '2024年5月', expense: '¥4,332.00', income: '¥6,800.00', balance: '¥2,468.00',
    total: '¥4,332.00', donutLabel: '五月餐饮35%，购物25%，交通15%，娱乐10%，其他15%', trendLabel: '五月收支趋势',
    categories: ['¥1,516.00', '¥1,083.00', '¥649.00', '¥433.00', '¥651.00'],
    compareTitle: '月度对比', previous: '4月', current: '5月', previousBalance: '¥1,850.00', currentBalance: '¥2,468.00', change: '+33.41% ↗',
  },
  年: {
    range: '2024年', expense: '¥43,520.00', income: '¥81,600.00', balance: '¥38,080.00',
    total: '¥43,520.00', donutLabel: '全年餐饮35%，购物25%，交通15%，娱乐10%，其他15%', trendLabel: '2024年收支趋势',
    categories: ['¥15,232.00', '¥10,880.00', '¥6,528.00', '¥4,352.00', '¥6,528.00'],
    compareTitle: '年度对比', previous: '2023年', current: '2024年', previousBalance: '¥31,260.00', currentBalance: '¥38,080.00', change: '+21.82% ↗',
  },
  自定义: {
    range: '5月1日-5月22日', expense: '¥3,218.00', income: '¥4,200.00', balance: '¥982.00',
    total: '¥3,218.00', donutLabel: '自定义区间餐饮35%，购物25%，交通15%，娱乐10%，其他15%', trendLabel: '自定义区间收支趋势',
    categories: ['¥1,126.00', '¥805.00', '¥483.00', '¥322.00', '¥482.00'],
    compareTitle: '区间对比', previous: '上一区间', current: '本区间', previousBalance: '¥820.00', currentBalance: '¥982.00', change: '+19.76% ↗',
  },
} as const;

function statisticsRangeFor(
  period: keyof typeof statisticsPeriodData,
  rangeLabel: string,
  customStart: string,
  customEnd: string,
  now: Date,
): StatisticsRange {
  if (period === '月') {
    return { kind: 'month', month: monthKeyFromLabel(rangeLabel) ?? monthKey(now) };
  }
  if (period === '年') {
    const year = Number(/^(\d{4})年$/.exec(rangeLabel)?.[1] ?? now.getFullYear());
    return { kind: 'year', year };
  }
  return { kind: 'custom', startDate: customStart, endDate: customEnd };
}

function previousStatisticsRange(range: StatisticsRange): StatisticsRange {
  if (range.kind === 'month') return { kind: 'month', month: shiftedMonth(range.month, -1) };
  if (range.kind === 'year') return { kind: 'year', year: range.year - 1 };
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const previousStart = new Date(previousEnd.getFullYear(), previousEnd.getMonth(), previousEnd.getDate() - days + 1);
  return {
    kind: 'custom',
    startDate: localDateInput(previousStart),
    endDate: localDateInput(previousEnd),
  };
}

function comparisonLabels(range: StatisticsRange): { previous: string; current: string } {
  if (range.kind === 'month') {
    return {
      previous: `${Number(shiftedMonth(range.month, -1).slice(5))}月`,
      current: `${Number(range.month.slice(5))}月`,
    };
  }
  if (range.kind === 'year') return { previous: `${range.year - 1}年`, current: `${range.year}年` };
  return { previous: '上一区间', current: '本区间' };
}

function percentageChange(previous: number, current: number): string {
  if (previous === 0) return current === 0 ? '0.00% →' : '--';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(2)}% ${change > 0 ? '↗' : change < 0 ? '↘' : '→'}`;
}

function realCategoryRows(snapshot: StatisticsSnapshot): Array<{
  label: string;
  percentage: number;
  amount: string;
}> {
  const primary = snapshot.expenseCategories.slice(0, 4).map((item) => ({
    label: item.name,
    percentage: item.percentage,
    cents: item.cents,
  }));
  const remainder = snapshot.expenseCategories.slice(4);
  if (remainder.length > 0) {
    primary.push({
      label: '其他',
      percentage: remainder.reduce((total, item) => total + item.percentage, 0),
      cents: remainder.reduce((total, item) => total + item.cents, 0),
    });
  }
  const preferred = ['餐饮', '购物', '交通', '娱乐', '其他'];
  for (const label of preferred) {
    if (primary.length >= 5) break;
    if (!primary.some((item) => item.label === label)) primary.push({ label, percentage: 0, cents: 0 });
  }
  return primary.slice(0, 5).map((item) => ({
    label: item.label,
    percentage: item.percentage,
    amount: formatReferenceYuan(item.cents),
  }));
}

export function StatisticsPage({ viewModel, backgrounds, onNavigate, onFeedback }: NavigateProps) {
  const [now] = useState(referenceNow);
  const useLiveStatistics = supportsLedgerQuery(viewModel, 'getStatistics');
  const currentMonth = monthKey(now);
  const currentYear = now.getFullYear();
  const [period, setPeriod] = useState<keyof typeof statisticsPeriodData>('月');
  const [rangeLabel, setRangeLabel] = useState<string>(() => (
    useLiveStatistics ? monthLabel(currentMonth) : statisticsPeriodData.月.range
  ));
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [customStart, setCustomStart] = useState(() => (
    useLiveStatistics ? `${currentMonth}-01` : '2024-05-01'
  ));
  const [customEnd, setCustomEnd] = useState(() => (
    useLiveStatistics ? localDateInput(now) : '2024-05-22'
  ));
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const activeData = statisticsPeriodData[period];
  const activeRange = useMemo(
    () => statisticsRangeFor(period, rangeLabel, customStart, customEnd, now),
    [customEnd, customStart, now, period, rangeLabel],
  );
  const previousRange = useMemo(() => previousStatisticsRange(activeRange), [activeRange]);
  const statisticsQuery = useLedgerQuery<StatisticsSnapshot>(
    ledgerSubscription(viewModel),
    `reference-statistics-${JSON.stringify(activeRange)}`,
    () => useLiveStatistics
      ? viewModel.getStatistics(activeRange)
      : Promise.resolve({
          rangeLabel: '', expenseCents: 0, incomeCents: 0, balanceCents: 0,
          totalBudget: null, categoryBudgets: [], expenseCategories: [], trend: [],
          monthlyComparison: [], accountDistribution: [],
        }),
  );
  const previousStatisticsQuery = useLedgerQuery<StatisticsSnapshot>(
    ledgerSubscription(viewModel),
    `reference-statistics-previous-${JSON.stringify(previousRange)}`,
    () => useLiveStatistics
      ? viewModel.getStatistics(previousRange)
      : Promise.resolve({
          rangeLabel: '', expenseCents: 0, incomeCents: 0, balanceCents: 0,
          totalBudget: null, categoryBudgets: [], expenseCategories: [], trend: [],
          monthlyComparison: [], accountDistribution: [],
        }),
  );
  const statistics = useLiveStatistics && statisticsQuery.status === 'ready'
    ? statisticsQuery.data
    : null;
  const previousStatistics = useLiveStatistics && previousStatisticsQuery.status === 'ready'
    ? previousStatisticsQuery.data
    : null;
  const expenseLabel = statistics ? formatReferenceYuan(statistics.expenseCents) : useLiveStatistics ? '¥0.00' : activeData.expense;
  const incomeLabel = statistics ? formatReferenceYuan(statistics.incomeCents) : useLiveStatistics ? '¥0.00' : activeData.income;
  const balanceLabel = statistics ? formatReferenceYuan(statistics.balanceCents) : useLiveStatistics ? '¥0.00' : activeData.balance;
  const categoryRows = statistics
    ? realCategoryRows(statistics)
    : [
        { label: '餐饮', percentage: 35, amount: activeData.categories[0] },
        { label: '购物', percentage: 25, amount: activeData.categories[1] },
        { label: '交通', percentage: 15, amount: activeData.categories[2] },
        { label: '娱乐', percentage: 10, amount: activeData.categories[3] },
        { label: '其他', percentage: 15, amount: activeData.categories[4] },
      ];
  const comparison = comparisonLabels(activeRange);
  const previousBalanceLabel = previousStatistics
    ? formatReferenceYuan(previousStatistics.balanceCents)
    : useLiveStatistics ? '¥0.00' : activeData.previousBalance;
  const comparisonChange = statistics && previousStatistics
    ? percentageChange(previousStatistics.balanceCents, statistics.balanceCents)
    : useLiveStatistics ? '0.00% →' : activeData.change;
  const rangeOptions: Record<keyof typeof statisticsPeriodData, ReadonlyArray<{ value: string; label: string }>> = {
    月: useLiveStatistics
      ? monthOptions(currentMonth)
      : ['2024年4月', '2024年5月', '2024年6月'].map((value) => ({ value, label: value })),
    年: (useLiveStatistics
      ? [currentYear - 1, currentYear, currentYear + 1].map((year) => `${year}年`)
      : ['2023年', '2024年', '2025年']).map((value) => ({ value, label: value })),
    自定义: [],
  };

  function defaultRangeLabel(nextPeriod: keyof typeof statisticsPeriodData): string {
    if (!useLiveStatistics) return statisticsPeriodData[nextPeriod].range;
    if (nextPeriod === '月') return monthLabel(currentMonth);
    if (nextPeriod === '年') return `${currentYear}年`;
    const formatDate = (value: string) => {
      const [, monthValue, dayValue] = value.split('-').map(Number);
      return `${monthValue}月${dayValue}日`;
    };
    return `${formatDate(customStart)}-${formatDate(customEnd)}`;
  }

  function applyCustomRange() {
    if (!customStart || !customEnd || customStart > customEnd) {
      setCustomRangeError('结束日期不能早于开始日期');
      return;
    }
    const formatDate = (value: string) => {
      const [, monthValue, dayValue] = value.split('-').map(Number);
      return `${monthValue}月${dayValue}日`;
    };
    setRangeLabel(`${formatDate(customStart)}-${formatDate(customEnd)}`);
    setCustomRangeError(null);
    setRangeSheetOpen(false);
  }

  function exportStatistics() {
    const csv = [
      ['统计周期', rangeLabel],
      ['项目', '金额'],
      ['支出', expenseLabel],
      ['收入', incomeLabel],
      ['结余', balanceLabel],
    ].map((row) => row.join(',')).join('\n');
    if (typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `海风账本-${rangeLabel}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    onFeedback('统计报表已导出', 'success');
  }

  return (
    <PageFrame background={backgrounds.statistics ?? statisticsBackground} className={styles.statisticsPage}>
      <header className={styles.centerHeader}>
        <span />
        <h1>统计</h1>
        <button type="button" aria-label="导出" onClick={exportStatistics}><img className={styles.actionArt} src={exportArt} alt="" /></button>
      </header>
      <div className={styles.statisticsFilters}>
        <button
          type="button"
          aria-haspopup={period === '自定义' ? 'dialog' : 'listbox'}
          aria-expanded={rangeSheetOpen}
          onClick={() => setRangeSheetOpen((current) => !current)}
        >{rangeLabel} <CaretDown /></button>
        <div className={styles.periodTabs}>{(['月', '年', '自定义'] as const).map((item) => <button key={item} type="button" data-active={period === item} onClick={() => {
          setPeriod(item);
          setRangeLabel(defaultRangeLabel(item));
          setRangeSheetOpen(item === '自定义');
        }}>{item}</button>)}</div>
      </div>
      <section className={styles.metricGrid}>
        <div className={styles.card}><span>支出</span><strong data-tone="expense">{expenseLabel}</strong></div>
        <div className={styles.card}><span>收入</span><strong data-tone="income">{incomeLabel}</strong></div>
        <div className={styles.card}><span>结余</span><strong data-tone="balance">{balanceLabel}</strong></div>
      </section>
      <section className={`${styles.card} ${styles.donutCard}`}>
        <div className={styles.chartTitle}><h2>支出分类占比</h2><span>总支出　{expenseLabel}</span></div>
        <div className={styles.donutBody}>
          <DonutChart
            key={`${period}-${rangeLabel}`}
            label={statistics
              ? categoryRows.map((item) => `${item.label}${item.percentage}%`).join('，')
              : activeData.donutLabel}
            percentages={statistics ? categoryRows.map((item) => item.percentage) : undefined}
          />
          <ul>
            {categoryRows.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <i data-color={['coral', 'orange', 'blue', 'purple', 'gray'][index]} />
                {item.label}　{item.percentage}% <strong>{item.amount}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className={`${styles.card} ${styles.trendCard}`}>
        <div className={styles.chartTitle}><h2>收支趋势</h2><span className={styles.legend}><i />支出　<i />收入</span></div>
        <TrendChart key={`${period}-${rangeLabel}`} label={statistics ? `${rangeLabel}收支趋势` : activeData.trendLabel} data={statistics?.trend} />
      </section>
      <section className={`${styles.card} ${styles.compareCard}`}>
        <h2>{useLiveStatistics ? period === '年' ? '年度对比' : period === '月' ? '月度对比' : '区间对比' : activeData.compareTitle}</h2>
        <div><span><b>{useLiveStatistics ? comparison.previous : activeData.previous}</b><small>结余 {previousBalanceLabel}</small></span><span><b>{useLiveStatistics ? comparison.current : activeData.current}</b><small>结余 <em>{balanceLabel}</em></small></span><strong>{comparisonChange}</strong></div>
      </section>
      <BottomNavigation active="statistics" onNavigate={onNavigate} />
      {rangeSheetOpen ? (
        period === '自定义' ? (
          <ReferenceSheet title="自定义统计范围" onClose={() => { setCustomRangeError(null); setRangeSheetOpen(false); }}>
            <div className={styles.customRangeForm}>
              <label className={styles.sheetInputField}><span>开始日期</span><input type="date" aria-label="开始日期" value={customStart} onChange={(event) => { setCustomStart(event.target.value); setCustomRangeError(null); }} /></label>
              <label className={styles.sheetInputField}><span>结束日期</span><input type="date" aria-label="结束日期" value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); setCustomRangeError(null); }} /></label>
            </div>
            {customRangeError ? <p className={styles.sheetFormError} role="alert">{customRangeError}</p> : null}
            <button type="button" className={styles.sheetPrimaryButton} onClick={applyCustomRange}>应用</button>
          </ReferenceSheet>
        ) : (
          <FilterDropdown
            title="选择统计周期"
            anchor="statistics"
            value={rangeLabel}
            options={rangeOptions[period]}
            onSelect={setRangeLabel}
            onClose={() => setRangeSheetOpen(false)}
          />
        )
      ) : null}
    </PageFrame>
  );
}

const profileGroups = [
  [
    { icon: expenseArt, label: '预算管理', detail: '' },
    { icon: bankCardArt, label: '账户管理', detail: '2个账户' },
    { icon: calendarArt, label: '记账提醒', detail: '每天 20:00' },
    { icon: ledgerArt, label: '备份与恢复', detail: '' },
  ],
  [
    { icon: homeArt, label: '背景设置', detail: '7个页面' },
    { icon: dailyArt, label: '主题设置', detail: '' },
    { icon: settingsArt, label: '偏好设置', detail: '' },
    { icon: profileArt, label: '关于我们', detail: '' },
  ],
];

const backgroundSettings: Array<{
  slot: BackgroundSlot;
  label: string;
  defaultImage: string;
}> = [
  { slot: 'splash', label: '开屏页', defaultImage: splashBackground },
  { slot: 'home', label: '首页', defaultImage: homeBackground },
  { slot: 'transactions', label: '流水', defaultImage: transactionsBackground },
  { slot: 'entry', label: '记账', defaultImage: entryBackground },
  { slot: 'statistics', label: '统计', defaultImage: statisticsBackground },
  { slot: 'profile', label: '我的', defaultImage: profileBackground },
  { slot: 'profileSubpage', label: '我的副页', defaultImage: profileSubpageBackground },
];

type ProfileSection = '个人资料' | '预算管理' | '账户管理' | '记账提醒' | '备份与恢复' | '背景设置' | '主题设置' | '偏好设置' | '关于我们';

type ProfileAccount = {
  id: string;
  sourceName: string;
  name: string;
  kind: 'cash' | 'wechat' | 'alipay' | 'debit_card' | 'credit_card' | 'custom';
  accountClass: 'asset' | 'liability';
  balanceCents: number;
  balanceEdited: boolean;
};

const defaultProfileAccounts: ProfileAccount[] = [
  { id: 'profile-cash', sourceName: '现金', name: '现金', kind: 'cash', accountClass: 'asset', balanceCents: 0, balanceEdited: false },
  { id: 'profile-savings', sourceName: '储蓄卡', name: '储蓄卡', kind: 'debit_card', accountClass: 'asset', balanceCents: 0, balanceEdited: false },
];

function parseAccountBalance(input: string): number {
  const value = input.trim();
  const isNegative = value.startsWith('-');
  const cents = parseYuan(isNegative ? value.slice(1) : value);
  return isNegative ? -cents : cents;
}

function loadProfileAccounts(): ProfileAccount[] {
  try {
    const storedAccounts: unknown = JSON.parse(localStorage.getItem('seabreeze-profile-accounts') ?? 'null');
    if (!Array.isArray(storedAccounts) || storedAccounts.length === 0) return defaultProfileAccounts;

    if (storedAccounts.every((item) => typeof item === 'string' && item.trim())) {
      return storedAccounts.map((name, index) => ({
        id: `profile-migrated-${index + 1}`,
        sourceName: name,
        name,
        kind: 'custom',
        accountClass: 'asset',
        balanceCents: 0,
        balanceEdited: false,
      }));
    }

    if (storedAccounts.every((item) => (
      typeof item === 'object'
      && item !== null
      && typeof (item as ProfileAccount).id === 'string'
      && typeof (item as ProfileAccount).name === 'string'
      && Boolean((item as ProfileAccount).name.trim())
      && Number.isSafeInteger((item as ProfileAccount).balanceCents)
      && (
        (item as Partial<ProfileAccount>).sourceName === undefined
        || (typeof (item as ProfileAccount).sourceName === 'string' && Boolean((item as ProfileAccount).sourceName.trim()))
      )
      && (
        (item as Partial<ProfileAccount>).balanceEdited === undefined
        || typeof (item as ProfileAccount).balanceEdited === 'boolean'
      )
    ))) {
      return storedAccounts.map((item) => {
        const account = item as ProfileAccount;
        return {
          id: account.id,
          sourceName: account.sourceName?.trim() || account.name,
          name: account.name,
          kind: account.kind ?? 'custom',
          accountClass: account.accountClass ?? (account.kind === 'credit_card' ? 'liability' : 'asset'),
          balanceCents: account.balanceCents,
          balanceEdited: account.balanceEdited ?? account.balanceCents !== 0,
        };
      });
    }
  } catch {
    // Fall back to the reference fixture accounts when local data is invalid.
  }
  return defaultProfileAccounts;
}

function loadManagedProfileAccounts(): ManagedAccount[] {
  return loadProfileAccounts().map((account) => ({
    id: account.id,
    name: account.name,
    kind: 'custom',
    accountClass: 'asset',
    balanceCents: account.balanceCents,
    version: 1,
  }));
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className={styles.toggleRow}>
      <strong>{label}</strong>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}

function ProfileSubpage({
  section,
  avatar,
  ledgerName,
  setLedgerName,
  signature,
  setSignature,
  onReplaceAvatar,
  onRestoreAvatar,
  onSaveProfile,
  budgetAmount,
  setBudgetAmount,
  budgetUsedCents,
  onSaveBudget,
  accounts,
  onSaveAccount,
  onRemoveAccount,
  onPermanentDeleteAccount,
  onGetAccountUsage,
  onAddAccount,
  reminderEnabled,
  setReminderEnabled,
  reminderTime,
  setReminderTime,
  theme,
  setTheme,
  hideAmounts,
  setHideAmounts,
  backgrounds,
  onReplaceBackground,
  onRestoreBackground,
  onBack,
  onFeedback,
}: {
  section: ProfileSection;
  avatar: string;
  ledgerName: string;
  setLedgerName(value: string): void;
  signature: string;
  setSignature(value: string): void;
  onReplaceAvatar(file: File): Promise<void>;
  onRestoreAvatar(): Promise<void>;
  onSaveProfile(): void;
  budgetAmount: string;
  setBudgetAmount(value: string): void;
  budgetUsedCents: number;
  onSaveBudget(amountCents: number): Promise<void>;
  accounts: ProfileAccount[];
  onSaveAccount(index: number, value: { name: string; balanceCents: number; kind: ProfileAccount['kind']; accountClass: ProfileAccount['accountClass'] }): Promise<void>;
  onRemoveAccount(index: number): Promise<void>;
  onPermanentDeleteAccount(index: number): Promise<void>;
  onGetAccountUsage(index: number): Promise<{ transactionCount: number; balanceCents: number }>;
  onAddAccount(value: { name: string; openingBalanceCents: number; kind: ProfileAccount['kind']; accountClass: ProfileAccount['accountClass'] }): Promise<void>;
  reminderEnabled: boolean;
  setReminderEnabled(value: boolean): void;
  reminderTime: string;
  setReminderTime(value: string): void;
  theme: string;
  setTheme(value: string): void;
  hideAmounts: boolean;
  setHideAmounts(value: boolean): void;
  backgrounds: BackgroundOverrides;
  onReplaceBackground(slot: BackgroundSlot, file: File): Promise<void>;
  onRestoreBackground(slot: BackgroundSlot): Promise<void>;
  onBack(): void;
  onFeedback(message: string, tone?: 'info' | 'success' | 'error'): void;
}) {
  const [editingAccountIndex, setEditingAccountIndex] = useState<number | null>(null);
  const [accountNameDraft, setAccountNameDraft] = useState('');
  const [accountBalanceDraft, setAccountBalanceDraft] = useState('0.00');
  const [accountKindDraft, setAccountKindDraft] = useState<ProfileAccount['kind']>('custom');
  const [accountClassDraft, setAccountClassDraft] = useState<ProfileAccount['accountClass']>('asset');
  const [removingAccountIndex, setRemovingAccountIndex] = useState<number | null>(null);
  const [removingAccountUsage, setRemovingAccountUsage] = useState<{ transactionCount: number; balanceCents: number } | null>(null);
  const [accountEditError, setAccountEditError] = useState<string | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [budgetSaveError, setBudgetSaveError] = useState<string | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [backgroundSaving, setBackgroundSaving] = useState<BackgroundSlot | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  let budgetDraftCents = 0;
  try {
    budgetDraftCents = parseYuan(budgetAmount || '0');
  } catch {
    budgetDraftCents = 0;
  }

  function openAccountEditor(index: number) {
    const account = accounts[index];
    if (!account) return;
    setEditingAccountIndex(index);
    setAccountNameDraft(account.name);
    setAccountBalanceDraft(formatYuan(account.balanceCents).replace('¥', ''));
    setAccountKindDraft(account.kind);
    setAccountClassDraft(account.accountClass);
    setAccountEditError(null);
  }

  function openAccountCreator() {
    setEditingAccountIndex(-1);
    setAccountNameDraft('');
    setAccountBalanceDraft('0.00');
    setAccountKindDraft('custom');
    setAccountClassDraft('asset');
    setAccountEditError(null);
  }

  async function openAccountRemoval(index: number) {
    setRemovingAccountIndex(index);
    setRemovingAccountUsage(null);
    try {
      setRemovingAccountUsage(await onGetAccountUsage(index));
    } catch {
      setRemovingAccountUsage({ transactionCount: 0, balanceCents: accounts[index]?.balanceCents ?? 0 });
    }
  }

  function closeAccountEditor() {
    setEditingAccountIndex(null);
    setAccountEditError(null);
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingAccountIndex === null) return;

    const nextName = accountNameDraft.trim();
    if (!nextName) {
      setAccountEditError('请输入账户名称');
      return;
    }
    if (accounts.some((account, index) => (
      index !== editingAccountIndex && account.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
    ))) {
      setAccountEditError('账户名称不能重复');
      return;
    }

    let nextBalanceCents: number;
    try {
      nextBalanceCents = parseAccountBalance(accountBalanceDraft);
    } catch (caught) {
      setAccountEditError(caught instanceof Error ? caught.message : '请输入有效金额');
      return;
    }

    setAccountSaving(true);
    try {
      if (editingAccountIndex === -1) {
        if (nextBalanceCents < 0) throw new Error('初始余额不能为负数');
        await onAddAccount({
          name: nextName,
          openingBalanceCents: nextBalanceCents,
          kind: accountKindDraft,
          accountClass: accountKindDraft === 'credit_card' ? 'liability' : accountClassDraft,
        });
      } else {
        await onSaveAccount(editingAccountIndex, {
          name: nextName,
          balanceCents: nextBalanceCents,
          kind: accountKindDraft,
          accountClass: accountKindDraft === 'credit_card' ? 'liability' : accountClassDraft,
        });
      }
      closeAccountEditor();
      onFeedback(editingAccountIndex === -1 ? '账户已添加' : '账户信息已更新', 'success');
    } catch (caught) {
      setAccountEditError(caught instanceof Error ? caught.message : '账户更新失败，请重试');
    } finally {
      setAccountSaving(false);
    }
  }

  async function finish() {
    if (section === '个人资料') {
      if (!ledgerName.trim()) {
        setProfileSaveError('请输入账本名称');
        return;
      }
      onSaveProfile();
      onFeedback('个人资料已保存', 'success');
      onBack();
      return;
    }
    if (section === '预算管理') {
      let amountCents: number;
      try {
        amountCents = parseYuan(budgetAmount);
        if (amountCents <= 0) throw new Error('本月预算必须大于0');
      } catch (caught) {
        setBudgetSaveError(caught instanceof Error ? caught.message : '请输入有效预算');
        return;
      }
      setBudgetSaving(true);
      setBudgetSaveError(null);
      try {
        await onSaveBudget(amountCents);
        onFeedback('预算管理已保存', 'success');
        onBack();
      } catch (caught) {
        setBudgetSaveError(caught instanceof Error ? caught.message : '预算保存失败，请重试');
      } finally {
        setBudgetSaving(false);
      }
      return;
    }
    if (section === '偏好设置') {
      localStorage.setItem('seabreeze-hide-amounts', hideAmounts ? 'true' : 'false');
    }
    onFeedback(`${section}已保存`, 'success');
    onBack();
  }

  async function replaceAvatar(file: File) {
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      await onReplaceAvatar(file);
      onFeedback('头像已更新', 'success');
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : '头像更新失败，请重试');
    } finally {
      setAvatarSaving(false);
    }
  }

  async function restoreAvatar() {
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      await onRestoreAvatar();
      onFeedback('头像已恢复默认', 'success');
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : '头像恢复失败，请重试');
    } finally {
      setAvatarSaving(false);
    }
  }

  function exportBackup() {
    const payload = JSON.stringify({ ledgerName, budgetAmount, accounts, reminderEnabled, reminderTime, theme }, null, 2);
    if (typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = '海风账本备份.json';
      link.click();
      URL.revokeObjectURL(url);
    }
    onFeedback('账本备份已导出', 'success');
  }

  async function replaceBackground(slot: BackgroundSlot, label: string, file: File) {
    setBackgroundSaving(slot);
    setBackgroundError(null);
    try {
      await onReplaceBackground(slot, file);
      onFeedback(`${label}背景已更新`, 'success');
    } catch (caught) {
      setBackgroundError(caught instanceof Error ? caught.message : '背景替换失败，请重试');
    } finally {
      setBackgroundSaving(null);
    }
  }

  async function restoreBackground(slot: BackgroundSlot, label: string) {
    setBackgroundSaving(slot);
    setBackgroundError(null);
    try {
      await onRestoreBackground(slot);
      onFeedback(`${label}背景已恢复默认`, 'success');
    } catch (caught) {
      setBackgroundError(caught instanceof Error ? caught.message : '背景恢复失败，请重试');
    } finally {
      setBackgroundSaving(null);
    }
  }

  return (
    <div className={styles.profileSubpage}>
      <header className={styles.subpageHeader}>
        <button type="button" aria-label={`返回我的页面`} onClick={onBack}><CaretLeft /></button>
        <h1>{section}</h1>
        <span />
      </header>
      <div className={styles.subpageContent}>
        {section === '个人资料' ? (
          <section className={`${styles.card} ${styles.formCard}`}>
            <div className={styles.profileAvatarEditor}>
              <img className={styles.profileAvatarPreview} src={avatar} alt="当前头像" />
              <div className={styles.profileAvatarActions}>
                <label className={styles.profileAvatarAction} aria-disabled={avatarSaving}>
                  <UploadSimple aria-hidden="true" />
                  <span>{avatarSaving ? '处理中...' : '更换头像'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="更换头像"
                    disabled={avatarSaving}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void replaceAvatar(file);
                    }}
                  />
                </label>
                {avatar !== profileArt ? (
                  <button type="button" className={styles.profileAvatarAction} disabled={avatarSaving} onClick={() => void restoreAvatar()}>
                    <ArrowCounterClockwise aria-hidden="true" />
                    <span>恢复默认</span>
                  </button>
                ) : null}
              </div>
            </div>
            {avatarError ? <p className={styles.profileAvatarError} role="alert">{avatarError}</p> : null}
            <label><span>账本名称</span><input aria-label="账本名称" maxLength={24} value={ledgerName} onChange={(event) => { setLedgerName(event.target.value); setProfileSaveError(null); }} /></label>
            <label><span>个人签名</span><input aria-label="个人签名" maxLength={40} value={signature} onChange={(event) => setSignature(event.target.value)} /></label>
            {profileSaveError ? <p className={styles.profileSaveError} role="alert">{profileSaveError}</p> : null}
          </section>
        ) : null}
        {section === '预算管理' ? (
          <section className={`${styles.card} ${styles.formCard}`}>
            <label><span>本月预算</span><input aria-label="本月预算" inputMode="decimal" value={budgetAmount} onChange={(event) => { setBudgetAmount(event.target.value); setBudgetSaveError(null); }} /></label>
            <div className={styles.budgetPreview}><span>已用 {formatReferenceYuan(budgetUsedCents)}</span><strong>剩余 {formatReferenceYuan(budgetDraftCents - budgetUsedCents)}</strong></div>
            {budgetSaveError ? <p className={styles.budgetSaveError} role="alert">{budgetSaveError}</p> : null}
          </section>
        ) : null}
        {section === '账户管理' ? (
          <section className={`${styles.card} ${styles.accountManager}`}>
            {accounts.map((account, index) => (
              <div className={styles.accountRow} key={account.id}>
                <button
                  type="button"
                  className={styles.accountEditButton}
                  aria-label={`编辑账户 ${account.name}`}
                  onClick={() => openAccountEditor(index)}
                >
                  <span><strong>{account.name}</strong><small>{account.accountClass === 'liability' ? '负债账户' : '资产账户'}</small></span>
                </button>
                <button
                  type="button"
                  className={styles.removeAccountButton}
                  aria-label={`管理账户 ${account.name}`}
                  onClick={() => void openAccountRemoval(index)}
                >
                  管理
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addAccountButton}
              onClick={openAccountCreator}
            >
              添加账户
            </button>
          </section>
        ) : null}
        {section === '记账提醒' ? (
          <section className={`${styles.card} ${styles.formCard}`}>
            <ToggleRow label="每日记账提醒" checked={reminderEnabled} onChange={setReminderEnabled} />
            <label><span>提醒时间</span><input type="time" aria-label="提醒时间" value={reminderTime} disabled={!reminderEnabled} onChange={(event) => setReminderTime(event.target.value)} /></label>
          </section>
        ) : null}
        {section === '备份与恢复' ? (
          <section className={`${styles.card} ${styles.backupActions}`}>
            <button type="button" onClick={exportBackup}>导出账本备份</button>
            <label>
              <span>从文件恢复</span>
              <input
                type="file"
                accept="application/json"
                onChange={(event) => {
                  if (event.target.files?.[0]) onFeedback('已读取备份文件', 'success');
                }}
              />
            </label>
          </section>
        ) : null}
        {section === '背景设置' ? (
          <section className={`${styles.card} ${styles.backgroundManager}`}>
            {backgroundSettings.map((item) => {
              const customBackground = backgrounds[item.slot];
              const saving = backgroundSaving === item.slot;
              return (
                <div className={styles.backgroundSettingRow} key={item.slot}>
                  <img src={customBackground ?? item.defaultImage} alt="" />
                  <span className={styles.backgroundSettingCopy}>
                    <strong>{item.label}</strong>
                    <small>{customBackground ? '自定义背景' : '默认背景'}</small>
                  </span>
                  <span className={styles.backgroundSettingActions}>
                    <label title={`替换${item.label}背景`} aria-disabled={saving}>
                      <UploadSimple aria-hidden="true" />
                      <span>{saving ? '处理中' : '替换'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label={`替换${item.label}背景`}
                        disabled={saving}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) void replaceBackground(item.slot, item.label, file);
                        }}
                      />
                    </label>
                    {customBackground ? (
                      <button
                        type="button"
                        title={`恢复${item.label}默认背景`}
                        aria-label={`恢复${item.label}默认背景`}
                        disabled={saving}
                        onClick={() => void restoreBackground(item.slot, item.label)}
                      >
                        <ArrowCounterClockwise aria-hidden="true" />
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
            {backgroundError ? <p className={styles.backgroundSettingError} role="alert">{backgroundError}</p> : null}
          </section>
        ) : null}
        {section === '主题设置' ? (
          <section className={`${styles.card} ${styles.themeOptions}`}>
            {['跟随系统', '浅色', '深色'].map((item) => <button key={item} type="button" data-active={theme === item ? 'true' : 'false'} onClick={() => setTheme(item)}>{item}{theme === item ? <Check /> : null}</button>)}
          </section>
        ) : null}
        {section === '偏好设置' ? (
          <section className={`${styles.card} ${styles.formCard}`}>
            <ToggleRow label="默认隐藏金额" checked={hideAmounts} onChange={setHideAmounts} />
            <ToggleRow label="保存后返回首页" checked={true} onChange={() => undefined} />
          </section>
        ) : null}
        {section === '关于我们' ? (
          <section className={`${styles.card} ${styles.aboutPanel}`}>
            <img src={profileArt} alt="" />
            <h2>海风小账本</h2>
            <p>版本 2.0.0</p>
            <dl><div><dt>数据存储</dt><dd>本地优先</dd></div><div><dt>同步状态</dt><dd>正常</dd></div></dl>
          </section>
        ) : null}
      </div>
      {editingAccountIndex !== null ? (
        <ReferenceSheet title={editingAccountIndex === -1 ? '添加账户' : '编辑账户'} onClose={closeAccountEditor}>
          <form onSubmit={saveAccount}>
            <label className={styles.sheetInputField}>
              <span>账户名称</span>
              <input
                autoFocus
                aria-label="账户名称"
                value={accountNameDraft}
                onChange={(event) => {
                  setAccountNameDraft(event.target.value);
                  setAccountEditError(null);
                }}
              />
            </label>
            <label className={styles.sheetInputField}>
              <span>账户种类</span>
              <select aria-label="账户种类" value={accountKindDraft} onChange={(event) => {
                const nextKind = event.target.value as ProfileAccount['kind'];
                setAccountKindDraft(nextKind);
                if (nextKind === 'credit_card') setAccountClassDraft('liability');
              }}>
                <option value="cash">现金</option><option value="wechat">微信</option><option value="alipay">支付宝</option>
                <option value="debit_card">银行卡</option><option value="credit_card">信用卡</option><option value="custom">其他</option>
              </select>
            </label>
            <label className={styles.sheetInputField}>
              <span>账户类型</span>
              <select aria-label="账户类型" value={accountKindDraft === 'credit_card' ? 'liability' : accountClassDraft} disabled={accountKindDraft === 'credit_card'} onChange={(event) => setAccountClassDraft(event.target.value as ProfileAccount['accountClass'])}>
                <option value="asset">资产账户</option><option value="liability">负债账户</option>
              </select>
            </label>
            <label className={styles.sheetInputField}>
              <span>{editingAccountIndex === -1 ? '初始余额' : '账户余额'}</span>
              <input
                aria-label="账户余额"
                inputMode="decimal"
                value={accountBalanceDraft}
                onChange={(event) => {
                  setAccountBalanceDraft(event.target.value);
                  setAccountEditError(null);
                }}
              />
            </label>
            {accountEditError ? <p className={styles.sheetFormError} role="alert">{accountEditError}</p> : null}
            <button type="submit" className={styles.sheetPrimaryButton} disabled={accountSaving}>{accountSaving ? '保存中...' : editingAccountIndex === -1 ? '创建账户' : '保存修改'}</button>
          </form>
        </ReferenceSheet>
      ) : null}
      {removingAccountIndex !== null ? (
        <ReferenceSheet title="账户管理确认" onClose={() => setRemovingAccountIndex(null)}>
          <div className={styles.logoutConfirmation}>
            <p>“{accounts[removingAccountIndex]?.name}”关联 {removingAccountUsage?.transactionCount ?? '…'} 笔流水。停用后历史流水保留，但不能再用于新记账。</p>
            <div className={styles.sheetFormActions}>
              <button type="button" onClick={() => setRemovingAccountIndex(null)}>取消</button>
              <button type="button" onClick={() => void onRemoveAccount(removingAccountIndex).then(() => {
                setRemovingAccountIndex(null); onFeedback('账户已停用，历史流水已保留', 'success');
              }).catch((caught) => onFeedback(caught instanceof Error ? caught.message : '账户停用失败', 'error'))}>停用账户</button>
              <button type="button" disabled={(removingAccountUsage?.transactionCount ?? 1) > 0} onClick={() => void onPermanentDeleteAccount(removingAccountIndex).then(() => {
                setRemovingAccountIndex(null); onFeedback('空账户已永久删除', 'success');
              }).catch((caught) => onFeedback(caught instanceof Error ? caught.message : '账户删除失败', 'error'))}>永久删除空账户</button>
            </div>
          </div>
        </ReferenceSheet>
      ) : null}
      {section !== '关于我们' && section !== '备份与恢复' && section !== '账户管理' && section !== '背景设置' ? (
        <button type="button" className={styles.subpageSaveButton} disabled={budgetSaving} onClick={() => void finish()}>{budgetSaving ? '保存中...' : '保存'}</button>
      ) : null}
    </div>
  );
}

export function ProfilePage({
  viewModel,
  backgrounds,
  onNavigate,
  onFeedback,
  onSignOut,
  onReplaceBackground,
  onRestoreBackground,
}: NavigateProps & {
  onSignOut(): Promise<void>;
  onReplaceBackground(slot: BackgroundSlot, file: File): Promise<void>;
  onRestoreBackground(slot: BackgroundSlot): Promise<void>;
}) {
  const [initialProfile] = useState(loadProfileTextPreferences);
  const [now] = useState(referenceNow);
  const useLiveAccounts = supportsLedgerQuery(viewModel, 'getAccounts');
  const useLiveBudget = supportsLedgerQuery(viewModel, 'getHomeSnapshot');
  const accountsQuery = useLedgerQuery(
    ledgerSubscription(viewModel),
    'reference-profile-accounts',
    () => useLiveAccounts ? viewModel.getAccounts() : Promise.resolve([]),
  );
  const budgetQuery = useLedgerQuery<HomeSnapshot>(
    ledgerSubscription(viewModel),
    `reference-profile-budget-${localDateInput(now)}`,
    () => useLiveBudget
      ? viewModel.getHomeSnapshot({ now })
      : Promise.resolve({
          totalAssetsCents: 0,
          todayExpenseCents: 0,
          monthIncomeCents: 0,
          monthExpenseCents: 151600,
          monthBalanceCents: 0,
          budget: { amountCents: 300000, usedCents: 151600, remainingCents: 148400 },
          quickCategories: [],
          recentTransactions: [],
        }),
  );
  const [activeSection, setActiveSection] = useState<ProfileSection | null>(null);
  const [ledgerName, setLedgerName] = useState(initialProfile.ledgerName);
  const [signature, setSignature] = useState(initialProfile.signature);
  const [avatar, setAvatar] = useState(profileArt);
  const [budgetAmount, setBudgetAmount] = useState(() => useLiveBudget ? '' : '3000.00');
  const [accounts, setAccounts] = useState<ProfileAccount[]>(() => (
    useLiveAccounts ? [] : loadProfileAccounts()
  ));
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('20:00');
  const [theme, setTheme] = useState('跟随系统');
  const [hideAmounts, setHideAmounts] = useState(() => localStorage.getItem('seabreeze-hide-amounts') === 'true');
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutPendingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadProfileAvatar().then((storedAvatar) => {
      if (active && storedAvatar) setAvatar(storedAvatar);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (useLiveAccounts && accountsQuery.status === 'ready') {
      setAccounts(accountsQuery.data.map((account) => ({
        id: account.id,
        sourceName: account.name,
        name: account.name,
        kind: account.kind,
        accountClass: account.accountClass,
        balanceCents: account.balanceCents,
        balanceEdited: false,
      })));
    }
  }, [accountsQuery, useLiveAccounts]);

  useEffect(() => {
    if (budgetQuery.status !== 'ready' || activeSection === '预算管理') return;
    const amountCents = budgetQuery.data.budget?.amountCents ?? 300000;
    setBudgetAmount(formatYuan(amountCents).replace('¥', ''));
  }, [activeSection, budgetQuery]);

  useEffect(() => {
    if (!useLiveAccounts) localStorage.setItem('seabreeze-profile-accounts', JSON.stringify(accounts));
  }, [accounts, useLiveAccounts]);

  async function saveProfileAccount(index: number, value: {
    name: string;
    balanceCents: number;
    kind: ProfileAccount['kind'];
    accountClass: ProfileAccount['accountClass'];
  }) {
    const account = accounts[index];
    if (!account) throw new Error('账户不存在');
    if (useLiveAccounts) {
      await viewModel.updateAccount({ id: account.id, ...value });
      return;
    }
    setAccounts((current) => current.map((item, accountIndex) => (
      accountIndex === index
        ? {
            ...item,
            sourceName: item.sourceName,
            name: value.name,
            kind: value.kind,
            accountClass: value.kind === 'credit_card' ? 'liability' : value.accountClass,
            balanceCents: value.balanceCents,
            balanceEdited: true,
          }
        : item
    )));
  }

  async function removeProfileAccount(index: number) {
    const account = accounts[index];
    if (!account) return;
    if (useLiveAccounts) {
      await viewModel.archiveAccount(account.id);
      return;
    }
    setAccounts((current) => current.filter((_, accountIndex) => accountIndex !== index));
  }

  async function addProfileAccount(value: {
    name: string;
    openingBalanceCents: number;
    kind: ProfileAccount['kind'];
    accountClass: ProfileAccount['accountClass'];
  }) {
    if (useLiveAccounts) {
      await viewModel.createAccount(value);
      return;
    }
    const accountId = `profile-account-${Date.now()}-${accounts.length + 1}`;
    setAccounts((current) => [...current, {
      id: accountId,
      sourceName: value.name,
      name: value.name,
      kind: value.kind,
      accountClass: value.kind === 'credit_card' ? 'liability' : value.accountClass,
      balanceCents: value.openingBalanceCents,
      balanceEdited: true,
    }]);
  }

  async function permanentlyDeleteProfileAccount(index: number) {
    const account = accounts[index];
    if (!account) return;
    if (useLiveAccounts) {
      await viewModel.deleteAccountPermanently(account.id);
      return;
    }
    setAccounts((current) => current.filter((_, accountIndex) => accountIndex !== index));
  }

  async function getProfileAccountUsage(index: number) {
    const account = accounts[index];
    if (!account) return { transactionCount: 0, balanceCents: 0 };
    if (useLiveAccounts) return viewModel.getAccountUsage(account.id);
    return { transactionCount: 0, balanceCents: account.balanceCents };
  }

  async function saveProfileBudget(amountCents: number) {
    if (useLiveBudget) {
      await viewModel.saveMonthlyBudget({ month: monthKey(now), amountCents });
    }
    setBudgetAmount(formatYuan(amountCents).replace('¥', ''));
  }

  function saveProfile() {
    const nextLedgerName = ledgerName.trim();
    const nextSignature = signature.trim();
    setLedgerName(nextLedgerName);
    setSignature(nextSignature);
    saveProfileTextPreferences({ ledgerName: nextLedgerName, signature: nextSignature });
  }

  async function replaceProfileAvatar(file: File) {
    setAvatar(await saveProfileAvatar(file));
  }

  async function restoreProfileAvatar() {
    await resetProfileAvatar();
    setAvatar(profileArt);
  }

  const profileBudgetUsedCents = budgetQuery.status === 'ready' ? budgetQuery.data.monthExpenseCents : 0;

  function selectSetting(label: ProfileSection) {
    setActiveSection(label);
  }

  function openSignOutConfirmation() {
    setSignOutError(null);
    setSignOutConfirmationOpen(true);
  }

  function closeSignOutConfirmation() {
    if (signOutPendingRef.current) return;
    setSignOutError(null);
    setSignOutConfirmationOpen(false);
  }

  async function confirmSignOut() {
    if (signOutPendingRef.current) return;
    signOutPendingRef.current = true;
    setSignOutPending(true);
    setSignOutError(null);
    try {
      await onSignOut();
      setSignOutConfirmationOpen(false);
    } catch {
      setSignOutError('退出登录失败，请检查网络后重试');
    } finally {
      signOutPendingRef.current = false;
      setSignOutPending(false);
    }
  }

  if (activeSection) {
    return (
      <PageFrame background={backgrounds.profileSubpage ?? profileSubpageBackground} className={styles.profilePage}>
        <ProfileSubpage
          section={activeSection}
          avatar={avatar}
          ledgerName={ledgerName}
          setLedgerName={setLedgerName}
          signature={signature}
          setSignature={setSignature}
          onReplaceAvatar={replaceProfileAvatar}
          onRestoreAvatar={restoreProfileAvatar}
          onSaveProfile={saveProfile}
          budgetAmount={budgetAmount}
          setBudgetAmount={setBudgetAmount}
          budgetUsedCents={profileBudgetUsedCents}
          onSaveBudget={saveProfileBudget}
          accounts={accounts}
          onSaveAccount={saveProfileAccount}
          onRemoveAccount={removeProfileAccount}
          onPermanentDeleteAccount={permanentlyDeleteProfileAccount}
          onGetAccountUsage={getProfileAccountUsage}
          onAddAccount={addProfileAccount}
          reminderEnabled={reminderEnabled}
          setReminderEnabled={setReminderEnabled}
          reminderTime={reminderTime}
          setReminderTime={setReminderTime}
          theme={theme}
          setTheme={setTheme}
          hideAmounts={hideAmounts}
          setHideAmounts={setHideAmounts}
          backgrounds={backgrounds}
          onReplaceBackground={onReplaceBackground}
          onRestoreBackground={onRestoreBackground}
          onBack={() => setActiveSection(null)}
          onFeedback={onFeedback}
        />
      </PageFrame>
    );
  }

  return (
    <PageFrame background={backgrounds.profile ?? profileBackground} className={styles.profilePage}>
      <button type="button" className={styles.profileIdentity} onClick={() => selectSetting('个人资料')}>
        <img src={avatar} alt="我的头像" data-custom={avatar !== profileArt ? 'true' : 'false'} />
        <span><strong>{ledgerName}</strong><small>{signature || '暂无个人签名'}</small></span>
        <CaretRight />
      </button>
      <div className={styles.settingsArea}>
        {profileGroups.map((group, groupIndex) => (
          <section className={`${styles.card} ${styles.settingsCard}`} key={groupIndex}>
            {group.map((item) => {
              return (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => selectSetting(item.label as ProfileSection)}
                >
                  <img src={item.icon} alt="" />
                  <strong>{item.label}</strong>
                  <span>{item.label === '账户管理' ? `${accounts.length}个账户` : item.detail}</span>
                  <CaretRight />
                </button>
              );
            })}
          </section>
        ))}
        <section className={`${styles.card} ${styles.logoutCard}`}>
          <button type="button" onClick={openSignOutConfirmation}>
            <SignOut aria-hidden="true" />
            <strong>退出登录</strong>
          </button>
        </section>
      </div>
      <BottomNavigation active="profile" onNavigate={onNavigate} />
      {signOutConfirmationOpen ? (
        <ReferenceSheet title="退出登录" onClose={closeSignOutConfirmation} dismissDisabled={signOutPending}>
          <div className={styles.logoutConfirmation}>
            <p>确定要退出当前账号吗？退出后需要重新登录。</p>
            {signOutError ? <p className={styles.sheetFormError} role="alert">{signOutError}</p> : null}
            <div className={styles.sheetFormActions}>
              <button type="button" disabled={signOutPending} onClick={closeSignOutConfirmation}>取消</button>
              <button type="button" disabled={signOutPending} onClick={() => void confirmSignOut()}>
                {signOutPending ? '正在退出...' : '确认退出'}
              </button>
            </div>
          </div>
        </ReferenceSheet>
      ) : null}
    </PageFrame>
  );
}
