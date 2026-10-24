import { Image, type ImageProps } from 'expo-image';
import { Landscapes } from '@/constants/theme';
import type { LandscapeKind } from '@/types/travel';

const illustrations: Record<LandscapeKind, ImageProps['source']> = {
  coast: require('@/assets/images/landscapes/watercolor/coast.jpg'),
  lake: require('@/assets/images/landscapes/watercolor/lake.jpg'),
  mountain: require('@/assets/images/landscapes/watercolor/mountain.jpg'),
  forest: require('@/assets/images/landscapes/watercolor/forest.jpg'),
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
  contentPosition,
}: {
  kind: LandscapeKind;
  style?: ImageProps['style'];
  contentPosition?: ImageProps['contentPosition'];
}) {
  return (
    <Image
      source={illustrations[kind]}
      style={[{ backgroundColor: Landscapes[kind].sky, flexShrink: 0 }, style]}
      contentFit="cover"
      contentPosition={
        contentPosition ??
        (kind === 'mountain' ? { top: '20%', left: '50%' } : 'center')
      }
      recyclingKey={kind}
      accessible
      accessibilityLabel={`Ilustracja krajobrazu: ${labels[kind]}`}
    />
  );
}
