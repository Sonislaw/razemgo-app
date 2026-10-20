import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText, FieldLabel, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ProfileTextField({
  label,
  value,
  onChangeText,
  maxLength,
  multiline = false,
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  maxLength: number;
  multiline?: boolean;
  hint?: string;
  required?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={required ? 'Pole wymagane.' : undefined}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline={multiline}
        autoCorrect={false}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            borderColor: theme.border,
            color: theme.text,
          },
          multiline && styles.multiline,
        ]}
      />
      {hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function ProfileCounter({
  label,
  value,
  min,
  max,
  onChange,
  required = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  required?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.counterRow}>
      <FieldLabel required={required} style={{ flex: 1 }}>
        {label}
      </FieldLabel>
      <View style={layout.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Mniej: ' + label}
          accessibilityState={{ disabled: value <= min }}
          disabled={value <= min}
          onPress={() => onChange(value - 1)}
          style={[
            styles.counterButton,
            { backgroundColor: theme.muted, opacity: value <= min ? 0.45 : 1 },
          ]}
        >
          <Icon name="minus" size={20} />
        </Pressable>
        <AppText
          variant="heading"
          accessibilityLabel={label + ': ' + value}
          style={styles.counterValue}
        >
          {value}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Więcej: ' + label}
          accessibilityState={{ disabled: value >= max }}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
          style={[
            styles.counterButton,
            { backgroundColor: theme.muted, opacity: value >= max ? 0.45 : 1 },
          ]}
        >
          <Icon name="plus" size={20} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.small,
    minHeight: 52,
    padding: 12,
    fontFamily: Fonts.sans,
    ...Typography.body,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  counterValue: { minWidth: 24, textAlign: 'center' },
});
