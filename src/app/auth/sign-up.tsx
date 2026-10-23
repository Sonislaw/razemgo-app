import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { AuthField, AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import { useAuth, getAuthRedirectUrl } from '@/features/auth/auth-context';
import {
  authErrorMessage,
  normalizeEmail,
  validateCredentials,
} from '@/features/auth/auth-data';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export default function SignUpScreen() {
  const { signInGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = async (google = false) => {
    if (busy) return;
    const errors = google ? [] : validateCredentials(email, password);
    if (!google && password !== repeat)
      errors.push('Hasła muszą być identyczne.');
    if (errors.length) return setError(errors.join(' '));
    setBusy(true);
    setError(null);
    try {
      if (google) setError(await signInGoogle());
      else {
        const { data, error: cause } = await getSupabase().auth.signUp({
          email: normalizeEmail(email),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (cause) setError(authErrorMessage(cause));
        else
          router.replace(
            data.session
              ? '/account-loading'
              : {
                  pathname: '/auth/confirm',
                  params: { email: normalizeEmail(email) },
                },
          );
      }
    } catch (cause) {
      setError(
        isSupabaseConfigured
          ? authErrorMessage(cause)
          : 'Rejestracja jest chwilowo niedostępna. Spróbuj później.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthScreen
      title="Dołącz do RazemGo"
      description="Załóż konto osoby dorosłej. W kolejnym kroku utworzysz profil swojej ekipy."
    >
      <Button
        label="Kontynuuj z Google"
        variant="secondary"
        disabled={busy}
        onPress={() => void register(true)}
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
        maxLength={128}
        autoComplete="new-password"
        editable={!busy}
      />
      <AuthNotice message="Wybierz hasło zawierające co najmniej 10 znaków." />
      <AuthField
        label="Powtórz hasło"
        password
        value={repeat}
        onChangeText={setRepeat}
        maxLength={128}
        autoComplete="new-password"
        editable={!busy}
      />
      <AuthNotice message={error} error />
      <Button
        label={busy ? 'Tworzenie konta…' : 'Załóż konto'}
        disabled={busy}
        onPress={() => void register()}
      />
      <Button
        label="Mam już konto"
        variant="secondary"
        disabled={busy}
        onPress={() => router.replace('/auth/sign-in')}
      />
    </AuthScreen>
  );
}
