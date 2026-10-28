import {
  integer,
  object,
  parseGroupRow,
  strings,
  text,
} from '../../data/contracts/validate.ts';
import type { AnimalKind } from '../../types/animals';
import type { ProfileAvatarId } from '../../types/avatar';
import type {
  ChildAgeBand,
  TravelGroup,
  TripProposal,
} from '../../types/travel';
import { matchesCrewSearch } from '../profile/crew-number.ts';
import type {
  GroupCompatibility,
  GroupCompatibilityRow,
} from './group-compatibility';

export interface PublicGroup {
  group: TravelGroup;
  about: string;
  activeTripCount: number;
  compatibility?: GroupCompatibility;
}
export interface PublicGroupDetail extends PublicGroup {
  trips: TripProposal[];
}
export type GroupTripCursor = {
  id: string;
  published_at: string;
  query_key: string;
};
export interface PublicGroupPage extends PublicGroupDetail {
  hasMore: boolean;
  cursor: GroupTripCursor | null;
}
export const GROUP_TRIP_PAGE_SIZE = 5;
export interface GroupVisibility {
  discoverable: boolean;
  about: string;
}
export interface GroupFilters {
  name: string;
  groupKinds: TravelGroup['kind'][];
  childAgeBands: ChildAgeBand[];
  travelModes: string[];
  interests: string[];
  animalKinds: AnimalKind[];
  hasTrips: boolean;
  onlineOnly: boolean;
  favoritesOnly: boolean;
}
export type GroupCursor = { name: string; id: string };
export type GroupSort = 'compatibility' | 'alphabetical';
export type RankedGroupCursor = GroupCursor & {
  score: number | null;
  sort: GroupSort;
};
export const GROUP_SEARCH_PAGE_SIZE = 5;
export interface GroupPage {
  items: PublicGroup[];
  totalCount: number;
  hasMore: boolean;
  cursor: RankedGroupCursor | null;
}
export const INITIAL_GROUP_FILTERS: GroupFilters = {
  name: '',
  groupKinds: [],
  childAgeBands: [],
  travelModes: [],
  interests: [],
  animalKinds: [],
  hasTrips: false,
  onlineOnly: false,
  favoritesOnly: false,
};
export type PublicGroupRow = {
  crew: {
    id: string;
    crew_number?: number;
    name: string;
    avatar_id: ProfileAvatarId;
    kind: TravelGroup['kind'];
    adult_count: number;
    child_count: number;
    child_age_bands: ChildAgeBand[];
    travel_mode: string;
    interests: string[];
    animal_kinds: AnimalKind[];
  };
  about: string;
  active_trip_count: number;
  compatibility?: GroupCompatibilityRow;
};
export function publicGroupFromRow(row: PublicGroupRow): PublicGroup {
  const value = object(row);
  parseGroupRow(value.crew, true);
  text(value.about, 600);
  integer(value.active_trip_count);
  if (value.compatibility !== undefined) {
    const matching = object(value.compatibility);
    if (matching.score !== null) integer(matching.score, 0, 100);
    strings(matching.reasons, 20);
    integer(matching.evaluated_weight, 0, 1000);
    if (typeof matching.limited_data !== 'boolean')
      throw new Error('Invalid compatibility');
  }
  const g = row.crew;
  return {
    group: {
      id: g.id,
      ...(g.crew_number ? { crewNumber: g.crew_number } : {}),
      name: g.name,
      avatarId: g.avatar_id,
      kind: g.kind,
      adultCount: g.adult_count,
      childCount: g.child_count,
      childAgeBands: g.child_age_bands,
      travelModes: [g.travel_mode],
      interests: g.interests,
      animals: { animals: g.animal_kinds.map((kind) => ({ kind })) },
    },
    about: row.about,
    activeTripCount: row.active_trip_count,
    ...(row.compatibility
      ? {
          compatibility: {
            score: row.compatibility.score,
            reasons: row.compatibility.reasons,
            limitedData: row.compatibility.limited_data,
            evaluatedWeight: row.compatibility.evaluated_weight,
          },
        }
      : {}),
  };
}
export function groupFiltersPayload(filters: GroupFilters) {
  return {
    name: filters.name.trim(),
    group_kinds: filters.groupKinds,
    child_age_bands: filters.childAgeBands,
    travel_modes: filters.travelModes,
    interests: filters.interests,
    animal_kinds: filters.animalKinds,
    has_trips: filters.hasTrips,
    online_only: filters.onlineOnly,
    favorites_only: filters.favoritesOnly,
  };
}
export function normalizeGroupSearch(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l');
}
export function filterPublicGroups(
  groups: PublicGroup[],
  filters: GroupFilters,
  onlineGroupIds: ReadonlySet<string> = new Set(),
  favoriteGroupIds: ReadonlySet<string> = new Set(),
) {
  const overlaps = <T>(selected: T[], actual: T[]) =>
    !selected.length || selected.some((x) => actual.includes(x));
  return groups
    .filter(
      ({ group, activeTripCount }) =>
        matchesCrewSearch(group.name, group.crewNumber, filters.name) &&
        overlaps(filters.groupKinds, [group.kind]) &&
        overlaps(filters.childAgeBands, group.childAgeBands) &&
        overlaps(filters.travelModes, group.travelModes) &&
        overlaps(filters.interests, group.interests) &&
        overlaps(
          filters.animalKinds,
          group.animals.animals.map((x) => x.kind),
        ) &&
        (!filters.hasTrips || activeTripCount > 0) &&
        (!filters.onlineOnly || onlineGroupIds.has(group.id)) &&
        (!filters.favoritesOnly || favoriteGroupIds.has(group.id)),
    )
    .sort(
      (a, b) =>
        normalizeGroupSearch(a.group.name).localeCompare(
          normalizeGroupSearch(b.group.name),
        ) || a.group.id.localeCompare(b.group.id),
    );
}
export function groupDirectoryError(error: unknown) {
  if ((error as { code?: string })?.code === 'PGRST202')
    return 'Wyszukiwanie ekip wymaga nowej migracji backendu. Ta wersja funkcji jest przygotowana lokalnie.';
  return 'Nie udało się pobrać ekip. Sprawdź połączenie i spróbuj ponownie.';
}
export function sortPublicGroups(groups: PublicGroup[], sort: GroupSort) {
  return [...groups].sort((a, b) => {
    const score =
      sort === 'compatibility'
        ? (b.compatibility?.score ?? -1) - (a.compatibility?.score ?? -1)
        : 0;
    const first = normalizeGroupSearch(a.group.name),
      second = normalizeGroupSearch(b.group.name);
    return (
      score ||
      (first < second
        ? -1
        : first > second
          ? 1
          : a.group.id.localeCompare(b.group.id))
    );
  });
}
