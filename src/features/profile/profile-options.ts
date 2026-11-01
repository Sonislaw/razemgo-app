import type { TravelGroup } from '../../types/travel';

export const TRAVEL_MODE_OPTIONS = [
  'Przyczepa',
  'Kamper',
  'Namiot',
  'Van',
  'Samochód',
];
// Keep the stored value compatible with existing profiles, trips and filters.
export const travelModeLabel = (mode: string): string =>
  mode === 'Van' ? 'Kampervan' : mode;

export const INTEREST_OPTIONS = [
  'Rowery',
  'Spokojny wypoczynek',
  'Ognisko',
  'Plaża',
  'Przyroda',
  'Wędrówki',
  'Kajaki',
  'Fotografia',
  'Gry planszowe',
  'Zwiedzanie',
];
export const GROUP_KIND_OPTIONS: {
  value: TravelGroup['kind'];
  label: string;
}[] = [
  { value: 'family', label: 'Rodziny z dziećmi' },
  { value: 'couple', label: 'Pary' },
  { value: 'solo', label: 'Osoby solo' },
  { value: 'friends', label: 'Grupy znajomych' },
];
