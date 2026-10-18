import { router } from 'expo-router';
import { View } from 'react-native';
import {
  AppText,
  Card,
  DemoBadge,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { IS_DEMO_MODE } from '@/constants/app';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';

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
  const back = () => router.dismissTo('/profile');
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <ProfileSubpageHeader title="Ustawienia" onBack={back} />
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
          description="Zarządzanie widocznością profilu i planów. W profilu pokazujemy wyłącznie przybliżoną okolicę oraz przedziały wieku dzieci."
        />
        <SettingsSection
          icon="bell"
          title="Powiadomienia"
          status="Wkrótce"
          description="Tutaj wybierzesz powiadomienia o zaproszeniach, rozmowach i wyjazdach. W tej wersji powiadomienia nie są wysyłane."
        />
        <SettingsSection
          icon="profile"
          title="Konto"
          status="Wkrótce"
          description="Logowanie i zarządzanie kontem będą dostępne w kolejnej wersji."
        />
        <SettingsSection
          icon="lock"
          title="Bezpieczeństwo"
          status="Wkrótce"
          description="Zarządzanie dostępem do konta, zgłoszeniami i zablokowanymi osobami."
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
