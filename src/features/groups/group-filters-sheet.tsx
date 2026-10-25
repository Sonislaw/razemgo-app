import { useEffect, useState } from 'react';
import { Keyboard, Switch, View } from 'react-native';
import { FilterSheet } from '@/components/ui/filter-sheet';
import { AppText, Button, Chip, FieldLabel, IconButton, layout } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { GROUP_KIND_OPTIONS, INTEREST_OPTIONS, TRAVEL_MODE_OPTIONS } from '@/features/profile/profile-options';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import { AnimalChoice } from '@/features/animals/animal-portrait';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { filterPublicGroups, groupFiltersPayload, INITIAL_GROUP_FILTERS, type GroupFilters } from './group-data';
import { fetchPublicGroupCount } from './group-repository';
import { DEMO_PUBLIC_GROUPS } from './group-demo';
import { USE_DEMO_DATA } from '@/constants/app';
import { useMessaging } from '@/features/messaging/messaging-context';
import { isPresenceActive } from '@/features/presence/presence-context';
import { PRESENCE_POLL_MS } from '@/features/presence/presence-controller';
import { useFavorites } from '@/features/favorites/favorites-context';

export function GroupFiltersSheet({ filters, onApply, onClose }: {
  filters: GroupFilters; onApply: (value: GroupFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [countAttempt, setCountAttempt] = useState(0);
  const [countResult, setCountResult] = useState<{ key: string; count: number | null; status: 'loading' | 'ready' | 'error' }>({
    key: '', count: null, status: 'loading',
  });
  const { state: mailbox } = useMessaging();
  const favorites = useFavorites();
  const countKey = JSON.stringify(groupFiltersPayload(draft));
  useEffect(() => {
    if (USE_DEMO_DATA) return;
    let current = true;
    const timer = setTimeout(() => {
      setCountResult({ key: countKey, count: null, status: 'loading' });
      void fetchPublicGroupCount(draft).then(count => {
        if (current) setCountResult({ key: countKey, count, status: 'ready' });
      }).catch(() => {
        if (current) setCountResult({ key: countKey, count: null, status: 'error' });
      });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [draft, countKey, countAttempt]);
  useEffect(() => {
    if (USE_DEMO_DATA || !(draft.onlineOnly || draft.favoritesOnly)) return;
    const timer = setInterval(() => { if (isPresenceActive()) setCountAttempt(attempt => attempt + 1); }, PRESENCE_POLL_MS);
    return () => clearInterval(timer);
  }, [draft.onlineOnly, draft.favoritesOnly]);
  const resultCount = USE_DEMO_DATA
    ? filterPublicGroups(DEMO_PUBLIC_GROUPS.filter(item => !mailbox.blockedGroupIds.includes(item.group.id)), draft, undefined, favorites.groupIds).length
    : countResult.key === countKey && countResult.status === 'ready' ? countResult.count : null;
  const countError = !USE_DEMO_DATA && countResult.key === countKey && countResult.status === 'error';
  const toggle = <K extends 'groupKinds' | 'childAgeBands' | 'travelModes' | 'interests' | 'animalKinds',>(key: K, value: GroupFilters[K][number]) => {
    setDraft(prev => { const items = prev[key] as (typeof value)[];
      return { ...prev, [key]: items.includes(value) ? items.filter(x => x !== value) : [...items, value] }; });
  };
  return <FilterSheet title="Filtry ekip" description="Wyszukaj po nazwie lub numerze i wybierz pozostałe kryteria." onClose={onClose}
    footer={<>
      {countError ? <View style={layout.row}>
        <AppText variant="caption" color="textSecondary" accessibilityRole="alert" style={{ flex: 1 }}>Nie udało się sprawdzić liczby profili.</AppText>
        <IconButton icon="refresh" label="Policz profile ponownie" onPress={() => setCountAttempt(attempt => attempt + 1)} />
      </View> : null}
      <Button label="Wyczyść" variant="secondary" onPress={() => setDraft({ ...INITIAL_GROUP_FILTERS })} />
      <Button label={resultCount !== null ? 'Pokaż wyniki · ' + resultCount : countError ? 'Pokaż wyniki' : 'Pokaż wyniki · …'}
        onPress={() => { Keyboard.dismiss(); onApply({ ...draft, name: draft.name.trim() }); }} />
    </>}>
    <ProfileTextField label="Szukaj po nazwie lub numerze ekipy" value={draft.name} onChangeText={name => setDraft(prev => ({ ...prev, name }))} maxLength={80} />
    <View style={layout.row}><AppText style={{ flex: 1 }}>Tylko ulubione</AppText>
      <Switch accessibilityLabel="Tylko ulubione" value={draft.favoritesOnly} onValueChange={favoritesOnly => setDraft(prev => ({ ...prev, favoritesOnly }))} /></View>
    <View style={layout.row}><AppText style={{ flex: 1 }}>Tylko online</AppText>
      <Switch accessibilityLabel="Tylko online" value={draft.onlineOnly} onValueChange={onlineOnly => setDraft(prev => ({ ...prev, onlineOnly }))} /></View>
    <AppText variant="caption" color="textSecondary">Możesz wybrać kilka opcji. Brak wyboru oznacza dowolną ekipę.</AppText>
    <View style={layout.stack}>
    <FieldLabel>Rodzaj ekipy</FieldLabel>
    <ChipRow horizontal label="Rodzaj ekipy">{GROUP_KIND_OPTIONS.map(o => <Chip key={o.value} label={o.label}
      selected={draft.groupKinds.includes(o.value)} onPress={() => toggle('groupKinds', o.value)} />)}</ChipRow>
    </View>
    <View style={layout.stack}>
    <FieldLabel>Wiek dzieci</FieldLabel>
    <ChipRow horizontal label="Wiek dzieci">{CHILD_AGE_BANDS.map(band => <Chip key={band} label={band + ' lat'}
      selected={draft.childAgeBands.includes(band)} onPress={() => toggle('childAgeBands', band)} />)}</ChipRow>
    </View>
    <View style={layout.stack}>
    <FieldLabel>Sposób podróżowania</FieldLabel>
    <ChipRow horizontal label="Sposób podróżowania">{TRAVEL_MODE_OPTIONS.map(mode => <Chip key={mode} label={mode === 'Van' ? 'Kampervan' : mode}
      selected={draft.travelModes.includes(mode)} onPress={() => toggle('travelModes', mode)} />)}</ChipRow>
    </View>
    <View style={layout.stack}>
    <FieldLabel>Zainteresowania</FieldLabel>
    <ChipRow horizontal label="Zainteresowania">{INTEREST_OPTIONS.map(interest => <Chip key={interest} label={interest}
      selected={draft.interests.includes(interest)} onPress={() => toggle('interests', interest)} />)}</ChipRow>
    </View>
    <View style={layout.stack}>
    <FieldLabel>Zwierzęta w ekipie</FieldLabel>
    <ChipRow horizontal label="Zwierzęta w ekipie">{(['dog', 'cat'] as const).map(kind => <AnimalChoice key={kind} kind={kind}
      label={kind === 'dog' ? 'Pies' : 'Kot'} selected={draft.animalKinds.includes(kind)} onPress={() => toggle('animalKinds', kind)} />)}</ChipRow>
    </View>
    <View style={layout.row}><AppText style={{ flex: 1 }}>Tylko z aktywnymi ogłoszeniami</AppText>
      <Switch accessibilityLabel="Tylko z aktywnymi ogłoszeniami" value={draft.hasTrips} onValueChange={hasTrips => setDraft(prev => ({ ...prev, hasTrips }))} /></View>
  </FilterSheet>;
}
