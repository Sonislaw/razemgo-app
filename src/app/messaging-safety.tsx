import { router } from 'expo-router';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { DEMO_GROUPS } from '@/data/mocks/travel';
import { useMessaging } from '@/features/messaging/messaging-context';
import { GroupAvatar } from '@/features/messaging/messaging-ui';

export default function MessagingSafetyScreen() {
  const { state, dispatch } = useMessaging();
  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <View style={layout.row}>
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
        </View>
        <Card style={{ gap: 12 }}>
          <View style={layout.row}>
            <Icon name="shield" />
            <AppText variant="label" style={{ flex: 1 }}>
              Poznajecie się na swoich zasadach
            </AppText>
          </View>
          <AppText style={{ fontSize: 14, lineHeight: 21 }}>
            Kontakt jest przeznaczony dla dorosłych. Rozmowę rozpoczynacie
            dopiero po akceptacji zaproszenia. Odrzucenie nie wymaga podawania
            przyczyny.
          </AppText>
          <AppText style={{ fontSize: 14, lineHeight: 21 }}>
            Nie dodajemy automatycznie do czatu danych dzieci z profilu. Sami
            decydujecie, czym dzielicie się z drugą ekipą. Unikajcie podawania
            dokładnego adresu i wrażliwych danych.
          </AppText>
        </Card>
        <Card style={{ gap: 12 }}>
          <AppText variant="label" accessibilityRole="header">
            Zablokowane ekipy · {state.blockedGroupIds.length}
          </AppText>
          {!state.blockedGroupIds.length ? (
            <AppText color="textSecondary" style={{ fontSize: 14 }}>
              Nie blokujecie żadnej ekipy. Opcje blokowania znajdziecie w menu
              rozmowy.
            </AppText>
          ) : (
            state.blockedGroupIds.map((id) => (
              <View key={id} style={{ gap: 8 }}>
                <View style={layout.row}>
                  <GroupAvatar groupId={id} size={40} />
                  <AppText variant="label" style={{ flex: 1 }}>
                    {DEMO_GROUPS.find((group) => group.id === id)?.name ??
                      'Ekipa'}
                  </AppText>
                </View>
                <Button
                  label="Odblokuj"
                  variant="secondary"
                  onPress={() => dispatch({ type: 'unblock', groupId: id })}
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
              {DEMO_GROUPS.find((group) => group.id === report.groupId)?.name ??
                'Ekipa'}{' '}
              · {report.reason}
            </AppText>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
