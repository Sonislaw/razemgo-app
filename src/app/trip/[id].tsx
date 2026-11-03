import { TripDetailsContent } from '@/components/trips/trip-details-content';
import { DataStatus } from '@/components/ui/data-status';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscoveryTrip } from '@/features/discovery/use-trip-search';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  DemoBadge,
  EmptyState,
  HeaderRow,
  IconButton,
  Screen,
} from '@/components/ui/primitives';
import { TripCover } from '@/components/trips/trip-cover';
import { AVAILABLE_PROPOSALS } from '@/data/proposals';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { TripContactAction } from '@/features/messaging/trip-contact-action';
import { TripReportAction } from '@/features/moderation/trip-report-action';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareLinkButton } from '@/features/sharing/share-link-button';

export function generateStaticParams() {
  return AVAILABLE_PROPOSALS.map(({ trip }) => ({ id: trip.id }));
}

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { item: proposal, status, error, refresh } = useDiscoveryTrip(id);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const back = () =>
    router.canGoBack() ? router.back() : router.replace('/explore');
  if (!proposal && status !== 'ready') return (
    <Screen><DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Wczytywanie wyjazdu" /></Screen>
  );
  if (!proposal)
    return (
      <Screen>
        <EmptyState
          title="Nie znaleźliśmy tego wyjazdu"
          description="Ten wyjazd nie jest dostępny. Wróć do listy propozycji."
          action={
            <Button
              label="Przejdź do Odkrywaj"
              onPress={() => router.replace('/explore')}
            />
          }
        />
      </Screen>
    );
  const { trip, group } = proposal;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
    <Screen>
      <HeaderRow>
        <IconButton icon="back" label="Wróć do listy wyjazdów" onPress={back} />
        <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
          Wyjazd
        </AppText>
        <ShareLinkButton kind="trip" targetId={trip.id} />
        <DemoBadge />
        <TripReportAction key={trip.id} tripId={trip.id} />
      </HeaderRow>
      <FavoritesNotice />
      <DataStatus status={status} error={error} onRetry={() => { void refresh(); }} label="Odświeżanie wyjazdu" />
      <TripCover trip={trip} variant="details" datesLabel={formatTripDates(trip)} action={<FavoriteButton kind="trip" targetId={trip.id} compact translucent />} />
      <TripDetailsContent
        trip={trip}
        group={group}
        onOpenGroup={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })}
      />
    </Screen>
    <View testID="trip-contact-bar" style={{
      backgroundColor: theme.backgroundElement, borderTopWidth: 1, borderTopColor: theme.border,
      paddingTop: 8, paddingBottom: Math.max(8, insets.bottom),
      paddingHorizontal: Math.max(16, insets.left, insets.right),
    }}>
      <View style={{ width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' }}>
        <TripContactAction proposal={proposal} />
      </View>
    </View>
    </View>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
});
