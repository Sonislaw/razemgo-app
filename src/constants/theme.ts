import '@/global.css';
import { Platform } from 'react-native';

// Brand colors and action colors from assets/design/razemgo-paleta.svg.
export const BrandPalette = {
  graphite: '#344952',
  blue: '#1992CE',
  green: '#59BC57',
  orange: '#FE881E',
  yellow: '#FDB61B',
  blueAction: '#086996',
  greenAction: '#287A31',
} as const;

export const Colors = {
  light: {
    text: '#243842',
    // Darker variant of the palette's #617782 for text on pale blue surfaces.
    textSecondary: '#5A707B',
    brand: BrandPalette.graphite,
    background: '#F6FAFB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EAF5F8',
    primary: BrandPalette.blueAction,
    primaryStrong: BrandPalette.blueAction,
    onPrimary: '#FFFFFF',
    positive: BrandPalette.greenAction,
    positiveBackground: '#EBF7EA',
    community: BrandPalette.green,
    energy: BrandPalette.orange,
    notificationBackground: BrandPalette.orange,
    notificationText: '#FFFFFF',
    border: '#DCE7EB',
    scrim: 'rgba(22, 35, 43, 0.42)',
    muted: '#EAF5F8',
    iconBackground: '#EAF5F8CC',
    accent: BrandPalette.yellow,
    accentText: BrandPalette.graphite,
    hero: '#FFF1CF',
    heroText: '#243842',
    heroMuted: BrandPalette.graphite,
    disabled: '#EAF5F8',
    disabledText: '#617782',
  },
  dark: {
    text: '#EAF5F8',
    textSecondary: '#B0C8D3',
    brand: '#EAF5F8',
    background: '#16232B',
    backgroundElement: '#21343E',
    backgroundSelected: '#294958',
    primary: '#8ED0EE',
    primaryStrong: '#8ED0EE',
    onPrimary: '#163B4E',
    positive: '#9CDB96',
    positiveBackground: '#263F32',
    community: BrandPalette.green,
    energy: BrandPalette.orange,
    notificationBackground: BrandPalette.orange,
    notificationText: '#FFFFFF',
    border: '#3C5663',
    scrim: 'rgba(0, 0, 0, 0.6)',
    muted: '#29424E',
    iconBackground: '#29424ECC',
    accent: BrandPalette.yellow,
    accentText: '#FFF1CF',
    hero: '#493D22',
    heroText: '#FFF1CF',
    heroMuted: '#E9D7AF',
    disabled: '#29424E',
    disabledText: '#B0C8D3',
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
    sky: '#EAF5F8',
    sun: BrandPalette.yellow,
    far: '#A3D3E9',
    near: BrandPalette.blue,
    ground: '#FDE8B7',
    ink: BrandPalette.graphite,
  },
  lake: {
    sky: '#EAF5F8',
    sun: BrandPalette.yellow,
    far: '#BDE5BC',
    near: BrandPalette.green,
    ground: '#A3D3E9',
    ink: BrandPalette.graphite,
  },
  mountain: {
    sky: '#EAF5F8',
    sun: BrandPalette.orange,
    far: '#A3D3E9',
    near: '#91A9B3',
    ground: '#BDE5BC',
    ink: BrandPalette.graphite,
  },
  forest: {
    sky: '#FFF1CF',
    sun: BrandPalette.orange,
    far: '#BDE5BC',
    near: BrandPalette.green,
    ground: '#FDE8B7',
    ink: BrandPalette.graphite,
  },
} as const;
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 600;
