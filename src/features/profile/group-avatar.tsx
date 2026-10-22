import { DEMO_GROUPS } from '@/data/mocks/travel';
import type { ProfileAvatarId } from '@/types/avatar';
import { useProfile } from './profile-context';
import { ProfileAvatar } from './profile-avatar';

export function GroupAvatar({
  groupId,
  avatarId,
  size = 48,
  decorative = false,
  testID,
}: {
  groupId: string;
  avatarId?: ProfileAvatarId;
  size?: number;
  decorative?: boolean;
  testID?: string;
}) {
  const { profile } = useProfile();
  const ownGroup = groupId === profile.group.id;
  const group = ownGroup
    ? profile.group
    : DEMO_GROUPS.find((candidate) => candidate.id === groupId);

  return (
    <ProfileAvatar
      avatarId={ownGroup ? group?.avatarId : (avatarId ?? group?.avatarId)}
      size={size}
      decorative={decorative}
      testID={testID ?? 'group-avatar-' + groupId}
    />
  );
}
