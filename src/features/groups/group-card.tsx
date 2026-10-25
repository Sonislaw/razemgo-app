import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { PublicGroup } from './group-data';
import { GroupCompatibilitySummary } from './group-compatibility-summary';
import { GroupCardContent, groupCardStyles } from './group-profile-card';

export function GroupCard({ item }: { item: PublicGroup }) {
  const theme = useTheme();
  const { group, about, activeTripCount } = item;
  return <Pressable accessibilityRole="button" accessibilityLabel={'Zobacz profil: ' + group.name}
    testID={'public-group-' + group.id}
    onPress={() => router.push({ pathname: '/crew/[id]', params: { id: group.id } })}
    style={({ pressed }) => [groupCardStyles.frame, {
      borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.75 : 1 }]}>
    <GroupCardContent
      group={group}
      about={about}
      decorativeAvatar
      afterIdentity={<GroupCompatibilitySummary match={item.compatibility} testID={'group-compatibility-' + group.id} />}
    />
    <View style={[layout.row, { borderTopWidth: 1, borderColor: theme.border, paddingTop: 10 }]}>
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {activeTripCount ? 'Aktywne ogłoszenia: ' + activeTripCount : 'Poznaj ekipę i wspólnie wymyśl wyjazd'}</AppText>
      <AppText variant="label" color="primaryStrong">Profil</AppText><Icon name="arrow" size={20} />
    </View>
  </Pressable>;
}
