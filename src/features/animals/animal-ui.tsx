import { View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import type { TripAnimals } from '@/types/animals';
import { animalSummary, tripAnimalSummary } from './animal-data';

export function TripAnimalTag({ animals }: { animals: TripAnimals }) {
  return (
    <View style={layout.row}>
      <Icon name="paw" size={16} />
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
      <AppText variant="label">
        {animalSummary(animals.animals) || 'Bez zwierząt'}
      </AppText>
    </View>
  );
}
