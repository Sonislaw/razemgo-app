import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { isPresenceActive } from '@/features/presence/presence-context';
import { REACTIONS, reactionOption, reactionTotal, topReactions, type ReactionKind, type ReactorsPage, type TripReactor } from './reaction-data';
import { useTripReactions } from './reactions-context';
import { fetchTripReactors } from './reactions-repository';

export function TripReactionsButton({ tripId, ownerGroupId }: { tripId: string; ownerGroupId: string }) {
  const theme = useTheme();
  const { profile } = useProfile();
  const { session } = useAuth();
  const { store, summary, busy, loading, error } = useTripReactions(tripId);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<ReactorsPage | null>(null);
  const [peopleError, setPeopleError] = useState(false);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [failedKind, setFailedKind] = useState<ReactionKind | null | undefined>(undefined);
  const version = useRef(0), fetching = useRef(false);
  const owner = ownerGroupId === profile.group.id;
  const userId = session?.user.id;
  const loadPeople = useCallback(async (cursor?: TripReactor) => {
    if (!userId || !owner || fetching.current) return;
    const current = version.current; fetching.current = true; setPeopleBusy(true); setPeopleError(false);
    try {
      const loaded = await fetchTripReactors(userId, tripId, cursor);
      if (version.current !== current) return;
      setPeople(previous => cursor && previous ? { ...loaded,
        items: [...previous.items, ...loaded.items.filter(item => !previous.items.some(old => old.id === item.id))] } : loaded);
    } catch { if (version.current === current) setPeopleError(true); }
    finally { if (version.current === current) { fetching.current = false; setPeopleBusy(false); } }
  }, [owner, tripId, userId]);
  useEffect(() => {
    const current = ++version.current;
    if (!open || !owner) return;
    void Promise.resolve().then(() => { if (version.current === current) void loadPeople(); });
    const timer = setInterval(() => { if (isPresenceActive()) void loadPeople(); }, 20000);
    return () => { version.current = current + 1; clearInterval(timer); };
  }, [open, owner, loadPeople]);
  if (!store || summary?.available === false) return null;
  const total = reactionTotal(summary), mine = summary?.mine;
  const label = owner ? 'Zobacz reakcje' : mine ? 'Twoja reakcja: ' + reactionOption(mine).label : 'Dodaj reakcję';
  const save = async (kind: ReactionKind | null) => {
    setFailedKind(undefined);
    if (await store.setReaction(tripId, kind)) setOpen(false);
    else setFailedKind(kind);
  };
  return <>
    <Pressable testID={'trip-reactions-' + tripId} accessibilityRole="button"
      accessibilityLabel={label + (summary ? '. Liczba reakcji: ' + total : '')}
      accessibilityState={{ expanded: open, selected: !!mine, busy: busy || loading }}
      onPress={() => { setFailedKind(undefined); setPeople(null); setPeopleError(false); setPeopleBusy(false);
        fetching.current = false; setOpen(true); void store.refresh(); }}
      style={({ pressed }) => ({ minHeight: 48, paddingVertical: 8,
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        opacity: pressed ? 0.7 : 1 })}>
      <AppText aria-hidden style={{ fontSize: 18 }}>
        {mine ? reactionOption(mine).emoji : summary && total ? topReactions(summary).map(option => option.emoji).join(' ') : '☺'}
      </AppText>
      {busy || loading && !summary ? <ActivityIndicator size="small" color={theme.primaryStrong} accessibilityLabel="Wczytywanie reakcji" /> :
        <AppText variant="caption" color="primaryStrong" style={{ fontWeight: '700' }}>{summary && total ? total : owner ? 'Reakcje' : 'Reaguj'}</AppText>}
    </Pressable>
    {open ? <BottomSheet title={owner ? 'Reakcje na Twoje ogłoszenie' : 'Reakcje na ogłoszenie'} onClose={() => { if (!busy) setOpen(false); }}>
      <AppText color="textSecondary">{owner ? 'Zobacz, komu podoba się Twój plan.' : 'Wybierz jedną emocję. Możesz ją później zmienić lub cofnąć.'}</AppText>
      {!summary && !error ? <ActivityIndicator accessibilityLabel="Wczytywanie reakcji" color={theme.primaryStrong} /> : null}
      {error ? <><AppText variant="caption" accessibilityRole="alert">{error}</AppText>
        <Button label="Wczytaj reakcje ponownie" variant="secondary" onPress={() => void store.refresh()} /></> : null}
      {REACTIONS.map(option => {
        const selected = mine === option.kind;
        const content = <><View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.backgroundElement,
          alignItems: 'center', justifyContent: 'center' }}><AppText aria-hidden style={{ fontSize: 26 }}>{option.emoji}</AppText></View>
          <AppText variant="label" style={{ flex: 1 }}>{option.label}</AppText>
          <AppText color="primaryStrong">{summary ? summary.counts[option.kind] ?? 0 : '—'}</AppText>
          {selected ? <AppText color="primaryStrong" accessibilityLabel="Twoja reakcja">✓</AppText> : null}</>;
        const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 10,
          borderRadius: 18, borderWidth: 1, borderColor: selected ? theme.primaryStrong : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : theme.muted };
        return owner ? <View key={option.kind} style={style}>{content}</View> :
          <Pressable key={option.kind} testID={'reaction-option-' + option.kind} accessibilityRole="button"
            accessibilityLabel={option.label} accessibilityState={{ selected }} disabled={busy || !summary?.can_react}
            onPress={() => { void save(selected ? null : option.kind); }} style={({ pressed }) => [style, { opacity: busy || pressed ? 0.6 : 1 }]}>{content}</Pressable>;
      })}
      {busy ? <AppText variant="caption" accessibilityLiveRegion="polite">Zapisywanie reakcji…</AppText> : null}
      {failedKind !== undefined ? <Button label="Ponów zapis reakcji" variant="secondary" disabled={busy} onPress={() => void save(failedKind)} /> : null}
      {!owner && mine ? <Button label="Cofnij reakcję" variant="secondary" disabled={busy} onPress={() => void save(null)} /> : null}
      {owner ? <>
        <AppText variant="label" accessibilityRole="header">Reagujące ekipy</AppText>
        {peopleBusy ? <ActivityIndicator accessibilityLabel="Wczytywanie reagujących ekip" color={theme.primaryStrong} /> : null}
        {peopleError ? <><AppText accessibilityRole="alert">Nie udało się wczytać ekip.</AppText>
          <Button label="Wczytaj ekipy ponownie" variant="secondary" onPress={() => void loadPeople()} /></> : null}
        {people && !people.items.length ? <AppText color="textSecondary">Jeszcze nikt nie zostawił reakcji.</AppText> : null}
        {people?.items.map(person => <Pressable key={person.id} testID={'trip-reactor-' + person.group_id}
          accessibilityRole={person.profile_available ? 'button' : undefined} disabled={!person.profile_available}
          accessibilityLabel={person.name + '. ' + reactionOption(person.kind).label + (person.profile_available ? '. Zobacz profil' : '')}
          onPress={() => { setOpen(false); router.push({ pathname: '/crew/[id]', params: { id: person.group_id } }); }}
          style={[layout.row, { paddingVertical: 8 }]}>
          <GroupAvatar groupId={person.group_id} avatarId={person.avatar_id} size={44} decorative />
          <View style={{ flex: 1 }}><AppText variant="label">{person.name}</AppText>
            <AppText variant="caption" color="textSecondary">{reactionOption(person.kind).label}</AppText></View>
          <AppText aria-hidden style={{ fontSize: 24 }}>{reactionOption(person.kind).emoji}</AppText>
        </Pressable>)}
        {people?.has_more ? <Button label="Wczytaj kolejne ekipy" variant="secondary" disabled={peopleBusy}
          onPress={() => void loadPeople(people.items.at(-1))} /> : null}
      </> : null}
    </BottomSheet> : null}
  </>;
}
