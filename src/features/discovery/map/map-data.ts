import type { DiscoveryFilters, TripProposal } from '../../../types/travel';
import { getLocationMapArea } from '../../trips/trip-map-data.ts';
import { TRAVEL_MODE_OPTIONS } from '../../profile/profile-options.ts';
import { placeLocation } from '../../trips/place-data.ts';

export interface MapBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}
export interface MapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}
export interface MapQuery {
  bounds: MapBounds;
  zoom: number;
}
export interface MapPoint extends MapBounds {
  key: string;
  count: number;
  latitude: number;
  longitude: number;
  label: string;
  travelMode: string | null;
}
export interface TripMapPage {
  points: MapPoint[];
  plannedCount: number;
  unmappedCount: number;
  totalCount: number;
  query: MapQuery;
}
export interface MapCursor {
  id: string;
  published_at: string;
  query_key: string;
  version: 1;
}
export type MapProposal = Omit<TripProposal, 'trip'> & {
  trip: Extract<TripProposal['trip'], { mode: 'planned' }>;
};
export interface MapItemsPage {
  items: MapProposal[];
  totalCount: number;
  hasMore: boolean;
  cursor: MapCursor | null;
}
export interface MapMemory {
  camera?: MapCamera;
  locationKey?: string;
}
export const DEFAULT_MAP_CAMERA: MapCamera = {
  latitude: 52,
  longitude: 19,
  zoom: 5,
};
export const MAP_PAGE_SIZE = 5;
export const MAP_CHANNEL = 'razemgo-discovery-map-v1';
function fail(): never {
  throw Error('Invalid discovery map data');
}
export const mapObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const number = (v: unknown, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail();
const integer = (v: unknown, min = 0, max = 1000000000): number =>
  Number.isInteger(v) ? number(v, min, max) : fail();
const coordinate = (v: unknown, latitude: boolean) =>
  number(v, latitude ? -85 : -180, latitude ? 85 : 180);
export function parseMapBounds(value: unknown): MapBounds {
  const v = mapObject(value),
    result = {
      south: coordinate(v.south, true),
      north: coordinate(v.north, true),
      west: coordinate(v.west, false),
      east: coordinate(v.east, false),
    };
  if (result.south >= result.north || result.west >= result.east) fail();
  return result;
}
export function parseMapCamera(value: unknown): MapCamera {
  const v = mapObject(value);
  return {
    latitude: coordinate(v.latitude, true),
    longitude: coordinate(v.longitude, false),
    zoom: integer(v.zoom, 2, 18),
  };
}
export function sameMapQuery(
  a: MapQuery | undefined,
  b: MapQuery | undefined,
): boolean {
  return (
    !!a &&
    !!b &&
    a.zoom === b.zoom &&
    (['south', 'north', 'west', 'east'] as const).every(
      (k) => Math.abs(a.bounds[k] - b.bounds[k]) < 0.000001,
    )
  );
}
export function initialMapCamera(
  filters: DiscoveryFilters,
  memory: MapMemory,
): MapCamera {
  const key = filters.locationId ?? filters.location.trim();
  if (memory.camera && memory.locationKey === key) return memory.camera;
  const area = getLocationMapArea(placeLocation(filters.place,filters.locationId));
  if (!area) return { ...DEFAULT_MAP_CAMERA };
  return {
    latitude: area.latitude,
    longitude: area.longitude,
    zoom: area.radiusMeters < 10000 ? 10 : area.radiusMeters < 120000 ? 7 : 5,
  };
}

function parseMapPoints(value: unknown): MapPoint[] {
  if (!Array.isArray(value) || value.length > 324) fail();
  const points = value.map((raw) => {
    const p = mapObject(raw);
    if (
      typeof p.key !== 'string' ||
      !/^p:\d{1,12}:\d{1,12}$/.test(p.key) ||
      typeof p.label !== 'string' ||
      p.label.length > 200
    )
      fail();
    const south = coordinate(p.south, true),
      north = coordinate(p.north, true),
      west = coordinate(p.west, false),
      east = coordinate(p.east, false);
    if (south > north || west > east) fail();
    const count = integer(p.count, 1);
    if (
      p.travel_mode != null &&
      (typeof p.travel_mode !== 'string' || !TRAVEL_MODE_OPTIONS.includes(p.travel_mode))
    )
      fail();
    return {
      key: p.key as string,
      label: p.label as string,
      count,
      travelMode: count === 1 ? (p.travel_mode as string | null | undefined) ?? null : null,
      latitude: coordinate(p.latitude, true),
      longitude: coordinate(p.longitude, false),
      south,
      north,
      west,
      east,
    };
  });
  if (new Set(points.map((p) => p.key)).size !== points.length) fail();
  return points;
}
export function parseTripMapPage(value: unknown): TripMapPage {
  const v = mapObject(value),
    points = parseMapPoints(v.points);
  if (
    (v.flexible_count !== undefined && v.flexible_count !== 0) ||
    (Array.isArray(v.areas) && v.areas.length)
  )
    fail();
  const plannedCount = integer(v.planned_count),
    totalCount = integer(v.total_count),
    unmappedCount = integer(v.unmapped_count);
  if (
    points.reduce((sum, p) => sum + p.count, 0) !== plannedCount ||
    plannedCount + unmappedCount > totalCount
  )
    fail();
  return {
    points,
    plannedCount,
    unmappedCount,
    totalCount,
    query: { bounds: parseMapBounds(v.viewport), zoom: integer(v.zoom, 2, 18) },
  };
}
export function parseMapCursor(value: unknown): MapCursor | null {
  if (value === null) return null;
  const v = mapObject(value);
  if (
    typeof v.id !== 'string' ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(v.id) ||
    v.version !== 1 ||
    typeof v.query_key !== 'string' ||
    !/^[\da-f]{32}$/i.test(v.query_key) ||
    typeof v.published_at !== 'string' ||
    !Number.isFinite(Date.parse(v.published_at))
  )
    fail();
  return {
    id: v.id as string,
    published_at: v.published_at as string,
    query_key: v.query_key as string,
    version: 1,
  };
}
export type MapMessage =
  | { type: 'ready' }
  | { type: 'error'; code: 'not-configured' | 'load-failed' }
  | { type: 'pin'; latitude: number; longitude: number }
  | {
      type: 'viewport';
      camera: MapCamera;
      query: MapQuery;
      reason: 'initial' | 'pan' | 'cluster';
    }
  | { type: 'select'; key: string }
  | { type: 'tiles'; ok: boolean }
  | {
      type: 'attribution';
      url: 'https://www.google.com/maps' | 'https://www.google.com/help/terms_maps/';
    };
export function parseMapMessage(value: unknown): MapMessage | null {
  try {
    const v = mapObject(value);
    if (v.channel !== MAP_CHANNEL) return null;
    if (v.type === 'ready') return { type: 'ready' };
    if (v.type === 'error' && ['not-configured', 'load-failed'].includes(v.code as string))
      return { type: 'error', code: v.code as 'not-configured' | 'load-failed' };
    if (v.type === 'pin') return { type: 'pin', latitude: coordinate(v.latitude, true), longitude: coordinate(v.longitude, false) };
    if (
      v.type === 'viewport' &&
      ['initial', 'pan', 'cluster'].includes(v.reason as string)
    )
      return {
        type: 'viewport',
        camera: parseMapCamera(v.camera),
        query: {
          bounds: parseMapBounds(v.bounds),
          zoom: parseMapCamera(v.camera).zoom,
        },
        reason: v.reason as 'initial' | 'pan' | 'cluster',
      };
    if (
      v.type === 'select' &&
      typeof v.key === 'string' &&
      /^p:\d{1,12}:\d{1,12}$/.test(v.key)
    )
      return { type: 'select', key: v.key };
    if (v.type === 'tiles' && typeof v.ok === 'boolean')
      return { type: 'tiles', ok: v.ok };
    if (
      v.type === 'attribution' &&
      (v.url === 'https://www.google.com/maps' ||
        v.url === 'https://www.google.com/help/terms_maps/')
    )
      return { type: 'attribution', url: v.url };
  } catch {
    return null;
  }
  return null;
}
