import { buildPosting } from '../domain/posting';
import { validateOperation, type LedgerOperation } from '../domain/operations';
import type { LedgerEntry, LedgerEntryRecord, Transaction } from '../domain/types';
import type { LocalLedgerSnapshot, OutboxRecord, ServerChange } from './records';
import { LedgerDatabase } from './local-db';

type TransactionWriteOperation = Extract<
  LedgerOperation,
  { kind: 'transaction.create' | 'transaction.update' }
>;

function postingsMatch(actual: readonly LedgerEntry[], expected: readonly LedgerEntry[]): boolean {
  return actual.length === expected.length && actual.every((entry, index) => (
    entry.accountId === expected[index]?.accountId && entry.deltaCents === expected[index]?.deltaCents
  ));
}

function assertBaseVersion(currentVersion: number, baseVersion: number): void {
  if (currentVersion !== baseVersion) {
    throw new Error('本机数据版本已变化，请刷新后重试');
  }
}

function operationEntityId(operation: LedgerOperation): string {
  if ('transaction' in operation) return operation.transaction.id;
  if ('transactionId' in operation) return operation.transactionId;
  if ('account' in operation) return operation.account.id;
  if ('accountId' in operation) return operation.accountId;
  if ('category' in operation) return operation.category.id;
  if ('categoryId' in operation) return operation.categoryId;
  if ('budget' in operation) return operation.budget.id;
  if ('budgetId' in operation) return operation.budgetId;
  if ('categoryBudget' in operation) return operation.categoryBudget.id;
  if ('categoryBudgetId' in operation) return operation.categoryBudgetId;
  if ('reminder' in operation) return operation.reminder.id;
  return operation.reminderId;
}

export class LocalLedgerRepository {
  constructor(private readonly db: LedgerDatabase) {}

  private async expectedPosting(operation: TransactionWriteOperation): Promise<LedgerEntry[]> {
    const { transaction, entries } = operation;
    if (transaction.type === 'expense' || transaction.type === 'income') {
      if (entries.length !== 1) throw new Error('分录与账务类型不一致');
      const account = await this.db.accounts.get(entries[0].accountId);
      if (!account || account.ledgerId !== operation.ledgerId) throw new Error('账户不存在');
      return buildPosting({ type: transaction.type, amountCents: transaction.amountCents, account });
    }

    if (transaction.type === 'transfer') {
      if (entries.length !== 2) throw new Error('分录与账务类型不一致');
      const [from, to] = await Promise.all([
        this.db.accounts.get(entries[0].accountId),
        this.db.accounts.get(entries[1].accountId),
      ]);
      if (!from || !to || from.ledgerId !== operation.ledgerId || to.ledgerId !== operation.ledgerId) {
        throw new Error('账户不存在');
      }
      return buildPosting({ type: 'transfer', amountCents: transaction.amountCents, from, to });
    }

    if (transaction.type === 'refund') {
      if (entries.length !== 1 || !transaction.originalTransactionId) {
        throw new Error('退款必须关联原支出');
      }
      const original = await this.db.transactions.get(transaction.originalTransactionId);
      if (!original || original.type !== 'expense' || original.deletedAt !== null) {
        throw new Error('原支出不存在');
      }
      const originalEntries = await this.db.entries.where('transactionId').equals(original.id).toArray();
      if (originalEntries.length !== 1) throw new Error('原支出分录无效');
      const existingRefunds = await this.db.transactions
        .where('ledgerId')
        .equals(operation.ledgerId)
        .filter((item) => (
          item.id !== transaction.id
          && item.type === 'refund'
          && item.originalTransactionId === original.id
          && item.deletedAt === null
        ))
        .toArray();
      const alreadyRefundedCents = existingRefunds.reduce((total, item) => total + item.amountCents, 0);
      return buildPosting({
        type: 'refund',
        amountCents: transaction.amountCents,
        originalExpenseAmountCents: original.amountCents,
        alreadyRefundedCents,
        originalEntry: originalEntries[0],
      });
    }

    if (entries.length !== 1 || Math.abs(entries[0].deltaCents) !== transaction.amountCents) {
      throw new Error('分录与账务类型不一致');
    }
    const account = await this.db.accounts.get(entries[0].accountId);
    if (!account || account.ledgerId !== operation.ledgerId) throw new Error('账户不存在');
    return buildPosting({ type: 'adjustment', account, deltaCents: entries[0].deltaCents });
  }

