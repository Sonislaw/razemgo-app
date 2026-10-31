import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, Chip, layout } from '@/components/ui/primitives';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { AnimalBadge } from '@/features/animals/animal-portrait';
import type { TravelGroup } from '@/types/travel';
import { crewNumberText } from '@/features/profile/crew-number';

interface GroupCardContentProps {
  group: TravelGroup;
  about?: string;
  avatarTestID?: string;
  decorativeAvatar?: boolean;
  expanded?: boolean;
  showCrewNumber?: boolean;
}

type GroupProfileCardProps = Pick<
  GroupCardContentProps,
  'group' | 'about' | 'avatarTestID' | 'expanded'
> & {
  headerAction?: ReactNode;
};

export function GroupProfileCard({
  group, about, avatarTestID, headerAction, expanded = false,
}: GroupProfileCardProps) {
  return (
    <Card testID="group-profile-card" style={groupCardStyles.frame}>
      {headerAction}
      <GroupCardContent group={group} about={about} avatarTestID={avatarTestID} expanded={expanded} showCrewNumber />
    </Card>
  );
}

export function GroupCardContent({ group, about, avatarTestID, decorativeAvatar = false, expanded = false, showCrewNumber = false }: GroupCardContentProps) {
  const interests = group.interests;
  const ages = group.childAgeBands;
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
            {group.travelModes[0] ? ' · ' + (group.travelModes[0] === 'Van' ? 'Kampervan' : group.travelModes[0]) : ''}
          </AppText>
        </View>
        <TravelModeBadges modes={group.travelModes} />
      </View>
      {about ? <AppText color="textSecondary" numberOfLines={expanded ? undefined : 3}>{about}</AppText> : null}
      <View style={layout.wrap}>
        {ages.length ? <Chip label={'Dzieci ' + ages.join(', ') + ' lat'} /> : null}
        {group.animals.animals.map(animal => <AnimalBadge key={animal.kind} kind={animal.kind} />)}
        {(expanded ? interests : interests.slice(0, 3)).map(interest => <Chip key={interest} label={interest} />)}
      </View>
    </>
  );
}

export const groupCardStyles = StyleSheet.create({
  frame: { padding: 16, gap: 12, borderRadius: 24, borderWidth: 1 },
});
