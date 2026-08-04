import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LedgerOperation } from '../domain/operations';
import type { Transaction } from '../domain/types';
import { fixtureIds, fixtureNow } from './ledger-fixture';
import { createE2eServices, parseE2eFixture, type E2eFixtureName } from './e2e-services';

const otherLedgerId = '00000000-0000-4000-8000-000000000002';
const otherLedgerAccountId = '00000000-0000-4000-8000-000000000105';

function transactionCreate(
  ledgerId: string,
  transactionId: string,
  operationId: string,
  accountId: string,
  note = 'foreign collision',
): LedgerOperation {
  return {
    schemaVersion: 1,
    operationId,
    ledgerId,
    createdAt: '2026-07-18T12:00:00.000Z',
    kind: 'transaction.create',
    transaction: {
      id: transactionId,
      operationId,
      ledgerId,
      type: 'expense',
      amountCents: 5000,
      categoryId: null,
      occurredAt: '2026-07-18T12:00:00.000Z',
      note,
      originalTransactionId: null,
      version: 1,
      deletedAt: null,
    },
    entries: [{ accountId, deltaCents: -5000 }],
  };
}

function transactionUpdate(
  transaction: Transaction,
  operationId: string,
  note: string,
  accountId: string,
): LedgerOperation {
  return {
    schemaVersion: 1,
    operationId,
    ledgerId: transaction.ledgerId,
    createdAt: '2026-07-18T12:01:00.000Z',
    kind: 'transaction.update',
    transactionId: transaction.id,
    baseVersion: transaction.version,
    transaction: {
      ...transaction,
      operationId,
      note,
      version: transaction.version + 1,
    },
    entries: [{ accountId, deltaCents: -transaction.amountCents }],
  };
}

function transactionDelete(
  transaction: Transaction,
  operationId: string,
): LedgerOperation {
  return {
    schemaVersion: 1,
    operationId,
    ledgerId: transaction.ledgerId,
    createdAt: '2026-07-18T12:02:00.000Z',
    kind: 'transaction.delete',
    transactionId: transaction.id,
    baseVersion: transaction.version,
    deletedAt: '2026-07-18T12:02:00.000Z',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseE2eFixture', () => {
  it.each([
    [null, 'logged-out'],
    ['', 'logged-out'],
    ['LOGGED-IN', 'logged-out'],
    ['unknown', 'logged-out'],
    ['recovery', 'recovery'],
    ['logged-in', 'logged-in'],
  ] as const)('maps %s to the closed fixture set', (value, expected) => {
    expect(parseE2eFixture(value)).toBe(expected);
  });
});

