import { useTripResultCount } from './use-trip-search';
import { useState } from 'react';
import {
  Keyboard,
  Pressable,
  Switch,
  View,
} from 'react-native';
import { FilterSheet } from '@/components/ui/filter-sheet';
import {
  AppText,
  Button,
  Chip,
  FieldLabel,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { ChipRow } from '@/components/ui/chip-row';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import {
  clearDiscoveryDates,
  getDiscoveryDateRangeError,
  INITIAL_FILTERS,
  resolveDiscoveryRange,
  selectDiscoveryLocation,
  toggleDiscoveryTripMode,
  updateDiscoveryDateRange,
  updateDiscoveryLocationQuery,
} from './filter-trips';
import { DateRangeSheet } from '@/components/trips/date-range-sheet';
import { DateRangeField } from '@/components/trips/date-range-field';
import { dateToleranceLabel } from '@/features/trips/date-range-calendar';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, DiscoveryFilters } from '@/types/travel';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { AnimalChoice } from '@/features/animals/animal-portrait';
import { TripLocationField } from '@/features/trips/trip-location-field';
import { TripLandscapePicker } from '@/features/trips/trip-landscape-picker';
import { FavoritesNotice } from '@/features/favorites/favorite-button';

interface DiscoveryFiltersSheetProps {
  initialFilters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
  onClose: () => void;
}
export function DiscoveryFiltersSheet({
  initialFilters,
  onApply,
  onClose,
}: DiscoveryFiltersSheetProps) {
  const theme = useTheme();
  const [showDateRange, setShowDateRange] = useState(false);
  const [draft, setDraft] = useState<DiscoveryFilters>(() => ({
    ...initialFilters,
    tripModes: [...initialFilters.tripModes],
    childAgeBands: [...initialFilters.childAgeBands],
    animalKinds: [...(initialFilters.animalKinds ?? [])],
    landscapeKinds: [...(initialFilters.landscapeKinds ?? [])],
    customDateRange: initialFilters.customDateRange
      ? { ...initialFilters.customDateRange }
      : undefined,
  }));
  const dateRange = resolveDiscoveryRange(draft);
  const dateError = getDiscoveryDateRangeError(draft.customDateRange);
  const { count: resultCount, countError, retryCount } = useTripResultCount(draft, !dateError);
  const toggleAge = (band: ChildAgeBand) =>
    setDraft((current) => ({
      ...current,
      childAgeBands: current.childAgeBands.includes(band)
        ? current.childAgeBands.filter((age) => age !== band)
        : [...current.childAgeBands, band],
    }));
  return (
    <FilterSheet
      title="Filtry wyjazdów"
      description="Wybierz typ ogłoszenia, termin, miejsce i klimat."
      onClose={onClose}
      footer={<>
        {countError ? <View style={layout.row}>
          <AppText variant="caption" color="textSecondary" accessibilityRole="alert" style={{ flex: 1 }}>Nie udało się sprawdzić liczby wyjazdów.</AppText>
          <IconButton icon="refresh" label="Policz wyjazdy ponownie" onPress={retryCount} />
        </View> : null}
        <Button label="Wyczyść" variant="secondary" onPress={() => setDraft({ ...INITIAL_FILTERS })} />
        <Button label={dateError || countError ? 'Pokaż wyniki' : 'Pokaż wyniki · ' + (resultCount ?? '…')} disabled={Boolean(dateError)} onPress={() => {
          if (dateError) return;
          Keyboard.dismiss();
          onApply(draft);
        }} />
      </>}
      overlay={showDateRange ? <DateRangeSheet allowTolerance initialRange={dateRange} initialTolerance={draft.dateFlexibilityDays}
        onClose={() => setShowDateRange(false)} onApply={(range, tolerance) => {
          setDraft(current => updateDiscoveryDateRange(current, range, tolerance));
          setShowDateRange(false);
        }} /> : null}
    >
            <FavoritesNotice />
            <View style={layout.row}><AppText style={{ flex: 1 }}>Tylko ulubione</AppText>
              <Switch accessibilityLabel="Tylko ulubione" value={!!draft.favoritesOnly} onValueChange={favoritesOnly => setDraft(current => ({ ...current, favoritesOnly }))} /></View>
            <View style={layout.stack}>
              <FieldLabel>Typ ogłoszenia</FieldLabel>
              <AppText variant="caption" color="textSecondary">
                Wybierz jeden lub oba typy. Co najmniej jeden musi pozostać
                zaznaczony.
              </AppText>
              <ChipRow horizontal label="Typ ogłoszenia">
                {(
                  [
                    {
                      mode: 'planned',
                      label: 'Mam plan',
                    },
                    {
                      mode: 'flexible',
                      label: 'Szukam pomysłu',
                    },
                  ] as const
                ).map((option) => {
                  const selected = draft.tripModes.includes(option.mode);
                  return (
                    <Pressable
                      key={option.mode}
                      accessibilityRole="checkbox"
                      accessibilityLabel={option.label}
                      accessibilityState={{ checked: selected }}
                      aria-checked={selected}
                      accessibilityHint={
                        selected && draft.tripModes.length === 1
                          ? 'Zaznacz drugi typ, aby odznaczyć ten.'
                          : undefined
                      }
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          tripModes: toggleDiscoveryTripMode(
                            current.tripModes,
                            option.mode,
                          ),
                        }))
                      }
                      style={({ pressed }) => [
                        layout.row,
                        {
                          minHeight: 48,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: Radius.pill,
                          borderWidth: 1,
                          borderColor: selected
                            ? theme.primaryStrong
                            : theme.border,
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.muted,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      {selected ? <Icon name="check" size={15} /> : null}
                      <AppText
                        variant="label"
                        color={selected ? 'primaryStrong' : 'text'}
                      >
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ChipRow>
            </View>
            <View style={layout.stack}>
              <FieldLabel>Klimat wyjazdu</FieldLabel>
              <AppText variant="caption" color="textSecondary">
                Możesz wybrać kilka klimatów. Brak wyboru pokazuje wszystkie.
              </AppText>
              <TripLandscapePicker
                multiple
                value={draft.landscapeKinds ?? []}
                onChange={(landscapeKinds) =>
                  setDraft((current) => ({ ...current, landscapeKinds }))
                }
              />
            </View>
            <View style={layout.stack}>
              <View style={layout.row}>
                <FieldLabel style={{ flex: 1 }}>
                  Termin wyjazdu
                </FieldLabel>
                {draft.customDateRange ? (
                  <IconButton
                    label="Wyczyść termin"
                    icon="close"
                    onPress={() => setDraft(clearDiscoveryDates)}
                  />
                ) : null}
              </View>
              <AppText variant="caption" color="textSecondary">
                Zaznacz zakres w kalendarzu i wybierz dokładny lub przybliżony
                termin.
              </AppText>
              <DateRangeField
                range={dateRange}
                caption={
                  dateRange
                    ? dateToleranceLabel(draft.dateFlexibilityDays ?? 0)
                    : undefined
                }
                onPress={() => {
                  Keyboard.dismiss();
                  setShowDateRange(true);
                }}
              />
              {dateError ? (
                <AppText
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  variant="caption"
                >
                  {dateError}
                </AppText>
              ) : null}
            </View>
            <View style={layout.stack}>
              <TripLocationField
                mode="flexible"
                required={false}
                value={draft.locationId ?? ''}
                query={draft.location}
                onChange={(id) =>
                  setDraft((current) => selectDiscoveryLocation(current, id))
                }
                onQueryChange={(query) =>
                  setDraft((current) =>
                    updateDiscoveryLocationQuery(current, query),
                  )
                }
              />
              <AppText variant="caption" color="textSecondary">
                Wyszukiwanie obejmuje cele wyjazdów i obszary do wspólnego wyboru.
              </AppText>
            </View>
            {draft.sourceTripId ? (
              <View style={layout.stack}>
                <FieldLabel>
                  Towarzystwo z preferencji wyjazdu
                </FieldLabel>
                <ChipRow horizontal label="Towarzystwo z preferencji wyjazdu">
                  {GROUP_KIND_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={draft.groupKinds?.includes(option.value)}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          groupKinds: current.groupKinds?.includes(option.value)
                            ? current.groupKinds.filter(
                                (value) => value !== option.value,
                              )
                            : [...(current.groupKinds ?? []), option.value],
                        }))
                      }
                    />
                  ))}
                </ChipRow>
              </View>
            ) : null}
            <View style={layout.stack}>
              <FieldLabel>Towarzystwo dla dzieci</FieldLabel>
              <AppText variant="caption" color="textSecondary">
                Możesz wybrać kilka przedziałów.
              </AppText>
              <ChipRow horizontal label="Towarzystwo dla dzieci">
                {CHILD_AGE_BANDS.map((band) => (
                  <Chip
                    key={band}
                    label={band + ' lat'}
                    accessibilityLabel={'Wiek dzieci: ' + band + ' lat'}
                    selected={draft.childAgeBands.includes(band)}
                    onPress={() => toggleAge(band)}
                  />
                ))}
              </ChipRow>
            </View>
            <View style={layout.stack}>
              <FieldLabel>Zwierzęta na wyjeździe</FieldLabel>
              <AppText variant="caption" color="textSecondary">
                Możesz wybrać kilka rodzajów.
              </AppText>
              <ChipRow horizontal label="Zwierzęta na wyjeździe">
                {ANIMAL_OPTIONS.map(({ kind, label }) => (
                  <AnimalChoice
                    key={kind}
                    kind={kind}
                    label={label}
                    accessibilityLabel={'Zwierzęta na wyjeździe: ' + label}
                    selected={draft.animalKinds?.includes(kind)}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        animalKinds: current.animalKinds?.includes(kind)
                          ? current.animalKinds.filter((item) => item !== kind)
                          : [...(current.animalKinds ?? []), kind],
                      }))
                    }
                  />
                ))}
              </ChipRow>
            </View>
    </FilterSheet>
  );
}
