import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, Card, Chip, EmptyState, Screen, SectionTitle, layout } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { AnimalBadge } from '@/features/animals/animal-portrait';
import { GroupContactAction } from '@/features/messaging/trip-contact-action';
import { GroupReportAction } from '@/features/moderation/trip-report-action';
import { useMessaging } from '@/features/messaging/messaging-context';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { fetchPublicGroup } from '@/features/groups/group-repository';
import { groupDirectoryError, type PublicGroupDetail } from '@/features/groups/group-data';
import { DEMO_PUBLIC_GROUPS } from '@/features/groups/group-demo';
import { USE_DEMO_DATA } from '@/constants/app';

export default function PublicGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
      const result = USE_DEMO_DATA ? DEMO_PUBLIC_GROUPS.find(x => x.group.id === id) ?? null : await fetchPublicGroup(id);
      if (version === generation.current) { setData(result); setStatus('ready'); }
    } catch (e) { if (version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const back = () => router.canGoBack() ? router.back() : router.replace('/explore');
  return <Screen>
    <ProfileSubpageHeader title="Profil ekipy" backLabel="Wróć" onBack={back} />
    <DataStatus status={status} error={error} label="Wczytywanie profilu ekipy" onRetry={() => void load()} />
    {status === 'ready' && (!data || blocked) ? <EmptyState title="Ten profil jest niedostępny"
      description="Ekipa mogła wyłączyć widoczność, usunąć konto lub ograniczyć kontakt."
      action={<Button label="Wróć do Odkrywaj" onPress={() => router.dismissTo('/explore')} />} /> : data && !blocked ? <>
      <Card>
        <View style={layout.row}><GroupAvatar groupId={data.group.id} avatarId={data.group.avatarId} size={88} />
          <View style={{ flex: 1, gap: 4 }}><AppText variant="heading">{data.group.name}</AppText>
            <AppText variant="caption" color="textSecondary">{GROUP_KIND_OPTIONS.find(x => x.value === data.group.kind)?.label}</AppText>
            <AppText variant="caption">{data.group.adultCount} {data.group.adultCount === 1 ? 'dorosły' : 'dorosłych'}</AppText></View></View>
        {data.about ? <AppText>{data.about}</AppText> : null}
        <TravelModeBadges modes={data.group.travelModes} />
        <View style={layout.wrap}>
          {data.group.childAgeBands.length ? <Chip label={'Dzieci ' + data.group.childAgeBands.join(', ') + ' lat'} /> : null}
          {data.group.animals.animals.map(a => <AnimalBadge key={a.kind} kind={a.kind} />)}
          {data.group.interests.map(i => <Chip key={i} label={i} />)}
        </View>
      </Card>
      <GroupContactAction key={id} group={data.group} />
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
