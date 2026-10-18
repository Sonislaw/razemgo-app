import { StyleSheet, View } from 'react-native';
import { Landscapes } from '@/constants/theme';
import type { LandscapeKind } from '@/types/travel';
import { Icon, type IconName } from '@/components/ui/icon';

const icons: Record<LandscapeKind, IconName> = {
  coast: 'water',
  lake: 'water',
  mountain: 'mountain',
  forest: 'tent',
};
export function Landscape({ kind }: { kind: LandscapeKind }) {
  const palette = Landscapes[kind];
  return (
    <View
      style={[styles.scene, { backgroundColor: palette.sky }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.sun, { backgroundColor: palette.sun }]} />
      <View
        style={[
          styles.far,
          {
            backgroundColor: palette.far,
            transform: [{ rotate: kind === 'mountain' ? '-28deg' : '-8deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.near,
          {
            backgroundColor: palette.near,
            transform: [{ rotate: kind === 'mountain' ? '25deg' : '9deg' }],
          },
        ]}
      />
      <View style={[styles.ground, { backgroundColor: palette.ground }]} />
      <View style={styles.symbol}>
        <Icon name={icons[kind]} size={38} color={palette.ink} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  scene: { height: 132, overflow: 'hidden' },
  sun: {
    width: 48,
    height: 48,
    borderRadius: 24,
    position: 'absolute',
    top: 18,
    right: '19%',
  },
  far: {
    width: '85%',
    height: 120,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 120,
    position: 'absolute',
    left: '-12%',
    top: 58,
  },
  near: {
    width: '82%',
    height: 120,
    borderTopLeftRadius: 100,
    borderTopRightRadius: 120,
    position: 'absolute',
    right: '-12%',
    top: 74,
  },
  ground: {
    height: 32,
    position: 'absolute',
    bottom: -12,
    width: '120%',
    left: '-10%',
    borderTopLeftRadius: 150,
    borderTopRightRadius: 180,
  },
  symbol: { position: 'absolute', left: 24, top: 26 },
});
