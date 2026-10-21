import type { TripPlan } from '../../types/travel';

export function getTripHeadline(trip: TripPlan): string {
  const description = trip.description.trim().replace(/\s+/gu, ' ');
  if (description) {
    const words = description.split(' ');
    const excerpt = words.slice(0, 8).join(' ');
    const characters = Array.from(excerpt);
    if (characters.length > 80) {
      const shortened = characters.slice(0, 80).join('');
      const boundary = shortened.lastIndexOf(' ');
      return (boundary > 0 ? shortened.slice(0, boundary) : shortened) + '…';
    }
    return words.length > 8 ? excerpt.replace(/[.,;:]+$/u, '') + '…' : excerpt;
  }
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  const location = place.name.trim() || place.region.trim();
  return location
    ? (trip.mode === 'planned' ? 'Wyjazd' : 'Szukam pomysłu') +
        ' · ' +
        location
    : 'Wyjazd do zaplanowania';
}
