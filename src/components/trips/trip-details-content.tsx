import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Chip, SectionTitle, layout } from '@/components/ui/primitives';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';
import type { TravelGroup, TripPlan } from '@/types/travel';
import { TripLocationSummary } from './trip-location-summary';
import { TripMapCard } from './trip-map-card';
import { TripParticipantsCard } from './trip-participants-card';
import { PassportLevelBadge } from '@/features/passport/passport-level-badge';

export function TripDetailsContent({
  trip,
  group,
  locationLabel,
  isOwn = false,
  onOpenGroup,
}: {
  trip: TripPlan;
  group: TravelGroup;
  locationLabel?: string;
  isOwn?: boolean;
  onOpenGroup: () => void;
}) {
  return (
    <>
      <View style={layout.stack}>
        <TripLocationSummary trip={trip} locationLabel={locationLabel} />
        <Card testID="trip-organizer">
          <View style={layout.row}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={48} />
            <View style={styles.organizerDetails}>
              <AppText variant="caption" color="textSecondary">
                Organizator wyjazdu
              </AppText>
              <AppText
                variant="heading"
                accessibilityRole="header"
                numberOfLines={2}
                style={styles.organizerName}
              >
                {group.name}
              </AppText>
              <PassportLevelBadge group={group} compact />
            </View>
            <TravelModeBadges modes={trip.travelModes ?? group.travelModes} />
          </View>
          {isOwn && !trip.travelModes?.length ? (
            <AppText variant="label">Sposób podróżowania do uzupełnienia</AppText>
          ) : null}
          <Button label="Zobacz profil ekipy" variant="secondary" onPress={onOpenGroup} />
        </Card>
        <Card>
          <SectionTitle title="Pomysł na wspólny czas" />
          <AppText color="textSecondary">
            {trip.description || (isOwn ? 'Jeszcze bez opisu. Możesz uzupełnić go w edycji.' : '')}
          </AppText>
          <TripReactionsButton tripId={trip.id} ownerGroupId={trip.groupId} compact />
          {trip.interests.length ? (
            <View style={layout.wrap}>
              {trip.interests.map((interest) => <Chip key={interest} label={interest} />)}
            </View>
          ) : null}
        </Card>
      </View>
      <TripMapCard trip={trip} />
      <TripParticipantsCard value={trip.participants} animals={trip.animals} />
    </>
  );
}

const styles = StyleSheet.create({
  organizerDetails: { flex: 1, minWidth: 0, gap: 4 },
  organizerName: { fontSize: 16, lineHeight: 22 },
});
