import type {TravelGroup} from '../../types/travel';

export const PROFILE_DESCRIPTION_PACES = [
  {id: 'relaxed', label: 'Spokojnie, na luzie'},
  {id: 'active', label: 'Aktywnie, dużo odkrywania'},
  {id: 'mixed', label: 'Trochę ruchu, trochę odpoczynku'},
] as const;

export const PROFILE_DESCRIPTION_ACTIVITIES = [
  {id: 'Rowery', phrase: 'jeździć na rowerach'},
  {id: 'Ognisko', phrase: 'spędzać wieczory przy ognisku'},
  {id: 'Plaża', phrase: 'odpoczywać na plaży'},
  {id: 'Przyroda', phrase: 'poznawać przyrodę'},
  {id: 'Wędrówki', phrase: 'wędrować'},
  {id: 'Kajaki', phrase: 'pływać kajakiem'},
  {id: 'Fotografia', phrase: 'robić zdjęcia'},
  {id: 'Gry planszowe', phrase: 'grać w planszówki'},
  {id: 'Zwiedzanie', phrase: 'zwiedzać okolicę'},
] as const;

export const PROFILE_DESCRIPTION_CONNECTIONS = [
  {id: 'conversation', label: 'Rozmowy i poznawanie ludzi'},
  {id: 'activities', label: 'Wspólne aktywności'},
  {id: 'spontaneous', label: 'Swoboda i spontaniczne pomysły'},
] as const;

export interface ProfileDescriptionAnswers {
  pace: typeof PROFILE_DESCRIPTION_PACES[number]['id'] | null;
  activities: (typeof PROFILE_DESCRIPTION_ACTIVITIES[number]['id'])[];
  connection: typeof PROFILE_DESCRIPTION_CONNECTIONS[number]['id'] | null;
}

export function initialProfileDescriptionAnswers(group: Pick<TravelGroup, 'interests'>): ProfileDescriptionAnswers {
  return {
    pace: group.interests.includes('Spokojny wypoczynek') ? 'relaxed' : null,
    activities: PROFILE_DESCRIPTION_ACTIVITIES.filter(a => group.interests.includes(a.id)).map(a => a.id),
    connection: null,
  };
}

const join = (values: string[]) => values.length < 2 ? values.join('') : values.slice(0, -1).join(', ') + ' i ' + values.at(-1);

// Only explicit profile data and answers enter the editable proposal. Generating
// a description never changes interests, transport or other profile fields.
export function suggestProfileDescription(group: Pick<TravelGroup, 'kind' | 'travelModes'>, answers: ProfileDescriptionAnswers, variant = 0): string {
  if (!answers.pace || !answers.connection) return '';
  const solo = group.kind === 'solo';
  const alternative = variant % 2 !== 0;
  const opening = {
    family: alternative ? 'Jesteśmy rodzinną ekipą z zamiłowaniem do podróży.' : 'Jesteśmy rodziną, która lubi wspólne podróże.',
    couple: alternative ? 'Podróżujemy we dwoje i chętnie odkrywamy nowe miejsca.' : 'Jesteśmy parą i lubimy razem odkrywać nowe miejsca.',
    friends: alternative ? 'Podróżujemy z przyjaciółmi i lubimy dzielić się wrażeniami z drogi.' : 'Jesteśmy grupą znajomych, którą łączą wspólne podróże.',
    solo: alternative ? 'Lubię samodzielne podróże i odkrywanie nowych miejsc.' : 'Podróżuję solo i lubię poznawać nowe miejsca.',
  }[group.kind];
  const mode = ({Przyczepa: 'z przyczepą', Kamper: 'kamperem', Van: 'kampervanem', Namiot: 'z namiotem', Samochód: 'samochodem'} as Record<string, string>)[group.travelModes[0]];
  const transport = mode ? `${solo ? 'Ruszam' : 'Ruszamy'} w drogę ${mode}.` : '';
  const pace = {
    relaxed: alternative ? 'Najlepiej odpoczywa się bez pośpiechu, z czasem na małe przyjemności.' : 'Najbardziej cieszy nas spokojny wypoczynek, bez napiętego harmonogramu.',
    active: alternative ? 'Dobry dzień w drodze to dla nas ruch i odkrywanie okolicy.' : 'Lubimy być w ruchu i odkrywać, co ciekawego jest w okolicy.',
    mixed: alternative ? 'Najlepiej łączyć trochę ruchu z chwilą spokojnego odpoczynku.' : 'Lubimy łączyć aktywności z czasem na spokojny odpoczynek.',
  }[answers.pace].replace('cieszy nas', solo ? 'cieszy mnie' : 'cieszy nas').replace('dla nas', solo ? 'dla mnie' : 'dla nas').replace('Lubimy', solo ? 'Lubię' : 'Lubimy');
  const activities = PROFILE_DESCRIPTION_ACTIVITIES.filter(a => answers.activities.includes(a.id)).map(a => a.phrase);
  const activityText = activities.length ? `Na wyjazdach ${solo ? 'lubię' : 'lubimy'} ${join(activities)}.` : '';
  const connection = {
    conversation: alternative ? 'W towarzystwie najbardziej cenię dobre rozmowy i poznawanie nowych ludzi.' : 'We wspólnych wyjazdach cenię rozmowy i okazję do poznania nowych ludzi.',
    activities: alternative ? 'Najchętniej spędzam wspólny czas, robiąc coś razem i wymieniając się pomysłami.' : 'We wspólnych wyjazdach cenię aktywności, które pozwalają lepiej się poznać.',
    spontaneous: alternative ? 'Najlepiej czuję się tam, gdzie jest przestrzeń na własne tempo i spontaniczne pomysły.' : 'We wspólnych wyjazdach cenię swobodę i spontaniczne pomysły, bez presji na wspólny plan.',
  }[answers.connection].replace('cenię', solo ? 'cenię' : 'cenimy').replace('spędzam', solo ? 'spędzam' : 'spędzamy').replace('czuję', solo ? 'czuję' : 'czujemy');
  const closing = `${solo ? 'Chętnie poznam' : 'Chętnie poznamy'} ekipę do wspólnego spędzania czasu!`;
  return [opening, transport, pace, activityText, connection, closing].filter(Boolean).join(' ');
}
