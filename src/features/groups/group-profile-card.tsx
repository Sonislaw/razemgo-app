import { StyleSheet, View } from 'react-native';
import { AppText, Card, layout } from '@/components/ui/primitives';
import { InterestTag, ListingTag } from '@/components/ui/listing-tag';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { GROUP_KIND_OPTIONS, travelModeLabel } from '@/features/profile/profile-options';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { tripAnimalSummary } from '@/features/animals/animal-data';
import { AnimalPortrait } from '@/features/animals/animal-portrait';
import type { TravelGroup } from '@/types/travel';
import { crewNumberText } from '@/features/profile/crew-number';
import { useTheme } from '@/hooks/use-theme';

interface GroupCardContentProps {
  group: TravelGroup;
  about?: string;
  aboutLabel?: string;
  avatarTestID?: string;
  decorativeAvatar?: boolean;
  expanded?: boolean;
  showCrewNumber?: boolean;
  showTravelModeLabel?: boolean;
}

type GroupProfileCardProps = Pick<
  GroupCardContentProps,
  'group' | 'avatarTestID' | 'expanded'
>;

export function GroupProfileCard({
  group, avatarTestID, expanded = false,
}: GroupProfileCardProps) {
  const theme = useTheme();
  return (
    <Card testID="group-profile-card" style={[
      styles.profile,
      { borderColor: theme.border },
    ]}>
      <View style={[styles.avatarFrame, { backgroundColor: theme.backgroundElement }]}>
        <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={112} testID={avatarTestID} />
      </View>
      <View style={styles.identity}>
        <AppText variant="title" style={styles.name}>{group.name}</AppText>
        {crewNumberText(group.crewNumber) ? (
          <AppText variant="label" color="textSecondary" testID={'crew-number-' + group.id}>
            {crewNumberText(group.crewNumber)}
          </AppText>
        ) : null}
      </View>
      <View style={layout.row}>
        <View style={styles.details}>
          <AppText variant="label">{GROUP_KIND_OPTIONS.find(option => option.value === group.kind)?.label}</AppText>
          <AppText variant="label" color="textSecondary">
            {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
            {group.travelModes[0] ? ' · ' + travelModeLabel(group.travelModes[0]) : ''}
          </AppText>
        </View>
        <TravelModeBadges modes={group.travelModes} />
      </View>
      <GroupCardFacts group={group} expanded={expanded} />
    </Card>
  );
}

export function GroupCardContent({ group, about, aboutLabel, avatarTestID, decorativeAvatar = false, expanded = false, showCrewNumber = false, showTravelModeLabel = true }: GroupCardContentProps) {
  return (
    <>
      <View style={layout.row}>
        <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={64} testID={avatarTestID} decorative={decorativeAvatar} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading" numberOfLines={2}>{group.name}</AppText>
          {showCrewNumber && crewNumberText(group.crewNumber) ? <AppText variant="caption" color="textSecondary" testID={'crew-number-' + group.id}>
            {crewNumberText(group.crewNumber)}
          </AppText> : null}
          {expanded ? <AppText variant="caption" color="textSecondary">
            {GROUP_KIND_OPTIONS.find(option => option.value === group.kind)?.label}
          </AppText> : null}
          <AppText variant="caption" color="textSecondary">
            {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
            {showTravelModeLabel && group.travelModes[0] ? ' · ' + travelModeLabel(group.travelModes[0]) : ''}
          </AppText>
        </View>
        <TravelModeBadges modes={group.travelModes} />
      </View>
      {about || aboutLabel ? (
        <View style={{ gap: 4 }}>
          {aboutLabel ? <AppText variant="label">{aboutLabel}</AppText> : null}
          <AppText color="textSecondary" numberOfLines={expanded ? undefined : 3}>
            {about || 'Przedstaw swoją ekipę w edycji profilu.'}
          </AppText>
        </View>
      ) : null}
      <GroupCardFacts group={group} expanded={expanded} />
    </>
  );
}

function GroupCardFacts({ group, expanded }: { group: TravelGroup; expanded: boolean }) {
  const ages = group.childAgeBands;
  const interests = group.interests;
  return (
    <View style={groupCardStyles.tags}>
      {ages.length ? <ListingTag icon="people" tone="warm" label={'Dzieci ' + ages.join(', ') + ' lat'} /> : null}
      {group.animals.animals.length ? (
        <ListingTag tone="warm" label={tripAnimalSummary(group.animals)}>
          {group.animals.animals.map(({ kind }) => (
            <AnimalPortrait key={kind} kind={kind} size={20} />
          ))}
        </ListingTag>
      ) : null}
      {(expanded ? interests : interests.slice(0, 3)).map(interest => <InterestTag key={interest} interest={interest} />)}
    </View>
  );
}

export const groupCardStyles = StyleSheet.create({
  frame: { padding: 16, gap: 12, borderRadius: 24, borderWidth: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});

const styles = StyleSheet.create({
  profile: {
    marginTop: -36,
    zIndex: 1,
    padding: 20,
    gap: 16,
    borderRadius: 28,
    boxShadow: '0 8px 28px rgba(36, 56, 66, 0.10)',
  },
  avatarFrame: {
    alignSelf: 'center',
    marginTop: -76,
    padding: 6,
    borderRadius: 70,
    boxShadow: '0 4px 16px rgba(36, 56, 66, 0.16)',
  },
  identity: { alignItems: 'center', gap: 4 },
  name: { textAlign: 'center', fontSize: 28, lineHeight: 34, fontWeight: '800' },
  details: { flex: 1, gap: 4 },
});
