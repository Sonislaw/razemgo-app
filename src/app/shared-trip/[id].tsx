import { Redirect, useLocalSearchParams } from 'expo-router';
import { DataStatus } from '@/components/ui/data-status';
import { Screen } from '@/components/ui/primitives';
import { SHARING_ENABLED, SHARING_SCHEME } from '@/features/sharing/share-config';
import { createShareLink } from '@/features/sharing/share-links';
import { useOwnTrip } from '@/features/trips/use-own-trip';

function ResolveSharedTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const validId = createShareLink('trip', id, SHARING_SCHEME) ? id : undefined;
  const own = useOwnTrip(validId);
  if (!validId) return <Redirect href="/explore" />;
  if (own.status !== 'ready') return <Screen>
    <DataStatus status={own.status} error={own.error} onRetry={own.retry} label="Otwieranie wyjazdu" />
  </Screen>;
  // Check ownership by ID, including trips outside the loaded pages of My Trips.
  return <Redirect href={{ pathname: own.trip ? '/trips/[id]' : '/trip/[id]', params: { id: validId } }} />;
}

export default function SharedTripScreen() {
  return SHARING_ENABLED ? <ResolveSharedTrip /> : <Redirect href="/explore" />;
}
