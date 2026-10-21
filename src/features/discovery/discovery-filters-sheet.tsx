import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SheetModal, SheetSurface } from '@/components/ui/sheet-modal';
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
import { CHILD_AGE_BANDS, DEMO_PROPOSALS } from '@/data/mocks/travel';
import {
  clearDiscoveryDates,
  filterProposals,
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
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, DiscoveryFilters } from '@/types/travel';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { TripLocationField } from '@/features/trips/trip-location-field';
import { LANDSCAPE_OPTIONS } from '@/constants/landscape-options';

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
  const insets = useSafeAreaInsets();
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
  const resultCount = filterProposals(DEMO_PROPOSALS, draft, dateRange).length;
  const toggleAge = (band: ChildAgeBand) =>
    setDraft((current) => ({
      ...current,
      childAgeBands: current.childAgeBands.includes(band)
        ? current.childAgeBands.filter((age) => age !== band)
        : [...current.childAgeBands, band],
    }));
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <SheetModal onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Zamknij panel filtrów"
        />
        <SheetSurface
          role="dialog"
          accessibilityLabel="Filtry wyjazdów"
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              marginTop: insets.top,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.flex}>
              <AppText variant="heading" accessibilityRole="header">
                Filtry wyjazdów
              </AppText>
              <AppText variant="caption" color="textSecondary">
                Wybierz typ ogłoszenia, termin, miejsce i klimat.
              </AppText>
            </View>
            <IconButton
              label="Zamknij filtry bez zmian"
              icon="close"
              onPress={close}
            />
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
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
              <ChipRow horizontal label="Klimat wyjazdu">
                {LANDSCAPE_OPTIONS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    accessibilityLabel={'Klimat wyjazdu: ' + label}
                    selected={draft.landscapeKinds?.includes(value)}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        landscapeKinds: current.landscapeKinds?.includes(value)
                          ? current.landscapeKinds.filter(
                              (kind) => kind !== value,
                            )
                          : [...(current.landscapeKinds ?? []), value],
                      }))
                    }
                  />
                ))}
              </ChipRow>
            </View>
            <View style={layout.stack}>
              <View style={layout.row}>
                <FieldLabel style={styles.flex}>
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
                  <Chip
                    key={kind}
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
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Button
              label="Wyczyść"
              variant="secondary"
              onPress={() => setDraft({ ...INITIAL_FILTERS })}
            />
            <Button
              label={
                dateError ? 'Pokaż wyniki' : 'Pokaż wyniki · ' + resultCount
              }
              disabled={Boolean(dateError)}
              onPress={() => {
                if (dateError) return;
                Keyboard.dismiss();
                onApply(draft);
              }}
            />
          </View>
          {showDateRange ? (
            <DateRangeSheet
              allowTolerance
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
          ) : null}
        </SheetSurface>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    height: '90%',
    maxHeight: 800,
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  scroll: { flex: 1, minHeight: 0 },
  content: { padding: Spacing.three, gap: Spacing.four },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    gap: Spacing.two,
  },
});