describe('createE2eServices', () => {
  it('pins ViewModel time to the deterministic fixture instead of the caller clock', async () => {
    const services = createE2eServices('logged-in');
    const viewModel = services.createLedgerViewModel({
      ledgerId: fixtureIds.ledger,
      repository: services.repo,
      saveOperation: (operation) => services.repo.saveOperation(operation),
      syncNow: async () => undefined,
      now: () => new Date('2040-01-01T00:00:00.000Z'),
      makeUuid: () => '00000000-0000-4000-8000-000000009999',
    });

    const home = await viewModel.getHomeSnapshot();
    const deletion = await viewModel.deleteTransaction(fixtureIds.foodTransaction);

    expect(home.todayExpenseCents).toBe(5_000);
    expect(deletion.undoUntil).toBe(
      new Date(fixtureNow.getTime() + 8_000).toISOString(),
    );
    viewModel.dispose();
  });

  it('scopes every snapshot collection to the requested ledger', async () => {
    const services = createE2eServices('logged-in');
    const main = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const other = await services.repo.readLedgerSnapshot(otherLedgerId);
    const mainCollections = [
      main.accounts,
      main.categories,
      main.transactions,
      main.entries,
      main.budgets,
      main.categoryBudgets,
    ];
    const otherCollections = [
      other.accounts,
      other.categories,
      other.transactions,
      other.entries,
      other.budgets,
      other.categoryBudgets,
    ];

    expect(mainCollections.every((records) => (
      records.every((record) => record.ledgerId === fixtureIds.ledger)
    ))).toBe(true);
    expect(main.accounts).not.toContainEqual(expect.objectContaining({ ledgerId: otherLedgerId }));
    expect(otherCollections.every((records) => (
      records.length > 0 && records.every((record) => record.ledgerId === otherLedgerId)
    ))).toBe(true);
    expect(other.accounts).toContainEqual(expect.objectContaining({
      id: otherLedgerAccountId,
      ledgerId: otherLedgerId,
    }));
  });

  it('notifies only watchers registered for the mutated ledger in both directions', async () => {
    const services = createE2eServices('logged-in');
    const mainWatcher = vi.fn();
    const otherWatcher = vi.fn();
    const stopMain = services.repo.watchLedger(fixtureIds.ledger, mainWatcher);
    const stopOther = services.repo.watchLedger(otherLedgerId, otherWatcher);
    const main = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const mainTransaction = main.transactions.find(
      (item) => item.id === fixtureIds.foodTransaction,
    );
    if (!mainTransaction) throw new Error('main fixture transaction is missing');

    await services.repo.saveOperation(transactionUpdate(
      mainTransaction,
      '00000000-0000-4000-8000-000000009910',
      'main update',
      fixtureIds.cash,
    ));
    expect(mainWatcher).toHaveBeenCalledOnce();
    expect(otherWatcher).not.toHaveBeenCalled();

    await services.repo.saveOperation(transactionCreate(
      otherLedgerId,
      '00000000-0000-4000-8000-000000009911',
      '00000000-0000-4000-8000-000000009912',
      otherLedgerAccountId,
    ));
    expect(mainWatcher).toHaveBeenCalledOnce();
    expect(otherWatcher).toHaveBeenCalledOnce();
    stopMain();
    stopOther();
  });

  it('validates operations and prevents foreign-ledger ID collisions from mutating main data', async () => {
    const services = createE2eServices('logged-in');
    const before = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const mainTransaction = before.transactions.find(
      (item) => item.id === fixtureIds.foodTransaction,
    );
    if (!mainTransaction) throw new Error('main fixture transaction is missing');
    const mainEntries = before.entries.filter(
      (item) => item.transactionId === mainTransaction.id,
    );

    await expect(services.repo.saveOperation({} as never)).rejects.toThrow('操作数据格式无效');

    const createForeignCollision = transactionCreate(
      otherLedgerId,
      mainTransaction.id,
      '00000000-0000-4000-8000-000000009920',
      otherLedgerAccountId,
    );
    await services.repo.saveOperation(createForeignCollision);
    const foreignTransaction = createForeignCollision.kind === 'transaction.create'
      ? createForeignCollision.transaction
      : undefined;
    if (!foreignTransaction) throw new Error('foreign transaction is missing');
    await services.repo.saveOperation(transactionUpdate(
      foreignTransaction,
      '00000000-0000-4000-8000-000000009921',
      'foreign update',
      otherLedgerAccountId,
    ));
    await services.repo.saveOperation(transactionDelete(
      { ...foreignTransaction, note: 'foreign update', version: 2 },
      '00000000-0000-4000-8000-000000009922',
    ));
    const after = await services.repo.readLedgerSnapshot(fixtureIds.ledger);

    expect(after.transactions.find((item) => item.id === mainTransaction.id)).toEqual(mainTransaction);
    expect(after.entries.filter((item) => item.transactionId === mainTransaction.id)).toEqual(mainEntries);

    const mismatchedLedger = transactionUpdate(
      mainTransaction,
      '00000000-0000-4000-8000-000000009923',
      'invalid mismatch',
      fixtureIds.cash,
    );
    if (mismatchedLedger.kind !== 'transaction.update') throw new Error('update is missing');
    await expect(services.repo.saveOperation({
      ...mismatchedLedger,
      transaction: { ...mismatchedLedger.transaction, ledgerId: otherLedgerId },
    })).rejects.toThrow('操作数据格式无效');
  });

  it('undoes colliding pending deletes one ledger at a time without crossing watcher scopes', async () => {
    const services = createE2eServices('logged-in');
    const mainBefore = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const mainTransaction = mainBefore.transactions.find(
      (item) => item.id === fixtureIds.foodTransaction,
    );
    if (!mainTransaction) throw new Error('main fixture transaction is missing');
    const foreignCreate = transactionCreate(
      otherLedgerId,
      mainTransaction.id,
      '00000000-0000-4000-8000-000000009930',
      otherLedgerAccountId,
    );
    await services.repo.saveOperation(foreignCreate);
    if (foreignCreate.kind !== 'transaction.create') throw new Error('foreign create is missing');
    const mainWatcher = vi.fn();
    const otherWatcher = vi.fn();
    services.repo.watchLedger(fixtureIds.ledger, mainWatcher);
    services.repo.watchLedger(otherLedgerId, otherWatcher);

    await services.repo.saveOperation(transactionDelete(
      mainTransaction,
      '00000000-0000-4000-8000-000000009931',
    ));
    await services.repo.saveOperation(transactionDelete(
      foreignCreate.transaction,
      '00000000-0000-4000-8000-000000009932',
    ));
    mainWatcher.mockClear();
    otherWatcher.mockClear();

    await services.repo.undoTransactionDelete(mainTransaction.id, '2026-07-18T12:03:00.000Z');
    expect(otherWatcher).toHaveBeenCalledOnce();
    expect(mainWatcher).not.toHaveBeenCalled();
    expect((await services.repo.readLedgerSnapshot(otherLedgerId)).transactions
      .find((item) => item.id === mainTransaction.id)?.deletedAt).toBeNull();
    expect((await services.repo.readLedgerSnapshot(fixtureIds.ledger)).transactions
      .find((item) => item.id === mainTransaction.id)?.deletedAt).not.toBeNull();

    await services.repo.undoTransactionDelete(mainTransaction.id, '2026-07-18T12:03:01.000Z');
    expect(mainWatcher).toHaveBeenCalledOnce();
    expect(otherWatcher).toHaveBeenCalledOnce();
    expect((await services.repo.readLedgerSnapshot(fixtureIds.ledger)).transactions
      .find((item) => item.id === mainTransaction.id)?.deletedAt).toBeNull();
  });

  it('uses valid UUIDs throughout the deterministic logged-in fixture', async () => {
    const services = createE2eServices('logged-in');
    const ledgerId = await services.repo.getPersonalLedgerId('e2e-user');
    const snapshot = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const recordIds = [
      snapshot.ledgerId,
      ...snapshot.accounts.flatMap((item) => [item.id, item.ledgerId]),
      ...snapshot.categories.flatMap((item) => [item.id, item.ledgerId]),
      ...snapshot.transactions.flatMap((item) => [item.id, item.operationId, item.ledgerId]),
      ...snapshot.entries.flatMap((item) => [item.id, item.ledgerId, item.transactionId, item.accountId]),
      ...snapshot.budgets.flatMap((item) => [item.id, item.ledgerId]),
    ];

    expect(ledgerId).toBe(fixtureIds.ledger);
    expect(recordIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))
      .toBe(true);
  });

  it('applies update and delete operations, notifies watchers, and cancels a pending delete on undo', async () => {
    const services = createE2eServices('logged-in');
    const watcher = vi.fn();
    const stopWatching = services.repo.watchLedger(fixtureIds.ledger, watcher);
    const before = await services.repo.readLedgerSnapshot(fixtureIds.ledger);
    const transaction = before.transactions.find((item) => item.id === fixtureIds.foodTransaction);
    if (!transaction) throw new Error('fixture transaction is missing');
    const transactionEntries = before.entries
      .filter((entry) => entry.transactionId === transaction.id)
      .map(({ accountId, deltaCents }) => ({ accountId, deltaCents }));
    const update: LedgerOperation = {
      schemaVersion: 1,
      operationId: '00000000-0000-4000-8000-000000009901',
      ledgerId: fixtureIds.ledger,
      createdAt: '2026-07-18T12:01:00.000Z',
      kind: 'transaction.update',
      transactionId: transaction.id,
      baseVersion: transaction.version,
      transaction: {
        ...transaction,
        operationId: '00000000-0000-4000-8000-000000009901',
        note: 'updated by e2e',
        version: transaction.version + 1,
      },
      entries: transactionEntries,
    };
    const deletion: LedgerOperation = {
      schemaVersion: 1,
      operationId: '00000000-0000-4000-8000-000000009902',
      ledgerId: fixtureIds.ledger,
      createdAt: '2026-07-18T12:02:00.000Z',
      kind: 'transaction.delete',
      transactionId: transaction.id,
      baseVersion: transaction.version + 1,
      deletedAt: '2026-07-18T12:02:00.000Z',
    };

    await services.repo.saveOperation(update);
    expect((await services.repo.readLedgerSnapshot(fixtureIds.ledger)).transactions
      .find((item) => item.id === transaction.id)?.note).toBe('updated by e2e');
    await services.repo.saveOperation(deletion);
    expect((await services.repo.readLedgerSnapshot(fixtureIds.ledger)).transactions
      .find((item) => item.id === transaction.id)?.deletedAt).toBe(deletion.deletedAt);
    await services.repo.undoTransactionDelete(transaction.id, '2026-07-18T12:03:00.000Z');
    const restored = (await services.repo.readLedgerSnapshot(fixtureIds.ledger)).transactions
      .find((item) => item.id === transaction.id);

    expect(restored).toMatchObject({ note: 'updated by e2e', deletedAt: null, version: 2 });
    expect(watcher).toHaveBeenCalledTimes(3);
    stopWatching();
  });

  it.each([
    ['logged-out', 'INITIAL_SESSION', false],
    ['recovery', 'PASSWORD_RECOVERY', true],
    ['logged-in', 'INITIAL_SESSION', true],
  ] as const)(
    'emits one deterministic session event for %s',
    (fixture, expectedEvent, expectsSession) => {
      const listener = vi.fn<(event: AuthChangeEvent, session: Session | null) => void>();
      const services = createE2eServices(fixture);

      const unsubscribe = services.auth.onSessionChange(listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expectedEvent,
        expectsSession ? expect.objectContaining({ user: expect.objectContaining({ id: 'e2e-user' }) }) : null,
      );
      unsubscribe();
      expect(listener).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['logged-out', 'recovery', 'logged-in'] satisfies E2eFixtureName[])(
    'uses an offline-free deterministic local runtime for %s',
    async (fixture) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const services = createE2eServices(fixture);
      const engine = services.createSyncEngine(fixtureIds.ledger);
      const statusListener = vi.fn();
      const sessionListener = vi.fn();
      const stopSession = services.auth.onSessionChange(sessionListener);

      expect(services.isOnline()).toBe(true);
      expect(sessionListener).toHaveBeenCalledOnce();
      await expect(services.auth.signIn('person@example.com', 'secret')).resolves.toBeUndefined();
      await expect(services.auth.requestPasswordReset('person@example.com')).resolves.toBeUndefined();
      await expect(services.auth.updatePassword('new-secret')).resolves.toBeUndefined();
      await expect(services.repo.getPersonalLedgerId('e2e-user')).resolves.toBe(
        fixture === 'logged-out' ? null : fixtureIds.ledger,
      );
      await expect(services.repo.readLedgerSnapshot(fixtureIds.ledger)).resolves.toMatchObject({
        ledgerId: fixtureIds.ledger,
      });
      const stopWatching = services.repo.watchLedger(fixtureIds.ledger, statusListener);
      await expect(services.repo.saveOperation(transactionCreate(
        fixtureIds.ledger,
        '00000000-0000-4000-8000-000000009940',
        '00000000-0000-4000-8000-000000009941',
        fixtureIds.cash,
      ))).resolves.toBeUndefined();
      await expect(services.repo.undoTransactionDelete(
        '00000000-0000-4000-8000-000000009940',
        '2026-07-18T12:00:00.000Z',
      )).resolves.toBeUndefined();
      stopWatching();
      await expect(services.api.bootstrapPersonalLedger()).resolves.toBe(fixtureIds.ledger);
      expect(engine.getStatus()).toEqual({
        mode: 'idle',
        pendingCount: 0,
        lastSyncedAt: null,
        message: null,
      });
      const unsubscribe = engine.subscribe(statusListener);
      await expect(engine.syncNow()).resolves.toBeUndefined();
      unsubscribe();
      const viewModel = services.createLedgerViewModel({
        ledgerId: fixtureIds.ledger,
        repository: services.repo,
        saveOperation: (operation) => services.repo.saveOperation(operation),
        syncNow: () => engine.syncNow(),
        now: () => new Date('2026-07-18T12:00:00.000Z'),
        makeUuid: () => '00000000-0000-4000-8000-000000009942',
      });
      viewModel.dispose();
      stopSession();
      expect(statusListener).toHaveBeenCalledOnce();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
