import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    'uses an offline-free, empty local runtime for %s',
    async (fixture) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const services = createE2eServices(fixture);
      const engine = services.createSyncEngine('e2e-personal-ledger');
      const statusListener = vi.fn();

      expect(services.isOnline()).toBe(true);
      await expect(services.repo.getPersonalLedgerId('e2e-user')).resolves.toBe(
        fixture === 'logged-out' ? null : 'e2e-personal-ledger',
      );
      await expect(services.repo.saveOperation({} as never)).resolves.toBeUndefined();
      await expect(services.api.bootstrapPersonalLedger()).resolves.toBe('e2e-personal-ledger');
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
