import { Image, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { ChipRow } from '@/components/ui/chip-row';
import { IllustrationChoice } from '@/components/ui/illustration-choice';
import { Chip, layout } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { TRAVEL_MODE_OPTIONS } from './profile-options';

const TRAVEL_MODE_IMAGES: Record<string, ImageSource> = {
  Przyczepa: require('../../../assets/images/travel-modes/caravan.png'),
  Kamper: require('../../../assets/images/travel-modes/motorhome.png'),
  Namiot: require('../../../assets/images/travel-modes/tent.png'),
  Van: require('../../../assets/images/travel-modes/van.png'),
  Samochód: require('../../../assets/images/travel-modes/car.png'),
};

function TravelModeArtwork({
  source,
  size,
}: {
  source: ImageSource;
  size: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.artwork,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.backgroundSelected,
        },
      ]}
    >
      <Image
        source={source}
        contentFit="contain"
        style={styles.image}
        accessible={false}
        alt=""
      />
    </View>
  );
}

export function TravelModePicker({
  value,
  onChange,
  horizontal = false,
}: {
  value: string[];
  onChange: (modes: string[]) => void;
  horizontal?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Sposób podróżowania">
      <ChipRow horizontal={horizontal} label="Sposób podróżowania">
        {TRAVEL_MODE_OPTIONS.map((mode) => (
          <IllustrationChoice
            key={mode}
            label={'Sposób podróżowania: ' + mode}
            selectionMode="single"
            selected={value[0] === mode}
            onPress={() => onChange([mode])}
          >
            <TravelModeArtwork source={TRAVEL_MODE_IMAGES[mode]} size={54} />
          </IllustrationChoice>
        ))}
      </ChipRow>
    </View>
  );
}

export function TravelModeBadges({ modes }: { modes: string[] }) {
  return (
    <View style={layout.wrap} accessibilityLabel="Sposób podróżowania">
      {modes.slice(0, 1).map((mode) => {
        const source = TRAVEL_MODE_IMAGES[mode];
        return source ? (
          <View
            key={mode}
            accessible
            accessibilityRole="image"
            accessibilityLabel={mode}
          >
            <TravelModeArtwork source={source} size={48} />
          </View>
        ) : (
          <Chip key={mode} label={mode} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  image: { width: '88%', height: '88%' },
});
