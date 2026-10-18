import { View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';
import type { LandscapeKind } from '@/types/travel';
import { useTheme } from '@/hooks/use-theme';

const icons: Record<LandscapeKind, IconName> = {
  coast: 'water',
  lake: 'water',
  mountain: 'mountain',
  forest: 'leaf',
};
export function TripThumbnail({
  kind,
  size = 52,
  height = 60,
}: {
  kind: LandscapeKind;
  size?: number;
  height?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor:
          kind === 'forest'
            ? theme.positiveBackground
            : kind === 'coast'
              ? theme.muted
              : theme.hero,
      }}
    >
      <Icon name={icons[kind]} size={Math.round(size * 0.54)} />
    </View>
  );
}
