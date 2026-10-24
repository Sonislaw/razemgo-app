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
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromHome = from === 'home';
  const back = () => router.dismissTo(fromHome ? '/' : '/profile');
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
          description="Aplikacja używa jasnego motywu. Możliwość wyboru motywu pojawi się w kolejnej wersji."
        />
        <SettingsSection
          icon="shield"
          title="Prywatność"
          status="Wkrótce"
          description="Zarządzanie widocznością profilu i planów. Wiek dzieci pokazujemy w przybliżonych przedziałach."
        />
        <PushPermissionCard />
        <AccountSettings />
        <Button
          label="Bezpieczeństwo rozmów"
          icon="shield"
          variant="secondary"
          onPress={() => router.push('/messaging-safety')}
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
