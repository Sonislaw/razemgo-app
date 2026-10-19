import { Pressable, View } from 'react-native';
import { AppText, Chip, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { ProfileCounter } from '@/features/profile/profile-form-fields';
import { ANIMAL_OPTIONS } from './animal-data';
import type { GroupAnimals } from '@/types/animals';

interface AnimalFieldsProps {
  value: GroupAnimals;
  onChange: (value: GroupAnimals) => void;
}
export function GroupAnimalFields({ value, onChange }: AnimalFieldsProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="caption" color="textSecondary">
        Opcjonalnie · wybierzcie rodzaj i liczbę zwierząt.
      </AppText>
      <View style={layout.wrap}>
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
                  : [...value.animals, { kind, count: 1 }],
              })
            }
          />
        ))}
      </View>
      {value.animals.map((item) => (
        <ProfileCounter
          key={item.kind}
          label={
            'Liczba zwierząt: ' +
            ANIMAL_OPTIONS.find((option) => option.kind === item.kind)!.label
          }
          value={item.count}
          min={1}
          max={8}
          onChange={(count) =>
            onChange({
              ...value,
              animals: value.animals.map((animal) =>
                animal.kind === item.kind ? { ...animal, count } : animal,
              ),
            })
          }
        />
      ))}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.welcomesAnimals }}
        aria-checked={value.welcomesAnimals}
        accessibilityLabel="Chętnie poznamy ekipy ze zwierzętami"
        onPress={() =>
          onChange({ ...value, welcomesAnimals: !value.welcomesAnimals })
        }
        style={[
          layout.row,
          {
            minHeight: 48,
            padding: 12,
            borderRadius: 14,
            backgroundColor: theme.muted,
          },
        ]}
      >
        <Icon name={value.welcomesAnimals ? 'check' : 'paw'} size={20} />
        <AppText variant="label" style={{ flex: 1 }}>
          Chętnie poznamy ekipy ze zwierzętami
        </AppText>
      </Pressable>
    </View>
  );
}
export function TripAnimalFields(props: AnimalFieldsProps) {
  return (
    <View style={{ gap: 12 }}>
      <View style={layout.row}>
        <Icon name="paw" size={22} />
        <AppText variant="heading" style={{ flex: 1 }}>
          Zwierzęta na tym wyjeździe
        </AppText>
      </View>
      <GroupAnimalFields {...props} />
    </View>
  );
}
