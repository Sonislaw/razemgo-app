import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';
import { AppText, layout } from '@/components/ui/primitives';
import { CompatibilityBadge } from '@/components/ui/compatibility-badge';
import { tripAnimalSummary } from '@/features/animals/animal-data';
import { AnimalPortrait } from '@/features/animals/animal-portrait';
import { formatTripDates, getTripLocation } from '@/features/discovery/filter-trips';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import type { ChildAgeBand, TravelGroup, TripPlan } from '@/types/travel';
import { LandscapePhoto } from './landscape-photo';
import { TripPlanningIcon } from './trip-planning-icon';

const INTEREST_ICONS: Record<string, IconName> = {
  Plaża: 'water',
  Kajaki: 'water',
  Rowery: 'bike',
  Ognisko: 'campfire',
  Las: 'leaf',
  Przyroda: 'leaf',
  Wędrówki: 'mountain',
  'Spokojny wypoczynek': 'sun',
};

interface TripListingCardProps {
  trip: TripPlan;
  group?: TravelGroup;
  ageBands?: ChildAgeBand[];
  travelModes?: string[];
  score?: number;
  rightBadge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  locationLabel?: string;
  datesLabel?: string;
  onPress?: () => void;
  onPressGroup?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  nativeID?: string;
  compatibilityTestID?: string;
}

export function TripListingCard({
  trip,
  group,
  ageBands = group?.childAgeBands ?? [],
  travelModes = group?.travelModes ?? [],
  score,
  rightBadge,
  footer,
  children,
  locationLabel,
  datesLabel,
  onPress,
  onPressGroup,
  accessibilityLabel,
  accessibilityHint,
  testID,
  nativeID,
  compatibilityTestID,
}: TripListingCardProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const travelMode = travelModes[0];
  const content = (
    <>
      <View style={styles.hero}>
        <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <LandscapePhoto
            kind={trip.landscape}
            style={[styles.photo, { minHeight: 80 * fontScale }]}
            contentPosition={trip.landscape === 'coast' ? { top: '35%', left: '50%' } : undefined}
          />
        </View>
        <View style={styles.imageLabels}>
          <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
            <AppText variant="caption" color="primaryStrong" style={styles.modeLabel}>
              {trip.mode === 'planned' ? 'MAM PLAN' : 'SZUKAM POMYSŁU'}
            </AppText>
          </View>
          {rightBadge || score !== undefined ? (
            <View style={styles.rightBadge}>
              {rightBadge ?? (
                score !== undefined ? <CompatibilityBadge score={score} compact testID={compatibilityTestID} /> : null
              )}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.content}>
        <AppText variant="heading" accessibilityRole="header" numberOfLines={2} style={styles.headline}>
          {getTripHeadline(trip)}
        </AppText>
        <View style={styles.metadata}>
          <View style={styles.metadataRow}>
            <Icon name="pin" size={20} />
            <AppText color="textSecondary" style={[styles.flex, styles.detailText]}>
              {locationLabel ?? getTripLocation(trip)}
              {trip.mode === 'flexible' ? ' · cel do ustalenia' : ''}
            </AppText>
          </View>
          {trip.mode === 'planned' && trip.campgroundName?.trim() ? (
            <View style={styles.metadataRow}>
              <Icon name="tent" size={20} />
              <AppText color="textSecondary" style={[styles.flex, styles.detailText]}>
                Kemping: {trip.campgroundName.trim()}
              </AppText>
            </View>
          ) : null}
          <View style={styles.metadataRow}>
            <TripPlanningIcon kind="dates" size={20} framed={false} />
            <AppText color="textSecondary" style={[styles.flex, styles.detailText]}>
              {datesLabel ?? formatTripDates(trip)}
            </AppText>
          </View>
        </View>
        {ageBands.length || group?.childCount || trip.animals.animals.length || trip.interests.length ? (
          <View style={styles.facts}>
            {ageBands.length || group?.childCount ? (
              <View style={[styles.fact, { backgroundColor: theme.muted }]}>
                <Icon name="people" size={18} />
                <AppText variant="caption" style={styles.shrink}>
                  {ageBands.length ? 'Dzieci ' + ageBands.join(', ') + ' lat' : 'Wiek dzieci niepodany'}
                </AppText>
              </View>
            ) : null}
            {trip.animals.animals.length ? (
              <View style={[styles.fact, { backgroundColor: theme.hero }]}>
                {trip.animals.animals.map(({ kind }) => (
                  <AnimalPortrait key={kind} kind={kind} size={20} />
                ))}
                <AppText variant="caption" style={styles.shrink}>{tripAnimalSummary(trip.animals)}</AppText>
              </View>
            ) : null}
            {trip.interests.map((interest) => (
              <View key={interest} style={[styles.fact, { backgroundColor: theme.muted }]}>
                <Icon name={INTEREST_ICONS[interest] ?? 'compass'} size={18} />
                <AppText variant="caption" style={styles.shrink}>{interest}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        {children}
        {group ? (
          <Pressable accessibilityRole={onPressGroup ? 'button' : undefined} accessibilityLabel={onPressGroup ? 'Zobacz profil: ' + group.name : undefined}
            disabled={!onPressGroup} onPress={onPressGroup} style={[styles.crew, { borderColor: theme.border }]}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={44} decorative />
            <View style={styles.flex}>
              <AppText variant="label">{group.name}</AppText>
              <AppText variant="caption" color="textSecondary">
                {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
                {travelMode ? ' · ' + (travelMode === 'Van' ? 'Kampervan' : travelMode) : ''}
              </AppText>
            </View>
            {travelModes.length ? <TravelModeBadges modes={travelModes} /> : null}
            {onPress || onPressGroup ? <Icon name="chevron" size={18} color={theme.textSecondary} /> : null}
          </Pressable>
        ) : null}
        {footer ? (
          <View style={[
            styles.footer,
            !group && { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
          ]}>{footer}</View>
        ) : null}
      </View>
    </>
  );
  const cardStyle = [
    styles.card,
    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];
  return onPress ? (
    <Pressable
      testID={testID}
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [...cardStyle, { opacity: pressed ? 0.7 : 1 }]}
    >{content}</Pressable>
  ) : <View testID={testID} nativeID={nativeID} style={cardStyle}>{content}</View>;
}

export function TripListingAction({ label, onPress, accessibilityLabel = label }: {
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <View style={layout.row}>
      <AppText variant="label" color="primaryStrong" style={styles.actionLabel}>{label}</AppText>
      <Icon name="arrow" size={22} />
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
    >{content}</Pressable>
  ) : <View style={styles.action}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1, borderRadius: 24, padding: 6,
    boxShadow: '0 4px 20px rgba(36, 56, 66, 0.08)',
  },
  hero: { borderRadius: 18, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 3 },
  imageLabels: {
    position: 'absolute', top: 8, left: 8, right: 8,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rightBadge: { marginLeft: 'auto', maxWidth: '100%' },
  modeLabel: { fontSize: 11, letterSpacing: 0.3 },
  content: { padding: 8, paddingBottom: 0, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  headline: { fontSize: 19, lineHeight: 25 },
  metadata: { gap: 4 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, lineHeight: 20 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, maxWidth: '100%',
  },
  crew: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderTopWidth: 1, borderBottomWidth: 1,
  },
  footer: { minHeight: 40, paddingBottom: 4 },
  action: { minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  actionLabel: { fontSize: 16, fontWeight: '700' },
});
