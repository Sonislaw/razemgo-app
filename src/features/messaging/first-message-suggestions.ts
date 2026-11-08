import type { TripPlan } from '../../types/travel';

export interface FirstMessageSuggestion {
  id: string;
  label: string;
  text: string;
}

// Only public trip details belong in a starter. Never add crew or child data.
function shortDetail(value: string | undefined): string {
  return Array.from(value?.trim().replace(/\s+/gu, ' ') ?? '')
    .slice(0, 100)
    .join('');
}

export function getFirstMessageSuggestions(
  trip?: TripPlan,
): FirstMessageSuggestion[] {
  const meet = {
    id: 'meet',
    label: 'Poznajmy się',
    text: 'Cześć! Chętnie poznam Waszą ekipę. Czy macie ochotę porozmawiać o wspólnym wyjeździe?',
  };
  if (!trip)
    return [
      meet,
      {
        id: 'plans',
        label: 'Plany na wyjazd',
        text: 'Cześć! Czy planujecie jakiś wyjazd w najbliższym czasie i szukacie towarzystwa?',
      },
      {
        id: 'activities',
        label: 'Wspólne aktywności',
        text: 'Cześć! Jak lubicie spędzać czas w podróży? Chętnie porozmawiam o pomyśle na wspólny wypad.',
      },
    ];

  const place = shortDetail(
    trip.mode === 'planned' ? trip.destination.name : trip.travelArea.name,
  );
  if (trip.mode === 'flexible')
    return [
      {
        id: 'idea',
        label: 'Wspólny pomysł',
        text: `Cześć! Zainteresowało mnie Wasze ogłoszenie „Szukam pomysłu”${place ? ` (obszar: ${place})` : ''}. Może wspólnie coś zaplanujemy?`,
      },
      {
        id: 'destination',
        label: 'Kierunek i termin',
        text: 'Cześć! Czy macie już pomysł na miejsce i czy termin z ogłoszenia jest elastyczny?',
      },
      meet,
    ];

  const campground = shortDetail(trip.campgroundName || (trip.destination.place?.kind==='campground'?trip.destination.name:undefined));
  return [
    {
      id: 'join',
      label: 'Wspólny wyjazd',
      text: `Cześć! Zainteresował mnie Wasz wyjazd${place ? ` (miejsce: ${place})` : ''}. Czy nadal szukacie towarzystwa?`,
    },
    {
      id: 'stay',
      label: 'Miejsce na nocleg',
      text: campground
        ? `Cześć! Mam pytanie o kemping ${campground}. Czy trzeba wcześniej zarezerwować miejsce, żeby do Was dołączyć?`
        : 'Cześć! Czy macie już wybrane miejsce na nocleg i wiecie, jak do Was dołączyć?',
    },
    {
      id: 'activities',
      label: 'Wspólne aktywności',
      text: 'Cześć! Jak planujecie spędzać czas podczas wyjazdu? Chętnie porozmawiam o wspólnych aktywnościach.',
    },
  ];
}