  private async replaceTransactionEntries(
    transaction: Transaction,
    entries: readonly LedgerEntry[],
  ): Promise<void> {
    await this.db.entries.where('transactionId').equals(transaction.id).delete();
    const records: LedgerEntryRecord[] = entries.map((entry, index) => ({
      id: `${transaction.id}:${index}`,
      ledgerId: transaction.ledgerId,
      transactionId: transaction.id,
      ...entry,
    }));
    await this.db.entries.bulkPut(records);
  }

  private async applyTransactionWrite(operation: TransactionWriteOperation): Promise<void> {
    const expected = await this.expectedPosting(operation);
    if (!postingsMatch(operation.entries, expected)) {
      throw new Error('分录与账务类型不一致');
    }

    const current = await this.db.transactions.get(operation.transaction.id);
    if (operation.kind === 'transaction.create') {
      if (current) throw new Error('流水已存在');
      if (operation.transaction.version !== 1) throw new Error('新流水版本必须为 1');
    } else {
      if (!current) throw new Error('流水不存在');
      assertBaseVersion(current.version, operation.baseVersion);
      if (operation.transaction.version !== operation.baseVersion + 1) {
        throw new Error('流水版本不连续');
      }
    }

    await this.db.transactions.put(operation.transaction);
    await this.replaceTransactionEntries(operation.transaction, operation.entries);
  }

