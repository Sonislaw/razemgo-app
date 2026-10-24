import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

export { GroupAvatar } from '@/features/profile/group-avatar';

export function CountBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <View
      style={{
        minWidth: 22,
        minHeight: 22,
        paddingHorizontal: 6,
        borderRadius: 12,
        backgroundColor: theme.notificationBackground,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText
        variant="caption"
        style={{ color: theme.notificationText, fontWeight: '700' }}
      >
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

export function MessageSegments<T extends string>({
  value,
  options,
  onChange,
  subtle = false,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  subtle?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 4,
        gap: 4,
        borderRadius: 16,
        backgroundColor: subtle ? theme.background : theme.muted,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={
            option.label + (option.count ? ', ' + option.count : '')
          }
          accessibilityState={{ selected: value === option.value }}
          aria-selected={value === option.value}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            paddingHorizontal: 8,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor:
              value === option.value ? theme.backgroundElement : 'transparent',
            opacity: pressed ? 0.65 : 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            flexWrap: 'wrap',
          })}
        >
          <AppText
            variant="label"
            color={value === option.value ? 'primaryStrong' : 'textSecondary'}
            style={{ textAlign: 'center', flexShrink: 1 }}
          >
            {option.label}
          </AppText>
          {option.count ? <CountBadge count={option.count} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function MailboxEmpty({
  title,
  description,
  icon = 'chat',
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 20,
          backgroundColor: theme.hero,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name={icon} size={30} />
      </View>
      <AppText
        variant="heading"
        accessibilityRole="header"
        style={{ textAlign: 'center' }}
      >
        {title}
      </AppText>
      <AppText
        color="textSecondary"
        style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}
      >
        {description}
      </AppText>
      <View style={{ alignSelf: 'stretch', gap: 8 }}>{children}</View>
    </View>
  );
}

export { BottomSheet as MessagingSheet } from '@/components/ui/bottom-sheet';
