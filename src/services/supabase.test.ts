import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from './supabase';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSupabaseClient', () => {
  it('persists and refreshes the authenticated session across browser restarts', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
    const client = {};
    vi.mocked(createClient).mockReturnValue(client as never);

    expect(getSupabaseClient()).toBe(client);
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'publishable-key',
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  });
});
