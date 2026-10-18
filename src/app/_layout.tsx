import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import AppTabs from '@/components/app-tabs';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const palette = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
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
