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
  Transaction,
} from '../domain/types';
import type {
  EntryOptions,
  HomeSnapshot,
  LedgerViewModelOptions,
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
  }): Promise<{ accountId: string }> {
    const snapshot = await this.readSnapshot();
    const name = input.name.trim();
    if (!name) throw new Error('请输入账户名称');
    if (name.length > 30) throw new Error('账户名称不能超过30个字符');
    if (!Number.isSafeInteger(input.openingBalanceCents)) throw new Error('账户余额无效');
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
      kind: 'custom',
      accountClass: 'asset',
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

    const currentInternalBalance = this.accountInternalBalance(snapshot, current);
    const desiredInternalBalance = current.accountClass === 'liability'
      ? -input.balanceCents
      : input.balanceCents;
    const account: Account = {
      ...current,
      name,
      openingBalanceCents: current.openingBalanceCents
        + desiredInternalBalance
        - currentInternalBalance,
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
  }

  async archiveAccount(id: string): Promise<void> {
    const snapshot = await this.readSnapshot();
    const current = this.requireActiveAccount(snapshot, id);
    if (this.accountPresentedBalance(snapshot, current) !== 0) {
      throw new Error('请先将账户余额调整为0再移除');
    }
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

  async createTransaction(
    input: TransactionCreateInput,
  ): Promise<{ transactionId: string }> {
    const snapshot = await this.readSnapshot();
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
      case 'transfer':
        entries = buildPosting({
          type: 'transfer',
          amountCents: input.amountCents,
          from: this.requireActiveAccount(snapshot, input.fromAccountId),
          to: this.requireActiveAccount(snapshot, input.toAccountId),
        });
        break;
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

    const operationId = this.makeUuid();
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