  private async applyManagementOperation(operation: LedgerOperation): Promise<void> {
    switch (operation.kind) {
      case 'account.create':
        if (await this.db.accounts.get(operation.account.id)) throw new Error('账户已存在');
        await this.db.accounts.add(operation.account);
        return;
      case 'account.update': {
        const current = await this.db.accounts.get(operation.accountId);
        if (!current) throw new Error('账户不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.accounts.put(operation.account);
        return;
      }
      case 'account.archive': {
        const current = await this.db.accounts.get(operation.accountId);
        if (!current) throw new Error('账户不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.accounts.put({ ...current, archivedAt: operation.archivedAt, version: current.version + 1 });
        return;
      }
      case 'category.create':
        if (await this.db.categories.get(operation.category.id)) throw new Error('分类已存在');
        await this.db.categories.add(operation.category);
        return;
      case 'category.update': {
        const current = await this.db.categories.get(operation.categoryId);
        if (!current) throw new Error('分类不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.categories.put(operation.category);
        return;
      }
      case 'category.archive': {
        const current = await this.db.categories.get(operation.categoryId);
        if (!current) throw new Error('分类不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.categories.put({ ...current, archivedAt: operation.archivedAt, version: current.version + 1 });
        return;
      }
      case 'budget.create':
        if (await this.db.budgets.get(operation.budget.id)) throw new Error('预算已存在');
        await this.db.budgets.add(operation.budget);
        return;
      case 'budget.update': {
        const current = await this.db.budgets.get(operation.budgetId);
        if (!current) throw new Error('预算不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.budgets.put(operation.budget);
        return;
      }
      case 'budget.archive': {
        const current = await this.db.budgets.get(operation.budgetId);
        if (!current) throw new Error('预算不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.budgets.put({ ...current, archivedAt: operation.archivedAt, version: current.version + 1 });
        return;
      }
      case 'category-budget.create':
        if (await this.db.categoryBudgets.get(operation.categoryBudget.id)) throw new Error('分类预算已存在');
        await this.db.categoryBudgets.add(operation.categoryBudget);
        return;
      case 'category-budget.update': {
        const current = await this.db.categoryBudgets.get(operation.categoryBudgetId);
        if (!current) throw new Error('分类预算不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.categoryBudgets.put(operation.categoryBudget);
        return;
      }
      case 'category-budget.archive': {
        const current = await this.db.categoryBudgets.get(operation.categoryBudgetId);
        if (!current) throw new Error('分类预算不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.categoryBudgets.put({ ...current, archivedAt: operation.archivedAt, version: current.version + 1 });
        return;
      }
      case 'reminder.create':
        if (await this.db.reminders.get(operation.reminder.id)) throw new Error('提醒已存在');
        await this.db.reminders.add(operation.reminder);
        return;
      case 'reminder.update': {
        const current = await this.db.reminders.get(operation.reminderId);
        if (!current) throw new Error('提醒不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.reminders.put(operation.reminder);
        return;
      }
      case 'reminder.archive': {
        const current = await this.db.reminders.get(operation.reminderId);
        if (!current) throw new Error('提醒不存在');
        assertBaseVersion(current.version, operation.baseVersion);
        await this.db.reminders.put({ ...current, archivedAt: operation.archivedAt, version: current.version + 1 });
        return;
      }
      default:
        throw new Error('不支持的本地操作');
    }
  }

  private async applyLocally(operation: LedgerOperation): Promise<void> {
    if (operation.kind === 'transaction.create' || operation.kind === 'transaction.update') {
      await this.applyTransactionWrite(operation);
      return;
    }
    if (operation.kind === 'transaction.delete') {
      const current = await this.db.transactions.get(operation.transactionId);
      if (!current) throw new Error('流水不存在');
      assertBaseVersion(current.version, operation.baseVersion);
      await this.db.transactions.put({ ...current, deletedAt: operation.deletedAt, version: current.version + 1 });
      return;
    }
    if (operation.kind === 'transaction.restore') {
      const current = await this.db.transactions.get(operation.transactionId);
      if (!current) throw new Error('流水不存在');
      assertBaseVersion(current.version, operation.baseVersion);
      await this.db.transactions.put({ ...current, deletedAt: null, version: current.version + 1 });
      return;
    }
    await this.applyManagementOperation(operation);
  }

  async saveOperation(input: LedgerOperation): Promise<void> {
    const operation = validateOperation(input);
    await this.db.transaction('rw', this.db.tables, async () => {
      if (await this.db.outbox.get(operation.operationId)) return;
      await this.applyLocally(operation);
      const notBefore = operation.kind === 'transaction.delete'
        ? new Date(Date.parse(operation.deletedAt) + 8_000).toISOString()
        : null;
      const outbox: OutboxRecord = {
        operationId: operation.operationId,
        ledgerId: operation.ledgerId,
        createdAt: operation.createdAt,
        status: 'pending',
        payload: operation,
        notBefore,
        lastError: null,
      };
      await this.db.outbox.put(outbox);
    });
  }

  async listPendingOperations(now = new Date().toISOString()): Promise<OutboxRecord[]> {
    const records = await this.db.outbox.toArray();
    return records
      .filter((record) => (
        record.status === 'pending' && (record.notBefore === null || record.notBefore <= now)
      ))
      .sort((left, right) => (
        left.createdAt.localeCompare(right.createdAt) || left.operationId.localeCompare(right.operationId)
      ));
  }

  async getPersonalLedgerId(userId: string): Promise<string | null> {
    const memberships = await this.db.members.where('userId').equals(userId).toArray();
    for (const member of memberships.filter((item) => item.role === 'owner')) {
      const ledger = await this.db.ledgers.get(member.ledgerId);
      if (ledger?.ownerUserId === userId) return ledger.id;
    }
    return null;
  }

  async getPendingOperationCount(): Promise<number> {
    return this.db.outbox.count();
  }

  async markOperationFailed(operationId: string, message: string): Promise<void> {
    await this.db.outbox.update(operationId, { status: 'pending', lastError: message });
  }

  async markOperationConflict(operationId: string, serverRecord: unknown): Promise<void> {
    await this.db.transaction('rw', [this.db.outbox, this.db.conflicts], async () => {
      const outbox = await this.db.outbox.get(operationId);
      if (!outbox) return;
      await this.db.outbox.update(operationId, { status: 'conflict', lastError: '瀛樺湪闇€瑕佸鐞嗙殑鏁版嵁鍐茬獊' });
      await this.db.conflicts.put({
        id: operationId,
        ledgerId: outbox.ledgerId,
        entityId: operationEntityId(outbox.payload),
        operation: outbox.payload,
        serverRecord,
        createdAt: new Date().toISOString(),
      });
    });
  }

  async markOperationSynced(operationId: string): Promise<void> {
    await this.db.outbox.delete(operationId);
  }

  async undoTransactionDelete(transactionId: string, now = new Date().toISOString()): Promise<void> {
    const transaction = await this.db.transactions.get(transactionId);
    if (!transaction || transaction.deletedAt === null) return;
    const deletion = (await this.db.outbox.toArray()).find((record) => (
      record.payload.kind === 'transaction.delete' && record.payload.transactionId === transactionId
    ));

    if (deletion?.notBefore && deletion.notBefore > now && deletion.payload.kind === 'transaction.delete') {
      const deleteOperation = deletion.payload;
      await this.db.transaction('rw', [this.db.transactions, this.db.outbox], async () => {
        await this.db.transactions.put({
          ...transaction,
          deletedAt: null,
          version: deleteOperation.baseVersion,
        });
        await this.db.outbox.delete(deletion.operationId);
      });
      return;
    }

    const operationId = globalThis.crypto.randomUUID();
    await this.saveOperation({
      schemaVersion: 1,
      operationId,
      ledgerId: transaction.ledgerId,
      createdAt: now,
      kind: 'transaction.restore',
      transactionId,
      baseVersion: transaction.version,
    });
  }

  async applyServerChanges(ledgerId: string, changes: readonly ServerChange[], nextCursor: string): Promise<void> {
    await this.db.transaction('rw', this.db.tables, async () => {
      for (const change of changes) {
        switch (change.entityType) {
          case 'profile': await this.db.profiles.put(change.record); break;
          case 'ledger': await this.db.ledgers.put(change.record); break;
          case 'member': await this.db.members.put(change.record); break;
          case 'account': await this.db.accounts.put(change.record); break;
          case 'category': await this.db.categories.put(change.record); break;
          case 'transaction': await this.db.transactions.put(change.record); break;
          case 'entry':
            if (change.tombstone) await this.db.entries.delete(change.entityId);
            else await this.db.entries.put(change.record);
            break;
          case 'budget': await this.db.budgets.put(change.record); break;
          case 'categoryBudget': await this.db.categoryBudgets.put(change.record); break;
          case 'reminder': await this.db.reminders.put(change.record); break;
        }
      }
      await this.db.syncMeta.put({ key: `${ledgerId}:change-seq`, ledgerId, value: nextCursor });
    });
  }

  async getChangeCursor(ledgerId: string): Promise<string> {
    return (await this.db.syncMeta.get(`${ledgerId}:change-seq`))?.value ?? '0';
  }

  async exportSnapshot(): Promise<LocalLedgerSnapshot> {
    return this.db.transaction('r', this.db.tables, async () => ({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profiles: await this.db.profiles.toArray(),
      ledgers: await this.db.ledgers.toArray(),
      members: await this.db.members.toArray(),
      accounts: await this.db.accounts.toArray(),
      categories: await this.db.categories.toArray(),
      transactions: await this.db.transactions.toArray(),
      entries: await this.db.entries.toArray(),
      budgets: await this.db.budgets.toArray(),
      categoryBudgets: await this.db.categoryBudgets.toArray(),
      reminders: await this.db.reminders.toArray(),
      outbox: await this.db.outbox.toArray(),
      conflicts: await this.db.conflicts.toArray(),
      restoreReceipts: await this.db.restoreReceipts.toArray(),
      syncMeta: await this.db.syncMeta.toArray(),
    }));
  }

  async clearUserData(userId: string): Promise<void> {
    await this.db.transaction('rw', this.db.tables, async () => {
      const memberships = await this.db.members.where('userId').equals(userId).toArray();
      const ledgerIds = [...new Set(memberships.map((membership) => membership.ledgerId))];
      await this.db.profiles.delete(userId);
      if (ledgerIds.length === 0) return;

      await Promise.all([
        this.db.ledgers.bulkDelete(ledgerIds),
        this.db.members.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.accounts.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.categories.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.transactions.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.entries.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.budgets.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.categoryBudgets.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.reminders.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.outbox.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.conflicts.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.restoreReceipts.where('ledgerId').anyOf(ledgerIds).delete(),
        this.db.syncMeta.where('ledgerId').anyOf(ledgerIds).delete(),
      ]);
    });
  }
}
