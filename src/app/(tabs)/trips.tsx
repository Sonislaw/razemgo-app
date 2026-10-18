import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Header,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { TripCard } from '@/components/trips/trip-card';
import { Icon } from '@/components/ui/icon';
import { MY_GROUP, MY_TRIPS } from '@/data/mocks/travel';

export default function TripsScreen() {
  return (
    <Screen>
      <Header
        title="Przed Wami dobre chwile."
        subtitle="Wasze plany i pomysły na małe oraz duże przygody."
        brand
      />
      <Card>
        <View style={layout.row}>
          <Icon name="plus" />
          <AppText variant="heading" style={{ flex: 1 }}>
            Dokąd następnym razem?
          </AppText>
        </View>
        <AppText color="textSecondary">
          Masz cel albo po prostu wolny weekend? Tutaj będzie można zaprosić
          innych do wspólnego wyjazdu.
        </AppText>
        <Button label="Dodaj wyjazd · Wkrótce" icon="plus" disabled />
        <AppText variant="caption" color="textSecondary">
          Tworzenie i edycja planów będą dostępne w kolejnej wersji.
        </AppText>
      </Card>
      <View style={layout.section}>
        <SectionTitle
          title="Wasze wyjazdy"
          detail="2 przykładowe plany · sezon 2027"
        />
        {MY_TRIPS.map((trip) => (
          <TripCard key={trip.id} trip={trip} group={MY_GROUP} />
        ))}
      </View>
    </Screen>
  );
}
