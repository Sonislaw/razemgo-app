import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { TripListingAction, TripListingCard } from '@/components/trips/trip-listing-card';
import { WELCOME_LISTINGS } from '@/data/mocks/welcome-listings';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { FavoriteIconButton } from '@/features/favorites/favorite-icon-button';

export function WelcomeFeaturedListing() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * WELCOME_LISTINGS.length));
  const hasFocused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasFocused.current) {
      hasFocused.current = true;
      return;
    }
    // Keep the example stable while reading; choose another one on return.
    const offset = 1 + Math.floor(Math.random() * (WELCOME_LISTINGS.length - 1));
    setIndex(previous => (previous + offset) % WELCOME_LISTINGS.length);
  }, []));
  const trip = WELCOME_LISTINGS[index];
  return (
    <View testID="welcome-listing-section" style={styles.section}>
      <AppText variant="label" accessibilityRole="header">Tak może zacząć się Twoja przygoda</AppText>
      <TripListingCard
        testID="welcome-featured-listing"
        nativeID={trip.id}
        trip={trip}
        group={trip.group}
        score={trip.exampleCompatibility}
        compatibilityTestID="welcome-example-compatibility"
        favoriteAction={<FavoriteIconButton compact translucent label="Dodaj wyjazd do ulubionych — załóż konto"
          testID="welcome-favorite" onPress={() => router.push('/auth/sign-up')} />}
        accessibilityLabel={'Przykładowe ogłoszenie: ' + getTripHeadline(trip) + ', ' + trip.exampleCompatibility + '% przykładowej zgodności'}
        accessibilityHint="Załóż konto, aby poznawać podróżników z podobnymi planami."
        onPress={() => router.push('/auth/sign-up')}
        footer={
          <View style={styles.footer}>
            <AppText variant="caption" color="textSecondary" style={styles.caption}>
              Przykładowe ogłoszenie i dopasowanie
            </AppText>
            <TripListingAction label="Dołącz" onPress={() => router.push('/auth/sign-up')} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  caption: { flex: 1, minWidth: 0 },
});
