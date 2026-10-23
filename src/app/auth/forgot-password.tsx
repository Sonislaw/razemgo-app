import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { AuthField, AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import { useAuth } from '@/features/auth/auth-context';
import { validateCredentials } from '@/features/auth/auth-data';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (busy) return;
    const errors = validateCredentials(email);
    if (errors.length) return setError(errors.join(' '));
    setBusy(true);
    setError(null);
    const cause = await requestPasswordReset(email);
    setError(cause);
    setSent(!cause);
    setBusy(false);
  };
  return (
    <AuthScreen
      title="Odzyskaj dostęp"
      description="Wyślemy wiadomość z linkiem do ustawienia nowego hasła."
    >
      <AuthField
        label="E-mail"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setSent(false);
        }}
        keyboardType="email-address"
        autoComplete="email"
        editable={!busy}
      />
      <AuthNotice message={error} error />
      <AuthNotice
        message={
          sent
            ? 'Jeśli konto istnieje, otrzymasz wiadomość. Otwórz link na tym urządzeniu. Sprawdź także spam.'
            : null
        }
      />
      <Button
        label={busy ? 'Wysyłanie…' : 'Wyślij link'}
        disabled={busy || sent}
        onPress={() => void send()}
      />
      <Button
        label="Wróć do logowania"
        variant="secondary"
        onPress={() => router.replace('/auth/sign-in')}
      />
    </AuthScreen>
  );
}
