import { StyleSheet, View, type ViewProps } from 'react-native';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function CompactTripCard({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}
    />
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.card, padding: 16, gap: 8 },
});
