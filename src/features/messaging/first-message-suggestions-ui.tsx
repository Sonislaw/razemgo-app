import { AppText, Button } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  getFirstMessageSuggestions,
  type FirstMessageSuggestion,
} from './first-message-suggestions';

export function FirstMessageSuggestions({
  trip,
  text,
  disabled,
  onChoose,
}: {
  trip?: TripPlan;
  text: string;
  disabled: boolean;
  onChoose: (text: string) => void;
}) {
  const theme = useTheme();
  const suggestions = getFirstMessageSuggestions(trip);
  const [pending, setPending] = useState<FirstMessageSuggestion | null>(null);
  const insert = (suggestion: FirstMessageSuggestion) => {
    setPending(null);
    onChoose(suggestion.text);
  };
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">Jak zacząć rozmowę?</AppText>
      <AppText variant="caption" color="textSecondary">
        Wybierz podpowiedź i dopasuj ją do siebie przed wysłaniem.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {suggestions.map((suggestion) => {
          const selected = text === suggestion.text;
          return (
            <Pressable
              key={suggestion.id}
              accessibilityRole="button"
              accessibilityLabel={'Podpowiedź: ' + suggestion.label}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (text.trim() && !suggestions.some((s) => s.text === text))
                  setPending(suggestion);
                else insert(suggestion);
              }}
              style={({ pressed }) => ({
                minHeight: 48,
                maxWidth: '100%',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? theme.primaryStrong : theme.border,
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: theme.backgroundSelected,
                opacity: pressed || disabled ? 0.6 : 1,
              })}
            >
              <AppText variant="label" color="primaryStrong">
                {suggestion.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {pending ? (
        <View
          style={{
            gap: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.background,
          }}
        >
          <AppText variant="label" accessibilityLiveRegion="polite">
            Zastąpić napisaną wiadomość podpowiedzią?
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {pending.text}
          </AppText>
          <Button
            label="Wstaw podpowiedź"
            disabled={disabled}
            onPress={() => insert(pending)}
          />
          <Button
            label="Zachowaj mój tekst"
            variant="secondary"
            disabled={disabled}
            onPress={() => setPending(null)}
          />
        </View>
      ) : null}
    </View>
  );
}
