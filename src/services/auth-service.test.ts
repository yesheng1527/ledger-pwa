import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth-service';

describe('AuthService', () => {
  it('passes sign-up credentials to Supabase and returns its data', async () => {
    const data = { user: { id: 'user-1' }, session: null };
    const signUp = vi.fn().mockResolvedValue({ data, error: null });
    const service = new AuthService({ auth: { signUp } } as never);

    await expect(service.signUp('person@example.com', 'correct-horse-battery-staple'))
      .resolves.toBe(data);
    expect(signUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'correct-horse-battery-staple',
    });
  });

  it('passes email credentials to Supabase without handling tokens itself', async () => {
    const data = { session: null };
    const signInWithPassword = vi.fn().mockResolvedValue({ data, error: null });
    const service = new AuthService({ auth: { signInWithPassword } } as never);

    await expect(service.signIn('person@example.com', 'correct-horse-battery-staple'))
      .resolves.toBe(data);

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'correct-horse-battery-staple',
    });
  });

  it('uses the current origin for password reset redirects', async () => {
    const data = {};
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data, error: null });
    const service = new AuthService({ auth: { resetPasswordForEmail } } as never);

    await expect(service.requestPasswordReset('person@example.com')).resolves.toBe(data);
    expect(resetPasswordForEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: `${location.origin}/reset-password`,
    });
  });

  it('updates the authenticated user password', async () => {
    const data = { user: { id: 'user-1' } };
    const updateUser = vi.fn().mockResolvedValue({ data, error: null });
    const service = new AuthService({ auth: { updateUser } } as never);

    await expect(service.updatePassword('new-correct-horse-battery-staple')).resolves.toBe(data);
    expect(updateUser).toHaveBeenCalledWith({ password: 'new-correct-horse-battery-staple' });
  });

  it('signs out through Supabase', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const service = new AuthService({ auth: { signOut } } as never);

    await expect(service.signOut()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('throws errors returned by every asynchronous auth method', async () => {
    const error = new Error('auth failed');
    const failing = () => vi.fn().mockResolvedValue({ data: null, error });
    const service = new AuthService({
      auth: {
        signUp: failing(),
        signInWithPassword: failing(),
        resetPasswordForEmail: failing(),
        updateUser: failing(),
        signOut: failing(),
      },
    } as never);

    await expect(service.signUp('person@example.com', 'password')).rejects.toBe(error);
    await expect(service.signIn('person@example.com', 'password')).rejects.toBe(error);
    await expect(service.requestPasswordReset('person@example.com')).rejects.toBe(error);
    await expect(service.updatePassword('password')).rejects.toBe(error);
    await expect(service.signOut()).rejects.toBe(error);
  });

  it('passes session events to the listener and returns an unsubscribe function', () => {
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } });
    const service = new AuthService({ auth: { onAuthStateChange } } as never);
    const listener = vi.fn<(event: AuthChangeEvent, session: Session | null) => void>();

    const stopListening = service.onSessionChange(listener);
    const registeredListener = onAuthStateChange.mock.calls[0][0];
    registeredListener('SIGNED_OUT', null);
    stopListening();

    expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
