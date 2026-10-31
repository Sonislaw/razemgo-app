import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, ScreenFullWidth } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import { LandscapePhoto } from './landscape-photo';
import { TripTimeline } from './trip-timeline';
import { TripPlanningIcon } from './trip-planning-icon';

export function TripCover({ trip, action, decorative = false, variant = 'card', datesLabel }: {
  trip: TripPlan;
  action?: ReactNode;
  decorative?: boolean;
  variant?: 'card' | 'details';
  datesLabel?: string;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const details = variant === 'details';
  const cover = (
    <View testID="trip-cover" style={[
      styles.cover,
      details && styles.detailsCover,
      details && { paddingLeft: Math.max(24, insets.left), paddingRight: Math.max(24, insets.right) },
    ]}>
      <View style={StyleSheet.absoluteFill} aria-hidden={decorative || undefined}
        accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}>
        <LandscapePhoto kind={trip.landscape} style={StyleSheet.absoluteFill}
          contentPosition={trip.landscape === 'coast' ? { top: '35%', left: '50%' } : undefined} />
      </View>
      <View style={styles.labels}>
        <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
          <AppText variant="caption" color="primaryStrong" style={styles.modeLabel}>
            {trip.mode === 'planned' ? 'MAM PLAN' : 'SZUKAM POMYSŁU'}
          </AppText>
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      <View style={styles.timelineGroup}>
        {details && datesLabel ? (
          <View style={[styles.dates, { backgroundColor: theme.backgroundElement + 'EB' }]}>
            <TripPlanningIcon kind="dates" size={20} framed={false} />
            <AppText variant="label" color="primaryStrong" style={styles.datesLabel}>{datesLabel}</AppText>
          </View>
        ) : null}
        <TripTimeline trip={trip} compact appearance="overlay" />
      </View>
    </View>
  );
  return details ? <ScreenFullWidth>{cover}</ScreenFullWidth> : cover;
}

const styles = StyleSheet.create({
  cover: { borderRadius: 18, overflow: 'hidden', minHeight: 148, padding: 8, justifyContent: 'space-between', gap: 24 },
  detailsCover: { borderRadius: 0, minHeight: 220, paddingVertical: 16 },
  timelineGroup: { gap: 6 },
  dates: {
    alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12,
  },
  datesLabel: { flexShrink: 1 },
  labels: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  modeLabel: { fontSize: 11, letterSpacing: 0.3 },
  action: { marginLeft: 'auto', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 },
});
