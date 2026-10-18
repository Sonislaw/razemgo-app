import { router } from 'expo-router';
import { AppText, Button } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { IS_DEMO_MODE } from '@/constants/app';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { DEMO_OWN_TRIPS } from '@/data/mocks/owned-trips';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { createOwnTripsState } from '@/features/trips/own-trips-state';
import { useMessaging } from '@/features/messaging/messaging-context';
import { createMessagingState } from '@/features/messaging/messaging-state';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';

type HomeScenario = 'active' | 'new' | 'no-trips' | 'draft' | 'messages';
export function HomeDemoControls({ onClose }: { onClose: () => void }) {
  const { resetProfile } = useProfile();
  const { dispatch: dispatchTrips } = useOwnTrips();
  const { dispatch: dispatchMessages } = useMessaging();
  const { setFilters } = useDiscovery();
  if (!IS_DEMO_MODE) return null;
  const setScenario = (scenario: HomeScenario) => {
    resetProfile(scenario === 'new' ? 'new' : 'example');
    const trips =
      scenario === 'new' || scenario === 'no-trips'
        ? []
        : scenario === 'draft'
          ? [
              {
                ...DEMO_OWN_TRIPS[0],
                status: 'draft' as const,
                visibility: 'private' as const,
              },
            ]
          : DEMO_OWN_TRIPS;
    dispatchTrips({ type: 'reset', state: createOwnTripsState(trips) });
    dispatchMessages({
      type: 'reset',
      state: createMessagingState(
        DEMO_MAILBOX,
        scenario === 'active'
          ? 'initial'
          : scenario === 'messages'
            ? 'conversations'
            : 'empty',
      ),
    });
    setFilters({ ...INITIAL_FILTERS });
    onClose();
    if (scenario === 'new') router.push('/welcome');
  };
  return (
    <BottomSheet title="Warianty ekranu Start" onClose={onClose}>
      <AppText variant="caption" color="textSecondary">
        Wybór zastąpi profil, wyjazdy, skrzynkę i filtry przykładowym stanem.
        Zmiany pozostają w bieżącej sesji.
      </AppText>
      <Button
        label="Wyjazdy i nowe zaproszenia"
        variant="secondary"
        onPress={() => setScenario('active')}
      />
      <Button
        label="Nowy użytkownik · bez profilu"
        variant="secondary"
        onPress={() => setScenario('new')}
      />
      <Button
        label="Profil bez wyjazdów"
        variant="secondary"
        onPress={() => setScenario('no-trips')}
      />
      <Button
        label="Tylko niedokończony szkic"
        variant="secondary"
        onPress={() => setScenario('draft')}
      />
      <Button
        label="Nieprzeczytane rozmowy"
        variant="secondary"
        onPress={() => setScenario('messages')}
      />
    </BottomSheet>
  );
}
