import { useTheme } from '@/hooks/use-theme';
import type { ProfileAvatarId } from '@/types/avatar';
import { Image, type ImageProps } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { getProfileAvatar } from './profile-avatar-data';

const AVATAR_IMAGES = {
  'trail-fox': require('@/assets/images/avatars/trail-fox.webp'),
  'camp-bear': require('@/assets/images/avatars/camp-bear.webp'),
  'star-owl': require('@/assets/images/avatars/star-owl.webp'),
  'paddle-beaver': require('@/assets/images/avatars/paddle-beaver.webp'),
  'summit-chamois': require('@/assets/images/avatars/summit-chamois.webp'),
  'meadow-hedgehog': require('@/assets/images/avatars/meadow-hedgehog.webp'),
  'road-wolf': require('@/assets/images/avatars/road-wolf.webp'),
  'cycling-hare': require('@/assets/images/avatars/cycling-hare.webp'),
  'campfire-squirrel': require('@/assets/images/avatars/campfire-squirrel.webp'),
  'happy-dog': require('@/assets/images/avatars/happy-dog.webp'),
} satisfies Record<ProfileAvatarId, ImageProps['source']>;

export function ProfileAvatar({
  avatarId,
  size = 64,
  decorative = false,
  testID,
  online,
}: {
  avatarId?: ProfileAvatarId;
  size?: number;
  decorative?: boolean;
  testID?: string;
  online?: boolean;
}) {
  const theme = useTheme();
  const avatar = getProfileAvatar(avatarId);
  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={
        decorative
          ? undefined
          : 'Awatar: ' +
            avatar.name +
            (online === undefined ? '' : online ? '. Online' : '. Offline')
      }
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.hero,
          },
        ]}
      >
        <Image
          source={AVATAR_IMAGES[avatar.id]}
          recyclingKey={avatar.id}
          cachePolicy="memory-disk"
          allowDownscaling
          transition={0}
          contentFit="contain"
          style={{ width: size * 0.84, height: size * 0.84 }}
          accessible={false}
          alt=""
        />
      </View>
      {online !== undefined && (
        <View
          testID={
            testID ? testID + (online ? '-online' : '-offline') : undefined
          }
          accessible={false}
          style={[
            styles.online,
            {
              width: Math.max(12, Math.min(24, size * 0.25)),
              height: Math.max(12, Math.min(24, size * 0.25)),
              backgroundColor: online ? theme.community : '#9CA3AF',
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexShrink: 0 },
  online: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderRadius: 99,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  frame: {
    flexShrink: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
