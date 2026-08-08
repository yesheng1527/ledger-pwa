import type { LedgerReadSnapshot } from '../db/records';
import { calculateMetrics } from '../domain/metrics';
import { formatYuan } from '../domain/money';
import type { LedgerOperation } from '../domain/operations';
import { buildPosting } from '../domain/posting';
import { selectStatistics } from '../domain/statistics';
import { decodeTransactionText, encodeTransactionText } from '../domain/transaction-text';
import type {
  Account,
  Category,
  LedgerEntry,
  LedgerEntryRecord,
  Reminder,
  Transaction,
} from '../domain/types';
import type {
  EntryOptions,
  CreditCardProfile,
  HomeSnapshot,
  LedgerViewModelOptions,
  RecurringRule,
  ManagedAccount,
  StatisticsRange,
  StatisticsSnapshot,
  TransactionCreateInput,
  TransactionDateGroup,
  TransactionDetail,
  TransactionEditInput,
  TransactionFilters,
  TransactionListSnapshot,
  TransactionRowModel,
} from './types';

const CREDIT_RECURRENCE = /^credit-card:v1:billing=(\d{1,2});repayment=(\d{1,2})$/;
const RECURRING_RECURRENCE = /^recurring:v1:(expense|income):monthly:(\d{1,2})$/;

