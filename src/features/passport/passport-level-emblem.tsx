import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import type { TravelGroup } from '@/types/travel';
import { usePassportLevelSummary } from './passport-level-summary';

const emblems: Record<number, ImageSource> = {
  1: require('@/assets/images/passport/level-emblems/level-1.svg'),
  2: require('@/assets/images/passport/level-emblems/level-2.svg'),
  3: require('@/assets/images/passport/level-emblems/level-3.svg'),
  4: require('@/assets/images/passport/level-emblems/level-4.svg'),
  5: require('@/assets/images/passport/level-emblems/level-5.svg'),
  6: require('@/assets/images/passport/level-emblems/level-6.svg'),
  7: require('@/assets/images/passport/level-emblems/level-7.svg'),
  8: require('@/assets/images/passport/level-emblems/level-8.svg'),
};

export function PassportLevelEmblemArtwork({ level, size = 60, testID, style }: {
  level: number; size?: number; testID?: string; style?: ImageProps['style'];
}) {
  return <Image testID={testID} source={emblems[level] ?? emblems[1]}
    contentFit="contain" transition={0} cachePolicy="memory-disk" accessible={false} alt=""
    style={[{ width: size, height: size * 600 / 512 }, style]} />;
}

export function PassportLevelEmblem({ group, size = 60, testID }: { group: TravelGroup; size?: number; testID?: string }) {
  const summary = usePassportLevelSummary(group);
  if (!summary) return null;
  return <Pressable testID={testID ?? 'passport-emblem-' + group.id} accessible accessibilityRole="button"
    accessibilityLabel={`Poziom ekipy ${summary.level}. ${summary.title}`}
    accessibilityHint="Otwiera paszport podróżnika i odznaki tej ekipy."
    onPress={() => router.push({ pathname: '/traveler-passport', params: { groupId: group.id, name: group.name } })}
    style={({ pressed }) => ({ width: size, height: size * 600 / 512, opacity: pressed ? 0.75 : 1 })}>
    <PassportLevelEmblemArtwork level={summary.level} size={size}
      testID={testID ? testID + '-artwork' : 'passport-emblem-artwork-' + group.id} />
  </Pressable>;
}
