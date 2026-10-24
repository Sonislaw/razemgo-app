import { ActivityIndicator, View } from 'react-native';
import { AppText, Button, Card, layout } from './primitives';
import { useTheme } from '@/hooks/use-theme';

export function DataStatus({ status, error, onRetry, label = 'Wczytywanie wyjazdów' }: {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  onRetry: () => void;
  label?: string;
}) {
  const theme = useTheme();
  if (status === 'ready') return null;
  return status === 'loading' ? (
    <View style={[layout.row, { paddingVertical: 12 }]} accessibilityLiveRegion="polite">
      <ActivityIndicator color={theme.primaryStrong} accessibilityLabel={label} />
      <AppText variant="label" color="textSecondary">{label}</AppText>
    </View>
  ) : (
    <Card>
      <AppText accessibilityRole="alert">{error ?? 'Nie udało się pobrać danych.'}</AppText>
      <Button label="Spróbuj ponownie" icon="refresh" variant="secondary" onPress={onRetry} />
    </Card>
  );
}
