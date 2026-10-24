import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { AuthField, AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import {
  authErrorMessage,
  normalizeEmail,
  validateCredentials,
} from '@/features/auth/auth-data';
import { getAuthRedirectUrl } from '@/features/auth/auth-context';
import { getSupabase } from '@/lib/supabase';
import { monitoredOperation, reportFailure } from '@/lib/monitoring-core';

export default function ConfirmEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(
    typeof params.email === 'string' ? params.email : '',
  );
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const submit = async (resend = false) => {
    if (busy || (resend && cooldown > 0)) return;
    const errors = validateCredentials(email);
    if (!resend && !/^\d{6}$/.test(code.trim()))
      errors.push('Wpisz sześciocyfrowy kod z wiadomości.');
    if (errors.length) return setError(errors.join(' '));
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = resend
        ? await monitoredOperation('auth.resend', () => getSupabase().auth.resend({
            type: 'signup',
            email: normalizeEmail(email),
            options: { emailRedirectTo: getAuthRedirectUrl() },
          }))
        : await monitoredOperation('auth.confirm', () => getSupabase().auth.verifyOtp({
            type: 'signup',
            email: normalizeEmail(email),
            token: code.trim(),
          }));
      if (result.error) setError(authErrorMessage(result.error));
      else if (resend) {
        setMessage(
          'Jeśli konto oczekuje na potwierdzenie, otrzymasz wiadomość. Sprawdź również spam.',
        );
        setCooldown(60);
      } else router.replace('/account-loading');
    } catch (cause) {
      reportFailure(cause, resend ? 'auth.resend' : 'auth.confirm');
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthScreen
      title="Potwierdź e-mail"
      description="Otwórz link w wiadomości na tym urządzeniu lub wpisz kod z e-maila. Jeśli masz już konto Google, zaloguj się przez Google — hasło możesz ustawić w ustawieniach."
    >
      <AuthField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        editable={!busy}
      />
      <AuthField
        label="Kod potwierdzenia"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        maxLength={6}
        editable={!busy}
      />
      <AuthNotice message={error} error />
      <AuthNotice message={message} />
      <Button
        label={busy ? 'Proszę czekać…' : 'Potwierdź adres'}
        disabled={busy}
        onPress={() => void submit()}
      />
      <Button
        label={
          cooldown ? `Wyślij ponownie za ${cooldown} s` : 'Wyślij ponownie'
        }
        variant="secondary"
        disabled={busy || cooldown > 0}
        onPress={() => void submit(true)}
      />
      <Button
        label="Wróć do logowania"
        variant="secondary"
        disabled={busy}
        onPress={() => router.replace('/auth/sign-in')}
      />
    </AuthScreen>
  );
}
