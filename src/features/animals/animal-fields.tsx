import { View } from 'react-native';
import { AppText, Chip, FieldLabel } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { ANIMAL_OPTIONS } from './animal-data';
import type { GroupAnimals } from '@/types/animals';

interface AnimalFieldsProps {
  value: GroupAnimals;
  onChange: (value: GroupAnimals) => void;
}
export function GroupAnimalFields({
  value,
  onChange,
  horizontal = false,
}: AnimalFieldsProps & { horizontal?: boolean }) {
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="caption" color="textSecondary">
        Zaznacz zwierzęta, z którymi podróżujesz.
      </AppText>
      <ChipRow horizontal={horizontal} label="Zwierzęta">
        <Chip
          label="Bez zwierząt"
          selected={!value.animals.length}
          onPress={() => onChange({ ...value, animals: [] })}
        />
        {ANIMAL_OPTIONS.map(({ kind, label }) => (
          <Chip
            key={kind}
            label={label}
            accessibilityLabel={'Zwierzę w ekipie: ' + label}
            selected={value.animals.some((item) => item.kind === kind)}
            onPress={() =>
              onChange({
                ...value,
                animals: value.animals.some((item) => item.kind === kind)
                  ? value.animals.filter((item) => item.kind !== kind)
                  : [...value.animals, { kind }],
              })
            }
          />
        ))}
      </ChipRow>
    </View>
  );
}
export function TripAnimalFields(props: AnimalFieldsProps) {
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>Zwierzęta na tym wyjeździe</FieldLabel>
      <GroupAnimalFields {...props} horizontal />
    </View>
  );
}
