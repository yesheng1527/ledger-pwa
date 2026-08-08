import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerDatabase } from './local-db';
import { LocalLedgerRepository } from './local-repository';
import type { LedgerOperation } from '../domain/operations';
import type { Account, Budget, Category, CategoryBudget } from '../domain/types';

const ledgerId = '00000000-0000-4000-8000-000000000001';
const bankId = '00000000-0000-4000-8000-000000000101';
let sequence = 0;
let db: LedgerDatabase;
let repo: LocalLedgerRepository;
type TransactionCreateOperation = Extract<LedgerOperation, { kind: 'transaction.create' }>;

function bank(id = bankId, targetLedgerId = ledgerId): Account {
  return {
    id,
    ledgerId: targetLedgerId,
    name: '储蓄卡',
    kind: 'debit_card',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 0,
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  };
}

function expenseOperation(
  index: number,
  createdAt = `2026-07-18T08:00:${String(index).padStart(2, '0')}.000Z`,
  targetLedgerId = ledgerId,
  targetBankId = bankId,
): TransactionCreateOperation {
  const suffix = String(index).padStart(12, '0');
  const operationId = `00000000-0000-4000-8001-${suffix}`;
  const transactionId = `00000000-0000-4000-8002-${suffix}`;
  return {
    schemaVersion: 1,
    operationId,
    ledgerId: targetLedgerId,
    createdAt,
    kind: 'transaction.create',
    transaction: {
      id: transactionId,
      operationId,
      ledgerId: targetLedgerId,
      type: 'expense',
      amountCents: 6800,
      categoryId: null,
      occurredAt: createdAt,
      note: '',
      originalTransactionId: null,
      version: 1,
      deletedAt: null,
    },
    entries: [{ accountId: targetBankId, deltaCents: -6800 }],
  };
}

function category(id: string, targetLedgerId: string): Category {
  return {
    id,
    ledgerId: targetLedgerId,
    name: '餐饮',
    kind: 'expense',
    iconKey: 'food',
    sortOrder: 0,
    version: 1,
    archivedAt: null,
  };
}

function budget(id: string, targetLedgerId: string): Budget {
  return {
    id,
    ledgerId: targetLedgerId,
    month: '2026-07',
    amountCents: 100000,
    version: 1,
    archivedAt: null,
  };
}

function categoryBudget(id: string, targetLedgerId: string, categoryId: string): CategoryBudget {
  return {
    id,
    ledgerId: targetLedgerId,
    categoryId,
    month: '2026-07',
    amountCents: 50000,
    version: 1,
    archivedAt: null,
  };
}

beforeEach(async () => {
  sequence += 1;
  db = new LedgerDatabase(`seabreeze-ledger-test-${sequence}`);
  repo = new LocalLedgerRepository(db);
  await db.accounts.put(bank());
});

afterEach(async () => {
  await db.delete();
});

