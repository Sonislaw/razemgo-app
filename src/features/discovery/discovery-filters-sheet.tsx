import { DateRangeField } from '@/components/trips/date-range-field';
import { DateRangeSheet } from '@/components/trips/date-range-sheet';
import { ChipRow } from '@/components/ui/chip-row';
import { FilterSheet } from '@/components/ui/filter-sheet';
import {
  AppText,
  Button,
  Chip,
  FieldLabel,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { CHILD_AGE_BANDS } from '@/constants/travel';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { AnimalChoice } from '@/features/animals/animal-portrait';
import { FavoritesNotice } from '@/features/favorites/favorite-button';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { dateToleranceLabel } from '@/features/trips/date-range-calendar';
import { TripLandscapePicker } from '@/features/trips/trip-landscape-picker';
import { TripLocationField } from '@/features/trips/trip-location-field';
import type { ChildAgeBand, DiscoveryFilters } from '@/types/travel';
import { useState } from 'react';
import { Keyboard, Switch, View } from 'react-native';
import {
  clearDiscoveryDates,
  getDiscoveryDateRangeError,
  resolveDiscoveryRange,
  selectDiscoveryLocation,
  updateDiscoveryDateRange,
  updateDiscoveryLocationQuery,
} from './filter-trips';
import { useTripResultCount } from './use-trip-search';
import { SaveFilterSetButton } from '../saved-filters/saved-filter-ui';
import type { SavedFilterSet } from '../saved-filters/saved-filter-data';
import {
  hasResettableMapFilters,
  discoveryTripMode,
  emptyDiscoveryFilters,
  plannedMapFilters,
  singleTripFilters,
} from './trip-discovery-state';

interface DiscoveryFiltersSheetProps {
  initialFilters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
  onClose: () => void;
  onSaved: (item: SavedFilterSet) => void;
  plannedOnly?: boolean;
}
export function DiscoveryFiltersSheet({
  initialFilters,
  onApply,
  onClose,
  onSaved,
  plannedOnly = false,
}: DiscoveryFiltersSheetProps) {
  const [showDateRange, setShowDateRange] = useState(false);
  const [draft, setDraft] = useState<DiscoveryFilters>(() => ({
    ...initialFilters,
    tripModes: plannedOnly ? ['planned'] : [...singleTripFilters(initialFilters).tripModes],
    childAgeBands: [...initialFilters.childAgeBands],
    animalKinds: [...(initialFilters.animalKinds ?? [])],
    landscapeKinds: [...(initialFilters.landscapeKinds ?? [])],
    customDateRange: initialFilters.customDateRange
      ? { ...initialFilters.customDateRange }
      : undefined,
  }));
  const dateRange = resolveDiscoveryRange(draft);
  const tripMode = discoveryTripMode(draft);
  const dateError = getDiscoveryDateRangeError(draft.customDateRange);
  const {
    count: resultCount,
    countError,
    retryCount,
  } = useTripResultCount(draft, !dateError);
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
      description={
        plannedOnly
          ? 'Wybierz termin, miejsce i klimat wyjazdów z gotowym planem.'
          : 'Wybierz termin, miejsce i klimat.'
      }
      onClose={onClose}
      footer={
        <>
          {countError ? (
            <View style={layout.row}>
              <AppText
                variant="caption"
                color="textSecondary"
                accessibilityRole="alert"
                style={{ flex: 1 }}
              >
                Nie udało się sprawdzić liczby wyjazdów.
              </AppText>
              <IconButton
                icon="refresh"
                label="Policz wyjazdy ponownie"
                onPress={retryCount}
              />
            </View>
          ) : null}
          <View style={layout.row}>
            {!plannedOnly || hasResettableMapFilters(draft) ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="Wyczyść"
                  variant="secondary"
                  onPress={() =>
                    setDraft(
                      emptyDiscoveryFilters(discoveryTripMode(draft)),
                    )
                  }
                />
              </View>
            ) : null}
            <SaveFilterSetButton
              value={{ kind: 'trips', filters: draft }}
              disabled={!!dateError}
              onSaved={onSaved}
            />
          </View>
          <Button
            label={
              dateError || countError
                ? 'Pokaż wyniki'
                : 'Pokaż wyniki · ' + (resultCount ?? '…')
            }
            disabled={Boolean(dateError)}
            onPress={() => {
              if (dateError) return;
              Keyboard.dismiss();
              onApply(plannedOnly ? plannedMapFilters(draft) : draft);
            }}
          />
        </>
      }
      overlay={
        showDateRange ? (
          <DateRangeSheet
            allowTolerance
            showWeekdays={false}
            initialRange={dateRange}
            initialTolerance={draft.dateFlexibilityDays}
            onClose={() => setShowDateRange(false)}
            onApply={(range, tolerance) => {
              setDraft((current) =>
                updateDiscoveryDateRange(current, range, tolerance),
              );
              setShowDateRange(false);
            }}
          />
        ) : null
      }
    >
      <FavoritesNotice />
      <View style={layout.row}>
        <AppText style={{ flex: 1 }}>Tylko ulubione</AppText>
        <Switch
          accessibilityLabel="Tylko ulubione"
          value={!!draft.favoritesOnly}
          onValueChange={(favoritesOnly) =>
            setDraft((current) => ({ ...current, favoritesOnly }))
          }
        />
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
          <FieldLabel style={{ flex: 1 }}>Termin wyjazdu</FieldLabel>
          {draft.customDateRange ? (
            <IconButton
              label="Wyczyść termin"
              icon="close"
              onPress={() => setDraft(clearDiscoveryDates)}
            />
          ) : null}
        </View>
        <AppText variant="caption" color="textSecondary">
          Zaznacz zakres w kalendarzu i wybierz dokładny lub przybliżony termin.
        </AppText>
        <DateRangeField
          range={dateRange}
          showWeekdays={false}
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
          mode={tripMode}
          areasOnly={tripMode === 'flexible'}
          label="Gdzie chcecie pojechać?"
          hint={tripMode === 'flexible' ? 'Wybierz miejscowość, wieś, region lub kraj.' : undefined}
          required={false}
          value={draft.locationId ?? ''}
          place={draft.place}
          onPlaceChange={place => setDraft(current => ({...current,place,locationId:place.id,location:place.userLabel??place.name}))}
          query={draft.location}
          onChange={(id) =>
            setDraft((current) => selectDiscoveryLocation(current, id))
          }
          onQueryChange={(query) =>
            setDraft((current) => updateDiscoveryLocationQuery(current, query))
          }
        />
        <AppText variant="caption" color="textSecondary">
          {tripMode === 'planned'
            ? 'Wyszukiwanie obejmuje cele wyjazdów.'
            : 'Wyszukiwanie obejmuje obszary poszukiwań w ogłoszeniach „Szukam pomysłu”.'}
        </AppText>
      </View>
      {draft.sourceTripId ? (
        <View style={layout.stack}>
          <FieldLabel>Rodzaj ekipy</FieldLabel>
          <ChipRow horizontal label="Rodzaj ekipy">
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
