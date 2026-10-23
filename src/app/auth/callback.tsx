import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Button } from '@/components/ui/primitives';
import { AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import { useAuth, getAuthRedirectUrl } from '@/features/auth/auth-context';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const { completeCallback, session, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (typeof value === 'string') query.set(key, value);
  const encodedQuery = query.toString();
  const url = getAuthRedirectUrl() + (encodedQuery ? '?' + encodedQuery : '');
  useEffect(() => {
    let active = true;
    void completeCallback(url).then((result) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined')
        window.history.replaceState({}, '', '/auth/callback');
      if (Platform.OS === 'web') WebBrowser.maybeCompleteAuthSession();
      if (!active) return;
      if (result.error) setError(result.error);
      else
        router.replace(
          result.recovery ? '/auth/reset-password' : '/account-loading',
        );
    });
    return () => {
      active = false;
    };
  }, [url, completeCallback]);
  return (
    <AuthScreen title={error ? 'Link wymaga odświeżenia' : 'Potwierdzanie…'}>
      <AuthNotice message={error} error />
      {error ? (
        <>
          <Button
            label={session ? 'Przejdź do konta' : 'Wróć do logowania'}
            onPress={() => router.replace('/account-loading')}
          />
          {session ? (
            <Button
              label="Wyloguj się"
              variant="secondary"
              onPress={() =>
                void signOut().catch(() => setError('Spróbuj ponownie.'))
              }
            />
          ) : (
            <Button
              label="Wyślij nowy link do hasła"
              variant="secondary"
              onPress={() => router.replace('/auth/forgot-password')}
            />
          )}
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="Potwierdzanie logowania" />
      )}
    </AuthScreen>
  );
}
