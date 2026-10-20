import { Pressable, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export function HomeAction({
  label,
  description,
  icon,
  onPress,
  variant = 'primary',
}: {
  label: string;
  description: string;
  icon: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const foreground = primary ? theme.onPrimary : theme.primaryStrong;
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={description}
        onPress={onPress}
        style={({ pressed }) => [
          layout.row,
          {
            minHeight: 84,
            padding: 16,
            gap: 12,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: primary ? theme.primary : theme.border,
            backgroundColor: primary
              ? theme.primary
              : theme.backgroundSelected,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <View
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: primary
              ? 'rgba(255, 255, 255, 0.15)'
              : theme.backgroundElement,
          }}
        >
          <Icon name={icon} color={foreground} size={26} />
        </View>
        <AppText
          variant="heading"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 20,
            lineHeight: 26,
            color: foreground,
          }}
        >
          {label}
        </AppText>
        <Icon name="arrow" color={foreground} size={22} />
      </Pressable>
      <AppText
        color="textSecondary"
        style={{ fontSize: 14, lineHeight: 21, paddingHorizontal: 4 }}
      >
        {description}
      </AppText>
    </View>
  );
}

export function ActivityPreview({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        {
          minHeight: 76,
          padding: 12,
          gap: 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.muted,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          backgroundColor: theme.backgroundElement,
          borderRadius: 14,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name={icon} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={2}>
          {description}
        </AppText>
      </View>
      <Icon name="chevron" size={18} />
    </Pressable>
  );
}
