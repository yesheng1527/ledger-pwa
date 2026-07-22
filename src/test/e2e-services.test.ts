import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LedgerOperation } from '../domain/operations';
import { fixtureIds } from './ledger-fixture';
import { createE2eServices, parseE2eFixture, type E2eFixtureName } from './e2e-services';

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
      const engine = services.createSyncEngine('e2e-personal-ledger');
      const statusListener = vi.fn();

      expect(services.isOnline()).toBe(true);
      await expect(services.repo.getPersonalLedgerId('e2e-user')).resolves.toBe(
        fixture === 'logged-out' ? null : fixtureIds.ledger,
      );
      await expect(services.repo.saveOperation({} as never)).resolves.toBeUndefined();
      await expect(services.repo.readLedgerSnapshot(fixtureIds.ledger)).resolves.toMatchObject({
        ledgerId: fixtureIds.ledger,
      });
      const stopWatching = services.repo.watchLedger(fixtureIds.ledger, statusListener);
      await expect(services.repo.undoTransactionDelete(
        fixtureIds.foodTransaction,
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
      expect(statusListener).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
