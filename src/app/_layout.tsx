import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
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
      <DiscoveryProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="trip/[id]" />
        </Stack>
      </DiscoveryProvider>
    </ThemeProvider>
  );
}
