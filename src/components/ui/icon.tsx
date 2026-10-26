import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Platform, View } from 'react-native';
import { TAB_ICONS } from '@/constants/tab-icons';
import { useTheme } from '@/hooks/use-theme';

export const SYMBOLS = {
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  sort: { ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' },
  paw: { ios: 'pawprint', android: 'pets', web: 'pets' },
  pause: { ios: 'pause', android: 'pause', web: 'pause' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' },
  trash: { ios: 'trash', android: 'delete_outline', web: 'delete_outline' },
  send: { ios: 'paperplane', android: 'send', web: 'send' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  flag: { ios: 'flag', android: 'flag', web: 'flag' },
  block: { ios: 'hand.raised.slash', android: 'block', web: 'block' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  chevron: {
    ios: 'chevron.right',
    android: 'chevron_right',
    web: 'chevron_right',
  },
  heart: { ios: 'heart', android: 'favorite_border', web: 'favorite_border' },
  'heart-filled': { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  camper: {
    ios: 'car.side',
    android: 'airport_shuttle',
    web: 'airport_shuttle',
  },
  minus: { ios: 'minus', android: 'remove', web: 'remove' },
  bell: {
    ios: 'bell',
    android: 'notifications_none',
    web: 'notifications_none',
  },
  lock: { ios: 'lock', android: 'lock_outline', web: 'lock_outline' },
  filters: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  back: { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' },
  home: { ios: 'house', android: 'home', web: 'home' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  trips: { ios: 'suitcase.rolling', android: 'luggage', web: 'luggage' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  profile: {
    ios: 'person.crop.circle',
    android: 'account_circle',
    web: 'account_circle',
  },
  compass: { ios: 'location.north.circle', android: 'explore', web: 'explore' },
  arrow: { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' },
  pin: {
    ios: 'mappin.and.ellipse',
    android: 'location_on',
    web: 'location_on',
  },
  calendar: {
    ios: 'calendar',
    android: 'calendar_today',
    web: 'calendar_today',
  },
  people: { ios: 'person.2', android: 'group', web: 'group' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  plus: { ios: 'plus', android: 'add', web: 'add' },
  shield: { ios: 'hand.raised', android: 'shield', web: 'shield' },
  leaf: { ios: 'leaf', android: 'eco', web: 'eco' },
  sun: { ios: 'sun.max', android: 'sunny', web: 'sunny' },
  mountain: { ios: 'mountain.2', android: 'landscape', web: 'landscape' },
  tent: { ios: 'tent', android: 'camping', web: 'camping' },
  water: { ios: 'water.waves', android: 'water', web: 'water' },
  bike: { ios: 'bicycle', android: 'directions_bike', web: 'directions_bike' },
  campfire: { ios: 'flame', android: 'local_fire_department', web: 'local_fire_department' },
} as const;
export type IconName = keyof typeof SYMBOLS | 'campfire-chat';
export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}
export function Icon({ name, size = 22, color }: IconProps) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{ width: size, height: size }}
    >
      {name === 'heart-filled' ? (
        <Image source={require('@/assets/icons/heart-filled.svg')} tintColor={color ?? theme.primaryStrong}
          contentFit="contain" style={{ width: size, height: size }} accessible={false} alt="" />
      ) : name === 'campfire-chat' ? (
        <Image
          source={
            Platform.OS === 'web'
              ? TAB_ICONS['campfire-chat'].web.default
              : TAB_ICONS['campfire-chat'].native.default
          }
          tintColor={color ?? theme.primaryStrong}
          contentFit="contain"
          style={{ width: size, height: size }}
          accessible={false}
          alt=""
        />
      ) : (
        <SymbolView
          name={SYMBOLS[name]}
          size={size}
          tintColor={color ?? theme.primaryStrong}
          style={{ width: size, height: size }}
          accessible={false}
        />
      )}
    </View>
  );
}
