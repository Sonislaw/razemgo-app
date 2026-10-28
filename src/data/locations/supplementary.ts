import type { LocationOption } from '../../types/location';

export const SUPPLEMENTARY_LOCATIONS: readonly LocationOption[] = [
  {
    id: 'demo-location-chlapowo',
    name: 'Chłapowo',
    region: 'Pomorze',
    country: 'Polska',
    kind: 'locality',
    aliases: ['Pomorskie'],
  },
  {
    id: 'demo-location-gdansk',
    name: 'Gdańsk',
    region: 'Pomorze',
    country: 'Polska',
    kind: 'locality',
    aliases: ['Pomorskie'],
  },
  {
    id: 'demo-location-kaszuby',
    name: 'Kaszuby',
    region: 'Pomorze',
    country: 'Polska',
    kind: 'region',
    aliases: ['Pomorskie'],
  },
  {
    id: 'demo-location-polska',
    name: 'Polska',
    region: '',
    country: 'Polska',
    kind: 'country',
  },
  {
    id: 'demo-location-slowenia',
    name: 'Słowenia',
    region: '',
    country: 'Słowenia',
    kind: 'country',
    aliases: ['Slovenia'],
  },
];
