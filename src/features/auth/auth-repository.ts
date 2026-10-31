import { getSupabase } from '@/lib/supabase';
import { monitoredOperation } from '@/lib/monitoring-core';
import { normalizeEmail } from './auth-data';

export const signInEmail = (email: string, password: string) =>
  monitoredOperation('auth.sign_in', () =>
    getSupabase().auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    }),
  );

export const registerEmail = (
  email: string,
  password: string,
  redirectUrl: string,
) =>
  monitoredOperation('auth.sign_up', () =>
    getSupabase().auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { emailRedirectTo: redirectUrl },
    }),
  );

export const resendConfirmation = (email: string, redirectUrl: string) =>
  monitoredOperation('auth.resend', () =>
    getSupabase().auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
      options: { emailRedirectTo: redirectUrl },
    }),
  );

export const confirmEmail = (email: string, code: string) =>
  monitoredOperation('auth.confirm', () =>
    getSupabase().auth.verifyOtp({
      type: 'signup',
      email: normalizeEmail(email),
      token: code.trim(),
    }),
  );
