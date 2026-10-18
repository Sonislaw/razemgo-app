import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#263E49',
    textSecondary: '#596B78',
    background: '#FFFBF5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#D8F5E9',
    primary: '#A7E5CF',
    primaryStrong: '#176C61',
    onPrimary: '#1F4B43',
    border: '#DDDDED',
    muted: '#EEE7FA',
    accent: '#FFE49A',
    accentText: '#73531C',
    hero: '#FFE1CA',
    heroText: '#563C39',
    heroMuted: '#715852',
    disabled: '#ECEAF0',
    disabledText: '#6D6A79',
  },
  dark: {
    text: '#F4EDF8',
    textSecondary: '#C0B8CC',
    background: '#1D2030',
    backgroundElement: '#292D40',
    backgroundSelected: '#304D49',
    primary: '#AFE7D4',
    primaryStrong: '#AFE7D4',
    onPrimary: '#1E443B',
    border: '#48475E',
    muted: '#3B3550',
    accent: '#F2D286',
    accentText: '#F8DEAC',
    hero: '#503D42',
    heroText: '#FFE5D3',
    heroMuted: '#E9C5B7',
    disabled: '#39394B',
    disabledText: '#B9B5C6',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light;
export const Fonts = {
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  serif: 'serif',
  rounded: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  mono: 'monospace',
};
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
export const Radius = { small: 12, card: 20, hero: 28, pill: 999 } as const;
export const Typography = {
  title: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  heading: { fontSize: 21, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
} as const;

// Local illustrations keep the demo independent of photo services and network access.
export const Landscapes = {
  coast: {
    sky: '#D9F0FF',
    sun: '#FFE49A',
    far: '#A9DDD7',
    near: '#78C8BE',
    ground: '#FFE2B8',
    ink: '#285E68',
  },
  lake: {
    sky: '#E5F4FF',
    sun: '#FFD8A0',
    far: '#BDE5C4',
    near: '#8DCCAC',
    ground: '#A8DDEA',
    ink: '#2C596A',
  },
  mountain: {
    sky: '#EEE5FF',
    sun: '#FFD6A6',
    far: '#C9B9EB',
    near: '#A59AD5',
    ground: '#C6E4D1',
    ink: '#53486F',
  },
  forest: {
    sky: '#FFF1D4',
    sun: '#FFC5AD',
    far: '#C3E7C3',
    near: '#91CEAA',
    ground: '#D6EEC8',
    ink: '#355F4B',
  },
} as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 600;
