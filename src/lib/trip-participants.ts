import type { TripParticipants, TravelGroup } from '../types/travel';
import { CHILD_AGE_BANDS } from '../constants/travel.ts';

export const MAX_TRIP_PARTICIPANTS = 20;

export function cloneTripParticipants(value?: TripParticipants | null): TripParticipants | null {
  if (!value) return null;
  return {
    adultCount: value.adultCount,
    childCount: value.childCount,
    childAgeBands: [...value.childAgeBands],
  };
}

export function participantsFromProfile(group: TravelGroup): TripParticipants {
  return {
    adultCount: group.adultCount,
    childCount: group.childCount,
    childAgeBands: group.childCount ? [...group.childAgeBands] : [],
  };
}

export function validateTripParticipants(
  value?: TripParticipants | null,
  { allowMissingChildAges = false }: { allowMissingChildAges?: boolean } = {},
): string[] {
  if (!value) return ['Uzupełnij skład uczestników wyjazdu.'];
  const errors: string[] = [];
  if (!Number.isInteger(value.adultCount) || value.adultCount < 1 || value.adultCount > MAX_TRIP_PARTICIPANTS) {
    errors.push(`Podaj liczbę dorosłych na wyjeździe od 1 do ${MAX_TRIP_PARTICIPANTS}.`);
  }
  if (!Number.isInteger(value.childCount) || value.childCount < 0 || value.childCount > MAX_TRIP_PARTICIPANTS) {
    errors.push(`Podaj liczbę dzieci na wyjeździe od 0 do ${MAX_TRIP_PARTICIPANTS}.`);
  }
  const missingAges = value.childCount > 0 && !value.childAgeBands.length;
  if (
    new Set(value.childAgeBands).size !== value.childAgeBands.length ||
    value.childAgeBands.some(band => !CHILD_AGE_BANDS.includes(band)) ||
    value.childAgeBands.length > value.childCount ||
    (missingAges && !allowMissingChildAges)
  ) {
    errors.push('Wybierz przedziały wieku dzieci jadących na ten wyjazd, zgodnie z ich liczbą.');
  }
  return errors;
}

export function tripParticipantsSummary(value?: TripParticipants | null): string {
  if (!value) return 'Skład wyjazdu do uzupełnienia';
  const adults = `${value.adultCount} ${value.adultCount === 1 ? 'dorosły' : 'dorosłych'}`;
  return value.childCount ? `${adults} · ${value.childCount} ${value.childCount === 1 ? 'dziecko' : 'dzieci'}` : adults;
}
