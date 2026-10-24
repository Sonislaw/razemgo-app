import { router } from 'expo-router';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  HeaderRow,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { DataStatus } from '@/components/ui/data-status';
import { useMessaging } from '@/features/messaging/messaging-context';
import { GroupAvatar } from '@/features/messaging/messaging-ui';

export default function MessagingSafetyScreen() {
  const { state, setBlock, contact, busy, actionError, error, refresh } = useMessaging();
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <HeaderRow>
          <IconButton
            label="Wróć do Wiadomości"
            icon="back"
            onPress={() => router.dismissTo('/messages')}
          />
          <AppText
            variant="heading"
            accessibilityRole="header"
            style={{ flex: 1 }}
          >
            Bezpieczeństwo rozmów
          </AppText>
        </HeaderRow>
        <DataStatus label="Wczytywanie kontaktów" status={error ? 'error' : state.loadStatus} error={error} onRetry={() => { void refresh(); }} />
        {actionError ? <AppText accessibilityRole="alert" color="textSecondary">{actionError}</AppText> : null}
        <Card style={{ gap: 12 }}>
          <View style={layout.row}>
            <Icon name="shield" />
            <AppText variant="label" style={{ flex: 1 }}>
              Poznawaj innych na swoich zasadach
            </AppText>
          </View>
          <AppText style={{ fontSize: 14, lineHeight: 21 }}>
            Kontakt jest przeznaczony dla dorosłych. Rozmowę rozpoczynasz
            dopiero po akceptacji zaproszenia. Odrzucenie nie wymaga podawania
            przyczyny.
          </AppText>
          <AppText style={{ fontSize: 14, lineHeight: 21 }}>
            Nie dodajemy automatycznie do czatu danych dzieci z profilu. To Ty
            decydujesz, czym dzielisz się z drugą ekipą. Unikaj podawania
            dokładnego adresu i wrażliwych danych.
          </AppText>
        </Card>
        <Card style={{ gap: 12 }}>
          <AppText variant="label" accessibilityRole="header">
            Zablokowane ekipy · {state.blockedGroupIds.length}
          </AppText>
          {!state.blockedGroupIds.length ? (
            <AppText color="textSecondary" style={{ fontSize: 14 }}>
              Nie masz zablokowanych ekip. Opcje blokowania znajdziesz w menu
              rozmowy.
            </AppText>
          ) : (
            state.blockedGroupIds.map((id) => (
              <View key={id} style={{ gap: 8 }}>
                <View style={layout.row}>
                  <GroupAvatar groupId={id} avatarId={contact(id)?.avatarId} size={40} />
                  <AppText variant="label" style={{ flex: 1 }}>
                    {contact(id)?.name ??
                      'Ekipa'}
                  </AppText>
                </View>
                <Button
                  label="Odblokuj"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => { void setBlock(id, false); }}
                />
              </View>
            ))
          )}
        </Card>
        <Card style={{ gap: 8 }}>
          <AppText variant="label" accessibilityRole="header">
            Zgłoszenia · {state.reports.length}
          </AppText>
          {state.reports.map((report) => (
            <AppText key={report.id} variant="caption">
              {contact(report.groupId)?.name ??
                'Ekipa'}{' '}
              · {report.reason}
            </AppText>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
