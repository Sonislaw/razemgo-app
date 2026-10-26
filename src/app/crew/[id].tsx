import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, EmptyState, Screen, SectionTitle } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { GroupContactAction } from '@/features/messaging/trip-contact-action';
import { GroupReportAction } from '@/features/moderation/trip-report-action';
import { useMessaging } from '@/features/messaging/messaging-context';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useGroupProfile } from '@/features/groups/use-group-profile';
import { GroupCompatibilitySummary } from '@/features/groups/group-compatibility-summary';
import { GroupProfileCard } from '@/features/groups/group-profile-card';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export default function PublicGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, status, error, loadingMore, retry, loadMore, preserveOnReturn } = useGroupProfile(id);
  const theme = useTheme();
  const [blocking, setBlocking] = useState(false);
  const { setBlock, busy, actionError, state } = useMessaging();
  const blocked = state.blockedGroupIds.includes(id);
  const back = () => router.canGoBack() ? router.back() : router.replace('/explore');
  return <Screen testID="crew-profile-screen">
    <ProfileSubpageHeader title="Profil ekipy" backLabel="Wróć" onBack={back} />
    <FavoritesNotice />
    {!data ? <DataStatus status={status} error={error} label="Wczytywanie profilu ekipy" onRetry={() => void retry()} /> : null}
    {status === 'ready' && (!data || blocked) ? <EmptyState title="Ten profil jest niedostępny"
      description="Ekipa mogła wyłączyć widoczność, usunąć konto lub ograniczyć kontakt."
      action={<Button label="Wróć do Odkrywaj" onPress={() => router.dismissTo('/explore')} />} /> : data && !blocked ? <>
      <GroupProfileCard group={data.group} about={data.about} expanded />
      {data.compatibility ? <Card><GroupCompatibilitySummary match={data.compatibility} detailed testID="profile-group-compatibility" /></Card> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <FavoriteButton kind="group" targetId={data.group.id} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <GroupContactAction key={id} group={data.group} />
        </View>
      </View>
      <SectionTitle title={'Ogłoszenia ekipy · ' + data.activeTripCount} />
      {data.trips.length ? data.trips.map(p => <DiscoveryTripCard key={p.trip.id} {...p} onNavigate={preserveOnReturn} facts={{ ageBands: p.group.childAgeBands, matchingAgeBands: [] }} />)
        : <Card><AppText color="textSecondary">Ta ekipa nie ma teraz aktywnych ogłoszeń. Możesz zaprosić ją do kontaktu i wspólnie wymyślić wyjazd.</AppText></Card>}
      <DataStatus status={loadingMore ? 'ready' : status} error={error} label="Wczytywanie ogłoszeń" onRetry={() => void retry()} />
      {data.hasMore && (status !== 'loading' || loadingMore) ? <Button label={loadingMore ? 'Wczytywanie ogłoszeń' : 'Pokaż więcej wyjazdów'} variant="secondary"
        disabled={loadingMore} leading={loadingMore ? <ActivityIndicator size="small" color={theme.primaryStrong} accessibilityLabel="Wczytywanie kolejnych ogłoszeń" /> : undefined}
        onPress={() => void loadMore()} /> : null}
      <GroupReportAction groupId={id} />
      <Button label="Zablokuj ekipę" variant="secondary" icon="block" onPress={() => setBlocking(true)} />
      {blocking ? <BottomSheet title="Zablokować ekipę?" onClose={() => { if (!busy) setBlocking(false); }}>
        <AppText>Ekipa zniknie z Twoich propozycji i wyszukiwania. Obie strony stracą możliwość wysyłania wiadomości. Blokadę możesz usunąć w ustawieniach bezpieczeństwa.</AppText>
        {actionError ? <AppText accessibilityRole="alert">{actionError}</AppText> : null}
        <Button label={busy ? 'Blokowanie…' : 'Zablokuj ekipę'} disabled={busy} onPress={async () => { if (await setBlock(id, true)) { setBlocking(false); back(); } }} />
      </BottomSheet> : null}
    </> : null}
  </Screen>;
}
