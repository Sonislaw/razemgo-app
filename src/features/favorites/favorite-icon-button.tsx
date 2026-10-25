import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FavoriteIconButton({ selected = false, pending = false, disabled = false, compact = false, translucent = false, label, onPress, testID }: {
  selected?: boolean;
  pending?: boolean;
  disabled?: boolean;
  compact?: boolean;
  translucent?: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const circleSize = compact ? Typography.caption.lineHeight * fontScale + 10 : 44;
  const touchSize = Math.max(44, circleSize);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected, busy: pending, disabled: disabled || pending }}
      disabled={disabled || pending} testID={testID}
      onPress={event => { event.stopPropagation(); onPress(); }}
      style={({ pressed }) => ({ width: touchSize, height: touchSize, alignItems: compact ? 'flex-end' : 'center', justifyContent: compact ? 'flex-start' : 'center', opacity: pressed || pending ? 0.65 : 1 })}>
      <View style={{ width: circleSize, height: circleSize, borderRadius: circleSize / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: translucent ? theme.backgroundElement + 'CC' : theme.backgroundElement, borderWidth: 1, borderColor: theme.border }}>
        {pending ? <ActivityIndicator color={theme.primaryStrong} size="small" /> : <Icon name={selected ? 'heart-filled' : 'heart'} size={compact ? 18 : 24} color={selected ? '#DC2626' : theme.primaryStrong} />}
      </View>
    </Pressable>
  );
}
