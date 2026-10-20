import { StyleSheet } from 'react-native';
import { LandscapePhoto } from '@/components/trips/landscape-photo';
import type { LandscapeKind } from '@/types/travel';

export function Landscape({ kind }: { kind: LandscapeKind }) {
  return <LandscapePhoto kind={kind} style={styles.scene} />;
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: 132, overflow: 'hidden' },
});
