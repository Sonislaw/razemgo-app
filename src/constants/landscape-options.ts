import type { LandscapeKind } from '@/types/travel';

export const LANDSCAPE_OPTIONS = [
  { value: 'coast', label: 'Morze' },
  { value: 'lake', label: 'Jeziora' },
  { value: 'mountain', label: 'Góry' },
  { value: 'forest', label: 'Las' },
] as const satisfies readonly { value: LandscapeKind; label: string }[];
