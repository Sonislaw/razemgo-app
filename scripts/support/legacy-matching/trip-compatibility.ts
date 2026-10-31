// Legacy API reference fixture; never imported by application code.
import type { DateRange, DiscoveryFilters, TripProposal } from '../../../src/types/travel.ts';
import type { OwnedTrip } from '../../../src/types/owned-trip.ts';
import type { TravelerProfile } from '../../../src/types/profile.ts';
import { normalizeLocation, sharedNights } from '../../../src/features/discovery/filter-trips.ts';
import { isSearchingTrip, isValidDate, shiftDate } from '../../../src/features/trips/own-trips-state.ts';

export interface Compatibility { score: number; reasons: string[] }
const overlap = (wanted: readonly string[], actual: readonly string[]) =>
  wanted.length ? wanted.filter(item => actual.includes(item)).length / wanted.length : 1;

function calculate(proposal: TripProposal, profile: TravelerProfile, filters: DiscoveryFilters, source?: OwnedTrip, range?: DateRange): Compatibility {
  let points = 0;
  let weight = 0;
  const reasons: string[] = [];
  const add = (value: number, importance: number, reason: string) => {
    points += value * importance; weight += importance;
    if (value > 0) reasons.push(reason);
  };
  const dates = range ?? source;
  if (dates && isValidDate(dates.startDate) && isValidDate(dates.endDate) && dates.endDate > dates.startDate) {
    const nights = Math.max(1, (Date.parse(dates.endDate) - Date.parse(dates.startDate)) / 86400000);
    const tolerance = range && Number.isFinite(filters.dateFlexibilityDays)
      ? Math.min(7, Math.max(0, Math.trunc(filters.dateFlexibilityDays ?? 0))) : 0;
    let common = 0;
    for (let offset = -tolerance; offset <= tolerance; offset++) {
      common = Math.max(common, sharedNights({ startDate: shiftDate(dates.startDate, offset), endDate: shiftDate(dates.endDate, offset) }, proposal.trip));
    }
    add(Math.min(1, common / nights), 30, 'Pasujące terminy');
  }
  if (source) {
    const a = source.mode === 'planned' ? source.destination : source.travelArea;
    const b = proposal.trip.mode === 'planned' ? proposal.trip.destination : proposal.trip.travelArea;
    const samePlace = a.locationId && b.locationId ? a.locationId === b.locationId
      : Boolean(a.name && b.name && normalizeLocation(a.name) === normalizeLocation(b.name)
        && normalizeLocation(a.region) === normalizeLocation(b.region));
    const sameRegion = Boolean(a.region && b.region && normalizeLocation(a.region) === normalizeLocation(b.region));
    add(samePlace ? 1 : sameRegion ? 0.7 : 0, 20, samePlace ? 'Wspólny kierunek' : 'Podobny region');
    add(source.landscape === proposal.trip.landscape ? 1 : 0, 10, 'Podobny klimat wyjazdu');
  }
  const interests = source?.interests.length ? source.interests : profile.group.interests;
  if (interests.length) add(overlap(interests, proposal.trip.interests), 20, 'Wspólne zainteresowania');
  const ages = filters.childAgeBands.length ? filters.childAgeBands
    : source ? (source.matching?.childAgeBands ?? []) : [];
  if (ages.length) add(overlap(ages, (proposal.trip.participants?.childAgeBands ?? [])), 15, 'Pasujący wiek dzieci');
  const kinds = filters.groupKinds?.length ? filters.groupKinds
    : source ? (source.matching?.groupKinds ?? []) : [];
  if (kinds.length) add(kinds.includes(proposal.group.kind) ? 1 : 0, 10, 'Preferowany rodzaj ekipy');
  const theirPreferences = proposal.trip.matching;
  if (theirPreferences?.groupKinds.length)
    add(theirPreferences.groupKinds.includes(profile.group.kind) ? 1 : 0, 10, 'Wasze ekipy pasują do swoich preferencji');
  if (theirPreferences?.childAgeBands.length)
    add(overlap(theirPreferences.childAgeBands, source ? source.participants?.childAgeBands ?? [] : profile.group.childAgeBands), 10, 'Twoja ekipa pasuje wiekiem dzieci');
  const modes = source?.travelModes ?? profile.group.travelModes;
  if (modes.length) add(overlap(modes, proposal.trip.travelModes ?? proposal.group.travelModes), 5, 'Podobny sposób podróżowania');
  const pets = (source?.animals ?? profile.group.animals).animals.map(item => item.kind);
  // Pets are an ordinary preference. Never exclude or gate contact.
  if (pets.length) add(overlap(pets, proposal.trip.animals.animals.map(item => item.kind)), 5, 'Podróż ze zwierzętami');
  return { score: weight ? Math.round(points / weight * 100) : 0, reasons };
}
export function tripCompatibility(proposal: TripProposal, profile: TravelerProfile, ownTrips: OwnedTrip[], filters: DiscoveryFilters, today: string): Compatibility {
  const range = filters.dateRangeId !== 'all' ? filters.customDateRange : undefined;
  const source = ownTrips.find(trip => trip.id === filters.sourceTripId && isSearchingTrip(trip, today));
  if (source) return calculate(proposal, profile, filters, source, range);
  // Never combine evidence from several unrelated own journeys.
  const candidates = ownTrips.filter(trip => isSearchingTrip(trip, today));
  return candidates.length
    ? candidates.map(trip => calculate(proposal, profile, filters, trip, range)).sort((a, b) => b.score - a.score)[0]
    : calculate(proposal, profile, filters, undefined, range);
}
