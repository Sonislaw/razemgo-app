import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#203D36',
    textSecondary: '#5E706A',
    background: '#F6F7F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E0F2E9',
    primary: '#169B83',
    primaryStrong: '#08735F',
    onPrimary: '#FFFFFF',
    border: '#DFE6DE',
    muted: '#EEF1EA',
    accent: '#F0C477',
    accentText: '#765118',
    hero: '#DCEFE3',
    heroText: '#173F32',
    heroMuted: '#466552',
    disabled: '#E7EBE4',
    disabledText: '#647269',
  },
  dark: {
    text: '#E8F1E9',
    textSecondary: '#ACBDB2',
    background: '#121E1A',
    backgroundElement: '#1C2D25',
    backgroundSelected: '#234C3C',
    primary: '#169B83',
    primaryStrong: '#78D9BC',
    onPrimary: '#FFFFFF',
    border: '#344B3D',
    muted: '#25382D',
    accent: '#E4BB74',
    accentText: '#F0CC8E',
    hero: '#234C3C',
    heroText: '#EBF5E9',
    heroMuted: '#BFDBBF',
    disabled: '#2D3D33',
    disabledText: '#ADB9AE',
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
    sky: '#D5E9E8',
    sun: '#F6D79D',
    far: '#91C6BE',
    near: '#4E9E92',
    ground: '#EEDAB7',
    ink: '#204E46',
  },
  lake: {
    sky: '#E0E9D4',
    sun: '#F2CB86',
    far: '#9AB6A0',
    near: '#5D8D79',
    ground: '#AAD5D0',
    ink: '#244E3B',
  },
  mountain: {
    sky: '#E7E4DD',
    sun: '#E9BE88',
    far: '#A4B5AD',
    near: '#658B7B',
    ground: '#D3DFCB',
    ink: '#304F41',
  },
  forest: {
    sky: '#E6ECD8',
    sun: '#EDD299',
    far: '#ACC399',
    near: '#6F9873',
    ground: '#CADAB7',
    ink: '#34503B',
  },
} as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 600;
