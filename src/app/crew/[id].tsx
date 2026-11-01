import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, EmptyState, SectionTitle } from '@/components/ui/primitives';
import { CollectionScreen } from '@/components/ui/collection-screen';
import { DataStatus } from '@/components/ui/data-status';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { GroupContactAction } from '@/features/messaging/trip-contact-action';
import { GroupReportAction } from '@/features/moderation/trip-report-action';
import { useMessaging } from '@/features/messaging/messaging-context';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { useGroupProfile } from '@/features/groups/use-group-profile';
import { GroupProfileCard } from '@/features/groups/group-profile-card';
import { ProfileCoverHeader } from '@/features/profile/profile-cover-header';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { View } from 'react-native';

export default function PublicGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, status, error, loadingMore, retry, loadMore, preserveOnReturn } = useGroupProfile(id);
  const { setBlock, busy, actionError, state } = useMessaging();
  const blocked = state.blockedGroupIds.includes(id);
  const back = () => router.canGoBack() ? router.back() : router.replace('/explore');
  const available = !!data && !blocked;
  const profileActions = available ? <GroupReportAction key={id} groupId={id} blockAction={{
    busy,
    error: actionError,
    onConfirm: async () => { if (await setBlock(id, true)) back(); },
  }} /> : null;
  return <CollectionScreen testID="crew-profile-screen" data={available ? data.trips : []} itemGap={24}
    header={available ? <ProfileCoverHeader avatarId={data.group.avatarId} title="Profil ekipy" onBack={back} actions={profileActions} /> : undefined}
    keyExtractor={item => item.trip.id}
    renderItem={({ item }) => <DiscoveryTripCard {...item} onNavigate={preserveOnReturn} />}
    beforeList={<>
    {!available ? <ProfileSubpageHeader title="Profil ekipy" backLabel="Wróć" onBack={back} /> : null}
    {!data ? <DataStatus status={status} error={error} label="Wczytywanie profilu ekipy" onRetry={() => void retry()} /> : null}
    {status === 'ready' && (!data || blocked) ? <EmptyState title="Ten profil jest niedostępny"
      description="Konto ekipy mogło zostać usunięte lub dostęp do niego został ograniczony."
      action={<Button label="Wróć do Odkrywaj" onPress={() => router.dismissTo('/explore')} />} /> : data && !blocked ? <>
      <GroupProfileCard group={data.group} expanded />
      <FavoritesNotice />
      <Card>
        <SectionTitle title="O ekipie" />
        <AppText color="textSecondary">
          {data.about.trim() || 'Ekipa nie dodała jeszcze opisu.'}
        </AppText>
      </Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FavoriteButton kind="group" targetId={data.group.id} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <GroupContactAction key={id} group={data.group} />
        </View>
      </View>
      <SectionTitle title={'Ogłoszenia ekipy · ' + data.activeTripCount} />
    </> : null}
    </>}
    empty={available ? <Card><AppText color="textSecondary">Ta ekipa nie ma teraz aktywnych ogłoszeń. Możesz zaprosić ją do kontaktu i wspólnie wymyślić wyjazd.</AppText></Card> : null}
    afterList={available ? <>
      <DataStatus status={status === 'loading' ? 'ready' : status} error={error} label="Wczytywanie ogłoszeń" onRetry={() => void retry()} />
      {data.hasMore ? <LoadMoreButton label="Pokaż więcej wyjazdów" loadingLabel="Wczytywanie ogłoszeń"
        loadingAccessibilityLabel="Wczytywanie kolejnych ogłoszeń" loading={loadingMore} disabled={status === 'loading'}
        onPress={() => void loadMore()} /> : null}
    </> : null}
  />;
}
