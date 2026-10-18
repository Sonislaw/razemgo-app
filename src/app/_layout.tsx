import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import AppTabs from '@/components/app-tabs';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';

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
        <AppTabs />
      </DiscoveryProvider>
    </ThemeProvider>
  );
}
