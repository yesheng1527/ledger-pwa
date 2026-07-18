import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LedgerDatabase } from './local-db';
import { LocalLedgerRepository } from './local-repository';
import type { LedgerOperation } from '../domain/operations';
import type { Account } from '../domain/types';

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
  createdAt = `2026-07-18T08:00:0${index}.000Z`,
): TransactionCreateOperation {
  const suffix = String(index).padStart(12, '0');
  const operationId = `00000000-0000-4000-8001-${suffix}`;
  const transactionId = `00000000-0000-4000-8002-${suffix}`;
  return {
    schemaVersion: 1,
    operationId,
    ledgerId,
    createdAt,
    kind: 'transaction.create',
    transaction: {
      id: transactionId,
      operationId,
      ledgerId,
      type: 'expense',
      amountCents: 6800,
      categoryId: null,
      occurredAt: createdAt,
      note: '',
      originalTransactionId: null,
      version: 1,
      deletedAt: null,
    },
    entries: [{ accountId: bankId, deltaCents: -6800 }],
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

    expect((await repo.listPendingOperations('2026-07-18T09:00:00.000Z')).map((item) => item.operationId))
      .toEqual([older.operationId, newer.operationId]);
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

    expect(await repo.listPendingOperations('2026-07-18T08:01:07.999Z')).toEqual([]);
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

  it('keeps a failed operation pending with a Chinese summary', async () => {
    const operation = expenseOperation(7);
    await repo.saveOperation(operation);
    await repo.markOperationFailed(operation.operationId, '缃戠粶杩炴帴澶辫触锛岀◢鍚庝細鑷姩閲嶈瘯');

    expect(await db.outbox.get(operation.operationId)).toMatchObject({
      status: 'pending',
      lastError: '缃戠粶杩炴帴澶辫触锛岀◢鍚庝細鑷姩閲嶈瘯',
    });
    expect(await repo.getPendingOperationCount()).toBe(1);
  });

  it('stores a conflict without removing its outbox operation', async () => {
    const operation = expenseOperation(8);
    await repo.saveOperation(operation);
    await repo.markOperationConflict(operation.operationId, { version: 2 });

    expect(await db.outbox.get(operation.operationId)).toMatchObject({ status: 'conflict' });
    expect(await db.conflicts.get(operation.operationId)).toMatchObject({
      entityId: operation.transaction.id,
      operation,
      serverRecord: { version: 2 },
    });
  });

  it('restores the active personal ledger for its owner', async () => {
    const userId = '00000000-0000-4000-8000-000000000203';
    await db.ledgers.put({ id: ledgerId, ownerUserId: userId, name: '涓汉璐︽湰', currency: 'CNY', version: 1 });
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
