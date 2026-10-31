import { View } from 'react-native';
import { AppText, Chip, FieldLabel, SectionTitle, layout } from '@/components/ui/primitives';
import { ProfileCounter } from '@/features/profile/profile-form-fields';
import { CHILD_AGE_BANDS } from '@/constants/travel';
import type { TripParticipants } from '@/types/travel';
import { MAX_TRIP_PARTICIPANTS } from '@/lib/trip-participants';

export function TripParticipantsFields({ value, onChange }: {
  value: TripParticipants | null;
  onChange: (value: TripParticipants) => void;
}) {
  const current = value ?? { adultCount: 1, childCount: 0, childAgeBands: [] };
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Kto jedzie?" required />
      <AppText variant="caption" color="textSecondary">
        Skład dotyczy tego wyjazdu. Możesz go zmienić niezależnie od profilu ekipy.
      </AppText>
      <ProfileCounter
        label="Dorośli na wyjeździe"
        required
        value={current.adultCount}
        min={1}
        max={MAX_TRIP_PARTICIPANTS}
        onChange={adultCount => onChange({ ...current, adultCount })}
      />
      <ProfileCounter
        label="Dzieci na wyjeździe"
        required
        value={current.childCount}
        min={0}
        max={MAX_TRIP_PARTICIPANTS}
        onChange={childCount => onChange({
          ...current, childCount,
          childAgeBands: current.childAgeBands.slice(0, childCount),
        })}
      />
      {current.childCount > 0 ? (
        <View style={{ gap: 8 }}>
          <FieldLabel required>Wiek dzieci na wyjeździe</FieldLabel>
          <View style={layout.wrap}>
            {CHILD_AGE_BANDS.map(band => (
              <Chip
                key={band}
                label={band + ' lat'}
                accessibilityLabel={'Wiek dzieci na wyjeździe: ' + band + ' lat'}
                selected={current.childAgeBands.includes(band)}
                onPress={() => onChange({
                  ...current,
                  childAgeBands: current.childAgeBands.includes(band)
                    ? current.childAgeBands.filter(item => item !== band)
                    : [...current.childAgeBands, band],
                })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
