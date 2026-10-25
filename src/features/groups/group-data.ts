import type { AnimalKind } from '../../types/animals';
import type { TravelGroup, ChildAgeBand, TripProposal } from '../../types/travel';
import type { ProfileAvatarId } from '../../types/avatar';

export interface PublicGroup {
  group: TravelGroup;
  about: string;
  activeTripCount: number;
}
export interface PublicGroupDetail extends PublicGroup { trips: TripProposal[] }
export interface GroupVisibility { discoverable: boolean; about: string }
export interface GroupFilters {
  name: string;
  groupKinds: TravelGroup['kind'][];
  childAgeBands: ChildAgeBand[];
  travelModes: string[];
  interests: string[];
  animalKinds: AnimalKind[];
  hasTrips: boolean;
}
export type GroupCursor = { name: string; id: string };
export interface GroupPage { items: PublicGroup[]; hasMore: boolean; cursor: GroupCursor | null }
export const INITIAL_GROUP_FILTERS: GroupFilters = {
  name: '', groupKinds: ['family'], childAgeBands: [], travelModes: [], interests: [], animalKinds: [], hasTrips: false,
};
export type PublicGroupRow = {
  crew: { id: string; name: string; avatar_id: ProfileAvatarId; kind: TravelGroup['kind']; adult_count: number;
    child_count: number; child_age_bands: ChildAgeBand[]; travel_mode: string; interests: string[]; animal_kinds: AnimalKind[] };
  about: string; active_trip_count: number;
};
export function publicGroupFromRow(row: PublicGroupRow): PublicGroup {
  const g = row.crew;
  return { group: { id: g.id, name: g.name, avatarId: g.avatar_id, kind: g.kind, adultCount: g.adult_count,
    childCount: g.child_count, childAgeBands: g.child_age_bands, travelModes: [g.travel_mode], interests: g.interests,
    animals: { animals: g.animal_kinds.map(kind => ({ kind })) } }, about: row.about, activeTripCount: row.active_trip_count };
}
export function groupFiltersPayload(filters: GroupFilters) {
  return { name: filters.name.trim(), group_kinds: filters.groupKinds, child_age_bands: filters.childAgeBands,
    travel_modes: filters.travelModes, interests: filters.interests, animal_kinds: filters.animalKinds, has_trips: filters.hasTrips };
}
export function normalizeGroupSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
}
export function filterPublicGroups(groups: PublicGroup[], filters: GroupFilters) {
  const overlaps = <T,>(selected: T[], actual: T[]) => !selected.length || selected.some(x => actual.includes(x));
  const name = normalizeGroupSearch(filters.name.trim());
  return groups.filter(({ group, activeTripCount }) => normalizeGroupSearch(group.name).includes(name)
    && overlaps(filters.groupKinds, [group.kind]) && overlaps(filters.childAgeBands, group.childAgeBands)
    && overlaps(filters.travelModes, group.travelModes) && overlaps(filters.interests, group.interests)
    && overlaps(filters.animalKinds, group.animals.animals.map(x => x.kind)) && (!filters.hasTrips || activeTripCount > 0))
    .sort((a, b) => normalizeGroupSearch(a.group.name).localeCompare(normalizeGroupSearch(b.group.name)) || a.group.id.localeCompare(b.group.id));
}
export function groupDirectoryError(error: unknown) {
  if ((error as { code?: string })?.code === 'PGRST202')
    return 'Wyszukiwanie ekip wymaga nowej migracji backendu. Ta wersja funkcji jest przygotowana lokalnie.';
  return 'Nie udało się pobrać ekip. Sprawdź połączenie i spróbuj ponownie.';
}
