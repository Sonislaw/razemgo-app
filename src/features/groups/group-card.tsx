import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { PublicGroup } from './group-data';
import { GroupCompatibilitySummary } from './group-compatibility-summary';
import { GroupCardContent, groupCardStyles } from './group-profile-card';
import { useGroupOnline } from '@/features/presence/presence-context';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import { crewNumberText } from '@/features/profile/crew-number';

export function GroupCard({ item }: { item: PublicGroup }) {
  const theme = useTheme();
  const { group, about, activeTripCount } = item;
  const online = useGroupOnline(group.id);
  const open = () => router.push({ pathname: '/crew/[id]', params: { id: group.id } });
  return <View style={[groupCardStyles.frame, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Zobacz profil: ' + group.name + (crewNumberText(group.crewNumber) ? '. ' + crewNumberText(group.crewNumber) : '') + (online ? '. Online' : '')}
    testID={'public-group-' + group.id}
    onPress={open} style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.75 : 1 })}>
    <GroupCardContent
      group={group}
      about={about}
      decorativeAvatar
      afterIdentity={<GroupCompatibilitySummary match={item.compatibility} testID={'group-compatibility-' + group.id} />}
    />
    </Pressable>
    <View style={[layout.row, { borderTopWidth: 1, borderColor: theme.border, paddingTop: 10 }]}>
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {activeTripCount ? 'Aktywne ogłoszenia: ' + activeTripCount : 'Poznaj ekipę i wspólnie wymyśl wyjazd'}</AppText>
      <FavoriteButton kind="group" targetId={group.id} />
      <Pressable accessibilityRole="button" accessibilityLabel={'Otwórz profil: ' + group.name} onPress={open} style={[layout.row, { minHeight: 44 }]}>
        <AppText variant="label" color="primaryStrong">Profil</AppText><Icon name="arrow" size={20} />
      </Pressable>
    </View>
  </View>;
}
