import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AutocompleteField, type AutocompleteFieldHandle } from '@/components/ui/autocomplete-field';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripMode } from '@/types/travel';
import {
  findTripLocation, locationContext, LOCATION_KIND_LABELS, searchTripLocations,
  MAX_LOCATION_SUGGESTIONS, MIN_LOCATION_QUERY_LENGTH,
} from './trip-locations';

export type TripLocationFieldHandle = AutocompleteFieldHandle;

export function TripLocationField({ value, mode, onChange, required = true, label: customLabel,
  hint, query: controlledQuery, onQueryChange, inputRef, errorId,
}: {
  value: string;
  mode: TripMode;
  onChange: (id: string) => void;
  required?: boolean;
  label?: string;
  hint?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  inputRef?: Ref<TripLocationFieldHandle>;
  errorId?: string;
}) {
  const theme = useTheme();
  const label = customLabel ?? (mode === 'planned' ? 'Miasto lub wieś' : 'Miejscowość, region lub kraj');
  const [localQuery, setLocalQuery] = useState('');
  const query = controlledQuery ?? localQuery;
  const setQuery = (text: string) => { setLocalQuery(text); onQueryChange?.(text); };
  const selected = findTripLocation(value);
  const clear = () => { setQuery(''); onChange(''); };
  return <View style={styles.field}>
    <AutocompleteField label={label} value={selected?.name ?? query} required={required} inputRef={inputRef}
      hint={hint ?? (mode === 'planned' ? 'Wybierz konkretną miejscowość, do której jedziesz.' : 'Wpisz nazwę i wybierz lokalizację z podpowiedzi.')}
      placeholder={mode === 'planned' ? 'Wpisz nazwę miejscowości' : 'Wpisz nazwę lokalizacji'}
      maxLength={100} errorId={errorId} onClear={clear} clearLabel="Wyczyść lokalizację"
      onChangeText={text => { onChange(''); setQuery(text); }}
      renderSuggestions={close => {
        const search = selected?.name ?? query;
        const results = searchTripLocations(search, mode);
        return <>
          <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {search.trim().length > 0 && search.trim().length < MIN_LOCATION_QUERY_LENGTH
              ? `Wpisz co najmniej ${MIN_LOCATION_QUERY_LENGTH} znaki`
              : results.length ? `Podpowiedzi lokalizacji · ${results.length}` : 'Brak pasujących lokalizacji'}
          </AppText>
          {results.map(location => <Pressable key={location.id} accessibilityRole="button"
            accessibilityLabel={`Wybierz lokalizację: ${location.name}, ${locationContext(location)}, ${LOCATION_KIND_LABELS[location.kind]}`}
            onPress={() => { setQuery(''); onChange(location.id); close(); }}
            style={({ pressed }) => [styles.suggestion, {
              backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.65 : 1,
            }]}>
            <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="pin" size={22} />
            </View>
            <View style={styles.details}>
              <AppText variant="label" style={{ fontSize: 16, lineHeight: 22 }}>{location.name}</AppText>
              <AppText variant="caption" color="textSecondary">{locationContext(location)}</AppText>
              <AppText variant="caption" color="textSecondary">{LOCATION_KIND_LABELS[location.kind]}</AppText>
            </View>
          </Pressable>)}
          {!results.length && search.trim().length >= MIN_LOCATION_QUERY_LENGTH ? <AppText variant="caption" color="textSecondary">
            Sprawdź pisownię lub wpisz inną nazwę. Możesz dopisać gminę, powiat albo województwo.
          </AppText> : null}
          {results.length === MAX_LOCATION_SUGGESTIONS ? <AppText variant="caption" color="textSecondary">
            Pokazujemy pierwsze {MAX_LOCATION_SUGGESTIONS} propozycji. Dopisz gminę, powiat lub województwo, aby zawęzić wybór.
          </AppText> : null}
        </>;
      }} />
    {selected ? <View style={layout.row}>
      <Icon name="check" size={16} color={theme.positive} />
      <AppText variant="caption" color="positive" style={{ flex: 1 }}>
        {LOCATION_KIND_LABELS[selected.kind]} · {locationContext(selected)}
      </AppText>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72,
    paddingVertical: 14, borderBottomWidth: 1 },
  icon: { width: 44, height: 44, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, minWidth: 0, gap: 4 },
});
