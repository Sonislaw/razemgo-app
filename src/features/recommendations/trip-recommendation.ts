import type { DiscoveryFilters, TripPlace, TripProposal } from '../../types/travel';
import type { TravelerProfile } from '../../types/profile';
import type { OwnedTrip } from '../../types/owned-trip';
import { isSearchingTrip, shiftDate } from '../trips/own-trips-state.ts';
import { findTripLocation } from '../trips/trip-locations.ts';
import { tripCompatibility } from '../discovery/compatibility.ts';
import { normalizeLocation, resolveDiscoveryRange, sharedNights } from '../discovery/filter-trips.ts';
import { groupRecommendation, type Recommendation, type RecommendationReason } from './recommendation.ts';

const placeOf = (trip: TripProposal['trip']): TripPlace => trip.mode === 'planned' ? trip.destination : trip.travelArea;
const isCountry = (place: TripPlace) => place.locationId?.startsWith('country:') || place.locationId === 'demo-location-polska';
const isRegion = (place: TripPlace) => place.locationId?.startsWith('pl-region:') || findTripLocation(place.locationId)?.kind === 'region';
const region = (place: TripPlace) => normalizeLocation(isRegion(place) ? place.name : place.region).replace(/\bpomorze\b/g, 'pomorskie');
function direction(a: TripPlace | undefined, b: TripPlace) {
  if (!a || isCountry(a) || isCountry(b)) return 0;
  if (!isRegion(a) && !isRegion(b) && (a.locationId && b.locationId
    ? a.locationId === b.locationId : normalizeLocation(a.name) === normalizeLocation(b.name) && region(a) === region(b))) return 2;
  return region(a) && region(a) === region(b) ? 1 : 0;
}
export function tripRecommendation(proposal: TripProposal, profile: TravelerProfile, ownTrips: OwnedTrip[], filters: DiscoveryFilters, today: string) {
  const range = resolveDiscoveryRange(filters), selectedPlace = findTripLocation(filters.locationId);
  const searching = ownTrips.filter(trip => isSearchingTrip(trip, today)).sort((a, b) => a.id.localeCompare(b.id));
  const selected = searching.find(trip => trip.id === filters.sourceTripId);
  const manualSearch = !!(range || filters.locationId || filters.location.trim());
  const sources = selected ? [selected] : manualSearch || !searching.length ? [undefined] : searching;
  const calculate = (source?: OwnedTrip) => {
    const context: Recommendation['context'] = source
      ? { kind: 'trip', tripId: source.id, place: placeOf(source).name, startDate: source.startDate, endDate: source.endDate }
      : { kind: manualSearch ? 'search' : 'profile' };
    const dates = range ?? source;
    // Free text is never interpreted as a verified town/region.
    const sourcePlace: TripPlace | undefined = selectedPlace
      ? { locationId: selectedPlace.id, name: selectedPlace.name, region: selectedPlace.region }
      : filters.location.trim() ? undefined : source ? placeOf(source) : undefined;
    // Find-companions filters intentionally carry the source region as text.
    const sourceQuery = normalizeLocation(filters.location);
    const effectivePlace = source && !selectedPlace && [normalizeLocation(placeOf(source).region), normalizeLocation(placeOf(source).name)].includes(sourceQuery)
      ? placeOf(source) : sourcePlace;
    const placeMatch = direction(effectivePlace, placeOf(proposal.trip));
    const tolerance = range ? Math.min(7, Math.max(0, Math.trunc(filters.dateFlexibilityDays ?? 0))) : 0;
    let dateMatch = dates && sharedNights(dates, proposal.trip) > 0 ? 2 : 0;
    if (!dateMatch && dates) for (let delta = -tolerance; delta <= tolerance; delta++) {
      if (sharedNights({ startDate: shiftDate(dates.startDate, delta), endDate: shiftDate(dates.endDate, delta) }, proposal.trip) > 0) { dateMatch = 1; break; }
    }
    const ownParticipants = source ? source.participants : profile.group;
    const otherParticipants = proposal.trip.participants;
    const group = groupRecommendation({ ...profile.group, childCount: ownParticipants?.childCount ?? 0, childAgeBands: ownParticipants?.childAgeBands ?? [] },
      { ...proposal.group, childCount: otherParticipants?.childCount ?? 0, childAgeBands: otherParticipants?.childAgeBands ?? [] });
    const interests = source?.interests.length ? source.interests : profile.group.interests;
    const common = [...new Set(interests.filter(value => proposal.trip.interests.includes(value)))].sort();
    const interestReasons: RecommendationReason[] = common.map(value => ({ code: 'interest', value }));
    const ages = group.reasons.filter(reason => reason.code === 'child_age');
    const planReasons: RecommendationReason[] = [];
    if (placeMatch) planReasons.push({ code: placeMatch === 2 ? 'same_place' : 'same_region',
      value: placeMatch === 2 ? placeOf(proposal.trip).name : isRegion(placeOf(proposal.trip)) ? placeOf(proposal.trip).name : placeOf(proposal.trip).region });
    if (dateMatch) planReasons.push(dateMatch === 2 ? { code: 'overlapping_dates' } : { code: 'date_tolerance', days: tolerance });
    const similarPlans = dateMatch > 0 && placeMatch > 0;
    const label = similarPlans ? 'similar_plans' : common.length ? 'shared_interests' : ages.length ? 'similar_children' : null;
    const reasons = similarPlans ? [...planReasons, ...interestReasons, ...ages] : [...interestReasons, ...ages, ...planReasons];
    const mode = source?.travelModes[0] ?? profile.group.travelModes[0];
    if (mode && (proposal.trip.travelModes ?? proposal.group.travelModes)[0] === mode) reasons.push({ code: 'travel_mode', value: mode });
    if (source?.landscape === proposal.trip.landscape) reasons.push({ code: 'landscape' });
    for (const { kind } of (source?.animals ?? profile.group.animals).animals)
      if (proposal.trip.animals.animals.some(animal => animal.kind === kind)) reasons.push({ code: 'animal', value: kind });
    const compatibility = tripCompatibility(proposal, profile, source ? [source] : [], filters, today);
    const rank = Number(similarPlans) * 1_000_000 + dateMatch * 100_000 + placeMatch * 10_000 + compatibility.score;
    const recommendation: Recommendation = { version: 2, label, reasons, context };
    return { recommendation, rank, compatibility };
  };
  return sources.map(calculate).sort((a, b) => b.rank - a.rank)[0];
}
