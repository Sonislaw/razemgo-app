import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Button,
  Chip,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { CHILD_AGE_BANDS, DEMO_PROPOSALS } from '@/data/mocks/travel';
import {
  clearDiscoveryDates,
  filterProposals,
  getDiscoveryDateRangeError,
  INITIAL_FILTERS,
  resolveDiscoveryRange,
  toggleDiscoveryTripMode,
  updateDiscoveryDate,
} from './filter-trips';
import { TripDateField } from '@/features/trips/trip-date-field';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import {
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, DiscoveryFilters } from '@/types/travel';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';

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
  const [draft, setDraft] = useState<DiscoveryFilters>(() => ({
    ...initialFilters,
    tripModes: [...initialFilters.tripModes],
    childAgeBands: [...initialFilters.childAgeBands],
    animalKinds: [...(initialFilters.animalKinds ?? [])],
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
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
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
        <View
          role="dialog"
          accessibilityLabel="Filtry wyjazdów"
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              paddingBottom: Math.max(Spacing.three, insets.bottom),
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
                Wybierz typ ogłoszenia, termin i miejsce.
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
              <AppText variant="label">Typ ogłoszenia</AppText>
              <AppText variant="caption" color="textSecondary">
                Wybierz jeden lub oba typy. Co najmniej jeden musi pozostać
                zaznaczony.
              </AppText>
              {(
                [
                  {
                    mode: 'planned',
                    label: 'Mam plan',
                    description: 'Wyjazdy z ustalonym celem',
                  },
                  {
                    mode: 'flexible',
                    label: 'Szukam pomysłu',
                    description: 'Kierunek do wspólnego wyboru',
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
                        minHeight: 64,
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: selected
                          ? theme.primaryStrong
                          : theme.border,
                        backgroundColor: selected
                          ? theme.muted
                          : theme.backgroundElement,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: selected
                          ? theme.primaryStrong
                          : theme.border,
                        backgroundColor: selected
                          ? theme.primaryStrong
                          : theme.backgroundElement,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      {selected ? (
                        <Icon name="check" size={18} color={theme.onPrimary} />
                      ) : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label">{option.label}</AppText>
                      <AppText variant="caption" color="textSecondary">
                        {option.description}
                      </AppText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={layout.stack}>
              <View style={layout.row}>
                <AppText variant="label" style={styles.flex}>
                  Termin wyjazdu
                </AppText>
                {draft.customDateRange ? (
                  <IconButton
                    label="Wyczyść termin"
                    icon="close"
                    onPress={() => setDraft(clearDiscoveryDates)}
                  />
                ) : null}
              </View>
              <AppText variant="caption" color="textSecondary">
                Wybierz daty w kalendarzu lub wpisz je ręcznie. Pusty zakres
                oznacza dowolny termin.
              </AppText>
              <View style={[layout.row, { alignItems: 'flex-start' }]}>
                <View style={styles.flex}>
                  <TripDateField
                    label="Od"
                    value={draft.customDateRange?.startDate ?? ''}
                    onChange={(value) =>
                      setDraft((current) =>
                        updateDiscoveryDate(current, 'startDate', value),
                      )
                    }
                    initialMonth={draft.customDateRange?.endDate}
                  />
                </View>
                <View style={styles.flex}>
                  <TripDateField
                    label="Do"
                    value={draft.customDateRange?.endDate ?? ''}
                    onChange={(value) =>
                      setDraft((current) =>
                        updateDiscoveryDate(current, 'endDate', value),
                      )
                    }
                    initialMonth={draft.customDateRange?.startDate}
                  />
                </View>
              </View>
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
            {draft.dateRangeId === 'own-trip' && !!draft.dateFlexibilityDays ? (
              <AppText variant="caption" color="textSecondary">
                Cały wyjazd można przesunąć o ±{draft.dateFlexibilityDays} dni.
                Porównujemy pobyty o niezmienionej długości.
              </AppText>
            ) : null}
            <View style={layout.stack}>
              <AppText variant="label">Miejsce lub region</AppText>
              <View
                style={[
                  styles.inputRow,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <Icon name="pin" size={20} />
                <TextInput
                  accessibilityLabel="Miejsce lub region"
                  placeholder="Np. Chłapowo, Mazury lub Sudety"
                  placeholderTextColor={theme.textSecondary}
                  value={draft.location}
                  onChangeText={(location) =>
                    setDraft((current) => ({ ...current, location }))
                  }
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  style={[styles.input, { color: theme.text }]}
                />
              </View>
              <AppText variant="caption" color="textSecondary">
                Szukamy w celach wyjazdów i obszarach do wspólnego wyboru.
              </AppText>
            </View>
            {draft.sourceTripId ? (
              <View style={layout.stack}>
                <AppText variant="label">
                  Towarzystwo z preferencji wyjazdu
                </AppText>
                <View style={layout.wrap}>
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
                </View>
              </View>
            ) : null}
            <View style={layout.stack}>
              <AppText variant="label">Towarzystwo dla dzieci</AppText>
              <AppText variant="caption" color="textSecondary">
                Opcjonalnie · możesz wybrać kilka przedziałów
              </AppText>
              <View style={layout.wrap}>
                {CHILD_AGE_BANDS.map((band) => (
                  <Chip
                    key={band}
                    label={band + ' lat'}
                    accessibilityLabel={'Wiek dzieci: ' + band + ' lat'}
                    selected={draft.childAgeBands.includes(band)}
                    onPress={() => toggleAge(band)}
                  />
                ))}
              </View>
            </View>
            <View style={layout.stack}>
              <AppText variant="label">Zwierzęta na wyjeździe</AppText>
              <AppText variant="caption" color="textSecondary">
                Opcjonalnie · możesz wybrać kilka rodzajów
              </AppText>
              <View style={layout.wrap}>
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
              </View>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    ...Typography.body,
  },
});
