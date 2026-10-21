import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarGradient } from '@/components/ui/tab-bar-gradient';
import { BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TAB_ITEMS } from '@/constants/navigation';
import { TAB_ICONS } from '@/constants/tab-icons';
import { useMessaging } from '@/features/messaging/messaging-context';
import { notificationCount } from '@/features/messaging/messaging-state';

export default function AppTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useMessaging();
  const notifications = notificationCount(state);
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        backBehavior="history"
        backgroundColor={theme.backgroundElement}
        tintColor={theme.primaryStrong}
        badgeBackgroundColor={theme.notificationBackground}
        badgeTextColor={theme.notificationText}
        iconColor={{
          default: theme.textSecondary,
          selected: theme.primaryStrong,
        }}
        indicatorColor={theme.backgroundSelected}
        labelVisibilityMode="labeled"
        labelStyle={{ fontSize: 11, color: theme.textSecondary }}
        tabBarRespectsIMEInsets
      >
        {TAB_ITEMS.map((tab) => (
          <NativeTabs.Trigger
            key={tab.name}
            name={tab.name}
            disableAutomaticContentInsets={tab.name === 'index'}
            disableTransparentOnScrollEdge
            accessibilityLabel={
              tab.label +
              (tab.name === 'messages' && notifications
                ? ', nowe: ' + notifications
                : '')
            }
          >
            <NativeTabs.Trigger.Label
              selectedStyle={{ color: theme.primaryStrong }}
            >
              {tab.label}
            </NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              src={TAB_ICONS[tab.icon].native}
              renderingMode="template"
            />
            {tab.name === 'messages' && notifications > 0 ? (
              <NativeTabs.Trigger.Badge>
                {notifications > 99 ? '99+' : String(notifications)}
              </NativeTabs.Trigger.Badge>
            ) : null}
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
      <TabBarGradient height={BottomTabInset + insets.bottom} />
    </View>
  );
}
