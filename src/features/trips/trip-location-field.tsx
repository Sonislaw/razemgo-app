import { useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripMode } from '@/types/travel';
import {
  findTripLocation,
  locationContext,
  LOCATION_KIND_LABELS,
  searchTripLocations,
  MAX_LOCATION_SUGGESTIONS,
  MIN_LOCATION_QUERY_LENGTH,
} from './trip-locations';

export function TripLocationField({
  value,
  mode,
  onChange,
  required = true,
  query: controlledQuery,
  onQueryChange,
}: {
  value: string;
  mode: TripMode;
  onChange: (id: string) => void;
  required?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
}) {
  const theme = useTheme();
  const label =
    mode === 'planned' ? 'Miasto lub wieś' : 'Miejscowość, region lub kraj';
  const input = useRef<TextInput>(null);
  const [localQuery, setLocalQuery] = useState('');
  const query = controlledQuery ?? localQuery;
  const setQuery = (text: string) => {
    setLocalQuery(text);
    onQueryChange?.(text);
  };
  const [expanded, setExpanded] = useState(false);
  const selected = findTripLocation(value);
  const results = searchTripLocations(query, mode);
  const showSuggestions = expanded && !selected;

  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label} · {required ? 'wymagane' : 'opcjonalnie'}
      </AppText>
      <View
        style={[
          styles.search,
          {
            backgroundColor: theme.backgroundElement,
            borderColor:
              selected || expanded ? theme.primaryStrong : theme.border,
          },
        ]}
      >
        <Icon name="search" size={20} />
        <TextInput
          ref={input}
          accessibilityLabel={label}
          accessibilityHint={
            (required ? 'Pole wymagane. ' : 'Opcjonalnie. ') +
            (mode === 'planned'
              ? 'Wybierz miasto lub wieś z podpowiedzi.'
              : 'Wpisz nazwę i wybierz lokalizację z podpowiedzi.')
          }
          placeholder={
            mode === 'planned'
              ? 'Wpisz nazwę miejscowości'
              : 'Wpisz nazwę lokalizacji'
          }
          placeholderTextColor={theme.textSecondary}
          value={selected?.name ?? query}
          onChangeText={(text) => {
            onChange('');
            setQuery(text);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(true)}
          autoCorrect={false}
          autoComplete="off"
          underlineColorAndroid="transparent"
          maxLength={100}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
        />
        {selected || query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wyczyść lokalizację"
            onPress={() => {
              setQuery('');
              setExpanded(true);
              onChange('');
              input.current?.focus();
            }}
            style={styles.clear}
          >
            <Icon name="close" size={20} />
          </Pressable>
        ) : null}
      </View>
      {selected ? (
        <View style={layout.row}>
          <Icon name="check" size={16} color={theme.positive} />
          <AppText variant="caption" color="positive" style={styles.flex}>
            {LOCATION_KIND_LABELS[selected.kind]} · {locationContext(selected)}
          </AppText>
        </View>
      ) : showSuggestions ? (
        <View style={styles.field}>
          <AppText
            variant="caption"
            color="textSecondary"
            accessibilityLiveRegion="polite"
          >
            {query.trim().length > 0 &&
            query.trim().length < MIN_LOCATION_QUERY_LENGTH
              ? `Wpisz co najmniej ${MIN_LOCATION_QUERY_LENGTH} znaki`
              : results.length
                ? `Podpowiedzi lokalizacji · ${results.length}`
                : 'Brak pasujących lokalizacji'}
          </AppText>
          {results.map((location) => (
            <Pressable
              key={location.id}
              accessibilityRole="button"
              accessibilityLabel={`Wybierz lokalizację: ${location.name}, ${locationContext(location)}, ${LOCATION_KIND_LABELS[location.kind]}`}
              onPress={() => {
                setQuery('');
                setExpanded(false);
                onChange(location.id);
                Keyboard.dismiss();
              }}
              style={({ pressed }) => [
                styles.suggestion,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  opacity: pressed ? 0.65 : 1,
                },
              ]}
            >
              <Icon name="pin" size={20} />
              <View style={[styles.flex, { gap: 4 }]}>
                <AppText
                  variant="label"
                  style={{ fontSize: 16, lineHeight: 22 }}
                >
                  {location.name}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {locationContext(location)}
                </AppText>
              </View>
              <AppText
                variant="caption"
                color="textSecondary"
                style={styles.kind}
              >
                {LOCATION_KIND_LABELS[location.kind]}
              </AppText>
            </Pressable>
          ))}
          {!results.length &&
          query.trim().length >= MIN_LOCATION_QUERY_LENGTH ? (
            <AppText variant="caption" color="textSecondary">
              Sprawdź pisownię lub wpisz inną nazwę. Możesz dopisać gminę,
              powiat albo województwo.
            </AppText>
          ) : null}
          {results.length === MAX_LOCATION_SUGGESTIONS ? (
            <AppText variant="caption" color="textSecondary">
              Pokazujemy pierwsze {MAX_LOCATION_SUGGESTIONS} propozycji. Dopisz
              gminę, powiat lub województwo, aby zawęzić wybór.
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText variant="caption" color="textSecondary">
          {mode === 'planned'
            ? 'Wybierz konkretną miejscowość, do której jedziecie.'
            : 'Wpisz nazwę i wybierz lokalizację z podpowiedzi.'}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderRadius: Radius.small,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 12,
    borderWidth: 0,
    backgroundColor: 'transparent',
    outlineWidth: 0,
    fontFamily: Fonts.sans,
    ...Typography.body,
  },
  clear: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 12,
    borderWidth: 1,
    borderRadius: Radius.small,
  },
  kind: { maxWidth: '35%', flexShrink: 1 },
});
