import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Appearance, Platform, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';
import {
  ProfileProvider,
  useProfile,
} from '@/features/profile/profile-context';
import { MessagingProvider } from '@/features/messaging/messaging-context';
import { OwnTripsProvider } from '@/features/trips/own-trips-context';
import { NotificationsProvider } from '@/features/notifications/notifications-context';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { USE_DEMO_DATA } from '@/constants/app';
import { PushProvider, PushAccountBridge } from '@/features/notifications/push-context';
import { AppText, Button } from '@/components/ui/primitives';
import { initializeMonitoring, reportRenderError, setMonitoringScreen } from '@/lib/monitoring';
import {AccountAccessProvider,AccountAccessGate} from '@/features/moderation/account-access-context';
import { PresenceProvider } from '@/features/presence/presence-context';

initializeMonitoring();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportRenderError(error); }, [error]);
  return <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#F5FAFB' }}>
    <AppText variant="heading">Coś poszło nie tak</AppText>
    <AppText>Nie udało się otworzyć tego ekranu. Spróbuj ponownie.</AppText>
    <Button label="Spróbuj ponownie" onPress={retry} />
  </View>;
}

export const unstable_settings = { anchor: 'account-loading' };

function RootNavigator() {
  const { session, isLoading, isRecovering, error } = useAuth();
  const { hasProfile, status } = useProfile();
  const palette = useTheme();
  // Mount the navigator only after session restoration, preserving cold-start Auth URLs.
  if (isLoading || (session && status === 'loading'))
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator
          accessibilityLabel="Wczytywanie konta"
          color={palette.primaryStrong}
        />
      </View>
    );
  const ready =
    USE_DEMO_DATA ||
    Boolean(
      session &&
      !isLoading &&
      !error &&
      !isRecovering &&
      status === 'ready' &&
      hasProfile,
    );
  return (
    <><Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="account-loading" />
      <Stack.Screen name="auth/callback" />
      <Stack.Protected
        guard={!session && !isLoading && !error && !USE_DEMO_DATA}
      >
        <Stack.Screen name="welcome" />
        <Stack.Screen name="auth/sign-in" />
        <Stack.Screen name="auth/sign-up" />
        <Stack.Screen name="auth/confirm" />
        <Stack.Screen name="auth/forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !isLoading}>
        <Stack.Screen name="auth/reset-password" />
      </Stack.Protected>
      <Stack.Protected
        guard={
          !USE_DEMO_DATA &&
          Boolean(session) &&
          !isLoading &&
          !error &&
          !isRecovering &&
          status === 'ready' &&
          !hasProfile
        }
      >
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="admin" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="group-visibility" />
        <Stack.Screen name="crew/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="messaging-safety" />
        <Stack.Screen name="trips/[id]" />
        <Stack.Screen name="trip-editor" />
      </Stack.Protected>
    </Stack><PushAccountBridge ready={ready} /></>
  );
}

function AccountProviders() {
  const { session } = useAuth();
  // Remount all account-scoped state when identity changes, including pending requests.
  return (
    <ProfileProvider key={session?.user.id ?? 'guest'}>
      <PresenceProvider>
        <OwnTripsProvider>
          <DiscoveryProvider>
            <MessagingProvider>
              <NotificationsProvider>
                <RootNavigator />
              </NotificationsProvider>
            </MessagingProvider>
          </DiscoveryProvider>
        </OwnTripsProvider>
      </PresenceProvider>
    </ProfileProvider>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  useEffect(() => { setMonitoringScreen(pathname); }, [pathname]);
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const palette = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  useEffect(() => {
    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(colorScheme);
    }
  }, [colorScheme]);
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: palette.primaryStrong,
          background: palette.background,
          card: palette.backgroundElement,
          text: palette.text,
          border: palette.border,
        },
      }}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthProvider>
        <AccountAccessProvider><AccountAccessGate><PushProvider><AccountProviders /></PushProvider></AccountAccessGate></AccountAccessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
