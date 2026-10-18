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
import {
  CHILD_AGE_BANDS,
  DEMO_DATE_RANGES,
  DEMO_PROPOSALS,
} from '@/data/mocks/travel';
import { filterProposals, INITIAL_FILTERS } from './filter-trips';
import {
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
  Typography,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, DiscoveryFilters } from '@/types/travel';

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
    childAgeBands: [...initialFilters.childAgeBands],
  }));
  const dateRange = DEMO_DATE_RANGES.find(
    (range) => range.id === draft.dateRangeId,
  );
  const resultCount = filterProposals(DEMO_PROPOSALS, draft, dateRange).length;
  const planned = draft.mode === 'planned';
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
                {planned
                  ? 'Dopasuj termin i kierunek.'
                  : 'Określ dostępność i obszar poszukiwań.'}
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
              <AppText variant="label">
                {planned ? 'Kiedy wyjeżdżacie?' : 'Kiedy macie wolne?'}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                Przykładowe terminy · 2027
              </AppText>
              <View style={layout.wrap}>
                <Chip
                  label="Dowolny termin"
                  selected={draft.dateRangeId === 'all'}
                  onPress={() =>
                    setDraft((current) => ({ ...current, dateRangeId: 'all' }))
                  }
                />
                {DEMO_DATE_RANGES.map((range) => (
                  <Chip
                    key={range.id}
                    label={range.label}
                    selected={draft.dateRangeId === range.id}
                    onPress={() =>
                      setDraft((current) => ({
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
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
              >
                <Icon name="pin" size={20} />
                <TextInput
                  accessibilityLabel={
                    planned ? 'Kierunek wyjazdu' : 'Obszar poszukiwań'
                  }
                  placeholder={
                    planned
                      ? 'Np. Chłapowo lub Pomorze'
                      : 'Np. Mazury lub Sudety'
                  }
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
                {planned
                  ? 'Miejscowość lub region celu wyjazdu.'
                  : 'Region wspólnego spotkania. Dokładny cel ustalicie później.'}
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
                    selected={draft.childAgeBands.includes(band)}
                    onPress={() => toggleAge(band)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Button
              label="Wyczyść"
              variant="secondary"
              onPress={() => setDraft({ ...INITIAL_FILTERS, mode: draft.mode })}
            />
            <Button
              label={'Pokaż wyniki · ' + resultCount}
              onPress={() => {
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
