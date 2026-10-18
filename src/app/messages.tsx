import { router } from 'expo-router';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Header,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';

export default function MessagesScreen() {
  return (
    <Screen>
      <Header
        title="Od „cześć” do wspomnień."
        subtitle="Miejsce na rozmowy z przyszłymi towarzyszami podróży."
        brand
      />
      <EmptyState
        icon="chat"
        title="Tu zacznie się Wasza rozmowa"
        description="Gdy druga grupa zaakceptuje zaproszenie, będziecie mogli poznać się i ustalić szczegóły wspólnego wyjazdu."
        action={
          <Button
            label="Odkryj towarzystwo"
            icon="arrow"
            onPress={() => router.navigate('/explore')}
          />
        }
      />
      <Card>
        <View style={layout.row}>
          <Icon name="shield" />
          <AppText variant="label" style={{ flex: 1 }}>
            Poznajecie się na swoich zasadach
          </AppText>
        </View>
        <AppText color="textSecondary">
          Rozmowy będą dostępne dla dorosłych po obustronnej zgodzie na kontakt.
        </AppText>
        <AppText variant="caption" color="primaryStrong">
          Zaproszenia i wiadomości · Wkrótce
        </AppText>
      </Card>
    </Screen>
  );
}
