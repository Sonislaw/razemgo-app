import { StyleSheet, View } from 'react-native';
import { AppText, Chip, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Landscape } from './landscape';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatTripDates,
  getTripLocation,
  sharedNights,
} from '@/features/discovery/filter-trips';
import type { DateRange, TravelGroup, TripPlan } from '@/types/travel';

export interface TripCardProps {
  trip: TripPlan;
  group: TravelGroup;
  compact?: boolean;
  dateRange?: DateRange;
}
export function TripCard({
  trip,
  group,
  compact = false,
  dateRange,
}: TripCardProps) {
  const theme = useTheme();
  const nights = dateRange ? sharedNights(trip, dateRange) : 0;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      {!compact ? <Landscape kind={trip.landscape} /> : null}
      <View style={styles.body}>
        <View style={layout.wrap}>
          <AppText variant="caption" color="primaryStrong">
            {trip.mode === 'planned' ? 'MAM PLAN' : 'SZUKAM POMYSŁU'}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            · WYJAZD DEMONSTRACYJNY
          </AppText>
        </View>
        <AppText variant="heading" accessibilityRole="header">
          {trip.title}
        </AppText>
        <View style={layout.row}>
          <Icon name="pin" size={17} />
          <AppText variant="label" color="textSecondary" style={styles.flex}>
            {getTripLocation(trip)}
            {trip.mode === 'flexible' ? ' · cel do ustalenia' : ''}
          </AppText>
        </View>
        <View style={layout.row}>
          <Icon name="calendar" size={17} />
          <AppText variant="label" color="textSecondary" style={styles.flex}>
            {formatTripDates(trip)}
          </AppText>
        </View>
        {!compact ? (
          <AppText color="textSecondary">{trip.description}</AppText>
        ) : null}
        <View style={layout.wrap}>
          {trip.interests.map((interest) => (
            <Chip key={interest} label={interest} />
          ))}
        </View>
        {nights > 0 ? (
          <View
            style={[
              styles.reason,
              { backgroundColor: theme.positiveBackground },
            ]}
          >
            <Icon name="check" size={17} color={theme.positive} />
            <AppText variant="label" color="positive" style={styles.flex}>
              Wspólne noce w wybranym terminie: {nights}
            </AppText>
          </View>
        ) : null}
        <View style={[styles.group, { borderTopColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.muted }]}>
            <Icon name="people" size={22} color={theme.positive} />
          </View>
          <View style={styles.flex}>
            <AppText variant="label">{group.name}</AppText>
            <AppText variant="caption" color="textSecondary">
              {group.adultCount}{' '}
              {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
              {group.childAgeBands.length
                ? ' · dzieci: ' + group.childAgeBands.join(', ') + ' lat'
                : ' · bez dzieci'}
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
  body: { padding: Spacing.three, gap: 12 },
  flex: { flex: 1 },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.small,
  },
});
