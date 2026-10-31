import { View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { tripParticipantsSummary } from '@/lib/trip-participants';
import type { TripParticipants } from '@/types/travel';

export function TripParticipantsSummary({ value }: { value?: TripParticipants | null }) {
  return (
    <View style={{ gap: 8 }} testID="trip-participants">
      <AppText>{tripParticipantsSummary(value)}</AppText>
      {value?.childCount && value.childAgeBands.length ? (
        <AppText color="textSecondary">
          Dzieci {value.childAgeBands.join(', ')} lat
        </AppText>
      ) : null}
    </View>
  );
}