function assertReminderDay(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${label}必须是1至31日`);
  }
}

function nextMonthlyDate(now: Date, day: number): string {
  const makeDate = (year: number, month: number) => new Date(
    year,
    month,
    Math.min(day, new Date(year, month + 1, 0).getDate()),
    9, 0, 0, 0,
  );
  let candidate = makeDate(now.getFullYear(), now.getMonth());
  if (candidate.getTime() <= now.getTime()) candidate = makeDate(now.getFullYear(), now.getMonth() + 1);
  return candidate.toISOString();
}

function advanceMonthlyDate(value: string, day: number): string {
  const current = new Date(value);
  const targetMonth = current.getMonth() + 1;
  const next = new Date(
    current.getFullYear(),
    targetMonth,
    Math.min(day, new Date(current.getFullYear(), targetMonth + 1, 0).getDate()),
    9, 0, 0, 0,
  );
  return next.toISOString();
}

function recurringOccurrenceId(reminderId: string, nextDueAt: string): string {
  const source = `${reminderId}:${nextDueAt}`;
  let hex = '';
  for (let salt = 0; salt < 4; salt += 1) {
    let hash = 0x811c9dc5 ^ salt;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hex += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function localRanges(now: Date) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    start: monthStart.toISOString(),
    end: monthEnd.toISOString(),
    todayStart: todayStart.toISOString(),
    todayEnd: todayEnd.toISOString(),
  };
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localMonthKey(now: Date): string {
  return localDateKey(now.toISOString()).slice(0, 7);
}

function compareBySortOrderThenId(
  left: { sortOrder: number; id: string },
  right: { sortOrder: number; id: string },
): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

function compareTransactions(left: Transaction, right: Transaction): number {
  return right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id);
}

function scopeSnapshot(snapshot: LedgerReadSnapshot, ledgerId: string): LedgerReadSnapshot {
  const transactions = snapshot.transactions.filter((item) => item.ledgerId === ledgerId);
  const transactionIds = new Set(transactions.map((item) => item.id));
  return {
    ledgerId,
    accounts: snapshot.accounts.filter((item) => item.ledgerId === ledgerId),
    categories: snapshot.categories.filter((item) => item.ledgerId === ledgerId),
    transactions,
    entries: snapshot.entries.filter((item) => (
      item.ledgerId === ledgerId && transactionIds.has(item.transactionId)
    )),
    budgets: snapshot.budgets.filter((item) => item.ledgerId === ledgerId),
    categoryBudgets: snapshot.categoryBudgets.filter((item) => item.ledgerId === ledgerId),
    reminders: snapshot.reminders.filter((item) => item.ledgerId === ledgerId),
  };
}

function entriesByTransaction(entries: readonly LedgerEntryRecord[]) {
  const result = new Map<string, LedgerEntryRecord[]>();
  for (const entry of entries) {
    const transactionEntries = result.get(entry.transactionId) ?? [];
    transactionEntries.push(entry);
    result.set(entry.transactionId, transactionEntries);
  }
  return result;
}

function amountPresentation(
  transaction: Transaction,
  transactionEntries: readonly LedgerEntryRecord[],
): Pick<TransactionRowModel, 'amountCents' | 'amountLabel' | 'amountTone'> {
  if (transaction.type === 'expense') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `-${formatYuan(transaction.amountCents)}`,
      amountTone: 'expense',
    };
  }
  if (transaction.type === 'income') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `+${formatYuan(transaction.amountCents)}`,
      amountTone: 'income',
    };
  }
  if (transaction.type === 'refund') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: `+${formatYuan(transaction.amountCents)}`,
      amountTone: 'refund',
    };
  }
  if (transaction.type === 'transfer') {
    return {
      amountCents: transaction.amountCents,
      amountLabel: formatYuan(transaction.amountCents),
      amountTone: 'neutral',
    };
  }

  const signedAmount = transactionEntries[0]?.deltaCents ?? transaction.amountCents;
  return {
    amountCents: Math.abs(signedAmount),
    amountLabel: `${signedAmount >= 0 ? '+' : '-'}${formatYuan(Math.abs(signedAmount))}`,
    amountTone: 'adjustment',
  };
}

function fallbackTitle(transaction: Transaction, category: Category | undefined): string {
  if (category) return category.name;
  switch (transaction.type) {
    case 'expense': return '支出';
    case 'income': return '收入';
    case 'transfer': return '转账';
    case 'refund': return '退款';
    case 'adjustment': return '余额校准';
  }
}

function orderTransactionEntries(
  transaction: Transaction,
  transactionEntries: readonly LedgerEntryRecord[],
  accountMap: ReadonlyMap<string, Account>,
): readonly LedgerEntryRecord[] {
  if (transaction.type !== 'transfer') return transactionEntries;
  return [...transactionEntries].sort((left, right) => {
    const leftAccount = accountMap.get(left.accountId);
    const rightAccount = accountMap.get(right.accountId);
    const leftRank = left.deltaCents < 0 && leftAccount?.accountClass === 'asset' ? 0 : 1;
    const rightRank = right.deltaCents < 0 && rightAccount?.accountClass === 'asset' ? 0 : 1;
    return leftRank - rightRank;
  });
}

function toRow(
  transaction: Transaction,
  accountMap: ReadonlyMap<string, Account>,
  categoryMap: ReadonlyMap<string, Category>,
  transactionEntries: readonly LedgerEntryRecord[],
): TransactionRowModel {
  const orderedEntries = orderTransactionEntries(transaction, transactionEntries, accountMap);
  const category = transaction.categoryId
    ? categoryMap.get(transaction.categoryId)
    : undefined;
  const entryAccountNames = orderedEntries.map((entry) => (
    accountMap.get(entry.accountId)?.name ?? '未知账户'
  ));
  const date = new Date(transaction.occurredAt);
  const text = decodeTransactionText(transaction.id, transaction.note);
  return {
    id: transaction.id,
    type: transaction.type,
    title: text.name.trim() || fallbackTitle(transaction, category),
    categoryName: category?.name ?? null,
    categoryIconKey: category?.iconKey ?? transaction.type,
    occurredAt: transaction.occurredAt,
    timeLabel: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    accountLabel: transaction.type === 'transfer'
      ? entryAccountNames.join(' → ')
      : entryAccountNames.join('、'),
    ...amountPresentation(transaction, orderedEntries),
    version: transaction.version,
  };
}

function projectionContext(snapshot: LedgerReadSnapshot) {
  const accountMap = new Map(snapshot.accounts.map((item) => [item.id, item]));
  const categoryMap = new Map(snapshot.categories.map((item) => [item.id, item]));
  const entryMap = entriesByTransaction(snapshot.entries);
  return { accountMap, categoryMap, entryMap };
}

function activeTransactions(snapshot: LedgerReadSnapshot): Transaction[] {
  return snapshot.transactions
    .filter((item) => item.deletedAt === null)
    .sort(compareTransactions);
}

function optionLists(snapshot: LedgerReadSnapshot) {
  return {
    accounts: snapshot.accounts
      .filter((item) => item.archivedAt === null)
      .sort(compareBySortOrderThenId),
    categories: snapshot.categories
      .filter((item) => item.archivedAt === null)
      .sort(compareBySortOrderThenId),
  };
}

export class LedgerViewModel {
  readonly ledgerId: string;
  private readonly repository: LedgerViewModelOptions['repository'];
  private readonly saveOperation: LedgerViewModelOptions['saveOperation'];
  private readonly syncNow: LedgerViewModelOptions['syncNow'];
  private readonly now: LedgerViewModelOptions['now'];
  private readonly makeUuid: LedgerViewModelOptions['makeUuid'];
  private readonly listeners = new Map<() => void, number>();
  private subscriberCount = 0;
  private stopWatching: (() => void) | null = null;
  private disposed = false;

  constructor(options: LedgerViewModelOptions) {
    this.ledgerId = options.ledgerId;
    this.repository = options.repository;
    this.saveOperation = options.saveOperation;
    this.syncNow = options.syncNow;
    this.now = options.now;
    this.makeUuid = options.makeUuid;
  }

  private async readSnapshot(): Promise<LedgerReadSnapshot> {
    return scopeSnapshot(
      await this.repository.readLedgerSnapshot(this.ledgerId),
      this.ledgerId,
    );
  }

  private requireActiveTransaction(snapshot: LedgerReadSnapshot, id: string): Transaction {
    const transaction = snapshot.transactions.find((item) => (
      item.id === id && item.deletedAt === null
    ));
    if (!transaction) throw new Error('流水不存在或已删除');
    return transaction;
  }

  private requireActiveAccount(snapshot: LedgerReadSnapshot, id: string): Account {
    const account = snapshot.accounts.find((item) => (
      item.id === id
      && item.ledgerId === this.ledgerId
      && item.archivedAt === null
    ));
    if (!account) throw new Error('账户不存在或已归档');
    return account;
  }

  private accountInternalBalance(snapshot: LedgerReadSnapshot, account: Account): number {
    const activeTransactionIds = new Set(activeTransactions(snapshot).map((item) => item.id));
    return snapshot.entries.reduce((balance, entry) => (
      entry.accountId === account.id && activeTransactionIds.has(entry.transactionId)
        ? balance + entry.deltaCents
        : balance
    ), account.openingBalanceCents);
  }

  private accountPresentedBalance(snapshot: LedgerReadSnapshot, account: Account): number {
    const internalBalance = this.accountInternalBalance(snapshot, account);
    return account.accountClass === 'liability' ? -internalBalance : internalBalance;
  }

  private requireActiveCategory(
    snapshot: LedgerReadSnapshot,
    id: string,
    expectedKind: Category['kind'],
  ): Category {
    const category = snapshot.categories.find((item) => (
      item.id === id
      && item.ledgerId === this.ledgerId
      && item.archivedAt === null
      && item.kind === expectedKind
    ));
    if (!category) throw new Error('分类不存在、已归档或类型不匹配');
    return category;
  }

  private requireLedgerAccount(snapshot: LedgerReadSnapshot, id: string): Account {
    const account = snapshot.accounts.find((item) => (
      item.id === id && item.ledgerId === this.ledgerId
    ));
    if (!account) throw new Error('原支出账户不存在');
    return account;
  }

  private buildEditPosting(
    input: TransactionEditInput,
    snapshot: LedgerReadSnapshot,
    current: Transaction,
  ): LedgerEntry[] {
    switch (input.type) {
      case 'expense':
      case 'income': {
        const account = this.requireActiveAccount(snapshot, input.accountId);
        this.requireActiveCategory(snapshot, input.categoryId, input.type);
        return buildPosting({
          type: input.type,
          amountCents: input.amountCents,
          account,
        });
      }
      case 'transfer':
        return buildPosting({
          type: 'transfer',
          amountCents: input.amountCents,
          from: this.requireActiveAccount(snapshot, input.fromAccountId),
          to: this.requireActiveAccount(snapshot, input.toAccountId),
        });
      case 'refund': {
        const original = snapshot.transactions.find((item) => (
          item.id === current.originalTransactionId
          && item.type === 'expense'
          && item.deletedAt === null
        ));
        if (!original) throw new Error('原支出不存在');
        const originalEntries = snapshot.entries.filter((item) => (
          item.transactionId === original.id
        ));
        if (originalEntries.length !== 1) throw new Error('原支出分录无效');
        this.requireLedgerAccount(snapshot, originalEntries[0].accountId);
        const alreadyRefundedCents = snapshot.transactions
          .filter((item) => (
            item.id !== current.id
            && item.type === 'refund'
            && item.originalTransactionId === original.id
            && item.deletedAt === null
          ))
          .reduce((total, item) => total + item.amountCents, 0);
        return buildPosting({
          type: 'refund',
          amountCents: input.amountCents,
          originalExpenseAmountCents: original.amountCents,
          alreadyRefundedCents,
          originalEntry: originalEntries[0],
        });
      }
      case 'adjustment':
        return buildPosting({
          type: 'adjustment',
          account: this.requireActiveAccount(snapshot, input.accountId),
          deltaCents: input.deltaCents,
        });
    }
  }

  async getEntryOptions(): Promise<EntryOptions> {
    const snapshot = await this.readSnapshot();
    const options = optionLists(snapshot);
    const accountMap = new Map(snapshot.accounts.map((item) => [item.id, item]));
    const activeTransactionIds = new Set(activeTransactions(snapshot).map((transaction) => transaction.id));
    const accountBalances = new Map(options.accounts.map((account) => [account.id, account.openingBalanceCents]));
    for (const entry of snapshot.entries) {
      if (!activeTransactionIds.has(entry.transactionId) || !accountBalances.has(entry.accountId)) continue;
      accountBalances.set(entry.accountId, accountBalances.get(entry.accountId)! + entry.deltaCents);
    }
    const categoryMap = new Map(snapshot.categories.map((item) => [item.id, item]));
    const entryMap = entriesByTransaction(snapshot.entries);
    const refundedByOriginal = new Map<string, number>();

    for (const transaction of snapshot.transactions) {
      if (
        transaction.type !== 'refund'
        || transaction.deletedAt !== null
        || !transaction.originalTransactionId
      ) continue;
      refundedByOriginal.set(
        transaction.originalTransactionId,
        (refundedByOriginal.get(transaction.originalTransactionId) ?? 0)
          + transaction.amountCents,
      );
    }

    const refundableExpenses = activeTransactions(snapshot)
      .filter((transaction) => transaction.type === 'expense')
      .flatMap((transaction) => {
        const originalEntries = entryMap.get(transaction.id) ?? [];
        if (originalEntries.length !== 1) return [];
        const originalEntry = originalEntries[0];
        if (!accountMap.has(originalEntry.accountId)) return [];
        const remainingCents = transaction.amountCents
          - (refundedByOriginal.get(transaction.id) ?? 0);
        if (remainingCents <= 0) return [];
        const category = transaction.categoryId
          ? categoryMap.get(transaction.categoryId)
          : undefined;
        return [{
          id: transaction.id,
          title: decodeTransactionText(transaction.id, transaction.note).name.trim()
            || fallbackTitle(transaction, category),
          accountId: originalEntry.accountId,
          remainingCents,
          occurredAt: transaction.occurredAt,
        }];
      });

    return {
      accounts: options.accounts.map(({ id, name, accountClass }) => ({
        id,
        name,
        accountClass,
        balanceCents: accountClass === 'liability'
          ? -(accountBalances.get(id) ?? 0)
          : accountBalances.get(id) ?? 0,
      })),
      expenseCategories: options.categories
        .filter((category) => category.kind === 'expense')
        .map(({ id, name, iconKey }) => ({ id, name, iconKey })),
      incomeCategories: options.categories
        .filter((category) => category.kind === 'income')
        .map(({ id, name, iconKey }) => ({ id, name, iconKey })),
      refundableExpenses,
    };
  }

  async getAccounts(): Promise<ManagedAccount[]> {
    const snapshot = await this.readSnapshot();
    return optionLists(snapshot).accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: account.kind,
      accountClass: account.accountClass,
      balanceCents: this.accountPresentedBalance(snapshot, account),
      version: account.version,
    }));
  }

  async createAccount(input: {
    name: string;
    openingBalanceCents: number;
    kind?: Account['kind'];
    accountClass?: Account['accountClass'];
  }): Promise<{ accountId: string }> {
    const snapshot = await this.readSnapshot();
    const name = input.name.trim();
    if (!name) throw new Error('请输入账户名称');
    if (name.length > 30) throw new Error('账户名称不能超过30个字符');
    if (!Number.isSafeInteger(input.openingBalanceCents) || input.openingBalanceCents < 0) {
      throw new Error('初始余额必须是大于或等于0的有效金额');
    }
    const kind = input.kind ?? 'custom';
    const accountClass = kind === 'credit_card' ? 'liability' : input.accountClass ?? 'asset';
    if (snapshot.accounts.some((account) => (
      account.archivedAt === null
      && account.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))) {
      throw new Error('账户名称不能重复');
    }

    const accountId = this.makeUuid();
    const account: Account = {
      id: accountId,
      ledgerId: this.ledgerId,
      name,
      kind,
      accountClass,
      currency: 'CNY',
      openingBalanceCents: input.openingBalanceCents,
      sortOrder: snapshot.accounts.reduce((largest, item) => Math.max(largest, item.sortOrder), -1) + 1,
      version: 1,
      archivedAt: null,
    };
    await this.saveOperation({
      schemaVersion: 1,
      operationId: accountId,
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'account.create',
      account,
    });
    return { accountId };
  }

  async updateAccount(input: {
    id: string;
    name: string;
    balanceCents: number;
    kind?: Account['kind'];
    accountClass?: Account['accountClass'];
  }): Promise<void> {
    const snapshot = await this.readSnapshot();
    const current = this.requireActiveAccount(snapshot, input.id);
    const name = input.name.trim();
    if (!name) throw new Error('请输入账户名称');
    if (name.length > 30) throw new Error('账户名称不能超过30个字符');
    if (!Number.isSafeInteger(input.balanceCents)) throw new Error('账户余额无效');
    if (snapshot.accounts.some((account) => (
      account.id !== current.id
      && account.archivedAt === null
      && account.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))) {
      throw new Error('账户名称不能重复');
    }

    const kind = input.kind ?? current.kind;
    const accountClass = kind === 'credit_card'
      ? 'liability'
      : input.accountClass ?? current.accountClass;
    const currentInternalBalance = this.accountInternalBalance(snapshot, current);
    const desiredInternalBalance = accountClass === 'liability'
      ? -input.balanceCents
      : input.balanceCents;
    const account: Account = {
      ...current,
      name,
      kind,
      accountClass,
      version: current.version + 1,
    };
    await this.saveOperation({
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'account.update',
      accountId: current.id,
      baseVersion: current.version,
      account,
    });
    const deltaCents = desiredInternalBalance - currentInternalBalance;
    if (deltaCents !== 0) {
      await this.createTransaction({
        type: 'adjustment',
        deltaCents,
        accountId: current.id,
        occurredAt: this.now().toISOString(),
        name: '余额校准',
        note: '由账户管理发起',
      });
    }
  }

  async archiveAccount(id: string): Promise<void> {
    const snapshot = await this.readSnapshot();
    const current = this.requireActiveAccount(snapshot, id);
    const archivedAt = this.now().toISOString();
    await this.saveOperation({
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt: archivedAt,
      kind: 'account.archive',
      accountId: current.id,
      baseVersion: current.version,
      archivedAt,
    });
  }

  async createCategory(input: {
    name: string;
    kind: Category['kind'];
    iconKey: string;
  }): Promise<{ categoryId: string }> {
    const snapshot = await this.readSnapshot();
    const name = input.name.trim();
    const iconKey = input.iconKey.trim();
    if (!name) throw new Error('请输入类目名称');
    if (name.length > 30) throw new Error('类目名称不能超过30个字符');
    if (!iconKey || iconKey.length > 50) throw new Error('类目图标无效');
    if (snapshot.categories.some((category) => (
      category.archivedAt === null
      && category.kind === input.kind
      && category.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))) {
      throw new Error('同类型下的类目名称不能重复');
    }

    const categoryId = this.makeUuid();
    const category: Category = {
      id: categoryId,
      ledgerId: this.ledgerId,
      name,
      kind: input.kind,
      iconKey,
      sortOrder: snapshot.categories
        .filter((item) => item.kind === input.kind)
        .reduce((largest, item) => Math.max(largest, item.sortOrder), -1) + 1,
      version: 1,
      archivedAt: null,
    };
    await this.saveOperation({
      schemaVersion: 1,
      operationId: categoryId,
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'category.create',
      category,
    });
    return { categoryId };
  }

  async updateCategory(input: {
    id: string;
    name: string;
    iconKey: string;
  }): Promise<void> {
    const snapshot = await this.readSnapshot();
    const current = snapshot.categories.find((category) => (
      category.id === input.id && category.archivedAt === null
    ));
    if (!current) throw new Error('类目不存在或已归档');
    const name = input.name.trim();
    const iconKey = input.iconKey.trim();
    if (!name) throw new Error('请输入类目名称');
    if (name.length > 30) throw new Error('类目名称不能超过30个字符');
    if (!iconKey || iconKey.length > 50) throw new Error('类目图标无效');
    if (snapshot.categories.some((category) => (
      category.id !== current.id
      && category.archivedAt === null
      && category.kind === current.kind
      && category.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ))) {
      throw new Error('同类型下的类目名称不能重复');
    }

    await this.saveOperation({
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'category.update',
      categoryId: current.id,
      baseVersion: current.version,
      category: {
        ...current,
        name,
        iconKey,
        version: current.version + 1,
      },
    });
  }

  async saveMonthlyBudget(input: { month: string; amountCents: number }): Promise<void> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('预算月份无效');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('本月预算必须大于0');
    }

    const snapshot = await this.readSnapshot();
    const current = snapshot.budgets.find((budget) => (
      budget.month === input.month && budget.archivedAt === null
    ));
    const createdAt = this.now().toISOString();

    if (current) {
      await this.saveOperation({
        schemaVersion: 1,
        operationId: this.makeUuid(),
        ledgerId: this.ledgerId,
        createdAt,
        kind: 'budget.update',
        budgetId: current.id,
        baseVersion: current.version,
        budget: {
          ...current,
          amountCents: input.amountCents,
          version: current.version + 1,
        },
      });
      return;
    }

    const budgetId = this.makeUuid();
    await this.saveOperation({
      schemaVersion: 1,
      operationId: budgetId,
      ledgerId: this.ledgerId,
      createdAt,
      kind: 'budget.create',
      budget: {
        id: budgetId,
        ledgerId: this.ledgerId,
        month: input.month,
        amountCents: input.amountCents,
        version: 1,
        archivedAt: null,
      },
    });
  }

  async getCreditCardProfiles(): Promise<CreditCardProfile[]> {
    const snapshot = await this.readSnapshot();
    return snapshot.accounts
      .filter((account) => account.archivedAt === null && account.kind === 'credit_card')
      .map((account) => {
        const reminder = snapshot.reminders.find((item) => (
          item.archivedAt === null
          && item.accountId === account.id
          && CREDIT_RECURRENCE.test(item.recurrence)
        ));
        const match = reminder ? CREDIT_RECURRENCE.exec(reminder.recurrence) : null;
        const billingDay = match ? Number(match[1]) : 1;
        const repaymentDay = match ? Number(match[2]) : 10;
        return {
          reminderId: reminder?.id ?? null,
          accountId: account.id,
          accountName: account.name,
          creditLimitCents: reminder?.amountCents ?? 0,
          billingDay,
          repaymentDay,
          dueCents: Math.max(0, -this.accountPresentedBalance(snapshot, account)),
          nextRepaymentAt: reminder?.nextDueAt ?? nextMonthlyDate(this.now(), repaymentDay),
        };
      });
  }

  async saveCreditCardProfile(input: {
    accountId: string;
    creditLimitCents: number;
    billingDay: number;
    repaymentDay: number;
  }): Promise<void> {
    if (!Number.isSafeInteger(input.creditLimitCents) || input.creditLimitCents <= 0) {
      throw new Error('信用额度必须大于0');
    }
    assertReminderDay(input.billingDay, '账单日');
    assertReminderDay(input.repaymentDay, '还款日');
    const snapshot = await this.readSnapshot();
    const account = this.requireActiveAccount(snapshot, input.accountId);
    if (account.kind !== 'credit_card' || account.accountClass !== 'liability') {
      throw new Error('只有信用卡负债账户可以设置账单信息');
    }
    const current = snapshot.reminders.find((item) => (
      item.archivedAt === null
      && item.accountId === account.id
      && CREDIT_RECURRENCE.test(item.recurrence)
    ));
    const createdAt = this.now().toISOString();
    const reminder: Reminder = {
      id: current?.id ?? this.makeUuid(),
      ledgerId: this.ledgerId,
      name: `${account.name}还款提醒`,
      amountCents: input.creditLimitCents,
      categoryId: null,
      accountId: account.id,
      recurrence: `credit-card:v1:billing=${input.billingDay};repayment=${input.repaymentDay}`,
      nextDueAt: nextMonthlyDate(this.now(), input.repaymentDay),
      version: current ? current.version + 1 : 1,
      archivedAt: null,
    };
    await this.saveOperation(current ? {
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt,
      kind: 'reminder.update',
      reminderId: current.id,
      baseVersion: current.version,
      reminder,
    } : {
      schemaVersion: 1,
      operationId: reminder.id,
      ledgerId: this.ledgerId,
      createdAt,
      kind: 'reminder.create',
      reminder,
    });
  }

  async getRecurringRules(now = this.now()): Promise<RecurringRule[]> {
    const snapshot = await this.readSnapshot();
    return snapshot.reminders.flatMap((reminder) => {
      if (reminder.archivedAt !== null || !reminder.accountId || !reminder.categoryId || reminder.amountCents === null) return [];
      const match = RECURRING_RECURRENCE.exec(reminder.recurrence);
      if (!match) return [];
      return [{
        id: reminder.id,
        name: reminder.name,
        type: match[1] as 'expense' | 'income',
        amountCents: reminder.amountCents,
        accountId: reminder.accountId,
        categoryId: reminder.categoryId,
        dayOfMonth: Number(match[2]),
        nextDueAt: reminder.nextDueAt,
        pending: Date.parse(reminder.nextDueAt) <= now.getTime(),
      }];
    });
  }

  async saveRecurringRule(input: {
    id?: string;
    name: string;
    type: 'expense' | 'income';
    amountCents: number;
    accountId: string;
    categoryId: string;
    dayOfMonth: number;
  }): Promise<{ reminderId: string }> {
    const name = input.name.trim();
    if (!name) throw new Error('请输入周期账单名称');
    if (name.length > 50) throw new Error('周期账单名称不能超过50个字符');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('周期金额必须大于0');
    assertReminderDay(input.dayOfMonth, '生成日');
    const snapshot = await this.readSnapshot();
    const account = this.requireActiveAccount(snapshot, input.accountId);
    if (input.type === 'income' && account.accountClass !== 'asset') throw new Error('周期收入只能存入资产账户');
    this.requireActiveCategory(snapshot, input.categoryId, input.type);
    const current = input.id
      ? snapshot.reminders.find((item) => item.id === input.id && item.archivedAt === null)
      : undefined;
    if (input.id && (!current || !RECURRING_RECURRENCE.test(current.recurrence))) throw new Error('周期账单不存在');
    const reminder: Reminder = {
      id: current?.id ?? this.makeUuid(),
      ledgerId: this.ledgerId,
      name,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      accountId: input.accountId,
      recurrence: `recurring:v1:${input.type}:monthly:${input.dayOfMonth}`,
      nextDueAt: current?.nextDueAt ?? nextMonthlyDate(this.now(), input.dayOfMonth),
      version: current ? current.version + 1 : 1,
      archivedAt: null,
    };
    const createdAt = this.now().toISOString();
    await this.saveOperation(current ? {
      schemaVersion: 1, operationId: this.makeUuid(), ledgerId: this.ledgerId, createdAt,
      kind: 'reminder.update', reminderId: current.id, baseVersion: current.version, reminder,
    } : {
      schemaVersion: 1, operationId: reminder.id, ledgerId: this.ledgerId, createdAt,
      kind: 'reminder.create', reminder,
    });
    return { reminderId: reminder.id };
  }

  async confirmRecurringRule(id: string): Promise<{ transactionId: string }> {
    const snapshot = await this.readSnapshot();
    const reminder = snapshot.reminders.find((item) => item.id === id && item.archivedAt === null);
    const match = reminder ? RECURRING_RECURRENCE.exec(reminder.recurrence) : null;
    if (!reminder || !match || !reminder.accountId || !reminder.categoryId || reminder.amountCents === null) {
      throw new Error('周期账单不存在');
    }
    if (Date.parse(reminder.nextDueAt) > this.now().getTime()) throw new Error('周期账单尚未到确认日期');
    const type = match[1] as 'expense' | 'income';
    const result = await this.createTransaction({
      type,
      operationId: recurringOccurrenceId(reminder.id, reminder.nextDueAt),
      amountCents: reminder.amountCents,
      accountId: reminder.accountId,
      categoryId: reminder.categoryId,
      occurredAt: this.now().toISOString(),
      name: reminder.name,
      note: '由周期账单确认生成',
    });
    const updated: Reminder = {
      ...reminder,
      nextDueAt: advanceMonthlyDate(reminder.nextDueAt, Number(match[2])),
      version: reminder.version + 1,
    };
    await this.saveOperation({
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'reminder.update',
      reminderId: reminder.id,
      baseVersion: reminder.version,
      reminder: updated,
    });
    return result;
  }

  async skipRecurringRule(id: string): Promise<void> {
    const snapshot = await this.readSnapshot();
    const reminder = snapshot.reminders.find((item) => item.id === id && item.archivedAt === null);
    const match = reminder ? RECURRING_RECURRENCE.exec(reminder.recurrence) : null;
    if (!reminder || !match) throw new Error('周期账单不存在');
    if (Date.parse(reminder.nextDueAt) > this.now().getTime()) throw new Error('周期账单尚未到确认日期');
    const updated = {
      ...reminder,
      nextDueAt: advanceMonthlyDate(reminder.nextDueAt, Number(match[2])),
      version: reminder.version + 1,
    };
    await this.saveOperation({
      schemaVersion: 1, operationId: this.makeUuid(), ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(), kind: 'reminder.update',
      reminderId: reminder.id, baseVersion: reminder.version, reminder: updated,
    });
  }

  async archiveRecurringRule(id: string): Promise<void> {
    const snapshot = await this.readSnapshot();
    const reminder = snapshot.reminders.find((item) => item.id === id && item.archivedAt === null);
    if (!reminder || !RECURRING_RECURRENCE.test(reminder.recurrence)) throw new Error('周期账单不存在');
    await this.saveOperation({
      schemaVersion: 1, operationId: this.makeUuid(), ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(), kind: 'reminder.archive',
      reminderId: reminder.id, baseVersion: reminder.version, archivedAt: this.now().toISOString(),
    });
  }

  async createTransaction(
    input: TransactionCreateInput,
  ): Promise<{ transactionId: string }> {
    const snapshot = await this.readSnapshot();
    if (input.operationId) {
      const existing = snapshot.transactions.find((item) => (
        item.id === input.operationId && item.operationId === input.operationId
      ));
      if (existing) return { transactionId: existing.id };
    }
    let entries: LedgerEntry[];
    let categoryId: string | null = null;
    let originalTransactionId: string | null = null;

    switch (input.type) {
      case 'expense':
      case 'income': {
        const account = this.requireActiveAccount(snapshot, input.accountId);
        this.requireActiveCategory(snapshot, input.categoryId, input.type);
        entries = buildPosting({
          type: input.type,
          amountCents: input.amountCents,
          account,
        });
        categoryId = input.categoryId;
        break;
      }
      case 'transfer': {
        const from = this.requireActiveAccount(snapshot, input.fromAccountId);
        const to = this.requireActiveAccount(snapshot, input.toAccountId);
        if (from.id === to.id) throw new Error('转出和转入账户不能相同');
        if (from.accountClass !== 'asset') throw new Error('转出账户必须是资产账户');
        const availableCents = this.accountPresentedBalance(snapshot, from);
        if (input.amountCents > availableCents) {
          throw new Error('转出金额不能超过账户可用余额');
        }
        entries = buildPosting({
          type: 'transfer',
          amountCents: input.amountCents,
          from,
          to,
        });
        break;
      }
      case 'refund': {
        const original = snapshot.transactions.find((transaction) => (
          transaction.id === input.originalTransactionId
          && transaction.type === 'expense'
          && transaction.deletedAt === null
        ));
        if (!original) throw new Error('原支出不存在');
        const originalEntries = snapshot.entries.filter((entry) => (
          entry.transactionId === original.id
        ));
        if (originalEntries.length !== 1) throw new Error('原支出分录无效');
        this.requireLedgerAccount(snapshot, originalEntries[0].accountId);
        const alreadyRefundedCents = snapshot.transactions
          .filter((transaction) => (
            transaction.type === 'refund'
            && transaction.originalTransactionId === original.id
            && transaction.deletedAt === null
          ))
          .reduce((total, transaction) => total + transaction.amountCents, 0);
        entries = buildPosting({
          type: 'refund',
          amountCents: input.amountCents,
          originalExpenseAmountCents: original.amountCents,
          alreadyRefundedCents,
          originalEntry: originalEntries[0],
        });
        categoryId = original.categoryId;
        originalTransactionId = original.id;
        break;
      }
      case 'adjustment':
        entries = buildPosting({
          type: 'adjustment',
          account: this.requireActiveAccount(snapshot, input.accountId),
          deltaCents: input.deltaCents,
        });
        break;
    }

    const operationId = input.operationId ?? this.makeUuid();
    const amountCents = input.type === 'adjustment'
      ? Math.abs(input.deltaCents)
      : input.amountCents;
    const transaction: Transaction = {
      id: operationId,
      operationId,
      ledgerId: this.ledgerId,
      type: input.type,
      amountCents,
      categoryId,
      occurredAt: input.occurredAt,
      note: input.name === undefined
        ? input.note.trim()
        : encodeTransactionText(operationId, input.name, input.note),
      originalTransactionId,
      version: 1,
      deletedAt: null,
    };
    await this.saveOperation({
      schemaVersion: 1,
      operationId,
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'transaction.create',
      transaction,
      entries,
    });
    return { transactionId: transaction.id };
  }

  async updateTransaction(input: TransactionEditInput): Promise<void> {
    const snapshot = await this.readSnapshot();
    const current = this.requireActiveTransaction(snapshot, input.id);
    if (current.version !== input.baseVersion) {
      throw new Error('流水已更新，请刷新后重试');
    }
    if (current.type !== input.type) throw new Error('流水类型不能修改');

    const entries = this.buildEditPosting(input, snapshot, current);
    const operationId = this.makeUuid();
    const updatedTransaction: Transaction = {
      ...current,
      operationId,
      amountCents: input.type === 'adjustment'
        ? Math.abs(input.deltaCents)
        : input.amountCents,
      categoryId: input.type === 'expense' || input.type === 'income'
        ? input.categoryId
        : current.categoryId,
      occurredAt: input.occurredAt,
      note: input.name === undefined
        ? input.note.trim()
        : encodeTransactionText(current.id, input.name, input.note),
      version: input.baseVersion + 1,
      deletedAt: null,
    };
    const operation: LedgerOperation = {
      schemaVersion: 1,
      operationId,
      ledgerId: this.ledgerId,
      createdAt: this.now().toISOString(),
      kind: 'transaction.update',
      transactionId: current.id,
      baseVersion: input.baseVersion,
      transaction: updatedTransaction,
      entries,
    };
    await this.saveOperation(operation);
  }

  async duplicateTransaction(id: string): Promise<{ transactionId: string }> {
    const detail = await this.getTransactionDetail(id);
    if (!detail) throw new Error('流水不存在或已删除');
    const common = {
      occurredAt: this.now().toISOString(),
      name: detail.title,
      note: detail.note,
    };
    if (detail.type === 'expense' || detail.type === 'income') {
      const entry = detail.entries[0];
      if (!entry || !detail.categoryId) throw new Error('流水分录不完整');
      return this.createTransaction({
        ...common,
        type: detail.type,
        amountCents: detail.amountCents,
        accountId: entry.accountId,
        categoryId: detail.categoryId,
      });
    }
    if (detail.type === 'transfer') {
      if (detail.entries.length !== 2) throw new Error('转账分录不完整');
      return this.createTransaction({
        ...common,
        type: 'transfer',
        amountCents: detail.amountCents,
        fromAccountId: detail.entries[0].accountId,
        toAccountId: detail.entries[1].accountId,
      });
    }
    if (detail.type === 'refund') {
      if (!detail.originalTransactionId) throw new Error('退款原流水不存在');
      return this.createTransaction({
        ...common,
        type: 'refund',
        amountCents: detail.amountCents,
        originalTransactionId: detail.originalTransactionId,
      });
    }
    const entry = detail.entries[0];
    if (!entry) throw new Error('余额校准分录不完整');
    return this.createTransaction({
      ...common,
      type: 'adjustment',
      deltaCents: entry.deltaCents,
      accountId: entry.accountId,
    });
  }

  async getAccountUsage(id: string): Promise<{ transactionCount: number; balanceCents: number }> {
    const snapshot = await this.readSnapshot();
    const account = this.requireActiveAccount(snapshot, id);
    const transactionIds = new Set(
      snapshot.entries.filter((entry) => entry.accountId === id).map((entry) => entry.transactionId),
    );
    return {
      transactionCount: transactionIds.size,
      balanceCents: this.accountPresentedBalance(snapshot, account),
    };
  }

  async deleteAccountPermanently(id: string): Promise<void> {
    const usage = await this.getAccountUsage(id);
    if (usage.transactionCount > 0) {
      throw new Error(`该账户关联 ${usage.transactionCount} 笔流水，不能永久删除；请停用账户以保留记录`);
    }
    await this.archiveAccount(id);
  }

  async deleteTransaction(id: string): Promise<{ undoUntil: string }> {
    const snapshot = await this.readSnapshot();
    const current = this.requireActiveTransaction(snapshot, id);
    const deletedAt = this.now();
    await this.saveOperation({
      schemaVersion: 1,
      operationId: this.makeUuid(),
      ledgerId: this.ledgerId,
      createdAt: deletedAt.toISOString(),
      kind: 'transaction.delete',
      transactionId: current.id,
      baseVersion: current.version,
      deletedAt: deletedAt.toISOString(),
    });
    return { undoUntil: new Date(deletedAt.getTime() + 8_000).toISOString() };
  }

  async undoTransactionDelete(id: string): Promise<void> {
    await this.repository.undoTransactionDelete(id, this.now().toISOString());
  }

  async flushPendingDelete(): Promise<void> {
    await this.syncNow();
  }

  async getHomeSnapshot(input: { now?: Date } = {}): Promise<HomeSnapshot> {
    const now = input.now ?? this.now();
    const snapshot = await this.readSnapshot();
    const metrics = calculateMetrics(
      snapshot.accounts,
      snapshot.entries,
      snapshot.transactions,
      localRanges(now),
    );
    const month = localMonthKey(now);
    const activeBudget = snapshot.budgets.find((item) => (
      item.month === month && item.archivedAt === null
    ));
    const preferredIcons = ['food', 'transport', 'shopping', 'entertainment'];
    const quickCategories = snapshot.categories
      .filter((item) => item.kind === 'expense' && item.archivedAt === null)
      .sort((left, right) => {
        const leftPreference = preferredIcons.indexOf(left.iconKey);
        const rightPreference = preferredIcons.indexOf(right.iconKey);
        const leftRank = leftPreference === -1 ? preferredIcons.length : leftPreference;
        const rightRank = rightPreference === -1 ? preferredIcons.length : rightPreference;
        return leftRank - rightRank || compareBySortOrderThenId(left, right);
      })
      .slice(0, 4)
      .map(({ id, name, iconKey }) => ({ id, name, iconKey }));
    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const recentTransactions = activeTransactions(snapshot)
      .slice(0, 5)
      .map((transaction) => toRow(
        transaction,
        accountMap,
        categoryMap,
        entryMap.get(transaction.id) ?? [],
      ));

    return {
      totalAssetsCents: metrics.netWorthCents,
      todayExpenseCents: metrics.todayExpenseCents,
      monthIncomeCents: metrics.periodIncomeCents,
      monthExpenseCents: metrics.periodNetExpenseCents,
      monthBalanceCents: metrics.periodBalanceCents,
      budget: activeBudget
        ? {
            amountCents: activeBudget.amountCents,
            usedCents: metrics.periodNetExpenseCents,
            remainingCents: activeBudget.amountCents - metrics.periodNetExpenseCents,
          }
        : null,
      quickCategories,
      recentTransactions,
    };
  }

  async getStatistics(range: StatisticsRange): Promise<StatisticsSnapshot> {
    return selectStatistics(await this.readSnapshot(), range);
  }

  async getTransactions(filters: TransactionFilters): Promise<TransactionListSnapshot> {
    const snapshot = await this.readSnapshot();
    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const query = filters.query.trim().toLocaleLowerCase();
    const dateMatchesMonth = filters.date === null || filters.date.slice(0, 7) === filters.month;
    const filteredTransactions = dateMatchesMonth
      ? activeTransactions(snapshot).filter((transaction) => {
          if (localDateKey(transaction.occurredAt).slice(0, 7) !== filters.month) return false;
          if (filters.date !== null && localDateKey(transaction.occurredAt) !== filters.date) return false;
          if (filters.categoryId !== null && transaction.categoryId !== filters.categoryId) return false;
          const transactionEntries = entryMap.get(transaction.id) ?? [];
          if (
            filters.accountId !== null
            && !transactionEntries.some((entry) => entry.accountId === filters.accountId)
          ) return false;
          if (query.length === 0) return true;
          const categoryName = transaction.categoryId
            ? categoryMap.get(transaction.categoryId)?.name ?? ''
            : '';
          const accountNames = transactionEntries.map((entry) => (
            accountMap.get(entry.accountId)?.name ?? ''
          ));
          const text = decodeTransactionText(transaction.id, transaction.note);
          return [text.name, text.note, categoryName, ...accountNames]
            .some((value) => value.toLocaleLowerCase().includes(query));
        })
      : [];

    const groups = new Map<string, TransactionDateGroup>();
    for (const transaction of filteredTransactions) {
      const dateKey = localDateKey(transaction.occurredAt);
      const date = new Date(transaction.occurredAt);
      const group = groups.get(dateKey) ?? {
        dateKey,
        dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
        expenseCents: 0,
        incomeCents: 0,
        rows: [],
      };
      if (transaction.type === 'expense') group.expenseCents += transaction.amountCents;
      else if (transaction.type === 'refund') group.expenseCents -= transaction.amountCents;
      else if (transaction.type === 'income') group.incomeCents += transaction.amountCents;
      group.rows.push(toRow(
        transaction,
        accountMap,
        categoryMap,
        entryMap.get(transaction.id) ?? [],
      ));
      groups.set(dateKey, group);
    }

    const options = optionLists(snapshot);
    return {
      groups: [...groups.values()],
      accounts: options.accounts.map(({ id, name }) => ({ id, name })),
      categories: options.categories.map(({ id, name, iconKey }) => ({ id, name, iconKey })),
    };
  }

  async getTransactionDetail(id: string): Promise<TransactionDetail | null> {
    const snapshot = await this.readSnapshot();
    const transaction = snapshot.transactions.find((item) => (
      item.id === id && item.deletedAt === null
    ));
    if (!transaction) return null;

    const { accountMap, categoryMap, entryMap } = projectionContext(snapshot);
    const transactionEntries = orderTransactionEntries(
      transaction,
      entryMap.get(transaction.id) ?? [],
      accountMap,
    );
    const originalTransaction = transaction.originalTransactionId
      ? snapshot.transactions.find((item) => item.id === transaction.originalTransactionId)
      : undefined;
    const originalCategory = originalTransaction?.categoryId
      ? categoryMap.get(originalTransaction.categoryId)
      : undefined;
    const options = optionLists(snapshot);
    const text = decodeTransactionText(transaction.id, transaction.note);
    return {
      ...toRow(transaction, accountMap, categoryMap, transactionEntries),
      ledgerId: transaction.ledgerId,
      categoryId: transaction.categoryId,
      note: text.note,
      originalTransactionId: transaction.originalTransactionId,
      originalTransactionTitle: originalTransaction
        ? decodeTransactionText(originalTransaction.id, originalTransaction.note).name.trim()
          || fallbackTitle(originalTransaction, originalCategory)
        : null,
      entries: transactionEntries.map((entry) => ({
        accountId: entry.accountId,
        accountName: accountMap.get(entry.accountId)?.name ?? '未知账户',
        deltaCents: entry.deltaCents,
      })),
      accountOptions: options.accounts.map(({ id: accountId, name, accountClass }) => ({
        id: accountId,
        name,
        accountClass,
      })),
      categoryOptions: options.categories.map(({ id: categoryId, name, kind }) => ({
        id: categoryId,
        name,
        kind,
      })),
    };
  }

  subscribe(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.set(listener, (this.listeners.get(listener) ?? 0) + 1);
    this.subscriberCount += 1;
    if (this.subscriberCount === 1) {
      this.stopWatching = this.repository.watchLedger(this.ledgerId, () => {
        [...this.listeners.keys()].forEach((currentListener) => currentListener());
      });
    }
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const listenerReferences = this.listeners.get(listener) ?? 0;
      if (listenerReferences <= 1) this.listeners.delete(listener);
      else this.listeners.set(listener, listenerReferences - 1);
      this.subscriberCount -= 1;
      if (this.subscriberCount === 0) {
        this.stopWatching?.();
        this.stopWatching = null;
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWatching?.();
    this.stopWatching = null;
    this.subscriberCount = 0;
    this.listeners.clear();
  }
}

export type {
  CreditCardProfile,
  EntryOptions,
  HomeSnapshot,
  LedgerViewModelOptions,
  StatisticsRange,
  StatisticsSnapshot,
  TransactionCreateInput,
  TransactionDetail,
  TransactionEditInput,
  TransactionFilters,
  TransactionListSnapshot,
  TransactionRowModel,
} from './types';
