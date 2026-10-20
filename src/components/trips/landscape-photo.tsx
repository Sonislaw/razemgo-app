import { Image, type ImageProps } from 'expo-image';
import { Landscapes } from '@/constants/theme';
import type { LandscapeKind } from '@/types/travel';

const photos: Record<LandscapeKind, ImageProps['source']> = {
  coast: require('@/assets/images/landscapes/coast.jpg'),
  lake: require('@/assets/images/landscapes/lake.jpg'),
  mountain: require('@/assets/images/landscapes/mountain.jpg'),
  forest: require('@/assets/images/landscapes/forest.jpg'),
};

const labels: Record<LandscapeKind, string> = {
  coast: 'morze i piaszczysta plaża',
  lake: 'jezioro z drewnianym pomostem',
  mountain: 'górskie szczyty i zielona dolina',
  forest: 'słoneczna leśna ścieżka',
};

export function LandscapePhoto({
  kind,
  style,
}: {
  kind: LandscapeKind;
  style?: ImageProps['style'];
}) {
  return (
    <Image
      source={photos[kind]}
      style={[{ backgroundColor: Landscapes[kind].sky, flexShrink: 0 }, style]}
      contentFit="cover"
      contentPosition={
        kind === 'mountain' ? { top: '20%', left: '50%' } : 'center'
      }
      recyclingKey={kind}
      accessible
      accessibilityLabel={`Zdjęcie ilustracyjne: ${labels[kind]}`}
    />
  );
}
