import type { ProfileAvatarId } from '../../types/avatar';

export const DEFAULT_PROFILE_AVATAR_ID: ProfileAvatarId = 'trail-fox';

export const PROFILE_AVATARS = [
  {
    id: 'trail-fox',
    name: 'Lis odkrywca',
    description: 'Ciekawość świata i nowe kierunki.',
  },
  {
    id: 'camp-bear',
    name: 'Miś na biwaku',
    description: 'Spokojny biwak i kawa bez pośpiechu.',
  },
  {
    id: 'star-owl',
    name: 'Sowa pod gwiazdami',
    description: 'Wieczory pod gwiazdami.',
  },
  {
    id: 'paddle-beaver',
    name: 'Bóbr kajakarz',
    description: 'Jeziora, kajaki i wodne przygody.',
  },
  {
    id: 'summit-chamois',
    name: 'Kozica na szlaku',
    description: 'Górskie szlaki i piękne widoki.',
  },
  {
    id: 'meadow-hedgehog',
    name: 'Jeż małych wypraw',
    description: 'Małe wyprawy blisko natury.',
  },
  {
    id: 'road-wolf',
    name: 'Wilk w drodze',
    description: 'Wolność i spontaniczne podróże.',
  },
  {
    id: 'cycling-hare',
    name: 'Zając na rowerze',
    description: 'Rowerowe trasy i aktywny wypoczynek.',
  },
  {
    id: 'campfire-squirrel',
    name: 'Wiewiórka przy ognisku',
    description: 'Ognisko, rozmowy i dobre towarzystwo.',
  },
  {
    id: 'happy-dog',
    name: 'Pies kompan',
    description: 'Radość drogi i przyjaźń.',
  },
] as const satisfies readonly {
  id: ProfileAvatarId;
  name: string;
  description: string;
}[];

export function getProfileAvatar(id: unknown) {
  return PROFILE_AVATARS.find((avatar) => avatar.id === id) ?? PROFILE_AVATARS[0];
}
