import { View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import type { TripAnimals } from '@/types/animals';
import { animalSummary, tripAnimalSummary } from './animal-data';
import { AnimalPortrait } from './animal-portrait';

export function TripAnimalTag({ animals }: { animals: TripAnimals }) {
  return (
    <View style={layout.row}>
      {animals.animals.length ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {animals.animals.map(({ kind }) => (
            <AnimalPortrait key={kind} kind={kind} size={24} />
          ))}
        </View>
      ) : (
        <Icon name="paw" size={16} />
      )}
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {tripAnimalSummary(animals)}
      </AppText>
    </View>
  );
}
export function AnimalInformation({ animals }: { animals: TripAnimals }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={layout.row}>
        <Icon name="paw" size={20} />
        <AppText variant="label" accessibilityRole="header" style={{ flex: 1 }}>
          Zwierzęta na wyjeździe
        </AppText>
      </View>
      <View style={layout.row}>
        {animals.animals.map(({ kind }) => (
          <AnimalPortrait key={kind} kind={kind} size={40} />
        ))}
        <AppText variant="label" style={{ flex: 1 }}>
          {animalSummary(animals.animals) || 'Bez zwierząt'}
        </AppText>
      </View>
    </View>
  );
}