describe('LocalLedgerRepository', () => {
  it('reads one ledger as a consistent scoped snapshot', async () => {
    const otherLedgerId = '00000000-0000-4000-8000-000000000002';
    const otherAccountId = '00000000-0000-4000-8000-000000000102';
    const categoryId = '00000000-0000-4000-8000-000000000301';
    const otherCategoryId = '00000000-0000-4000-8000-000000000302';
    await db.accounts.put(bank(otherAccountId, otherLedgerId));
    await db.categories.bulkPut([
      category(categoryId, ledgerId),
      category(otherCategoryId, otherLedgerId),
    ]);
    await db.budgets.bulkPut([
      budget('00000000-0000-4000-8000-000000000401', ledgerId),
      budget('00000000-0000-4000-8000-000000000402', otherLedgerId),
    ]);
    await db.categoryBudgets.bulkPut([
      categoryBudget('00000000-0000-4000-8000-000000000501', ledgerId, categoryId),
      categoryBudget('00000000-0000-4000-8000-000000000502', otherLedgerId, otherCategoryId),
    ]);
    await repo.saveOperation(expenseOperation(21));
    await repo.saveOperation(expenseOperation(22, '2026-07-18T08:00:00.000Z', otherLedgerId, otherAccountId));

    const snapshot = await repo.readLedgerSnapshot(ledgerId);

    expect(snapshot.ledgerId).toBe(ledgerId);
    expect(snapshot.accounts.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.categories.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.transactions.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.entries.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.budgets.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.categoryBudgets.every((item) => item.ledgerId === ledgerId)).toBe(true);
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.categories).toHaveLength(1);
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.budgets).toHaveLength(1);
    expect(snapshot.categoryBudgets).toHaveLength(1);
  });

  it('notifies only after watched ledger data changes and unsubscribes cleanly', async () => {
    const onChange = vi.fn();
    const readSnapshot = vi.spyOn(repo, 'readLedgerSnapshot');
    const stop = repo.watchLedger(ledgerId, onChange);
    await vi.waitFor(() => expect(readSnapshot).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();

    await repo.saveOperation(expenseOperation(23));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    stop();
    await repo.saveOperation(expenseOperation(24));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('commits a transaction, entries and outbox item atomically', async () => {
    const operation = expenseOperation(1);
    await repo.saveOperation(operation);

    expect(await db.transactions.get(operation.transaction.id)).toEqual(operation.transaction);
    expect(await db.entries.where('transactionId').equals(operation.transaction.id).toArray())
      .toMatchObject([{ accountId: bankId, deltaCents: -6800 }]);
    expect(await db.outbox.get(operation.operationId)).toMatchObject({ status: 'pending' });
  });

  it('rejects a mismatched posting without leaving partial records', async () => {
    const operation = expenseOperation(2) as Extract<LedgerOperation, { kind: 'transaction.create' }>;
    const invalid = { ...operation, entries: [{ accountId: bankId, deltaCents: 6800 }] };

    await expect(repo.saveOperation(invalid)).rejects.toThrow('分录与账务类型不一致');
    expect(await db.transactions.count()).toBe(0);
    expect(await db.entries.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('returns due pending operations in creation order', async () => {
    const older = expenseOperation(3, '2026-07-18T08:00:00.000Z');
    const newer = expenseOperation(4, '2026-07-18T08:00:01.000Z');
    await repo.saveOperation(newer);
    await repo.saveOperation(older);

    expect((await repo.listPendingOperations(ledgerId, '2026-07-18T09:00:00.000Z'))
      .map((item) => item.operationId))
      .toEqual([older.operationId, newer.operationId]);
  });

  it('lists and counts outbox operations only for the requested ledger', async () => {
    const otherLedgerId = '00000000-0000-4000-8000-000000000002';
    const otherBankId = '00000000-0000-4000-8000-000000000102';
    await db.accounts.put(bank(otherBankId, otherLedgerId));
    const ledgerDue = expenseOperation(12, '2026-07-18T08:00:00.000Z');
    const ledgerFuture = expenseOperation(13, '2026-07-18T08:00:01.000Z');
    const otherDue = expenseOperation(14, '2026-07-18T08:00:02.000Z', otherLedgerId, otherBankId);
    const otherFuture = expenseOperation(15, '2026-07-18T08:00:03.000Z', otherLedgerId, otherBankId);
    await repo.saveOperation(otherFuture);
    await repo.saveOperation(ledgerFuture);
    await repo.saveOperation(otherDue);
    await repo.saveOperation(ledgerDue);
    await db.outbox.update(ledgerFuture.operationId, { notBefore: '2026-07-18T10:00:00.000Z' });
    await db.outbox.update(otherFuture.operationId, { notBefore: '2026-07-18T10:00:00.000Z' });

    expect((await repo.listPendingOperations(ledgerId, '2026-07-18T09:00:00.000Z'))
      .map((item) => item.operationId)).toEqual([ledgerDue.operationId]);
    expect((await repo.listPendingOperations(otherLedgerId, '2026-07-18T09:00:00.000Z'))
      .map((item) => item.operationId)).toEqual([otherDue.operationId]);
    expect(await repo.getPendingOperationCount(ledgerId)).toBe(2);
    expect(await repo.getPendingOperationCount(otherLedgerId)).toBe(2);
  });

  it('delays a tombstone for eight seconds and can undo it locally', async () => {
    const create = expenseOperation(5, '2026-07-18T08:00:00.000Z');
    await repo.saveOperation(create);
    await repo.markOperationSynced(create.operationId);
    const deletion: LedgerOperation = {
      schemaVersion: 1,
      operationId: '00000000-0000-4000-8003-000000000005',
      ledgerId,
      createdAt: '2026-07-18T08:01:00.000Z',
      kind: 'transaction.delete',
      transactionId: create.transaction.id,
      baseVersion: 1,
      deletedAt: '2026-07-18T08:01:00.000Z',
    };
    await repo.saveOperation(deletion);

    expect(await repo.listPendingOperations(ledgerId, '2026-07-18T08:01:07.999Z')).toEqual([]);
    expect(await db.transactions.get(create.transaction.id)).toMatchObject({ deletedAt: deletion.deletedAt });

    await repo.undoTransactionDelete(create.transaction.id, '2026-07-18T08:01:04.000Z');
    expect(await db.transactions.get(create.transaction.id)).toMatchObject({ deletedAt: null, version: 1 });
    expect(await db.outbox.get(deletion.operationId)).toBeUndefined();
  });

  it('exports pending drafts and conflicts', async () => {
    const operation = expenseOperation(6);
    await repo.saveOperation(operation);
    await db.conflicts.put({
      id: 'conflict-1',
      ledgerId,
      entityId: operation.transaction.id,
      operation,
      serverRecord: { version: 2 },
      createdAt: '2026-07-18T09:00:00.000Z',
    });

    const snapshot = await repo.exportSnapshot();
    expect(snapshot.outbox).toHaveLength(1);
    expect(snapshot.conflicts).toHaveLength(1);
    expect(snapshot.transactions).toHaveLength(1);
  });

  it('applies a server page and advances its cursor in the same local transaction', async () => {
    const serverAccount = { ...bank(), name: '服务器储蓄卡', version: 2 };

    await repo.applyServerChanges(
      ledgerId,
      [{ entityType: 'account', entityId: serverAccount.id, version: 2, tombstone: false, record: serverAccount }],
      '42',
    );

    expect(await db.accounts.get(bankId)).toEqual(serverAccount);
    expect(await repo.getChangeCursor(ledgerId)).toBe('42');
  });

  it('replaces a local optimistic entry with the authoritative server entry', async () => {
    const operation = expenseOperation(10, '2026-07-18T08:00:10.000Z');
    await repo.saveOperation(operation);
    const serverTransaction = { ...operation.transaction, version: 2 };
    const serverEntry = {
      id: '00000000-0000-4000-8004-000000000010',
      ledgerId,
      transactionId: operation.transaction.id,
      accountId: bankId,
      deltaCents: -6800,
    };

    await repo.applyServerChanges(ledgerId, [
      {
        entityType: 'transaction', entityId: serverTransaction.id,
        version: 2, tombstone: false, record: serverTransaction,
      },
      {
        entityType: 'entry', entityId: serverEntry.id,
        version: 1, tombstone: false, record: serverEntry,
      },
    ], '43');

    const storedEntries = await db.entries.where('transactionId').equals(operation.transaction.id).toArray();
    expect(storedEntries).toEqual([serverEntry]);
    expect(storedEntries.reduce((total, entry) => total + entry.deltaCents, 0)).toBe(-6800);
  });

  it('keeps a failed operation pending with a Chinese summary', async () => {
    const operation = expenseOperation(7);
    await repo.saveOperation(operation);
    await repo.markOperationFailed(operation.operationId, '网络连接失败，稍后会自动重试');

    expect(await db.outbox.get(operation.operationId)).toMatchObject({
      status: 'pending',
      lastError: '网络连接失败，稍后会自动重试',
    });
    expect(await repo.getPendingOperationCount(ledgerId)).toBe(1);
  });

  it('stores a conflict without removing its outbox operation', async () => {
    const operation = expenseOperation(8);
    await repo.saveOperation(operation);
    await repo.markOperationConflict(operation.operationId, { version: 2 });

    expect(await db.outbox.get(operation.operationId)).toMatchObject({
      status: 'conflict',
      lastError: '存在需要处理的数据冲突',
    });
    expect(await db.conflicts.get(operation.operationId)).toMatchObject({
      entityId: operation.transaction.id,
      operation,
      serverRecord: { version: 2 },
    });
  });

  it('can choose the server side of a conflict and clears the blocked local operation', async () => {
    const operation = expenseOperation(18);
    await repo.saveOperation(operation);
    await repo.markOperationConflict(operation.operationId, { version: 2 });
    await repo.resolveConflict(operation.operationId, 'server');
    expect(await db.conflicts.get(operation.operationId)).toBeUndefined();
    expect(await db.outbox.get(operation.operationId)).toBeUndefined();
  });

  it('rebases a local update onto the server version when keeping the local conflict choice', async () => {
    const create = expenseOperation(21);
    await repo.saveOperation(create);
    await repo.markOperationSynced(create.operationId);
    const updateOperationId = '00000000-0000-4000-8001-000000000221';
    const update: LedgerOperation = {
      ...create,
      operationId: updateOperationId,
      kind: 'transaction.update',
      transactionId: create.transaction.id,
      baseVersion: 1,
      transaction: { ...create.transaction, operationId: updateOperationId, amountCents: 7000, version: 2 },
      entries: [{ accountId: bankId, deltaCents: -7000 }],
    };
    await repo.saveOperation(update);
    await repo.markOperationConflict(update.operationId, { id: create.transaction.id, version: 3 });
    await repo.resolveConflict(update.operationId, 'local');
    expect(await db.outbox.get(update.operationId)).toMatchObject({
      status: 'pending',
      payload: { baseVersion: 3, transaction: { version: 4, amountCents: 7000 } },
    });
    expect(await db.conflicts.get(update.operationId)).toBeUndefined();
  });

  it('restores only the selected ledger from a full local snapshot', async () => {
    const userId = '00000000-0000-4000-8000-000000000203';
    await db.ledgers.put({ id: ledgerId, ownerUserId: userId, name: '个人账本', currency: 'CNY', version: 1 });
    await db.accounts.put(bank());
    const snapshot = await repo.exportSnapshot();
    await db.accounts.update(bankId, { name: '已修改名称' });
    await repo.restoreLedgerSnapshot(snapshot, ledgerId);
    expect(await db.accounts.get(bankId)).toMatchObject({ name: '储蓄卡' });
    expect(await db.restoreReceipts.where('ledgerId').equals(ledgerId).count()).toBe(1);
  });

  it('captures bounded automatic history before writes and can restore a previous version', async () => {
    await db.accounts.put(bank());
    await repo.saveOperation(expenseOperation(19));
    await repo.saveOperation(expenseOperation(20));
    const history = await repo.listHistory(ledgerId);
    expect(history[0]).toMatchObject({ transactions: 1 });
    expect(history[1]).toMatchObject({ transactions: 0 });
    await repo.restoreHistory(ledgerId, history[0].id);
    expect(await db.transactions.where('ledgerId').equals(ledgerId).count()).toBe(1);
    expect((await repo.listHistory(ledgerId)).length).toBeGreaterThanOrEqual(3);
  });

  it('retains at most twelve automatic history versions', async () => {
    await db.accounts.put(bank());
    for (let index = 30; index < 45; index += 1) await repo.saveOperation(expenseOperation(index));
    expect(await repo.listHistory(ledgerId)).toHaveLength(12);
  });

  it('reports unresolved outbox conflicts only for the requested ledger', async () => {
    const otherLedgerId = '00000000-0000-4000-8000-000000000002';
    expect(await repo.hasUnresolvedConflicts(ledgerId)).toBe(false);

    const operation = expenseOperation(11, '2026-07-18T08:00:11.000Z');
    await repo.saveOperation(operation);
    await repo.markOperationConflict(operation.operationId, { version: 2 });

    expect(await repo.hasUnresolvedConflicts(ledgerId)).toBe(true);
    expect(await repo.hasUnresolvedConflicts(otherLedgerId)).toBe(false);
  });

  it('restores the active personal ledger for its owner', async () => {
    const userId = '00000000-0000-4000-8000-000000000203';
    await db.ledgers.put({ id: ledgerId, ownerUserId: userId, name: '个人账本', currency: 'CNY', version: 1 });
    await db.members.put({ id: 'member-owner', userId, ledgerId, role: 'owner', version: 1 });

    expect(await repo.getPersonalLedgerId(userId)).toBe(ledgerId);
  });

  it('deletes a replaced server entry and advances the cursor atomically', async () => {
    const operation = expenseOperation(9);
    await repo.saveOperation(operation);
    const entry = (await db.entries.where('transactionId').equals(operation.transaction.id).first())!;

    await repo.applyServerChanges(ledgerId, [{
      entityType: 'entry', entityId: entry.id, version: 2, tombstone: true, record: entry,
    }], '51');

    expect(await db.entries.get(entry.id)).toBeUndefined();
    expect(await repo.getChangeCursor(ledgerId)).toBe('51');
  });

  it('clears only the ledgers visible to the requested user', async () => {
    const otherLedgerId = '00000000-0000-4000-8000-000000000002';
    const userId = '00000000-0000-4000-8000-000000000201';
    const otherUserId = '00000000-0000-4000-8000-000000000202';
    await db.profiles.bulkPut([
      { id: userId, displayName: '甲', settings: {} },
      { id: otherUserId, displayName: '乙', settings: {} },
    ]);
    await db.ledgers.bulkPut([
      { id: ledgerId, ownerUserId: userId, name: '甲账本', currency: 'CNY', version: 1 },
      { id: otherLedgerId, ownerUserId: otherUserId, name: '乙账本', currency: 'CNY', version: 1 },
    ]);
    await db.members.bulkPut([
      { id: 'member-a', userId, ledgerId, role: 'owner', version: 1 },
      { id: 'member-b', userId: otherUserId, ledgerId: otherLedgerId, role: 'owner', version: 1 },
    ]);
    await db.accounts.put(bank('00000000-0000-4000-8000-000000000102', otherLedgerId));

    await repo.clearUserData(userId);

    expect(await db.profiles.get(userId)).toBeUndefined();
    expect(await db.accounts.where('ledgerId').equals(ledgerId).count()).toBe(0);
    expect(await db.profiles.get(otherUserId)).toBeTruthy();
    expect(await db.accounts.where('ledgerId').equals(otherLedgerId).count()).toBe(1);
  });
});
