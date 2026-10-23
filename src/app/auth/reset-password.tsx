import { router } from 'expo-router';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { AuthField, AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import { useAuth } from '@/features/auth/auth-context';
import { validateCredentials } from '@/features/auth/auth-data';

export default function ResetPasswordScreen() {
  const { updatePassword, signOut, session, isRecovering } = useAuth();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    const errors = validateCredentials(session?.user.email ?? '', password);
    if (password !== repeat) errors.push('Hasła muszą być identyczne.');
    if (errors.length) return setError(errors.join(' '));
    setBusy(true);
    setError(null);
    const cause = await updatePassword(password);
    setError(cause);
    setBusy(false);
    if (!cause) router.replace('/account-loading');
  };
  return (
    <AuthScreen
      title="Ustaw nowe hasło"
      description="Wybierz hasło zawierające od 10 do 128 znaków."
    >
      <AuthField
        label="Nowe hasło"
        password
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        maxLength={128}
        editable={!busy}
      />
      <AuthField
        label="Powtórz nowe hasło"
        password
        value={repeat}
        onChangeText={setRepeat}
        autoComplete="new-password"
        maxLength={128}
        editable={!busy}
      />
      <AuthNotice message={error} error />
      <Button
        label={busy ? 'Zapisywanie…' : 'Zapisz hasło'}
        disabled={busy}
        onPress={() => void save()}
      />
      <Button
        label={isRecovering ? 'Wróć do logowania' : 'Anuluj'}
        variant="secondary"
        disabled={busy}
        onPress={() => {
          if (isRecovering)
            void signOut().catch(() =>
              setError('Nie udało się wylogować. Spróbuj ponownie.'),
            );
          else router.back();
        }}
      />
    </AuthScreen>
  );
}
