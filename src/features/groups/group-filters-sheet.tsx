import { useState } from 'react';
import { Switch, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button, Chip, FieldLabel, layout } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { GROUP_KIND_OPTIONS, INTEREST_OPTIONS, TRAVEL_MODE_OPTIONS } from '@/features/profile/profile-options';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import { AnimalChoice } from '@/features/animals/animal-portrait';
import { INITIAL_GROUP_FILTERS, type GroupFilters } from './group-data';

export function GroupFiltersSheet({ filters, onApply, onClose }: {
  filters: GroupFilters; onApply: (value: GroupFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const toggle = <K extends 'groupKinds' | 'childAgeBands' | 'travelModes' | 'interests' | 'animalKinds',>(key: K, value: GroupFilters[K][number]) => {
    setDraft(prev => { const items = prev[key] as (typeof value)[];
      return { ...prev, [key]: items.includes(value) ? items.filter(x => x !== value) : [...items, value] }; });
  };
  return <BottomSheet title="Filtry ekip" onClose={onClose}>
    <AppText variant="caption" color="textSecondary">Możesz wybrać kilka opcji. Brak wyboru oznacza dowolną ekipę.</AppText>
    <FieldLabel>Rodzaj ekipy</FieldLabel>
    <ChipRow horizontal label="Rodzaj ekipy">{GROUP_KIND_OPTIONS.map(o => <Chip key={o.value} label={o.label}
      selected={draft.groupKinds.includes(o.value)} onPress={() => toggle('groupKinds', o.value)} />)}</ChipRow>
    <FieldLabel>Wiek dzieci</FieldLabel>
    <ChipRow horizontal label="Wiek dzieci">{CHILD_AGE_BANDS.map(band => <Chip key={band} label={band + ' lat'}
      selected={draft.childAgeBands.includes(band)} onPress={() => toggle('childAgeBands', band)} />)}</ChipRow>
    <FieldLabel>Sposób podróżowania</FieldLabel>
    <ChipRow horizontal label="Sposób podróżowania">{TRAVEL_MODE_OPTIONS.map(mode => <Chip key={mode} label={mode === 'Van' ? 'Kampervan' : mode}
      selected={draft.travelModes.includes(mode)} onPress={() => toggle('travelModes', mode)} />)}</ChipRow>
    <FieldLabel>Zainteresowania</FieldLabel>
    <ChipRow horizontal label="Zainteresowania">{INTEREST_OPTIONS.map(interest => <Chip key={interest} label={interest}
      selected={draft.interests.includes(interest)} onPress={() => toggle('interests', interest)} />)}</ChipRow>
    <FieldLabel>Zwierzęta w ekipie</FieldLabel>
    <ChipRow horizontal label="Zwierzęta w ekipie">{(['dog', 'cat'] as const).map(kind => <AnimalChoice key={kind} kind={kind}
      label={kind === 'dog' ? 'Pies' : 'Kot'} selected={draft.animalKinds.includes(kind)} onPress={() => toggle('animalKinds', kind)} />)}</ChipRow>
    <View style={layout.row}><AppText style={{ flex: 1 }}>Tylko z aktywnymi ogłoszeniami</AppText>
      <Switch accessibilityLabel="Tylko z aktywnymi ogłoszeniami" value={draft.hasTrips} onValueChange={hasTrips => setDraft(prev => ({ ...prev, hasTrips }))} /></View>
    <Button label="Pokaż ekipy" onPress={() => onApply(draft)} />
    <Button label="Wyczyść filtry ekip" variant="secondary" onPress={() => setDraft({ ...INITIAL_GROUP_FILTERS, name: draft.name, groupKinds: [] })} />
  </BottomSheet>;
}
