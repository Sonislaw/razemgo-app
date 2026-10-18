import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Header,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { TripCard } from '@/components/trips/trip-card';
import { DEMO_PROPOSALS, MY_TRIPS } from '@/data/mocks/travel';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <Header
        title="Dobrze być razem."
        subtitle="Witaj w RazemGo. Kolejna przygoda zaczyna się od poznania ludzi."
        brand
      />
      <View style={[styles.hero, { backgroundColor: theme.hero }]}>
        <View style={layout.row}>
          <Icon name="sun" color={theme.energy} />
          <AppText variant="caption" color="heroText" style={styles.eyebrow}>
            MNIEJ PLANOWANIA. WIĘCEJ WSPOMNIEŃ.
          </AppText>
        </View>
        <AppText variant="title" color="heroText">
          Wasz kierunek.{'\n'}Wasze towarzystwo.
        </AppText>
        <AppText color="heroMuted">
          Nad morze, pod namiot, a może gdzieś zupełnie indziej? Odkryj ludzi, z
          którymi będzie Wam po drodze.
        </AppText>
        <Button
          label="Znajdź towarzystwo"
          icon="arrow"
          onPress={() => router.navigate('/explore')}
        />
        <View style={layout.row}>
          <Icon name="people" size={17} color={theme.heroMuted} />
          <AppText variant="caption" color="heroMuted" style={{ flex: 1 }}>
            Dla rodzin, par i wszystkich ciekawych świata.
          </AppText>
        </View>
      </View>
      <Card>
        <View style={layout.row}>
          <Icon name="trips" />
          <AppText variant="heading" style={{ flex: 1 }}>
            Co przed Wami?
          </AppText>
        </View>
        <AppText color="textSecondary">
          W Waszym przykładowym kalendarzu są {MY_TRIPS.length} plany. Jeden cel
          już wybrany, drugi czeka na pomysł.
        </AppText>
        <Button
          label="Zobacz swoje wyjazdy"
          variant="secondary"
          icon="arrow"
          onPress={() => router.navigate('/trips')}
        />
      </Card>
      <View style={layout.section}>
        <SectionTitle
          title="Może właśnie tutaj?"
          detail="Trzy inspiracje na wspólny wyjazd"
        />
        {DEMO_PROPOSALS.slice(0, 3).map(({ trip, group }) => (
          <TripCard key={trip.id} trip={trip} group={group} />
        ))}
        <Button
          label="Odkryj wszystkie propozycje"
          variant="secondary"
          icon="search"
          onPress={() => router.navigate('/explore')}
        />
        <AppText variant="caption" color="textSecondary">
          Wszystkie grupy i plany w tej wersji są fikcyjne.
        </AppText>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: {
    padding: Spacing.four,
    borderRadius: Radius.hero,
    gap: Spacing.three,
  },
  eyebrow: { letterSpacing: 1, flexShrink: 1, fontSize: 10 },
});
