import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { BrandHeader } from '@/components/ui/brand-header';
import {
  AuthField,
  AuthNotice,
  AuthScreen,
  GoogleSignInButton,
} from '@/features/auth/auth-ui';
import { useAuth } from '@/features/auth/auth-context';
import {
  authErrorMessage,
  normalizeEmail,
  validateCredentials,
} from '@/features/auth/auth-data';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { monitoredOperation, reportFailure } from '@/lib/monitoring-core';

export default function SignInScreen() {
  const { signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = async (google = false) => {
    if (busy) return;
    const errors = google ? [] : validateCredentials(email);
    if (!google && !password) errors.push('Wpisz hasło.');
    if (errors.length) return setError(errors.join(' '));
    setBusy(true);
    setError(null);
    try {
      if (google) setError(await signInGoogle());
      else {
        const { error: cause } = await monitoredOperation('auth.sign_in', () => getSupabase().auth.signInWithPassword({
          email: normalizeEmail(email),
          password,
        }));
        if (cause?.code === 'email_not_confirmed')
          router.push({
            pathname: '/auth/confirm',
            params: { email: normalizeEmail(email) },
          });
        else if (cause) setError(authErrorMessage(cause));
        else router.replace('/account-loading');
      }
    } catch (cause) {
      if (!google) reportFailure(cause, 'auth.sign_in');
      setError(
        isSupabaseConfigured
          ? authErrorMessage(cause)
          : 'Logowanie jest chwilowo niedostępne. Spróbuj później.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthScreen
      header={<BrandHeader />}
      title="Dobrze Cię widzieć"
      description="Zaloguj się i wróć do swojej podróżniczej ekipy."
    >
      <GoogleSignInButton
        disabled={busy}
        onPress={() => void login(true)}
      />
      <AuthField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        editable={!busy}
      />
      <AuthField
        label="Hasło"
        password
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        editable={!busy}
        onSubmitEditing={() => void login()}
      />
      <AuthNotice message={error} error />
      <Button
        label={busy ? 'Logowanie…' : 'Zaloguj się'}
        disabled={busy}
        onPress={() => void login()}
      />
      <Button
        label="Nie pamiętam hasła"
        variant="secondary"
        disabled={busy}
        onPress={() => router.push('/auth/forgot-password')}
      />
      <Button
        label="Załóż konto"
        variant="secondary"
        disabled={busy}
        onPress={() => router.push('/auth/sign-up')}
      />
    </AuthScreen>
  );
}
