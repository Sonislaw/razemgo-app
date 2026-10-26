import { memo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentDate } from '@/hooks/use-current-date';
import { getTripTimeline, type TimelineTrip } from '@/features/trips/trip-timeline-model';

export const TripTimeline = memo(function TripTimeline({ trip, compact = false, testID = 'trip-timeline' }: { trip: TimelineTrip; compact?: boolean; testID?: string }) {
  const theme = useTheme();
  const today = useCurrentDate();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const model = getTripTimeline(trip, today);
  if (!model) return null;
  const ink = model.muted ? theme.textSecondary : model.phase === 'ongoing' ? theme.positive : theme.primaryStrong;
  const periodColor = model.muted ? theme.textSecondary : theme.community;
  const fontSize = compact ? 10 : 11;
  const labelWidths = model.markers.map(marker => Math.max(34, marker.label.length * fontSize * 0.58 + 8) * fontScale);
  const separateLabels = width > 0 && model.markers.some((marker, i) => i > 0 &&
    (marker.position - model.markers[i - 1].position) * width / 100 < (labelWidths[i] + labelWidths[i - 1]) / 2 + 4);
  const railTop = separateLabels ? 8 : (compact ? 27 : 30) * fontScale;
  const railHeight = compact ? 7 : 9;
  const dotSize = compact ? 12 : 14;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={model.accessibilityLabel}
      style={[styles.container, { backgroundColor: theme.backgroundSelected, padding: compact ? 8 : 10 }]}>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.caption}>
          <Icon name="clock" size={14} color={ink} />
          <AppText variant="caption" style={{ color: ink, fontWeight: '700', fontSize: compact ? 11 : 12, flexShrink: 1 }}>{model.caption}</AppText>
        </View>
        {separateLabels ? <View style={styles.legend}>
          {model.markers.map(marker => <AppText key={marker.key} variant="caption" style={{ flex: 1, textAlign: 'center', fontSize,
            color: marker.isToday ? theme.primaryStrong : theme.textSecondary, fontWeight: marker.isToday ? '700' : '500' }}>
            {marker.isToday ? marker.label : (marker.key === 'start' ? 'Start\n' : 'Koniec\n') + marker.label}
          </AppText>)}
        </View> : null}
        <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ height: railTop + railHeight + 6 }}>
          <View style={[styles.rail, { top: railTop, height: railHeight, backgroundColor: theme.border }]}>
            {[1, 2, 3, 4, 5, 6, 7].map(tick => <View key={tick} style={{ position: 'absolute', left: `${tick * 12.5}%`, width: 1, height: railHeight, backgroundColor: theme.backgroundElement }} />)}
            <View testID="trip-timeline-period" style={{ position: 'absolute', left: `${model.startPosition}%`, width: `${model.endPosition - model.startPosition}%`, height: railHeight,
              borderRadius: 999, backgroundColor: periodColor, opacity: model.muted ? 0.5 : 1 }} />
          </View>
          {model.markers.map((marker, i) => {
            const labelWidth = Math.min(width || labelWidths[i], labelWidths[i]);
            const labelLeft = Math.max(0, Math.min(width - labelWidth, width * marker.position / 100 - labelWidth / 2));
            return <View key={marker.key} style={StyleSheet.absoluteFill} pointerEvents="none">
              {!separateLabels && width > 0 ? <AppText variant="caption" numberOfLines={1} style={{ position: 'absolute', top: 0, left: labelLeft, width: labelWidth,
                textAlign: 'center', fontSize, fontWeight: marker.isToday ? '700' : '500', color: marker.isToday ? theme.primaryStrong : theme.textSecondary }}>{marker.label}</AppText> : null}
              <View style={{ position: 'absolute', left: `${marker.position}%`, top: railTop - 7, height: 7, width: 1,
                backgroundColor: marker.isToday ? theme.primaryStrong : theme.textSecondary }} />
              <View testID={marker.isToday ? 'trip-timeline-today' : undefined} style={{ position: 'absolute', left: `${marker.position}%`, top: railTop + railHeight / 2 - dotSize / 2,
                width: dotSize, height: dotSize, marginLeft: -dotSize / 2, borderRadius: 999, borderWidth: 2, borderColor: theme.backgroundElement,
                backgroundColor: marker.isToday ? theme.primaryStrong : periodColor }} />
            </View>;
          })}
        </View>
      </View>
    </View>
  );
});
const styles = StyleSheet.create({
  container: { borderRadius: 14 },
  caption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginBottom: 3 },
  legend: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  rail: { position: 'absolute', left: 0, right: 0, borderRadius: 999, overflow: 'hidden' },
});
