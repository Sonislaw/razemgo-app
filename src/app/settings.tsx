import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  DemoBadge,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { IS_DEMO_MODE } from '@/constants/app';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { AccountSettings } from '@/features/auth/account-settings';
import { PushPermissionCard } from '@/features/notifications/push-permission-card';
import { NotificationPreferencesCard } from '@/features/notifications/notification-ui';
import { MonitoringTestCard } from '@/features/notifications/monitoring-test-card';
import {useAccountAccess} from '@/features/moderation/account-access-context';

function SettingsSection({
  icon,
  title,
  description,
  status,
}: {
  icon: IconName;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <Card style={{ gap: 8 }}>
      <View style={layout.row}>
        <Icon name={icon} size={22} />
        <AppText
          accessibilityRole="header"
          variant="label"
          style={{ flex: 1, fontSize: 16 }}
        >
          {title}
        </AppText>
        {status ? (
          <AppText variant="caption" color="primaryStrong">
            {status}
          </AppText>
        ) : null}
      </View>
      <AppText
        variant="body"
        color="textSecondary"
        style={{ fontSize: 14, lineHeight: 20 }}
      >
        {description}
      </AppText>
    </Card>
  );
}

export default function SettingsScreen() {
  const {is_admin}=useAccountAccess();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromHome = from === 'home';
  const back = () => router.dismissTo(fromHome ? '/' : '/profile');
  const openSafety = () => router.push({ pathname: '/messaging-safety', params: { from: 'settings' } });
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <ProfileSubpageHeader
          title="Ustawienia"
          onBack={back}
          backLabel={fromHome ? 'Wróć na Start' : 'Wróć do profilu'}
        />
        <SettingsSection
          icon="sun"
          title="Wygląd aplikacji"
          status="Jasny"
          description="Aplikacja używa jasnego motywu."
        />
        <Card style={{ gap: 12 }}>
          <View style={layout.row}>
            <Icon name="shield" size={22} />
            <AppText accessibilityRole="header" variant="label" style={{ fontSize: 16 }}>
              Prywatność
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary">
            Zarządzaj widocznością profilu i blokadami. Widoczność konkretnego
            wyjazdu zmienisz w jego edycji. Wiek dzieci pokazujemy w przedziałach.
          </AppText>
          <Button label="Widoczność profilu" icon="people" variant="secondary" onPress={() => router.push('/group-visibility')} />
          <Button label="Zablokowane ekipy" icon="block" variant="secondary" onPress={openSafety} />
        </Card>
        <PushPermissionCard />
        <NotificationPreferencesCard />
        <AccountSettings />
        {is_admin ? <Button label="Panel administracyjny" icon="shield" variant="secondary" onPress={()=>router.push('/admin')} /> : null}
        <MonitoringTestCard />
        <Button
          label="Bezpieczeństwo rozmów"
          icon="shield"
          variant="secondary"
          onPress={openSafety}
        />
        {IS_DEMO_MODE ? (
          <View style={{ gap: 8 }}>
            <DemoBadge />
            <AppText variant="caption" color="textSecondary">
              Korzystasz z fikcyjnego profilu. Edycja działa lokalnie do
              ponownego uruchomienia aplikacji.
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
