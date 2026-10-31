import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/primitives';
import { getTripLocation } from '@/features/discovery/filter-trips';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';

export function TripLocationSummary({ trip, locationLabel, compact = false }: {
  trip: TripPlan;
  locationLabel?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const campground = trip.mode === 'planned' ? trip.campgroundName?.trim() : '';
  const address = !compact && trip.mode === 'planned' ? trip.campgroundAddress?.trim() : '';
  return (
    <View style={[
      styles.container,
      !compact && styles.details,
      { backgroundColor: theme.backgroundSelected, borderLeftColor: theme.primaryStrong },
    ]}>
      <View style={styles.row}>
        <Icon name="pin" size={compact ? 20 : 22} />
        <AppText color="primaryStrong" style={[styles.text, styles.location, !compact && styles.detailLocation]}>
          {locationLabel ?? getTripLocation(trip)}
          {trip.mode === 'flexible' ? ' · cel do ustalenia' : ''}
        </AppText>
      </View>
      {campground ? (
        <View style={styles.row}>
          <Icon name="tent" size={compact ? 20 : 22} />
          <AppText color="textSecondary" style={[styles.text, styles.secondary, !compact && styles.detailSecondary]}>
            Kemping: {campground}
          </AppText>
        </View>
      ) : null}
      {address ? <AppText color="textSecondary" style={[styles.detailSecondary, styles.address]}>{address}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderLeftWidth: 3, padding: 10, gap: 4 },
  details: { padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, minWidth: 0 },
  location: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  detailLocation: { fontSize: 16, lineHeight: 24 },
  secondary: { fontSize: 13, lineHeight: 20 },
  detailSecondary: { fontSize: 14, lineHeight: 21 },
  address: { marginLeft: 30 },
});
