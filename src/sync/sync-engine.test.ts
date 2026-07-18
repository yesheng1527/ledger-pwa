import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerDatabase } from '../db/local-db';
import { LocalLedgerRepository } from '../db/local-repository';
import type { LedgerOperation } from '../domain/operations';
import type { Account } from '../domain/types';
import type { ApplyOperationResult, PullChangesResult } from '../services/ledger-api';
import { SyncEngine, type SyncApi } from './sync-engine';

const ledgerId = '00000000-0000-4000-8000-000000000001';
const bankId = '00000000-0000-4000-8000-000000000101';
const syncTime = new Date('2026-07-19T10:00:00.000Z');
type TransactionCreateOperation = Extract<LedgerOperation, { kind: 'transaction.create' }>;

let sequence = 0;
let db: LedgerDatabase;
let repo: LocalLedgerRepository;
let online: boolean;
let api: {
  applyOperation: ReturnType<typeof vi.fn<(operation: LedgerOperation) => Promise<ApplyOperationResult>>>;
  pullChanges: ReturnType<typeof vi.fn<(targetLedgerId: string, cursor: string) => Promise<PullChangesResult>>>;
};
let engine: SyncEngine;

function bank(overrides: Partial<Account> = {}): Account {
  return {
    id: bankId,
    ledgerId,
    name: '储蓄卡',
    kind: 'debit_card',
    accountClass: 'asset',
    currency: 'CNY',
    openingBalanceCents: 0,
    sortOrder: 0,
    version: 1,
    archivedAt: null,
    ...overrides,
  };
}

