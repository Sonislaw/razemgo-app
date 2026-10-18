import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { TripCard } from '@/components/trips/trip-card';
import {
  CHILD_AGE_BANDS,
  DEMO_DATE_RANGES,
  DEMO_PROPOSALS,
} from '@/data/mocks/travel';
import {
  filterProposals,
  INITIAL_FILTERS,
} from '@/features/discovery/filter-trips';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { Fonts, Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, TripMode } from '@/types/travel';

const modes: { mode: TripMode; label: string }[] = [
  { mode: 'planned', label: 'Mam plan' },
  { mode: 'flexible', label: 'Szukam pomysłu' },
];
export default function ExploreScreen() {
  const theme = useTheme();
  const { filters, setFilters } = useDiscovery();
  const dateRange = DEMO_DATE_RANGES.find(
    (range) => range.id === filters.dateRangeId,
  );
  const proposals = filterProposals(DEMO_PROPOSALS, filters, dateRange);
  const planned = filters.mode === 'planned';
  const reset = () => setFilters({ ...INITIAL_FILTERS, mode: filters.mode });
  const toggleAge = (band: ChildAgeBand) =>
    setFilters((current) => ({
      ...current,
      childAgeBands: current.childAgeBands.includes(band)
        ? current.childAgeBands.filter((age) => age !== band)
        : [...current.childAgeBands, band],
    }));
  return (
    <Screen>
      <Header
        title="Znajdź wspólny kierunek."
        subtitle="Podobne plany. Nowe znajomości. Wybierz, czego szukasz."
        brand
      />
      <View
        accessibilityRole="tablist"
        style={[styles.segment, { backgroundColor: theme.muted }]}
      >
        {modes.map(({ mode, label }) => (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: filters.mode === mode }}
            accessibilityLabel={label}
            onPress={() => setFilters((current) => ({ ...current, mode }))}
            style={({ pressed }) => [
              styles.segmentItem,
              {
                backgroundColor:
                  filters.mode === mode ? theme.backgroundElement : theme.muted,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <AppText
              variant="label"
              color={filters.mode === mode ? 'primaryStrong' : 'textSecondary'}
              style={{ textAlign: 'center' }}
            >
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Card style={{ gap: Spacing.four }}>
        <View style={layout.stack}>
          <AppText variant="label">
            {planned ? 'Kiedy wyjeżdżacie?' : 'Kiedy macie wolne?'}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Przykładowe terminy · 2027
          </AppText>
          <View style={layout.wrap}>
            <Chip
              label="Dowolny termin"
              selected={filters.dateRangeId === 'all'}
              onPress={() =>
                setFilters((current) => ({ ...current, dateRangeId: 'all' }))
              }
            />
            {DEMO_DATE_RANGES.map((range) => (
              <Chip
                key={range.id}
                label={range.label}
                selected={filters.dateRangeId === range.id}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    dateRangeId: range.id,
                  }))
                }
              />
            ))}
          </View>
        </View>
        <View style={layout.stack}>
          <AppText variant="label">
            {planned ? 'Dokąd jedziecie?' : 'Jaki obszar Was interesuje?'}
          </AppText>
          <View
            style={[
              styles.inputRow,
              { borderColor: theme.border, backgroundColor: theme.background },
            ]}
          >
            <Icon name="pin" size={20} />
            <TextInput
              accessibilityLabel={
                planned ? 'Kierunek wyjazdu' : 'Obszar poszukiwań'
              }
              placeholder={
                planned ? 'Np. Chłapowo lub Pomorze' : 'Np. Mazury lub Sudety'
              }
              placeholderTextColor={theme.textSecondary}
              value={filters.location}
              onChangeText={(location) =>
                setFilters((current) => ({ ...current, location }))
              }
              autoCorrect={false}
              returnKeyType="done"
              style={[styles.input, { color: theme.text }]}
            />
          </View>
          <AppText variant="caption" color="textSecondary">
            {planned
              ? 'Szukamy propozycji w miejscowości lub regionie celu wyjazdu.'
              : 'Wybierz region, w którym chcecie się spotkać. Dokładny cel ustalicie później.'}
          </AppText>
        </View>
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
                selected={filters.childAgeBands.includes(band)}
                onPress={() => toggleAge(band)}
              />
            ))}
          </View>
        </View>
        <Button label="Wyczyść filtry" variant="secondary" onPress={reset} />
      </Card>
      <View style={layout.section}>
        <AppText
          variant="heading"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          Propozycje dla Was · {proposals.length}
        </AppText>
        <AppText variant="label" color="textSecondary">
          Plany i pomysły · dane demonstracyjne
        </AppText>
        {proposals.length ? (
          proposals.map(({ trip, group }) => (
            <TripCard
              key={trip.id}
              trip={trip}
              group={group}
              dateRange={dateRange}
            />
          ))
        ) : (
          <EmptyState
            title="Jeszcze się mijamy"
            description="Żaden przykładowy plan nie pasuje do tych filtrów. Spróbuj innego regionu, terminu lub wieku dzieci."
            action={
              <Button label="Pokaż wszystkie propozycje" onPress={reset} />
            }
          />
        )}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.small,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segmentItem: {
    flex: 1,
    minHeight: 48,
    padding: 12,
    justifyContent: 'center',
    borderRadius: Radius.small,
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
