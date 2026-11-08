import type { TripForm } from '../../types/owned-trip';

export const DESCRIPTION_COMPANIES = [
  { id: 'family', label: 'Rodzina z dziećmi' },
  { id: 'couple', label: 'Para' },
  { id: 'solo', label: 'Osoba solo' },
  { id: 'friends', label: 'Grupa znajomych' },
  { id: 'any', label: 'Dowolna ekipa' },
] as const;
export const DESCRIPTION_PACES = [
  { id: 'relaxed', label: 'Spokojnie, na luzie' },
  { id: 'active', label: 'Aktywnie, dużo odkrywania' },
  { id: 'mixed', label: 'Trochę ruchu, trochę odpoczynku' },
] as const;
export const DESCRIPTION_ACTIVITIES = [
  { id: 'Zwiedzanie', phrase: 'zwiedzać okolicę' },
  { id: 'Wędrówki', phrase: 'wybrać się na piesze wycieczki' },
  { id: 'Rowery', phrase: 'jeździć na rowerach' },
  { id: 'Gry planszowe', phrase: 'grać w planszówki' },
  { id: 'Ognisko', phrase: 'spotkać się przy ognisku, jeśli warunki pozwolą' },
  { id: 'Przyroda', phrase: 'poznawać przyrodę' },
  { id: 'Plaża', phrase: 'odpoczywać na plaży' },
  { id: 'Kajaki', phrase: 'popływać kajakiem' },
  { id: 'Fotografia', phrase: 'robić zdjęcia' },
] as const;

export interface DescriptionAnswers {
  company: typeof DESCRIPTION_COMPANIES[number]['id'] | null;
  pace: typeof DESCRIPTION_PACES[number]['id'] | null;
  activities: (typeof DESCRIPTION_ACTIVITIES[number]['id'])[];
}

export function initialDescriptionAnswers(form: Pick<TripForm, 'interests'>): DescriptionAnswers {
  return {
    company: null,
    pace: form.interests.includes('Spokojny wypoczynek') ? 'relaxed' : null,
    activities: DESCRIPTION_ACTIVITIES.filter(a => form.interests.includes(a.id)).map(a => a.id),
  };
}

const join = (values: string[]) => values.length < 2 ? values.join('') : values.slice(0, -1).join(', ') + ' i ' + values.at(-1);

// This local writing aid describes intentions, never amenities, reservations or
// a confirmed itinerary. Answers affect the text only, not discovery/push rules.
export function suggestTripDescription(form: Pick<TripForm, 'mode' | 'place' | 'participants'>, answers: DescriptionAnswers, variant = 0): string {
  if (!answers.company || !answers.pace) return '';
  const solo = form.participants?.adultCount === 1 && !form.participants.childCount;
  const alternative = variant % 2 !== 0;
  const label = form.place && (form.mode === 'planned' || ['locality', 'region', 'country'].includes(form.place.kind))
    ? (form.place.userLabel ?? form.place.name).trim().replace(/\s+/gu, ' ') : '';
  let opening: string;
  if (form.mode === 'flexible') {
    opening = alternative
      ? `${solo ? 'Chcę' : 'Chcemy'} wspólnie wybrać miejsce i ułożyć pomysł na wyjazd.${label ? ` Interesuje ${solo ? 'mnie' : 'nas'} obszar „${label}”.` : ''}`
      : `${solo ? 'Mam' : 'Mamy'} wolny termin i ${solo ? 'szukam' : 'szukamy'} inspiracji na wspólny wyjazd.${label ? ` Obszar poszukiwań to „${label}”.` : ''} Konkretne miejsce ${solo ? 'chcę' : 'chcemy'} wybrać razem z ekipą.`;
  } else {
    opening = alternative
      ? `${label ? `Celem wyjazdu jest „${label}”. ` : ''}${solo ? 'Chcę' : 'Chcemy'} poznać ludzi, z którymi miło będzie spędzić część pobytu.`
      : `${label ? `Cel wyjazdu to „${label}”. ` : ''}${solo ? 'Szukam' : 'Szukamy'} towarzystwa do wspólnego spędzania czasu.`;
  }
  const company = {
    family: 'rodziny z dziećmi', couple: 'inne pary', solo: 'osoby podróżujące solo', friends: 'grupę znajomych', any: 'nową ekipę, niezależnie od jej składu',
  }[answers.company];
  const people = `${solo ? 'Chętnie poznam' : 'Chętnie poznamy'} ${company}.`;
  const pace = {
    relaxed: alternative ? 'Najlepiej odpoczywa się bez pośpiechu, z czasem na rozmowy i spontaniczne pomysły.' : 'Najważniejszy jest spokojny wypoczynek, bez napiętego harmonogramu.',
    active: alternative ? 'Dobrze spędzony dzień to dla nas trochę ruchu i odkrywanie nowych miejsc.' : 'To ma być aktywny wyjazd, z ruchem i odkrywaniem okolicy.',
    mixed: alternative ? 'Trochę aktywności, trochę leniuchowania — najlepiej znaleźć wspólne tempo.' : 'W planach jest zarówno trochę ruchu, jak i czas na spokojny odpoczynek.',
  }[answers.pace].replace('dla nas', solo ? 'dla mnie' : 'dla nas');
  const activities = DESCRIPTION_ACTIVITIES.filter(a => answers.activities.includes(a.id)).map(a => a.phrase);
  const activityText = activities.length ? `${solo ? 'Mam' : 'Mamy'} ochotę ${join(activities)}.` : '';
  const closing = alternative
    ? 'Masz podobny pomysł? Odezwij się, porozmawiajmy o wspólnym wyjeździe!'
    : 'Dajcie znać, co lubicie robić — szczegóły wspólnego czasu ustalimy w rozmowie.';
  return [opening, people, pace, activityText, closing].filter(Boolean).join(' ');
}
