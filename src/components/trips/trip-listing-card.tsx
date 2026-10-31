import { tripParticipantsSummary } from '@/lib/trip-participants';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { InterestTag, ListingTag } from '@/components/ui/listing-tag';
import { AppText, layout } from '@/components/ui/primitives';
import { tripAnimalSummary } from '@/features/animals/animal-data';
import { AnimalPortrait } from '@/features/animals/animal-portrait';
import { formatTripDates, getTripLocation } from '@/features/discovery/filter-trips';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { useGroupOnline } from '@/features/presence/presence-context';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { getTripHeadline } from '@/features/trips/trip-headline';
import { useTheme } from '@/hooks/use-theme';
import type { TravelGroup, TripPlan } from '@/types/travel';
import { LandscapePhoto } from './landscape-photo';
import { TripPlanningIcon } from './trip-planning-icon';
import { TripTimeline } from './trip-timeline';

interface TripListingCardProps {
  trip: TripPlan;
  group?: TravelGroup;
  travelModes?: string[];
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
  favoriteAction?: ReactNode;
}

export function TripListingCard({
  trip,
  group,
  travelModes = group?.travelModes ?? [],
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
  favoriteAction,
}: TripListingCardProps) {
  const theme = useTheme();
  const travelMode = travelModes[0];
  const ageBands = trip.participants?.childCount ? trip.participants.childAgeBands : [];
  const hasChildren = (trip.participants?.childCount ?? 0) > 0;
  const hasFacts = !group || hasChildren || trip.animals.animals.length > 0 || trip.interests.length > 0;
  const participantsSummary = tripParticipantsSummary(trip.participants);
  const online = useGroupOnline(group?.id);
  const content = (
    <>
      <View style={styles.hero}>
        <View style={StyleSheet.absoluteFill} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <LandscapePhoto
            kind={trip.landscape}
            style={StyleSheet.absoluteFill}
            contentPosition={trip.landscape === 'coast' ? { top: '35%', left: '50%' } : undefined}
          />
        </View>
        <View style={styles.imageLabels}>
          <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
            <AppText variant="caption" color="primaryStrong" style={styles.modeLabel}>
              {trip.mode === 'planned' ? 'MAM PLAN' : 'SZUKAM POMYSŁU'}
            </AppText>
          </View>
          {rightBadge || favoriteAction ? (
            <View style={styles.rightBadge}>
              {rightBadge}
              {favoriteAction ? (onPress ? <View style={styles.favoriteSpace} /> : favoriteAction) : null}
            </View>
          ) : null}
        </View>
        <TripTimeline trip={trip} compact appearance="overlay" />
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
        {hasFacts ? (
          <View style={styles.facts}>
            {!group ? (
              <ListingTag icon="people" label={participantsSummary} />
            ) : null}
            {hasChildren ? (
              <ListingTag icon="people" label={ageBands.length ? 'Dzieci ' + ageBands.join(', ') + ' lat' : 'Wiek dzieci niepodany'} />
            ) : null}
            {trip.animals.animals.length ? (
              <ListingTag tone="warm" label={tripAnimalSummary(trip.animals)}>
                {trip.animals.animals.map(({ kind }) => (
                  <AnimalPortrait key={kind} kind={kind} size={20} />
                ))}
              </ListingTag>
            ) : null}
            {trip.interests.map((interest) => (
              <InterestTag key={interest} interest={interest} />
            ))}
          </View>
        ) : null}
        {children}
        {group ? (
          <Pressable accessibilityRole={onPressGroup ? 'button' : undefined} accessibilityLabel={onPressGroup ? 'Zobacz profil: ' + group.name + (online ? '. Online' : '') : undefined}
            disabled={!onPressGroup} onPress={onPressGroup} style={[styles.crew, { borderColor: theme.border }]}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={44} decorative />
            <View style={styles.flex}>
              <AppText variant="label">{group.name}</AppText>
              <AppText variant="caption" color="textSecondary">
                {participantsSummary}
                {travelMode ? ' · ' + (travelMode === 'Van' ? 'Kampervan' : travelMode) : ''}
              </AppText>
            </View>
            {travelModes.length ? <TravelModeBadges modes={travelModes} /> : null}
            {onPress || onPressGroup ? <Icon name="chevron" size={18} color={theme.textSecondary} /> : null}
          </Pressable>
        ) : null}
      </View>
    </>
  );
  const cardStyle = [
    styles.card,
    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
  ];
  const footerContent = footer ? <View style={[
    styles.footer, { marginHorizontal: 8 },
    !group && { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  ]}>{footer}</View> : null;
  // Footer actions and favorite remain siblings of the main button on native and web.
  if (onPress) return (
    <View testID={testID} nativeID={nativeID} style={cardStyle}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ? accessibilityLabel + (online ? '. Ekipa online' : '') : undefined}
        accessibilityHint={accessibilityHint} onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{content}</Pressable>
      {favoriteAction ? <View style={styles.cardFavoriteAction}>{favoriteAction}</View> : null}
      {footerContent}
    </View>
  );
  return <View testID={testID} nativeID={nativeID} style={cardStyle}>{content}{footerContent}</View>;
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
  hero: { borderRadius: 18, overflow: 'hidden', minHeight: 148, padding: 8, justifyContent: 'space-between', gap: 24 },
  imageLabels: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rightBadge: { marginLeft: 'auto', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  favoriteSpace: { width: 44, height: 44 },
  cardFavoriteAction: { position: 'absolute', top: 14, right: 14 },
  modeLabel: { fontSize: 11, letterSpacing: 0.3 },
  content: { padding: 8, paddingBottom: 0, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  headline: { fontSize: 19, lineHeight: 25 },
  metadata: { gap: 4 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, lineHeight: 20 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  crew: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderTopWidth: 1, borderBottomWidth: 1,
  },
  footer: { minHeight: 40, paddingBottom: 4 },
  action: { minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' },
  actionLabel: { fontSize: 16, fontWeight: '700' },
});
