import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { TripListingAction, TripListingCard } from '@/components/trips/trip-listing-card';
import { WELCOME_LISTINGS } from '@/data/mocks/welcome-listings';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { FavoriteIconButton } from '@/features/favorites/favorite-icon-button';
import { reactionTotal, topReactions, type ReactionSummary } from '@/features/reactions/reaction-data';

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
  const reactions: ReactionSummary = { trip_id: trip.id, available: true, can_react: false, mine: null, counts: trip.exampleReactions };
  const total = reactionTotal(reactions);
  return (
    <View testID="welcome-listing-section" style={styles.section}>
      <AppText variant="label" accessibilityRole="header">Tak może zacząć się Twoja przygoda</AppText>
      <TripListingCard
        testID="welcome-featured-listing"
        nativeID={trip.id}
        trip={trip}
        group={trip.group}
        exampleRecommendation
        compatibilityTestID="welcome-example-compatibility"
        favoriteAction={<FavoriteIconButton compact translucent label="Dodaj wyjazd do ulubionych — załóż konto"
          testID="welcome-favorite" onPress={() => router.push('/auth/sign-up')} />}
        accessibilityLabel={'Przykładowe ogłoszenie: ' + getTripHeadline(trip)}
        accessibilityHint="Załóż konto, aby poznawać podróżników z podobnymi planami."
        onPress={() => router.push('/auth/sign-up')}
        footer={
          <View style={styles.footer}>
            <Pressable testID="welcome-reactions" accessibilityRole="button"
              accessibilityLabel={`Przykładowe reakcje: ${total}. Załóż konto, aby dodać reakcję.`}
              onPress={() => router.push('/auth/sign-up')}
              style={({ pressed }) => [styles.reactions, { opacity: pressed ? 0.7 : 1 }]}>
              <AppText aria-hidden style={{ fontSize: 18 }}>{topReactions(reactions).map(option => option.emoji).join(' ')}</AppText>
              <AppText variant="caption" color="primaryStrong" style={{ fontWeight: '700' }}>{total}</AppText>
            </Pressable>
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
  reactions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5 },
});
