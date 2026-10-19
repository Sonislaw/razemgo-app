import type {
  ChildAgeBand,
  DemoDateRange,
  TravelGroup,
  TripPlan,
  TripProposal,
} from '../../types/travel';

export const CHILD_AGE_BANDS: ChildAgeBand[] = [
  '0–3',
  '4–6',
  '7–9',
  '10–12',
  '13–17',
];
export const DEMO_DATE_RANGES: DemoDateRange[] = [
  {
    id: 'may',
    label: '21–24 maja',
    startDate: '2027-05-21',
    endDate: '2027-05-24',
  },
  {
    id: 'june',
    label: '4–7 czerwca',
    startDate: '2027-06-04',
    endDate: '2027-06-07',
  },
  {
    id: 'late-june',
    label: '18–21 czerwca',
    startDate: '2027-06-18',
    endDate: '2027-06-21',
  },
];
export const MY_GROUP: TravelGroup = {
  id: 'demo-us',
  name: 'Przykładowa rodzina',
  kind: 'family',
  adultCount: 2,
  childCount: 2,
  childAgeBands: ['4–6', '7–9'],
  homeLocation: 'Okolice Gdańska',
  travelModes: ['Przyczepa', 'Samochód'],
  interests: ['Rowery', 'Spokojny wypoczynek', 'Ognisko'],
  animals: { animals: [{ kind: 'dog', count: 1 }] },
};
export const DEMO_GROUPS: TravelGroup[] = [
  {
    id: 'demo-1',
    name: 'Rodzina A · demo',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['4–6', '7–9'],
    homeLocation: 'Okolice Krakowa',
    travelModes: ['Przyczepa'],
    interests: ['Rowery', 'Plaża', 'Spokojny wypoczynek'],
    animals: { animals: [{ kind: 'dog', count: 1 }] },
  },
  {
    id: 'demo-2',
    name: 'Rodzina B · demo',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['7–9', '10–12'],
    homeLocation: 'Okolice Warszawy',
    travelModes: ['Kamper'],
    interests: ['Kajaki', 'Ognisko', 'Przyroda'],
    animals: { animals: [] },
  },
  {
    id: 'demo-3',
    name: 'Para C · demo',
    kind: 'couple',
    adultCount: 2,
    childCount: 0,
    childAgeBands: [],
    homeLocation: 'Okolice Poznania',
    travelModes: ['Van'],
    interests: ['Wędrówki', 'Przyroda', 'Fotografia'],
    animals: { animals: [{ kind: 'cat', count: 1 }] },
  },
  {
    id: 'demo-4',
    name: 'Rodzina D · demo',
    kind: 'family',
    adultCount: 1,
    childCount: 2,
    childAgeBands: ['0–3', '4–6'],
    homeLocation: 'Okolice Torunia',
    travelModes: ['Namiot'],
    interests: ['Spokojny wypoczynek', 'Las', 'Ognisko'],
    animals: { animals: [] },
  },
  {
    id: 'demo-5',
    name: 'Grupa E · demo',
    kind: 'friends',
    adultCount: 3,
    childCount: 0,
    childAgeBands: [],
    homeLocation: 'Okolice Wrocławia',
    travelModes: ['Samochód', 'Namiot'],
    interests: ['Rowery', 'Plaża', 'Gry planszowe'],
    animals: { animals: [] },
  },
  {
    id: 'demo-6',
    name: 'Rodzina F · demo',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['10–12', '13–17'],
    homeLocation: 'Okolice Łodzi',
    travelModes: ['Kamper'],
    interests: ['Wędrówki', 'Rowery', 'Ognisko'],
    animals: { animals: [{ kind: 'dog', count: 2 }] },
  },
];
export const DEMO_TRIPS: TripPlan[] = [
  {
    id: 'demo-coast',
    animals: { animals: [{ kind: 'dog', count: 1 }] },

    groupId: 'demo-1',
    mode: 'planned',
    title: 'Małe kroki, wielkie morze',
    destination: { name: 'Chłapowo', region: 'Pomorze' },
    startDate: '2027-05-22',
    endDate: '2027-05-25',
    description:
      'Plaża, rowery i dużo czasu na wspólną zabawę. Spokojny weekend nad Bałtykiem.',
    interests: ['Rowery', 'Plaża', 'Spokojny wypoczynek'],
    landscape: 'coast',
  },
  {
    id: 'demo-lake',
    animals: { animals: [] },

    groupId: 'demo-2',
    mode: 'planned',
    title: 'Poranki nad jeziorem',
    destination: { name: 'Mikołajki', region: 'Mazury' },
    startDate: '2027-06-04',
    endDate: '2027-06-07',
    description:
      'Kajaki w ciągu dnia, a wieczorem rozmowy przy ognisku. Jest czas, żeby się poznać.',
    interests: ['Kajaki', 'Ognisko', 'Przyroda'],
    landscape: 'lake',
  },
  {
    id: 'demo-mountains',
    animals: { animals: [{ kind: 'cat', count: 1 }] },

    groupId: 'demo-3',
    mode: 'flexible',
    title: 'Gdzieś bliżej gór',
    travelArea: { name: 'Sudety', region: 'Dolny Śląsk' },
    startDate: '2027-05-21',
    endDate: '2027-05-24',
    description:
      'Mamy wolny weekend. Wybierzmy razem szlak i miejsce na spokojny postój.',
    interests: ['Wędrówki', 'Przyroda'],
    landscape: 'mountain',
  },
  {
    id: 'demo-forest',
    animals: { animals: [] },

    groupId: 'demo-4',
    mode: 'flexible',
    title: 'Weekend w rytmie lasu',
    travelArea: { name: 'Bory Tucholskie', region: 'Pomorze' },
    startDate: '2027-05-21',
    endDate: '2027-05-23',
    description:
      'Krótki wyjazd z najmłodszymi. Cel wybierzemy wspólnie, bez pośpiechu.',
    interests: ['Las', 'Ognisko'],
    landscape: 'forest',
  },
  {
    id: 'demo-friends',
    animals: { animals: [] },

    groupId: 'demo-5',
    mode: 'planned',
    title: 'Słońce, plaża i planszówki',
    destination: { name: 'Łeba', region: 'Pomorze' },
    startDate: '2027-06-18',
    endDate: '2027-06-21',
    description:
      'Kilka dni na świeżym powietrzu. Chętnie poznamy innych fanów rowerów i gier.',
    interests: ['Rowery', 'Plaża', 'Gry planszowe'],
    landscape: 'coast',
  },
  {
    id: 'demo-bieszczady',
    animals: { animals: [{ kind: 'dog', count: 2 }] },

    groupId: 'demo-6',
    mode: 'planned',
    title: 'Razem na połoniny',
    destination: { name: 'Wetlina', region: 'Bieszczady' },
    startDate: '2027-06-05',
    endDate: '2027-06-08',
    description:
      'Górskie widoki i wieczory pod gwiazdami. Trasy dobierzemy do możliwości grupy.',
    interests: ['Wędrówki', 'Ognisko'],
    landscape: 'mountain',
  },
];
export const MY_TRIPS: TripPlan[] = [
  {
    id: 'demo-my-coast',
    animals: { animals: [{ kind: 'dog', count: 1 }] },

    groupId: MY_GROUP.id,
    mode: 'planned',
    title: 'Nasz weekend nad morzem',
    destination: { name: 'Chłapowo', region: 'Pomorze' },
    startDate: '2027-05-21',
    endDate: '2027-05-24',
    description:
      'Przykładowy plan: przyczepa, rowery i rodzinny czas na plaży.',
    interests: ['Rowery', 'Plaża'],
    landscape: 'coast',
  },
  {
    id: 'demo-my-idea',
    animals: { animals: [] },

    groupId: MY_GROUP.id,
    mode: 'flexible',
    title: 'Czerwiec? Wybierzmy się razem',
    travelArea: { name: 'Kaszuby', region: 'Pomorze' },
    startDate: '2027-06-04',
    endDate: '2027-06-07',
    description:
      'Przykładowa dostępność: mamy wolny termin, miejsce wybierzemy z towarzyszami.',
    interests: ['Ognisko', 'Spokojny wypoczynek'],
    landscape: 'lake',
  },
];
export const DEMO_PROPOSALS: TripProposal[] = DEMO_TRIPS.flatMap((trip) => {
  const group = DEMO_GROUPS.find((candidate) => candidate.id === trip.groupId);
  return group ? [{ trip, group }] : [];
});
