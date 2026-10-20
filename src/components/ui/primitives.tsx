import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
  Typography,
  type ThemeColor,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { IS_DEMO_MODE } from '@/constants/app';
import { Icon, type IconName } from './icon';
import { ScenicFooter } from './scenic-footer';

export interface AppTextProps extends TextProps {
  variant?: keyof typeof Typography;
  color?: ThemeColor;
}
export function AppText({
  variant = 'body',
  color = 'text',
  style,
  ...props
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...props}
      style={[
        { fontFamily: Fonts.sans, color: theme[color] },
        Typography[variant],
        style,
      ]}
    />
  );
}
export function Screen({
  children,
  header,
  adjustKeyboardInsets = true,
}: {
  children: ReactNode;
  header?: ReactNode;
  adjustKeyboardInsets?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets={adjustKeyboardInsets}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[
        styles.scroll,
        {
          paddingTop: Spacing.three + (Platform.OS === 'ios' ? 0 : insets.top),
        },
      ]}
    >
      {header}
      <View
        style={[
          styles.screenContent,
          {
            paddingLeft: Math.max(Spacing.four, insets.left),
            paddingRight: Math.max(Spacing.four, insets.right),
          },
        ]}
      >
        <View style={styles.screen}>{children}</View>
      </View>
      <ScenicFooter />
    </ScrollView>
  );
}
export function DemoBadge() {
  const theme = useTheme();
  if (!IS_DEMO_MODE) return null;
  return (
    <View style={[styles.demoBadge, { backgroundColor: theme.muted }]}>
      <View style={[styles.dot, { backgroundColor: theme.community }]} />
      <AppText variant="caption" color="text">
        Wersja demonstracyjna
      </AppText>
    </View>
  );
}
export interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <View style={styles.pageHeader}>
      <AppText
        accessibilityRole="header"
        variant="heading"
        style={styles.pageTitle}
      >
        {title}
      </AppText>
      {actions ? <View style={layout.row}>{actions}</View> : null}
    </View>
  );
}
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}
export function IconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 48,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.pill,
        backgroundColor: theme.muted,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={22} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  const theme = useTheme();
  const background = disabled
    ? theme.disabled
    : variant === 'primary'
      ? theme.primary
      : theme.backgroundSelected;
  const foreground = disabled
    ? theme.disabledText
    : variant === 'primary'
      ? theme.onPrimary
      : theme.primaryStrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <AppText
        variant="label"
        style={{ color: foreground, flexShrink: 1, textAlign: 'center' }}
      >
        {label}
      </AppText>
      {icon ? <Icon name={icon} color={foreground} size={20} /> : null}
    </Pressable>
  );
}
export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}
export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
}: ChipProps) {
  const theme = useTheme();
  const content = (
    <AppText
      variant="label"
      color={selected ? 'primaryStrong' : 'text'}
      style={{ flexShrink: 1 }}
    >
      {label}
    </AppText>
  );
  const baseStyle = [
    styles.chip,
    {
      backgroundColor: selected ? theme.backgroundSelected : theme.muted,
      borderColor: selected ? theme.primaryStrong : theme.border,
    },
  ];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        ...baseStyle,
        styles.touchChip,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      {selected ? <Icon name="check" size={15} /> : null}
      {content}
    </Pressable>
  ) : (
    <View style={baseStyle}>{content}</View>
  );
}
export function Card({ style, ...props }: ViewProps) {
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
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
}
export function EmptyState({
  title,
  description,
  icon = 'search',
  action,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <Card style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.hero }]}>
        <Icon name={icon} size={44} />
      </View>
      <AppText
        accessibilityRole="header"
        variant="heading"
        style={styles.center}
      >
        {title}
      </AppText>
      <AppText color="textSecondary" style={styles.center}>
        {description}
      </AppText>
      {action}
    </Card>
  );
}
export function SectionTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={{ gap: Spacing.one }}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {detail ? (
        <AppText variant="label" color="textSecondary">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}
export const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stack: { gap: Spacing.three },
  section: { gap: Spacing.three },
});
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center' },
  screenContent: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: Spacing.five,
  },
  screen: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  pageHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pageTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 24,
    lineHeight: 30,
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  button: {
    minHeight: 52,
    borderRadius: Radius.small,
    paddingVertical: 14,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  touchChip: { minHeight: 48 },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: Radius.hero,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  center: { textAlign: 'center' },
});
