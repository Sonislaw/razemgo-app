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

interface GroupProfileCardProps {
  group: TravelGroup;
  avatarTestID?: string;
  expanded?: boolean;
}

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

export function GroupCardFacts({ group, expanded }: { group: TravelGroup; expanded: boolean }) {
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

const groupCardStyles = StyleSheet.create({
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
