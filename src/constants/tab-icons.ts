import type { ImageSourcePropType } from 'react-native';

export const TAB_ICONS = {
  camp: {
    native: {
      default: require('@/assets/icons/navigation/camp.png'),
      selected: require('@/assets/icons/navigation/camp-selected.png'),
    },
    web: {
      default: require('@/assets/icons/navigation/camp.svg'),
      selected: require('@/assets/icons/navigation/camp-selected.svg'),
    },
  },
  compass: {
    native: {
      default: require('@/assets/icons/navigation/compass.png'),
      selected: require('@/assets/icons/navigation/compass-selected.png'),
    },
    web: {
      default: require('@/assets/icons/navigation/compass.svg'),
      selected: require('@/assets/icons/navigation/compass-selected.svg'),
    },
  },
  caravan: {
    native: {
      default: require('@/assets/icons/navigation/caravan.png'),
      selected: require('@/assets/icons/navigation/caravan-selected.png'),
    },
    web: {
      default: require('@/assets/icons/navigation/caravan.svg'),
      selected: require('@/assets/icons/navigation/caravan-selected.svg'),
    },
  },
  'campfire-chat': {
    native: {
      default: require('@/assets/icons/navigation/campfire-chat.png'),
      selected: require('@/assets/icons/navigation/campfire-chat-selected.png'),
    },
    web: {
      default: require('@/assets/icons/navigation/campfire-chat.svg'),
      selected: require('@/assets/icons/navigation/campfire-chat-selected.svg'),
    },
  },
  traveler: {
    native: {
      default: require('@/assets/icons/navigation/traveler.png'),
      selected: require('@/assets/icons/navigation/traveler-selected.png'),
    },
    web: {
      default: require('@/assets/icons/navigation/traveler.svg'),
      selected: require('@/assets/icons/navigation/traveler-selected.svg'),
    },
  },
} as const satisfies Record<
  string,
  Record<'native' | 'web', { default: ImageSourcePropType; selected: ImageSourcePropType }>
>;

export type TabIconName = keyof typeof TAB_ICONS;
