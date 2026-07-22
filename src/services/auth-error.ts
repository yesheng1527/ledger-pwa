import { isAuthRetryableFetchError } from '@supabase/supabase-js';

export function isRetryableAuthFetchError(error: unknown): boolean {
  return isAuthRetryableFetchError(error);
}
