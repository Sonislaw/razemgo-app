import { IS_DEMO_MODE } from '@/constants/app';
import {
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
  Typography,
  type ThemeColor,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAutoPagination, type AutoPagination } from '@/hooks/use-auto-pagination';
import type { ReactNode, Ref } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextProps,
  type ScrollViewInstance,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './icon';
import { ScenicFooter } from './scenic-footer';
import { getScenicHeaderLayout, ScenicHeaderBackground } from './scenic-header';

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
export function FieldLabel({
  children,
  required = false,
  variant = 'label',
  ...props
}: AppTextProps & { required?: boolean }) {
  return (
    <AppText {...props} variant={variant}>
      {children}
      {required ? (
        <AppText
          variant="caption"
          color="primaryStrong"
          style={{ fontWeight: '700' }}
        >
          {' -\u00a0wymagane'}
        </AppText>
      ) : null}
    </AppText>
  );
}
export function Screen({
  children,
  header,
  testID,
  adjustKeyboardInsets = true,
  footerPlacement = 'flow',
  fillFooter = false,
  onNearEnd,
  pagination,
  scrollRef,
}: {
  children: ReactNode;
  header?: ReactNode;
  testID?: string;
  adjustKeyboardInsets?: boolean;
  footerPlacement?: 'flow' | 'fixed';
  fillFooter?: boolean;
  onNearEnd?: () => void;
  pagination?: AutoPagination;
  scrollRef?: Ref<ScrollViewInstance>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const fixedFooter = footerPlacement === 'fixed';
  const paging = useAutoPagination(pagination);
  const content = (
    <ScrollView
      ref={scrollRef}
      scrollEventThrottle={onNearEnd || pagination ? 100 : undefined}
      onLayout={pagination ? paging.onLayout : undefined}
      onScrollBeginDrag={pagination ? paging.onScrollBeginDrag : undefined}
      onContentSizeChange={pagination ? paging.onContentSizeChange : undefined}
      onScroll={
        onNearEnd || pagination
          ? (event) => {
              if (pagination) paging.onScroll(event);
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              if (
                contentOffset.y + layoutMeasurement.height >
                contentSize.height - 600
              )
                onNearEnd?.();
            }
          : undefined
      }
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: fixedFooter ? 'transparent' : theme.background,
      }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets={adjustKeyboardInsets}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={[
        styles.scroll,
        {
          paddingTop: header
            ? 0
            : Spacing.three + (Platform.OS === 'ios' ? 0 : insets.top),
          paddingBottom:
            fixedFooter && Platform.OS !== 'ios' ? insets.bottom : 0,
        },
      ]}
    >
      {!header ? (
        <ScenicHeaderBackground
          style={{ top: Platform.OS === 'ios' ? 0 : insets.top }}
        />
      ) : null}
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
      {!fixedFooter ? <ScenicFooter fillAvailableSpace={fillFooter} /> : null}
    </ScrollView>
  );

  if (!fixedFooter) return content;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        testID="fixed-scenic-footer"
        pointerEvents="none"
        style={[styles.fixedFooter, { bottom: insets.bottom }]}
      >
        <ScenicFooter />
      </View>
      {content}
    </View>
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
// Use inside Screen's padded column for media that reaches both window edges.
export function ScreenFullWidth({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const leftPadding = Math.max(Spacing.four, insets.left);
  const rightPadding = Math.max(Spacing.four, insets.right);
  const paddedWidth = width - leftPadding - rightPadding;
  const columnOffset = Math.max(0, (paddedWidth - MaxContentWidth) / 2);
  return (
    <View style={{ width, marginLeft: -(leftPadding + columnOffset) }}>
      {children}
    </View>
  );
}
export interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}
export function HeaderRow({ style, ...props }: ViewProps) {
  const { width } = useWindowDimensions();
  const { height } = getScenicHeaderLayout(width);
  return (
    <View
      {...props}
      style={[
        styles.pageHeader,
        { minHeight: height, paddingBottom: height - 48 },
        style,
      ]}
    />
  );
}
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <HeaderRow>
      <AppText
        accessibilityRole="header"
        variant="heading"
        style={styles.pageTitle}
      >
        {title}
      </AppText>
      {actions ? <View style={layout.row}>{actions}</View> : null}
    </HeaderRow>
  );
}
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  leading?: ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  singleLine?: boolean;
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
        backgroundColor: theme.iconBackground,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={22} color={theme.textSecondary} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  icon,
  leading,
  variant = 'primary',
  disabled = false,
  singleLine = false,
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
      {leading}
      <AppText
        variant="label"
        numberOfLines={singleLine ? 1 : undefined}
        adjustsFontSizeToFit={singleLine}
        minimumFontScale={singleLine ? 0.9 : undefined}
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
  compact?: boolean;
}
export function Chip({
  label,
  selected = false,
  onPress,
  accessibilityLabel,
  compact = false,
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
    compact && styles.compactChip,
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
      aria-pressed={selected}
      hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        ...baseStyle,
        !compact && styles.touchChip,
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
  compact?: boolean | 'dense';
}
export function EmptyState({
  title,
  description,
  icon = 'search',
  action,
  compact = false,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <Card style={[styles.empty, compact && styles.emptyCompact, compact === 'dense' && styles.emptyDense]}>
      <View style={[styles.emptyIcon, compact && styles.emptyIconCompact, compact === 'dense' && styles.emptyIconDense, { backgroundColor: theme.hero }]}>
        <Icon name={icon} size={compact === 'dense' ? 28 : compact ? 32 : 44} />
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
  required = false,
}: {
  title: string;
  detail?: string;
  required?: boolean;
}) {
  return (
    <View style={{ gap: Spacing.one }}>
      <FieldLabel
        variant="heading"
        accessibilityRole="header"
        required={required}
      >
        {title}
      </FieldLabel>
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
  fixedFooter: { position: 'absolute', left: 0, right: 0 },
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
  compactChip: { minHeight: 32, paddingVertical: 4, paddingHorizontal: 10 },
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
  emptyCompact: { paddingVertical: Spacing.four },
  emptyIconCompact: { width: 64, height: 64, borderRadius: Radius.card, marginBottom: 0 },
  emptyDense: { paddingVertical: 12, paddingHorizontal: Spacing.three, gap: 10 },
  emptyIconDense: { width: 48, height: 48, borderRadius: 16 },
  center: { textAlign: 'center' },
});
