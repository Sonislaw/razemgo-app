import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, Chip, layout } from '@/components/ui/primitives';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { AnimalBadge } from '@/features/animals/animal-portrait';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { PublicGroup } from './group-data';

export function GroupCard({ item }: { item: PublicGroup }) {
  const theme = useTheme();
  const { group, about, activeTripCount } = item;
  return <Pressable accessibilityRole="button" accessibilityLabel={'Zobacz profil: ' + group.name}
    testID={'public-group-' + group.id}
    onPress={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })}
    style={({ pressed }) => ({ padding: 16, gap: 12, borderRadius: 24, borderWidth: 1,
      borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.75 : 1 })}>
    <View style={layout.row}>
      <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={64} decorative />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="heading" numberOfLines={2}>{group.name}</AppText>
        <AppText variant="caption" color="textSecondary">{group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
          {group.travelModes[0] ? ' · ' + (group.travelModes[0] === 'Van' ? 'Kampervan' : group.travelModes[0]) : ''}</AppText>
      </View>
      <TravelModeBadges modes={group.travelModes} />
    </View>
    {about ? <AppText color="textSecondary" numberOfLines={3}>{about}</AppText> : null}
    <View style={layout.wrap}>
      {group.childAgeBands.length ? <Chip label={'Dzieci ' + group.childAgeBands.join(', ') + ' lat'} /> : null}
      {group.animals.animals.map(a => <AnimalBadge key={a.kind} kind={a.kind} />)}
      {group.interests.slice(0, 3).map(i => <Chip key={i} label={i} />)}
    </View>
    <View style={[layout.row, { borderTopWidth: 1, borderColor: theme.border, paddingTop: 10 }]}>
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {activeTripCount ? 'Aktywne ogłoszenia: ' + activeTripCount : 'Poznaj ekipę i wspólnie wymyśl wyjazd'}</AppText>
      <AppText variant="label" color="primaryStrong">Profil</AppText><Icon name="arrow" size={20} />
    </View>
  </Pressable>;
}
