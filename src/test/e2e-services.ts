import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { AppProviderServices } from '../app/providers';

export type E2eFixtureName = 'logged-out' | 'recovery' | 'logged-in';

const personalLedgerId = 'e2e-personal-ledger';
const idleStatus = {
  mode: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  message: null,
} as const;

const authenticatedSession: Session = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  expires_in: 3600,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: {
    id: 'e2e-user',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    email: 'e2e@example.invalid',
    created_at: '2026-07-19T00:00:00.000Z',
  },
};

export function parseE2eFixture(value: string | null): E2eFixtureName {
  return value === 'recovery' || value === 'logged-in' ? value : 'logged-out';
}

export function createE2eServices(fixture: E2eFixtureName): AppProviderServices {
  const session = fixture === 'logged-out' ? null : authenticatedSession;
  const event: AuthChangeEvent = fixture === 'recovery' ? 'PASSWORD_RECOVERY' : 'INITIAL_SESSION';

  return {
    auth: {
      onSessionChange(listener) {
        void listener(event, session);
        return () => undefined;
      },
      async signIn() {},
      async requestPasswordReset() {},
      async updatePassword() {},
    },
    api: {
      async bootstrapPersonalLedger() {
        return personalLedgerId;
      },
    },
    repo: {
      async getPersonalLedgerId() {
        return session ? personalLedgerId : null;
      },
      async saveOperation() {},
    },
    createSyncEngine: () => ({
      getStatus: () => ({ ...idleStatus }),
      subscribe: () => () => undefined,
      async syncNow() {},
    }),
    isOnline: () => true,
  };
}
