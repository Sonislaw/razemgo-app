import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Button } from '@/components/ui/primitives';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { AuthNotice, AuthScreen } from '@/features/auth/auth-ui';
import { useProfile } from '@/features/profile/profile-context';

export default function AccountLoadingScreen() {
  const auth = useAuth();
  const profile = useProfile();
  if (USE_DEMO_DATA) return <Redirect href="/" />;
  if (auth.error || (auth.session && profile.status === 'error'))
    return (
      <AuthScreen title="Wróćmy do Twojego konta">
        <AuthNotice message={auth.error ?? profile.error} error />
        <Button
          label="Spróbuj ponownie"
          onPress={auth.error ? auth.retry : profile.retry}
        />
        {auth.error ? (
          <Button
            label="Zaloguj się ponownie"
            variant="secondary"
            onPress={() => void auth.resetSession()}
          />
        ) : null}
        {auth.session ? (
          <Button
            label="Wyloguj się"
            variant="secondary"
            onPress={() => void auth.signOut().catch(auth.retry)}
          />
        ) : null}
      </AuthScreen>
    );
  if (auth.isLoading || (auth.session && profile.status === 'loading'))
    return (
      <AuthScreen title="Jeszcze chwila…">
        <ActivityIndicator accessibilityLabel="Wczytywanie konta" />
      </AuthScreen>
    );
  if (!auth.session) return <Redirect href="/welcome" />;
  if (auth.isRecovering) return <Redirect href="/auth/reset-password" />;
  return <Redirect href={profile.hasProfile ? '/' : '/onboarding'} />;
}
