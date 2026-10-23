import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, Card } from '@/components/ui/primitives';
import { USE_DEMO_DATA } from '@/constants/app';
import { authErrorMessage } from './auth-data';
import { useAuth } from './auth-context';
import { AuthNotice } from './auth-ui';

export function AccountSettings() {
  const { session, signOut, deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perform = async (remove = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (remove) setError(await deleteAccount());
      else await signOut();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (USE_DEMO_DATA) return null;
  return (
    <Card>
      <AppText variant="heading">Twoje konto</AppText>
      <AppText selectable>{session?.user.email}</AppText>
      <AppText variant="caption" color="textSecondary">
        E-mail służy do logowania. Nie jest częścią profilu widocznego dla
        innych podróżników.
      </AppText>
      <Button
        label="Zmień lub ustaw hasło"
        variant="secondary"
        disabled={busy}
        onPress={() => router.push('/auth/reset-password')}
      />
      <Button
        label={busy ? 'Proszę czekać…' : 'Wyloguj się'}
        variant="secondary"
        disabled={busy}
        onPress={() => void perform()}
      />
      <AuthNotice message={error} error />
      {confirming ? (
        <>
          <AuthNotice
            message="Usunięcie konta jest nieodwracalne. Usuniemy konto logowania, profil ekipy i jego preferencje."
            error
          />
          <Button
            label={busy ? 'Usuwanie…' : 'Potwierdzam — usuń konto'}
            disabled={busy}
            onPress={() => void perform(true)}
          />
          <Button
            label="Zachowaj konto"
            variant="secondary"
            disabled={busy}
            onPress={() => setConfirming(false)}
          />
        </>
      ) : (
        <Button
          label="Usuń konto"
          variant="secondary"
          disabled={busy}
          onPress={() => setConfirming(true)}
        />
      )}
    </Card>
  );
}
