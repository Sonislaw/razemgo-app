import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import type { LandscapeKind } from '@/types/travel';
import { TripThumbnail } from './trip-thumbnail';

export function TripCardHeading({
  title,
  landscape,
}: {
  title: string;
  landscape: LandscapeKind;
}) {
  return (
    <View style={styles.row}>
      <TripThumbnail kind={landscape} size={60} height={60} />
      <AppText
        variant="heading"
        accessibilityRole="header"
        style={styles.title}
        numberOfLines={2}
      >
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 24 },
});
