import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/hooks/use-theme';
import { TAB_ITEMS } from '@/constants/navigation';
import { SYMBOLS } from '@/components/ui/icon';

export default function AppTabs() {
  const theme = useTheme();
  return (
    <NativeTabs
      backBehavior="history"
      backgroundColor={theme.backgroundElement}
      tintColor={theme.primaryStrong}
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
          disableTransparentOnScrollEdge
          accessibilityLabel={tab.label}
        >
          <NativeTabs.Trigger.Label
            selectedStyle={{ color: theme.primaryStrong }}
          >
            {tab.label}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={SYMBOLS[tab.icon].ios}
            md={SYMBOLS[tab.icon].android}
          />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
