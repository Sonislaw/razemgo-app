import { View } from 'react-native';
import { ChipRow } from '@/components/ui/chip-row';
import { Chip, FieldLabel, layout } from '@/components/ui/primitives';
import { ADULT_AGE_BANDS } from '@/constants/travel';
import type { AdultAgeBand } from '@/types/travel';

export function AdultAgeBandFields({ value, adultCount, onChange, forTrip = false }: {
  value: AdultAgeBand[];
  adultCount: number;
  onChange: (bands: AdultAgeBand[]) => void;
  forTrip?: boolean;
}) {
  const label = forTrip ? 'Wiek dorosłych na wyjeździe' : 'Wiek dorosłych';
  return (
    <View style={layout.stack}>
      <FieldLabel>{label}</FieldLabel>
      <ChipRow horizontal={!forTrip} label={label}>
        {ADULT_AGE_BANDS.map(band => {
          const selected = value.includes(band);
          return (
            <Chip
              key={band}
              label={band}
              accessibilityLabel={label + ': ' + band}
              selected={selected}
              onPress={() => onChange(selected
                ? value.filter(age => age !== band)
                : ADULT_AGE_BANDS.filter(age => age === band || (adultCount > 1 && value.includes(age)))
              )}
            />
          );
        })}
      </ChipRow>
    </View>
  );
}
