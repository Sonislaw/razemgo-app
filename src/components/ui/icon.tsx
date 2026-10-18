import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export const SYMBOLS = {
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
} as const;
export type IconName = keyof typeof SYMBOLS;
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
      <SymbolView
        name={SYMBOLS[name]}
        size={size}
        tintColor={color ?? theme.primaryStrong}
        style={{ width: size, height: size }}
        accessible={false}
      />
    </View>
  );
}
