import { Image, type ImageProps } from 'expo-image';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export function HomeAction({
  label,
  description,
  illustration,
  illustrationSize,
  onPress,
  variant = 'primary',
  density = 'regular',
  orientation = 'horizontal',
  showIllustration = true,
  showDescription = true,
  style,
}: {
  label: string;
  description: string;
  illustration: ImageProps['source'];
  illustrationSize?: number;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  density?: 'regular' | 'compact' | 'minimal';
  orientation?: 'horizontal' | 'vertical';
  showIllustration?: boolean;
  showDescription?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const minimal = density === 'minimal';
  const compact = density !== 'regular';
  const vertical = orientation === 'vertical';
  const artworkSize =
    illustrationSize ?? (minimal ? (showDescription ? 56 : 40) : compact ? 88 : 112);
  const artwork = showIllustration ? (
    <Image
      source={illustration}
      style={{
        width: artworkSize,
        height: artworkSize,
        flexShrink: 0,
        marginTop: vertical ? -(compact ? 24 : 28) : 0,
        transform: [
          { translateX: vertical ? 0 : minimal ? 4 : 8 },
          { translateY: vertical ? 0 : minimal ? -2 : -4 },
          { scale: 1.35 },
        ],
      }}
      contentFit="contain"
      pointerEvents="none"
      accessible={false}
      alt=""
    />
  ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        {
          flexDirection: vertical ? 'column' : 'row',
          minHeight: minimal ? (showDescription ? 76 : 56) : compact ? 108 : 144,
          padding: minimal ? 8 : compact ? 12 : 16,
          gap: compact ? 8 : 12,
          borderRadius: 24,
          borderWidth: 1,
          overflow: 'visible',
          borderColor: primary ? theme.border : `${theme.accent}40`,
          backgroundColor: primary ? theme.backgroundSelected : theme.hero,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {vertical ? artwork : null}
      <View
        style={{
          flex: vertical ? 0 : 1,
          alignSelf: vertical ? 'stretch' : undefined,
          minWidth: 0,
          gap: compact ? 4 : 8,
        }}
      >
        <AppText
          variant="heading"
          color="primaryStrong"
          style={{
            fontSize: minimal ? 16 : 20,
            lineHeight: minimal ? 22 : 26,
            textAlign: vertical ? 'center' : undefined,
          }}
        >
          {label}
        </AppText>
        {showDescription ? (
          <AppText
            color="textSecondary"
            style={{
              fontSize: minimal ? 12 : compact ? 13 : 14,
              lineHeight: minimal ? 16 : compact ? 18 : 20,
              textAlign: vertical ? 'center' : undefined,
            }}
          >
            {description}
          </AppText>
        ) : null}
      </View>
      {!vertical ? artwork : null}
      <View
        style={{
          width: minimal ? 24 : 28,
          height: minimal ? 24 : 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.iconBackground,
          ...(showIllustration
            ? {
                position: 'absolute',
                right: 8,
                top: vertical ? 8 : undefined,
                bottom: vertical ? undefined : 8,
              }
            : { flexShrink: 0 }),
        }}
      >
        <Icon name="arrow" size={16} />
      </View>
    </Pressable>
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
