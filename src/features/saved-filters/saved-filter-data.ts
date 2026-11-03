import type { DiscoveryFilters } from '../../types/travel';
import { CHILD_AGE_BANDS } from '../../constants/travel.ts';
import { LANDSCAPE_OPTIONS } from '../../constants/landscape-options.ts';
import { ANIMAL_OPTIONS } from '../animals/animal-data.ts';
import { discoveryFiltersPayload } from '../discovery/discovery-data.ts';
import { getDiscoveryDateRangeError } from '../discovery/filter-trips.ts';
import { groupFiltersPayload, type GroupFilters } from '../groups/group-data.ts';
import { GROUP_KIND_OPTIONS, INTEREST_OPTIONS, TRAVEL_MODE_OPTIONS, travelModeLabel } from '../profile/profile-options.ts';
import { findTripLocation } from '../trips/trip-locations.ts';

export type SavedFilterKind = 'trips' | 'groups';
export type FilterSetDraft = { kind: 'trips'; filters: DiscoveryFilters } | { kind: 'groups'; filters: GroupFilters };
export type FilterSetPayload = ReturnType<typeof discoveryFiltersPayload> | ReturnType<typeof groupFiltersPayload>;
export type SavedFilterSet = FilterSetDraft & {
  id: string; name: string; schemaVersion: 1; createdAt: string; updatedAt: string;
};
export interface SavedFilterSetRow {
  id: string; name: string; kind: SavedFilterKind; filters: unknown;
  schema_version: number; created_at: string; updated_at: string;
}
export interface FilterSetWrite {
  id: string; kind: SavedFilterKind; name: string; filters: FilterSetPayload | null;
}
export const FILTER_SET_LIMIT = 10;
export const FILTER_SET_NAME_LIMIT = 40;
const invalid = () => { throw new Error('Nie można wczytać tego zestawu filtrów.'); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown, limit: number): string => {
  if (typeof value !== 'string' || Array.from(value).length > limit) return invalid();
  return value;
};
const bool = (value: unknown): boolean => { if (typeof value !== 'boolean') return invalid(); return value; };
const values = <T extends string>(value: unknown, allowed: readonly T[]): T[] => {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !allowed.includes(item as T)) || new Set(value).size !== value.length) return invalid();
  return [...value].sort() as T[];
};
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some(key => !keys.includes(key))) invalid();
};
export const normalizeFilterSetName = (name: string) => name.trim().replace(/\s+/gu, ' ');
export function filterSetNameError(name: string) {
  const count = Array.from(normalizeFilterSetName(name)).length;
  return !count ? 'Podaj nazwę zestawu.' : count > FILTER_SET_NAME_LIMIT ? 'Nazwa może mieć najwyżej 40 znaków.' : undefined;
}

