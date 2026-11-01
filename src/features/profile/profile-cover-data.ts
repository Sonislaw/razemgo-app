import type { ImageSource } from 'expo-image';
import type { ProfileAvatarId } from '@/types/avatar';
import { getProfileAvatar } from './profile-avatar-data';

const PROFILE_COVERS = {
  'trail-fox': require('@/assets/images/profile-covers/trail-fox.webp'),
  'camp-bear': require('@/assets/images/profile-covers/camp-bear.webp'),
  'star-owl': require('@/assets/images/profile-covers/star-owl.webp'),
  'paddle-beaver': require('@/assets/images/profile-covers/paddle-beaver.webp'),
  'summit-chamois': require('@/assets/images/profile-covers/summit-chamois.webp'),
  'meadow-hedgehog': require('@/assets/images/profile-covers/meadow-hedgehog.webp'),
  'road-wolf': require('@/assets/images/profile-covers/road-wolf.webp'),
  'cycling-hare': require('@/assets/images/profile-covers/cycling-hare.webp'),
  'campfire-squirrel': require('@/assets/images/profile-covers/campfire-squirrel.webp'),
  'happy-dog': require('@/assets/images/profile-covers/happy-dog.webp'),
} satisfies Record<ProfileAvatarId, ImageSource>;

export function getProfileCover(avatarId?: ProfileAvatarId) {
  const avatar = getProfileAvatar(avatarId);
  return { avatarId: avatar.id, source: PROFILE_COVERS[avatar.id] };
}
