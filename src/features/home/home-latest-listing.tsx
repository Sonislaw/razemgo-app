import { Pressable, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { TripThumbnail } from '@/components/trips/trip-thumbnail';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';

export function HomeLatestListing({
  trip,
  compact,
  onPress,
}: {
  trip: TripPlan;
  compact: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const headline = getTripHeadline(trip);
  const place =
    trip.mode === 'planned' ? trip.destination.name : trip.travelArea.name;
  const dates = formatTripDates(trip);
  return (
    <Pressable
      testID="home-latest-listing"
      accessibilityRole="button"
      accessibilityLabel={'Ostatnio dodane ogłoszenie: ' + headline}
      accessibilityHint={place + ', ' + dates + '. Otwórz szczegóły wyjazdu.'}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        {
          minHeight: compact ? 56 : 92,
          padding: compact ? 8 : 12,
          gap: compact ? 8 : 12,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 20,
          backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <TripThumbnail
          kind={trip.landscape}
          size={compact ? 40 : 56}
          height={compact ? 40 : 56}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: compact ? 2 : 4 }}>
        <AppText
          variant="label"
          numberOfLines={compact ? 1 : 2}
          style={{ lineHeight: 18 }}
        >
          {headline}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {compact ? place + ' · ' + dates : place}
        </AppText>
        {!compact ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {dates}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron" size={18} />
    </Pressable>
  );
}
