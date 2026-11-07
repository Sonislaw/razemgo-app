import { loadCampgrounds } from '../../data/campgrounds/campground-dictionary.cjs';

export interface Campground {
  id: string;
  name: string;
  address: string;
  locality: string;
  latitude: number;
  longitude: number;
}
type Coordinates = { latitude: number; longitude: number };
type CampgroundRow = [string, string, string, string, number, number];
export const MIN_CAMPGROUND_QUERY_LENGTH = 2;
export const MAX_CAMPGROUND_SUGGESTIONS = 6;
export const CAMPGROUND_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
const normalize = (value: string) => value.trim().toLocaleLowerCase('pl-PL')
  .replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
let index: { campground: Campground; name: string; text: string }[] | undefined;
function getIndex() {
  return index ??= (loadCampgrounds() as CampgroundRow[]).map(([id, name, address, locality, latitude, longitude]) => ({
    campground: { id, name, address, locality, latitude, longitude },
    name: normalize(name), text: normalize([name, address, locality].join(' ')),
  }));
}
export function campgroundDistanceKm(campground: Coordinates, near: Coordinates): number {
  const radians = Math.PI / 180;
  const a = Math.sin((campground.latitude - near.latitude) * radians / 2) ** 2 +
    Math.cos(near.latitude * radians) * Math.cos(campground.latitude * radians) *
    Math.sin((campground.longitude - near.longitude) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function searchCampgrounds(query: string, near?: Coordinates): Campground[] {
  const normalized = normalize(query).slice(0, 120);
  if (normalized.length < MIN_CAMPGROUND_QUERY_LENGTH) return [];
  const words = normalized.split(' ');
  return getIndex().filter(item => words.every(word => item.text.includes(word)))
    .map(item => ({ ...item,
      rank: item.name === normalized ? 0 : item.name.startsWith(normalized) ? 1 :
        words.every(word => item.name.includes(word)) ? 2 : 3,
      distance: near ? campgroundDistanceKm(item.campground, near) : 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.distance - b.distance ||
      a.campground.name.localeCompare(b.campground.name, 'pl') || a.campground.id.localeCompare(b.campground.id))
    .slice(0, MAX_CAMPGROUND_SUGGESTIONS).map(item => item.campground);
}