export function tripCriteriaFromPayload(value: unknown): DiscoveryFilters {
  const p = object(value);
  onlyKeys(p, ['trip_modes','landscapes','group_kinds','child_age_bands','animal_kinds','favorites_only','location_query','location','start_date','end_date','tolerance_days']);
  const tripModes = values(p.trip_modes, ['planned','flexible'] as const);
  if (!tripModes.length) invalid();
  let locationId: string | undefined;
  if (p.location !== null) {
    const place = object(p.location);
    locationId = text(place.id, 160);
    if (!findTripLocation(locationId)) invalid();
    for (const key of ['name','region','country']) text(place[key], 160);
    if (!['country','region','city','village','locality'].includes(text(place.kind, 20))) invalid();
  }
  const hasDates = p.start_date !== null || p.end_date !== null;
  const customDateRange = hasDates ? { startDate: text(p.start_date, 10), endDate: text(p.end_date, 10) } : undefined;
  if (customDateRange && getDiscoveryDateRangeError(customDateRange)) invalid();
  if (typeof p.tolerance_days !== 'number' || !Number.isInteger(p.tolerance_days) || p.tolerance_days < 0 || p.tolerance_days > 7) invalid();
  return {
    tripModes, favoritesOnly: bool(p.favorites_only), dateRangeId: customDateRange ? 'custom' : 'all',
    customDateRange, dateFlexibilityDays: customDateRange ? p.tolerance_days as number : 0,
    location: text(p.location_query, 200).trim(), locationId,
    groupKinds: values(p.group_kinds, GROUP_KIND_OPTIONS.map(option => option.value)),
    childAgeBands: values(p.child_age_bands, CHILD_AGE_BANDS),
    animalKinds: values(p.animal_kinds, ANIMAL_OPTIONS.map(option => option.kind)),
    landscapeKinds: values(p.landscapes, LANDSCAPE_OPTIONS.map(option => option.value)),
  };
}
export function groupCriteriaFromPayload(value: unknown): GroupFilters {
  const p = object(value);
  onlyKeys(p, ['name','group_kinds','child_age_bands','travel_modes','interests','animal_kinds','has_trips','online_only','favorites_only']);
  return {
    name: text(p.name, 80).trim(),
    groupKinds: values(p.group_kinds, GROUP_KIND_OPTIONS.map(option => option.value)),
    childAgeBands: values(p.child_age_bands, CHILD_AGE_BANDS),
    travelModes: values(p.travel_modes, TRAVEL_MODE_OPTIONS), interests: values(p.interests, INTEREST_OPTIONS),
    animalKinds: values(p.animal_kinds, ANIMAL_OPTIONS.map(option => option.kind)),
    hasTrips: bool(p.has_trips), onlineOnly: bool(p.online_only), favoritesOnly: bool(p.favorites_only),
  };
}
export function filterSetPayload(value: FilterSetDraft): FilterSetPayload {
  if (value.kind === 'groups') return groupFiltersPayload(groupCriteriaFromPayload(groupFiltersPayload(value.filters)));
  if (value.filters.dateRangeId !== 'all' && (!value.filters.customDateRange || getDiscoveryDateRangeError(value.filters.customDateRange))) invalid();
  if (value.filters.locationId && !findTripLocation(value.filters.locationId)) invalid();
  return discoveryFiltersPayload(tripCriteriaFromPayload(discoveryFiltersPayload(value.filters)));
}
export function copyFilterCriteria(value: FilterSetDraft): FilterSetDraft {
  return value.kind === 'trips'
    ? { kind: 'trips', filters: tripCriteriaFromPayload(filterSetPayload(value)) }
    : { kind: 'groups', filters: groupCriteriaFromPayload(filterSetPayload(value)) };
}
export function sameFilterCriteria(a: FilterSetDraft, b: FilterSetDraft) {
  try { return a.kind === b.kind && JSON.stringify(filterSetPayload(a)) === JSON.stringify(filterSetPayload(b)); } catch { return false; }
}
export function parseSavedFilterSet(value: unknown): SavedFilterSet {
  const p = object(value);
  const id = text(p.id, 36), name = text(p.name, FILTER_SET_NAME_LIMIT);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || filterSetNameError(name) || normalizeFilterSetName(name) !== name || p.schema_version !== 1) invalid();
  const createdAt = text(p.created_at, 80), updatedAt = text(p.updated_at, 80);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) invalid();
  const base = { id, name, schemaVersion: 1 as const, createdAt, updatedAt };
  if (p.kind === 'trips') return { ...base, kind: 'trips', filters: tripCriteriaFromPayload(p.filters) };
  if (p.kind === 'groups') return { ...base, kind: 'groups', filters: groupCriteriaFromPayload(p.filters) };
  return invalid();
}
export function filterSetExpired(value: FilterSetDraft, today: string): boolean {
  return value.kind === 'trips' && !!value.filters.customDateRange && value.filters.customDateRange.endDate <= today;
}
export function filterSetSummary(value: FilterSetDraft): string {
  const f = value.filters;
  const kinds = f.groupKinds?.map(kind => GROUP_KIND_OPTIONS.find(option => option.value === kind)?.label).filter(Boolean).join(', ');
  const common = [kinds, f.childAgeBands.length ? 'Dzieci ' + f.childAgeBands.join(', ') + ' lat' : '',
    f.animalKinds?.length ? 'Zwierzęta: ' + f.animalKinds.map(kind => ANIMAL_OPTIONS.find(option => option.kind === kind)?.label).join(', ') : '',
    f.favoritesOnly ? 'Tylko ulubione' : ''];
  if (value.kind === 'groups') return [value.filters.name ? 'Nazwa lub numer: ' + value.filters.name : '', ...common,
    value.filters.travelModes.map(travelModeLabel).join(', '), value.filters.interests.join(', '),
    value.filters.hasTrips ? 'Z aktywnymi ogłoszeniami' : '', value.filters.onlineOnly ? 'Tylko online' : ''].filter(Boolean).join(' · ') || 'Wszystkie ekipy';
  const trip = value.filters, dates = trip.customDateRange;
  const formatDate = (date: string) => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  return [trip.tripModes.length === 1 ? trip.tripModes[0] === 'planned' ? 'Mam plan' : 'Szukam pomysłu' : '',
    dates ? formatDate(dates.startDate) + ' – ' + formatDate(dates.endDate) + (trip.dateFlexibilityDays ? ` (±${trip.dateFlexibilityDays} dni)` : '') : '',
    trip.location, ...common, trip.landscapeKinds?.map(kind => LANDSCAPE_OPTIONS.find(option => option.value === kind)?.label).join(', ')]
    .filter(Boolean).join(' · ') || 'Wszystkie wyjazdy';
}
export function filterSetError(error: unknown, fallback = 'Nie udało się zapisać zestawu. Spróbuj ponownie.') {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === '23505') return 'Masz już zestaw o tej nazwie w tej zakładce.';
  if (code === '54000') return 'Możesz zapisać najwyżej 10 zestawów w tej zakładce.';
  if (code === 'P0002') return 'Ten zestaw nie jest już dostępny. Odśwież listę zestawów.';
  if (code === '22023') return 'Sprawdź nazwę i kryteria zestawu filtrów.';
  return fallback;
}
