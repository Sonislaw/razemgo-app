import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, EmptyState, Screen, SectionTitle } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { GroupContactAction } from '@/features/messaging/trip-contact-action';
import { GroupReportAction } from '@/features/moderation/trip-report-action';
import { useMessaging } from '@/features/messaging/messaging-context';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { fetchPublicGroup } from '@/features/groups/group-repository';
import { groupDirectoryError, type PublicGroupDetail } from '@/features/groups/group-data';
import { DEMO_PUBLIC_GROUPS, withDemoGroupCompatibility } from '@/features/groups/group-demo';
import { USE_DEMO_DATA } from '@/constants/app';
import { useProfile } from '@/features/profile/profile-context';
import { GroupCompatibilitySummary } from '@/features/groups/group-compatibility-summary';
import { GroupProfileCard } from '@/features/groups/group-profile-card';
import { FavoriteButton, FavoritesNotice } from '@/features/favorites/favorite-button';
import { View } from 'react-native';

export default function PublicGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const [data, setData] = useState<PublicGroupDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const generation = useRef(0);
  const { setBlock, busy, actionError, state } = useMessaging();
  const blocked = state.blockedGroupIds.includes(id);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setStatus('loading'); setError(null); setData(null);
    try {
      const example = DEMO_PUBLIC_GROUPS.find(x => x.group.id === id);
      const result = USE_DEMO_DATA ? example ? withDemoGroupCompatibility(example, profile) : null : await fetchPublicGroup(id);
      if (version === generation.current) { setData(result); setStatus('ready'); }
    } catch (e) { if (version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
  }, [id, profile]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const back = () => router.canGoBack() ? router.back() : router.replace('/explore');
  return <Screen>
    <ProfileSubpageHeader title="Profil ekipy" backLabel="Wróć" onBack={back} />
    <FavoritesNotice />
    <DataStatus status={status} error={error} label="Wczytywanie profilu ekipy" onRetry={() => void load()} />
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
      <SectionTitle title={'Ogłoszenia ekipy · ' + data.trips.length} />
      {data.trips.length ? data.trips.map(p => <DiscoveryTripCard key={p.trip.id} {...p} facts={{ ageBands: p.group.childAgeBands, matchingAgeBands: [] }} />)
        : <Card><AppText color="textSecondary">Ta ekipa nie ma teraz aktywnych ogłoszeń. Możesz zaprosić ją do kontaktu i wspólnie wymyślić wyjazd.</AppText></Card>}
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
