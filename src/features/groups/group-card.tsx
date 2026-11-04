import { router } from 'expo-router';
import { memo } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { PublicGroup } from './group-data';
import { GroupCardFacts } from './group-profile-card';
import { useGroupOnline } from '@/features/presence/presence-context';
import { CardShareActions } from '@/features/sharing/card-share-actions';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { getProfileCover } from '@/features/profile/profile-cover-data';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';

export const GroupCard = memo(function GroupCard({ item, onNavigate }: { item: PublicGroup; onNavigate?: () => void }) {
  const theme = useTheme();
  const { group, activeTripCount } = item;
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const cover = getProfileCover(group.avatarId);
  const online = useGroupOnline(group.id);
  const open = () => { onNavigate?.(); router.push({ pathname: '/crew/[id]', params: { id: group.id } }); };
  return <View testID={'group-card-' + group.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Zobacz profil: ' + group.name + (online ? '. Online' : '')}
    testID={'public-group-' + group.id}
    onPress={open}>
      {({ pressed }) => <>
      <View style={styles.cover} pointerEvents="none" accessible={false}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image testID={'group-card-cover-' + group.id} source={cover.source} recyclingKey={cover.avatarId}
          contentFit="cover" contentPosition="center" transition={0} cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill} accessible={false} alt="" />
        {pressed ? <View style={[StyleSheet.absoluteFill, styles.pressFeedback]} /> : null}
        <Image source={require('@/assets/images/profile-covers/card-wave.svg')} tintColor={theme.backgroundElement}
          contentFit="fill" style={styles.wave} accessible={false} alt="" />
      </View>
      <View style={styles.body}>
        <View style={styles.identity}>
          <View style={[styles.avatarFrame, { backgroundColor: theme.backgroundElement }]}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={compact ? 72 : 88} decorative />
          </View>
          <View style={styles.nameColumn}>
            <AppText variant="heading" numberOfLines={2} style={[styles.name, compact && styles.compactName]}>{group.name}</AppText>
            <View style={styles.adults}>
              <Icon name="people" size={16} color={theme.textSecondary} />
              <AppText variant="caption" color="textSecondary" style={styles.adultCount}>
                {group.adultCount} {group.adultCount === 1 ? 'dorosły' : 'dorosłych'}
              </AppText>
            </View>
          </View>
        </View>
        <GroupCardFacts group={group} expanded={false} />
      </View>
      </>}
    </Pressable>
    <View style={styles.favorite}>
      <CardShareActions kind="group" targetId={group.id} />
    </View>
    <View style={[layout.row, styles.footer, { borderColor: theme.border }]}>
      <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {activeTripCount ? 'Aktywne ogłoszenia: ' + activeTripCount : 'Poznaj ekipę i wspólnie wymyśl wyjazd'}</AppText>
      <TravelModeBadges modes={group.travelModes} />
      <Pressable accessibilityRole="button" accessibilityLabel={'Otwórz profil: ' + group.name} onPress={open} style={[layout.row, { minHeight: 44 }]}>
        <AppText variant="label" color="primaryStrong">Profil</AppText><Icon name="arrow" size={20} />
      </Pressable>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  card: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', boxShadow: '0 4px 20px rgba(36, 56, 66, 0.08)' },
  cover: { aspectRatio: 2.1, minHeight: 130, maxHeight: 240, backgroundColor: '#DCE7EB' },
  wave: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 40 },
  pressFeedback: { backgroundColor: 'rgba(16, 33, 29, 0.14)' },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  identity: { flexDirection: 'row', alignItems: 'center', minHeight: 74, gap: 10 },
  avatarFrame: { marginTop: -40, padding: 4, borderRadius: 60, boxShadow: '0 4px 12px rgba(36, 56, 66, 0.14)' },
  nameColumn: { flex: 1, minWidth: 0, gap: 6 },
  name: { fontSize: 23, lineHeight: 28, fontWeight: '800' },
  compactName: { fontSize: 20, lineHeight: 25 },
  adults: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adultCount: { flexShrink: 1 },
  favorite: { position: 'absolute', top: 12, right: 12, zIndex: 1, flexDirection: 'row', gap: 0 },
  footer: { borderTopWidth: 1, marginHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
});
