import { DataStatus } from '@/components/ui/data-status';
import { AppText, Screen } from '@/components/ui/primitives';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { TripEditorScreen } from '@/features/trips/trip-editor-controller';
import { useOwnTrip } from '@/features/trips/use-own-trip';
import { useLocalSearchParams } from 'expo-router';
export default function TripEditorEntry() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const details = useOwnTrip(id);
  const { status, error, refresh, hasLoaded } = useOwnTrips();
  if (id && details.status !== 'ready')
    return (
      <Screen>
        <AppText variant="heading">Edytuj wyjazd</AppText>
        <DataStatus
          status={details.status}
          error={details.error}
          onRetry={details.retry}
        />
      </Screen>
    );
  if (!hasLoaded)
    return (
      <Screen>
        <AppText variant="heading">Nowy wyjazd</AppText>
        <DataStatus
          status={status}
          error={error}
          onRetry={() => {
            void refresh();
          }}
        />
      </Screen>
    );
  return <TripEditorScreen />;
}
