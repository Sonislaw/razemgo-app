import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/primitives';
import { TAB_ITEMS } from '@/constants/navigation';
import { TAB_ICONS, type TabIconName } from '@/constants/tab-icons';
import { useTheme } from '@/hooks/use-theme';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useMessaging } from '@/features/messaging/messaging-context';
import { notificationCount } from '@/features/messaging/messaging-state';
import { CountBadge } from '@/features/messaging/messaging-ui';
import { TabBarGradient } from '@/components/ui/tab-bar-gradient';

// Router's slot ref still uses the legacy View type. Use Pressable's instance ref.
type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> &
  Pick<ComponentProps<typeof Pressable>, 'ref'> & {
    icon: TabIconName;
    count?: number;
  };

function TabButton({
  children,
  isFocused,
  icon,
  count = 0,
  ...props
}: TabButtonProps) {
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
        <Image
          source={TAB_ICONS[icon].web[isFocused ? 'selected' : 'default']}
          tintColor={isFocused ? theme.primaryStrong : theme.textSecondary}
          contentFit="contain"
          style={{ width: 26, height: 26 }}
          accessible={false}
          alt=""
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
        <TabBarGradient />
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
