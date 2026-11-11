import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/primitives';
import { getTripLocation } from '@/features/discovery/filter-trips';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import { useLivePlace } from '@/features/trips/use-live-place';
import { areaPlaceLabel } from '@/features/trips/place-data';
import { GeoapifyAttribution } from './geoapify-attribution';

export function TripLocationSummary({ trip, locationLabel, compact = false }: {
  trip: TripPlan;
  locationLabel?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const original=trip.mode==='planned' ? trip.destination : trip.travelArea;
  const locality=compact&&trip.mode==='planned'?trip.searchArea:undefined;
  const place=useLivePlace(compact&&trip.mode==='planned'?locality:original.place);
  const campground = !compact&&trip.mode === 'planned' ? trip.campgroundName?.trim() : '';
  const address = !compact&&trip.mode==='planned' ? place?.address || trip.campgroundAddress?.trim() : '';
  const title=trip.mode==='flexible'&&place?areaPlaceLabel(place.name,place.kind):place?.name??locationLabel??getTripLocation(trip);
  return (
    <View style={[
      styles.container,
      !compact && styles.details,
      { backgroundColor: theme.backgroundSelected, borderLeftColor: theme.primaryStrong },
    ]}>
      <View style={styles.row}>
        <Icon name="pin" size={compact ? 20 : 22} />
        <AppText color="primaryStrong" style={[styles.text, styles.location, !compact && styles.detailLocation]}>
          {title}
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
      {place?.source==='google' ? <AppText style={{fontSize:12,fontWeight:'400',color:theme.textSecondary,marginLeft:30}}>Google Maps</AppText> : null}
      {place?.source==='geoapify' ? <View style={{marginLeft:30}}><GeoapifyAttribution/></View> : null}
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
