import { useMemo, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ExternalLink } from '@/components/external-link';
import { AutocompleteField, type AutocompleteFieldHandle } from '@/components/ui/autocomplete-field';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { findTripLocation } from './trip-locations';
import { CAMPGROUND_ATTRIBUTION_URL, campgroundDistanceKm, MIN_CAMPGROUND_QUERY_LENGTH,
  searchCampgrounds, type Campground } from './campgrounds';

export type TripCampgroundFieldHandle = AutocompleteFieldHandle;

function Attribution() {
  return <ExternalLink href={CAMPGROUND_ATTRIBUTION_URL} accessibilityLabel="Źródło danych o kempingach: OpenStreetMap">
    <AppText variant="caption" color="primaryStrong">© OpenStreetMap contributors</AppText>
  </ExternalLink>;
}

export function TripCampgroundField({ value, locationId, onChangeText, onSelect, inputRef, errorId }: {
  value: string;
  locationId: string;
  onChangeText: (value: string) => void;
  onSelect: (campground: Campground) => void;
  inputRef?: Ref<TripCampgroundFieldHandle>;
  errorId?: string;
}) {
  const theme = useTheme();
  const location = findTripLocation(locationId);
  const latitude = location?.latitude, longitude = location?.longitude;
  const near = useMemo(() => typeof latitude === 'number' && typeof longitude === 'number'
    ? { latitude, longitude } : undefined, [latitude, longitude]);
  return <View style={styles.field}>
    <AutocompleteField label="Nazwa kempingu" value={value} inputRef={inputRef} errorId={errorId}
      placeholder="Wpisz nazwę kempingu" maxLength={120} allowFreeText
      hint="Opcjonalnie. Wybierz podpowiedź lub wpisz własną nazwę kempingu."
      onChangeText={onChangeText} onClear={() => onChangeText('')} clearLabel="Wyczyść nazwę kempingu"
      renderSuggestions={close => {
        const results = searchCampgrounds(value, near);
        return <View testID="campground-suggestions" style={styles.field}>
          {value.trim() ? <Pressable accessibilityRole="button" accessibilityLabel="Użyj wpisanej nazwy kempingu"
            onPress={close} style={[styles.suggestion, { padding: 14, borderRadius: Radius.small,
              backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            <Icon name="check" size={22} />
            <View style={styles.details}>
              <AppText variant="label">Użyj wpisanej nazwy</AppText>
              <AppText variant="caption" color="textSecondary">{value.trim()}</AppText>
            </View>
          </Pressable> : null}
          <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {value.trim().length < MIN_CAMPGROUND_QUERY_LENGTH ? 'Wpisz co najmniej 2 znaki, aby zobaczyć podpowiedzi.' :
              results.length ? `Podpowiedzi kempingów · ${results.length}` : 'Brak podpowiedzi. Możesz zachować wpisaną nazwę i podać adres ręcznie.'}
          </AppText>
          {results.map(campground => <Pressable key={campground.id} accessibilityRole="button"
            accessibilityLabel={`Wybierz kemping: ${campground.name}, ${campground.address || campground.locality || 'adres do uzupełnienia'}`}
            onPress={() => { onSelect(campground); close(); }}
            style={({ pressed }) => [styles.suggestion, { borderColor: theme.border,
              backgroundColor: theme.backgroundElement, opacity: pressed ? 0.65 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
              <Icon name="tent" size={22} />
            </View>
            <View style={styles.details}>
              <AppText variant="label" numberOfLines={2}>{campground.name}</AppText>
              {campground.address || campground.locality ? <AppText variant="caption" color="textSecondary">
                {campground.address || campground.locality}
              </AppText> : near ? <AppText variant="caption" color="textSecondary">
                Ok. {Math.round(campgroundDistanceKm(campground, near))} km od miejsca wyjazdu
              </AppText> : null}
              {!campground.address ? <AppText variant="caption" color="textSecondary">Adres do uzupełnienia ręcznie</AppText> : null}
            </View>
          </Pressable>)}
          <Attribution />
        </View>;
      }} />
    <Attribution />
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 10 },
  suggestion: { ...layout.row, minHeight: 64, paddingVertical: 14, borderBottomWidth: 1 },
  icon: { width: 44, height: 44, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center' },
  details: { flex: 1, minWidth: 0, gap: 4 },
});
