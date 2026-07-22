import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

type AuthClient = {
  auth: Pick<
    SupabaseClient['auth'],
    | 'signUp'
    | 'signInWithPassword'
    | 'resetPasswordForEmail'
    | 'updateUser'
    | 'signOut'
    | 'onAuthStateChange'
  >;
};

export type SessionChangeListener = (
  event: AuthChangeEvent,
  session: Session | null,
) => void | Promise<void>;

export function buildPasswordResetRedirect(
  origin = location.origin,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const appBase = new URL(baseUrl, `${origin}/`);
  return new URL('reset-password', appBase).toString();
}

export class AuthService {
  private readonly client: AuthClient;

  constructor(client: AuthClient = getSupabaseClient()) {
    this.client = client;
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async requestPasswordReset(email: string) {
    const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetRedirect(),
    });
    if (error) throw error;
    return data;
  }

  async updatePassword(password: string) {
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  onSessionChange(listener: SessionChangeListener): () => void {
    const { data: { subscription } } = this.client.auth.onAuthStateChange(listener);
    return () => subscription.unsubscribe();
  }
}