function expenseOperation(index: number): TransactionCreateOperation {
  const suffix = String(index).padStart(12, '0');
  const operationId = `00000000-0000-4000-8001-${suffix}`;
  const transactionId = `00000000-0000-4000-8002-${suffix}`;
  const createdAt = `2026-07-19T08:00:${String(index).padStart(2, '0')}.000Z`;
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

function makeEngine(): SyncEngine {
  return new SyncEngine(ledgerId, repo, api satisfies SyncApi, () => online, () => syncTime);
}

beforeEach(async () => {
  sequence += 1;
  db = new LedgerDatabase(`sync-engine-test-${sequence}`);
  repo = new LocalLedgerRepository(db);
  await db.accounts.put(bank());
  online = true;
  api = {
    applyOperation: vi.fn(async (operation) => ({
      status: 'applied',
      entityId: operation.operationId,
      serverVersion: 1,
    })),
    pullChanges: vi.fn(async (_targetLedgerId, cursor) => ({ changes: [], nextCursor: cursor })),
  };
  engine = makeEngine();
});

afterEach(async () => {
  await db.delete();
});

describe('SyncEngine', () => {
  it('uploads pending operations once and marks them synced', async () => {
    const operation = expenseOperation(1);
    await repo.saveOperation(operation);

    await engine.syncNow();

    expect(api.applyOperation).toHaveBeenCalledOnce();
    expect(api.applyOperation).toHaveBeenCalledWith(operation);
    expect(await repo.listPendingOperations(syncTime.toISOString())).toEqual([]);
    expect(engine.getStatus()).toEqual({
      mode: 'idle',
      pendingCount: 0,
      lastSyncedAt: syncTime.toISOString(),
      message: null,
    });
  });

  it('keeps a failed operation pending with a Chinese network summary', async () => {
    const operation = expenseOperation(2);
    await repo.saveOperation(operation);
    api.applyOperation.mockRejectedValue(new Error('fetch failed'));

    await engine.syncNow();

    expect(await db.outbox.get(operation.operationId)).toMatchObject({
      status: 'pending',
      lastError: '网络连接失败，稍后会自动重试',
    });
    expect(engine.getStatus()).toMatchObject({
      mode: 'error',
      pendingCount: 1,
      lastSyncedAt: null,
      message: '网络连接失败，稍后会自动重试',
    });
    expect(api.pullChanges).not.toHaveBeenCalled();
  });

  it('does not call the API while offline and reports every retained operation', async () => {
    const operation = expenseOperation(3);
    await repo.saveOperation(operation);
    await repo.markOperationConflict(operation.operationId, { version: 2 });
    online = false;

    await engine.syncNow();

    expect(api.applyOperation).not.toHaveBeenCalled();
    expect(api.pullChanges).not.toHaveBeenCalled();
    expect(engine.getStatus()).toMatchObject({ mode: 'offline', pendingCount: 1, lastSyncedAt: null });
  });

  it('leaves future operations queued but still pulls from the stored cursor', async () => {
    const operation = expenseOperation(4);
    await repo.saveOperation(operation);
    await db.outbox.update(operation.operationId, { notBefore: '2999-01-01T00:00:00.000Z' });
    await db.syncMeta.put({ key: `${ledgerId}:change-seq`, ledgerId, value: '900719925474099312345' });

    await engine.syncNow();

    expect(api.applyOperation).not.toHaveBeenCalled();
    expect(api.pullChanges).toHaveBeenCalledWith(ledgerId, '900719925474099312345');
    expect(engine.getStatus()).toMatchObject({ mode: 'idle', pendingCount: 1 });
  });

  it('persists a conflict, stops later uploads, pulls, and keeps conflict mode', async () => {
    const conflicted = expenseOperation(5);
    const later = expenseOperation(6);
    await repo.saveOperation(conflicted);
    await repo.saveOperation(later);
    api.applyOperation.mockResolvedValueOnce({
      status: 'conflict',
      transactionId: conflicted.transaction.id,
      server: { id: conflicted.transaction.id, version: 2 },
      local: conflicted.transaction,
    });

    await engine.syncNow();

    expect(api.applyOperation).toHaveBeenCalledOnce();
    expect(api.pullChanges).toHaveBeenCalledOnce();
    expect(await db.outbox.get(conflicted.operationId)).toMatchObject({ status: 'conflict' });
    expect(await db.outbox.get(later.operationId)).toMatchObject({ status: 'pending' });
    expect(await db.conflicts.get(conflicted.operationId)).toMatchObject({
      operation: conflicted,
      serverRecord: { id: conflicted.transaction.id, version: 2 },
    });
    expect(engine.getStatus()).toMatchObject({
      mode: 'conflict',
      pendingCount: 2,
      lastSyncedAt: null,
      message: '存在需要处理的数据冲突',
    });
  });

  it('pulls every page with decimal-string cursors and applies each page atomically', async () => {
    const firstCursor = '900719925474099312345';
    const nextCursor = '900719925474099312346';
    await db.syncMeta.put({ key: `${ledgerId}:change-seq`, ledgerId, value: firstCursor });
    const serverAccount = bank({ name: '云端储蓄卡', version: 2 });
    api.pullChanges
      .mockResolvedValueOnce({
        changes: [{
          entityType: 'account',
          entityId: serverAccount.id,
          version: serverAccount.version,
          tombstone: false,
          record: serverAccount,
        }],
        nextCursor,
      })
      .mockResolvedValueOnce({ changes: [], nextCursor });

    await engine.syncNow();

    expect(api.pullChanges.mock.calls).toEqual([
      [ledgerId, firstCursor],
      [ledgerId, nextCursor],
    ]);
    expect(await db.accounts.get(bankId)).toEqual(serverAccount);
    expect(await repo.getChangeCursor(ledgerId)).toBe(nextCursor);
    expect(engine.getStatus()).toMatchObject({ mode: 'idle', lastSyncedAt: syncTime.toISOString() });
  });

  it('reports pull failures without changing the last successful timestamp or retained outbox', async () => {
    const future = expenseOperation(7);
    await repo.saveOperation(future);
    await db.outbox.update(future.operationId, { notBefore: '2999-01-01T00:00:00.000Z' });
    api.pullChanges.mockRejectedValue(new Error('service unavailable'));

    await engine.syncNow();

    expect(await db.outbox.get(future.operationId)).toBeDefined();
    expect(engine.getStatus()).toMatchObject({
      mode: 'error',
      pendingCount: 1,
      lastSyncedAt: null,
      message: '同步失败，请稍后重试',
    });
  });

  it('rejects a non-advancing cursor before applying a non-empty page', async () => {
    const serverAccount = bank({ name: '不会落库', version: 2 });
    api.pullChanges.mockResolvedValue({
      changes: [{
        entityType: 'account',
        entityId: serverAccount.id,
        version: serverAccount.version,
        tombstone: false,
        record: serverAccount,
      }],
      nextCursor: '0',
    });

    await engine.syncNow();

    expect(await db.accounts.get(bankId)).toEqual(bank());
    expect(await repo.getChangeCursor(ledgerId)).toBe('0');
    expect(engine.getStatus()).toMatchObject({ mode: 'error', lastSyncedAt: null });
  });

  it('shares one in-flight synchronization between concurrent callers', async () => {
    const operation = expenseOperation(8);
    await repo.saveOperation(operation);
    let release!: (result: ApplyOperationResult) => void;
    api.applyOperation.mockReturnValue(new Promise((resolve) => {
      release = resolve;
    }));

    const first = engine.syncNow();
    const second = engine.syncNow();

    expect(second).toBe(first);
    release({ status: 'applied', transactionId: operation.transaction.id, serverVersion: 1 });
    await Promise.all([first, second]);
    expect(api.applyOperation).toHaveBeenCalledOnce();
  });

  it('notifies subscribers of status changes and supports unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    await engine.syncNow();

    expect(listener.mock.calls.map(([status]) => status.mode)).toEqual(['syncing', 'idle']);
    unsubscribe();
    online = false;
    await engine.syncNow();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
