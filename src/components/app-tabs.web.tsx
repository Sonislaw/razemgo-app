import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { TAB_ITEMS } from '@/constants/navigation';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useMessaging } from '@/features/messaging/messaging-context';
import { notificationCount } from '@/features/messaging/messaging-state';
import { CountBadge } from '@/features/messaging/messaging-ui';

function TabButton({
  children,
  isFocused,
  icon,
  count = 0,
  ...props
}: TabTriggerSlotProps & { icon: IconName; count?: number }) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={
        typeof children === 'string'
          ? children + (count ? ', nowe: ' + count : '')
          : undefined
      }
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: isFocused
              ? theme.backgroundSelected
              : theme.backgroundElement,
          },
        ]}
      >
        <Icon
          name={icon}
          size={22}
          color={isFocused ? theme.primaryStrong : theme.textSecondary}
        />
        {count ? (
          <View style={{ position: 'absolute', top: -5, right: 0 }}>
            <CountBadge count={count} />
          </View>
        ) : null}
      </View>
      <AppText
        variant="caption"
        color={isFocused ? 'primaryStrong' : 'textSecondary'}
        style={styles.label}
      >
        {children}
      </AppText>
    </Pressable>
  );
}
export default function AppTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useMessaging();
  const notifications = notificationCount(state);
  return (
    <Tabs
      style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}
      options={{ backBehavior: 'history' }}
    >
      <TabSlot style={styles.slot} />
      <TabList
        style={[
          styles.bar,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
            paddingBottom: Math.max(8, insets.bottom),
          },
        ]}
      >
        {TAB_ITEMS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
            <TabButton
              icon={tab.icon}
              count={tab.name === 'messages' ? notifications : 0}
            >
              {tab.label}
            </TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}
const styles = StyleSheet.create({
  tabs: { flex: 1, height: '100%' },
  slot: { flex: 1, minHeight: 0 },
  bar: {
    borderTopWidth: 1,
    alignItems: 'stretch',
    alignSelf: 'center',
    paddingTop: 8,
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
  },
  tab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', gap: 4 },
  icon: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  label: { fontSize: 11, textAlign: 'center', maxWidth: '100%' },
});
