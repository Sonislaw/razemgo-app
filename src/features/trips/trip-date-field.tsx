import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import {
  AppText,
  Button,
  IconButton,
  layout,
} from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { Fonts, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isValidDate, todayDate } from './own-trips-state';

export function dateLabel(value: string): string {
  return isValidDate(value)
    ? new Intl.DateTimeFormat('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value))
    : 'Wybierz datę';
}
function DatePicker({
  label,
  value,
  onChange,
  onClose,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const today = todayDate();
  const initial = isValidDate(value) ? value : today;
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [selected, setSelected] = useState(isValidDate(value) ? value : '');
  const display = (date: string) =>
    isValidDate(date)
      ? date.slice(8, 10) + '.' + date.slice(5, 7) + '.' + date.slice(0, 4)
      : '';
  const [input, setInput] = useState(display(value));
  const [error, setError] = useState('');
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const offset = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const changeMonth = (delta: number) =>
    setMonth(
      new Date(Date.UTC(year, monthIndex + delta, 1)).toISOString().slice(0, 7),
    );
  const parse = (text: string) => {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
  };
  const pick = (date: string) => {
    setSelected(date);
    setInput(display(date));
    setError('');
  };
  return (
    <BottomSheet title={label} onClose={onClose}>
      <View style={[layout.row, { justifyContent: 'space-between' }]}>
        <IconButton
          icon="back"
          label="Poprzedni miesiąc"
          onPress={() => changeMonth(-1)}
        />
        <AppText variant="label" style={{ flex: 1, textAlign: 'center' }}>
          {new Intl.DateTimeFormat('pl-PL', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(month + '-01'))}
        </AppText>
        <IconButton
          icon="arrow"
          label="Następny miesiąc"
          onPress={() => changeMonth(1)}
        />
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((day) => (
          <AppText
            key={day}
            variant="caption"
            color="textSecondary"
            style={{ width: '14.2857%', textAlign: 'center' }}
          >
            {day}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: offset + days }, (_, index) => {
          const day = index - offset + 1;
          const date = month + '-' + String(day).padStart(2, '0');
          return day <= 0 ? (
            <View key={index} style={{ width: '14.2857%' }} />
          ) : (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={
                dateLabel(date) + (date === today ? ', dzisiaj' : '')
              }
              accessibilityState={{ selected: selected === date }}
              onPress={() => pick(date)}
              style={{
                width: '14.2857%',
                minHeight: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  selected === date ? theme.primaryStrong : 'transparent',
              }}
            >
              {date === today ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 4,
                    bottom: 4,
                    left: 4,
                    right: 4,
                    borderWidth: 2,
                    borderRadius: 8,
                    borderColor:
                      selected === date ? theme.onPrimary : theme.primaryStrong,
                  }}
                />
              ) : null}
              <AppText
                variant="label"
                style={{
                  color:
                    selected === date
                      ? theme.onPrimary
                      : date === today
                        ? theme.primaryStrong
                        : theme.text,
                  fontWeight: date === today ? '700' : '600',
                }}
              >
                {day}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText variant="label">Lub wpisz datę (DD.MM.RRRR)</AppText>
      <TextInput
        accessibilityLabel="Data (DD.MM.RRRR)"
        placeholder="21.05.2027"
        placeholderTextColor={theme.textSecondary}
        value={input}
        maxLength={10}
        keyboardType="numbers-and-punctuation"
        onChangeText={(text) => {
          setInput(text);
          setError('');
          const parsed = parse(text);
          setSelected(isValidDate(parsed) ? parsed : '');
          if (isValidDate(parsed)) setMonth(parsed.slice(0, 7));
        }}
        style={{
          minHeight: 52,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.background,
          color: theme.text,
          fontFamily: Fonts.sans,
          ...Typography.body,
        }}
      />
      {error ? (
        <AppText accessibilityRole="alert" variant="caption">
          {error}
        </AppText>
      ) : null}
      <Button
        label="Wybierz datę"
        onPress={() => {
          if (!isValidDate(selected)) {
            setError('Podaj poprawną datę w formacie DD.MM.RRRR.');
            return;
          }
          onChange(selected);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
export function TripDateField({
  label,
  value,
  onChange,
  initialMonth,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  initialMonth?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + ': ' + dateLabel(value)}
        onPress={() => setOpen(true)}
        style={[
          layout.row,
          {
            minHeight: 52,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <Icon name="calendar" size={20} />
        <AppText style={{ flex: 1, fontSize: 14 }}>{dateLabel(value)}</AppText>
      </Pressable>
      {open ? (
        <DatePicker
          label={label}
          value={value || initialMonth || ''}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
