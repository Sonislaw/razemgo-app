import { tripParticipantsSummary } from '@/lib/trip-participants';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { InterestTag, ListingTag } from '@/components/ui/listing-tag';
import { AppText, layout } from '@/components/ui/primitives';
import { tripAnimalSummary } from '@/features/animals/animal-data';
import { AnimalPortrait } from '@/features/animals/animal-portrait';
import { formatTripDates } from '@/features/discovery/filter-trips';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { useGroupOnline } from '@/features/presence/presence-context';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { getTripHeadline } from '@/features/trips/trip-headline';
import type { TripHighlight } from '@/features/trips/trip-timeline-model';
import { BrandPalette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TravelGroup, TripPlan } from '@/types/travel';
import { TripCover } from './trip-cover';
import { TripPlanningIcon } from './trip-planning-icon';
import { TripLocationSummary } from './trip-location-summary';
import { PassportLevelBadge } from '@/features/passport/passport-level-badge';

interface TripListingCardProps {
  trip: TripPlan;
  group?: TravelGroup;
  travelModes?: string[];
  rightBadge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  locationLabel?: string;
  datesLabel?: string;
  highlight?: TripHighlight;
  onPress?: () => void;
  onPressDetails?: () => void;
  onPressLocation?: () => void;
  onPressGroup?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  nativeID?: string;
  favoriteAction?: ReactNode;
  disabled?: boolean;
  showCrewParticipants?: boolean;
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
  highlight,
  onPress,
  onPressDetails,
  onPressLocation,
  onPressGroup,
  accessibilityLabel,
  accessibilityHint,
  testID,
  nativeID,
  favoriteAction,
  disabled = false,
  showCrewParticipants = true,
}: TripListingCardProps) {
  const theme = useTheme();
  const adultAgeBands = trip.participants?.adultAgeBands ?? [];
  const ageBands = trip.participants?.childCount ? trip.participants.childAgeBands : [];
  const hasChildren = (trip.participants?.childCount ?? 0) > 0;
  const hasFacts = !group || adultAgeBands.length > 0 || hasChildren || trip.animals.animals.length > 0 || trip.interests.length > 0;
  const participantsSummary = tripParticipantsSummary(trip.participants);
  const online = useGroupOnline(group?.id);
  const openDetails = !disabled && !onPress ? onPressDetails : undefined;
  const headline = <AppText variant="heading" accessibilityRole="header" numberOfLines={2} style={styles.headline}>
    {getTripHeadline(trip)}
  </AppText>;
  const content = (
    <>
      <TripCover trip={trip} decorative onPress={openDetails} accessibilityLabel={'Otwórz wyjazd ze zdjęcia: ' + getTripHeadline(trip)} action={rightBadge || favoriteAction ? <>
        {rightBadge}
        {favoriteAction ? (onPress ? <View style={styles.favoriteSpace} /> : favoriteAction) : null}
      </> : undefined} />
      <View style={styles.content}>
        {openDetails ? <Pressable accessibilityRole="button" accessibilityLabel={'Otwórz wyjazd: ' + getTripHeadline(trip)}
          onPress={openDetails} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{headline}</Pressable> : headline}
        <View style={styles.metadata}>
          <TripLocationSummary trip={trip} locationLabel={locationLabel} compact showGeoapifyAttribution={false}
            onOpenLocation={!disabled && !onPress ? onPressLocation : undefined} />
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
            {adultAgeBands.length ? (
              <ListingTag icon="profile" tone="warm" label={'Dorośli ' + adultAgeBands.join(', ')} />
            ) : null}
            {hasChildren ? (
              <ListingTag icon="people" tone="warm" label={ageBands.length ? 'Dzieci ' + ageBands.join(', ') + ' lat' : 'Wiek dzieci niepodany'} />
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
            disabled={disabled || !onPressGroup} accessibilityState={{ disabled: disabled || !onPressGroup }} onPress={onPressGroup} style={[styles.crew, { borderColor: theme.border }]}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={44} decorative />
            <View style={styles.flex}>
              <AppText variant="label">{group.name}</AppText>
              <PassportLevelBadge group={group} compact levelOnly showIcon={false} />
              {showCrewParticipants ? <AppText variant="caption" color="textSecondary">
                {participantsSummary}
              </AppText> : null}
            </View>
            {travelModes.length ? <TravelModeBadges modes={travelModes} /> : null}
            {onPress || onPressGroup ? <Icon name="chevron" size={18} color={theme.textSecondary} /> : null}
          </Pressable>
        ) : null}
      </View>
    </>
  );
  const ongoing = highlight?.kind === 'ongoing';
  const cardStyle = [
    styles.card,
    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
    !!highlight && [
      styles.highlightedCard,
      ongoing ? styles.ongoingCard : styles.departureCard,
      { borderColor: ongoing ? theme.community : theme.energy },
    ],
  ];
  const highlightBadge = highlight ? (
    <View pointerEvents="none" style={[styles.highlightBadge, ongoing ? styles.ongoingBadge : styles.departureBadge]}>
      <Icon name={ongoing ? 'clock' : 'calendar'} size={16} color="#FFFFFF" />
      <AppText variant="label" style={styles.highlightLabel}>{highlight.label}</AppText>
    </View>
  ) : null;
  const footerContent = footer ? <View style={[
    styles.footer, { marginHorizontal: 8 },
    !group && { marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  ]}>{footer}</View> : null;
  // Footer actions and favorite remain siblings of the main button on native and web.
  if (onPress) return (
    <View testID={testID} nativeID={nativeID} style={cardStyle}>
      {highlightBadge}
      <Pressable accessibilityRole="button"
        disabled={disabled} accessibilityState={{ disabled }}
        accessibilityLabel={accessibilityLabel ? accessibilityLabel + (online ? '. Ekipa online' : '') : undefined}
        accessibilityHint={accessibilityHint} onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{content}</Pressable>
      {favoriteAction ? <View style={styles.cardFavoriteAction}>{favoriteAction}</View> : null}
      {footerContent}
    </View>
  );
  return <View testID={testID} nativeID={nativeID} style={cardStyle}>{highlightBadge}{content}{footerContent}</View>;
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
  highlightedCard: { marginTop: 12, borderWidth: 2 },
  departureCard: { boxShadow: '0 5px 20px rgba(229, 115, 22, 0.20)' },
  ongoingCard: { boxShadow: '0 5px 20px rgba(40, 122, 49, 0.18)' },
  // Keep the badge in the layout so larger text also leaves room for the cover actions.
  highlightBadge: {
    zIndex: 1, alignSelf: 'flex-end', marginTop: -18, marginRight: 8, marginBottom: -4,
    maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, borderBottomLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 4,
  },
  departureBadge: {
    backgroundColor: '#BC460C',
    backgroundImage: 'linear-gradient(180deg, #C4510B, #A93B0A)',
    boxShadow: '0 3px 8px rgba(150, 55, 12, 0.2)',
  },
  ongoingBadge: {
    backgroundColor: BrandPalette.greenAction,
    backgroundImage: 'linear-gradient(180deg, #2D8037, #206428)',
    boxShadow: '0 3px 8px rgba(40, 122, 49, 0.2)',
  },
  highlightLabel: { color: '#FFFFFF', fontWeight: '700', flexShrink: 1 },
  favoriteSpace: { width: 44, height: 44 },
  cardFavoriteAction: { position: 'absolute', top: 14, right: 14 },
  content: { padding: 8, paddingBottom: 0, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  headline: { fontSize: 19, lineHeight: 25 },
  metadata: { gap: 8 },
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
