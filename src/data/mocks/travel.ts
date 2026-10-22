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
  name: 'Nasza rodzina',
  kind: 'family',
  adultCount: 2,
  childCount: 2,
  childAgeBands: ['4–6', '7–9'],
  travelModes: ['Przyczepa'],
  interests: ['Rowery', 'Spokojny wypoczynek', 'Ognisko'],
  animals: { animals: [{ kind: 'dog' }] },
};
export const DEMO_GROUPS: TravelGroup[] = [
  {
    id: 'demo-1',
    name: 'Rodzina A',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['4–6', '7–9'],
    travelModes: ['Przyczepa'],
    interests: ['Rowery', 'Plaża', 'Spokojny wypoczynek'],
    animals: { animals: [{ kind: 'dog' }] },
  },
  {
    id: 'demo-2',
    name: 'Rodzina B',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['7–9', '10–12'],
    travelModes: ['Kamper'],
    interests: ['Kajaki', 'Ognisko', 'Przyroda'],
    animals: { animals: [] },
  },
  {
    id: 'demo-3',
    name: 'Para C',
    kind: 'couple',
    adultCount: 2,
    childCount: 0,
    childAgeBands: [],
    travelModes: ['Van'],
    interests: ['Wędrówki', 'Przyroda', 'Fotografia'],
    animals: { animals: [{ kind: 'cat' }] },
  },
  {
    id: 'demo-4',
    name: 'Rodzina D',
    kind: 'family',
    adultCount: 1,
    childCount: 2,
    childAgeBands: ['0–3', '4–6'],
    travelModes: ['Namiot'],
    interests: ['Spokojny wypoczynek', 'Las', 'Ognisko'],
    animals: { animals: [] },
  },
  {
    id: 'demo-5',
    name: 'Grupa E',
    kind: 'friends',
    adultCount: 3,
    childCount: 0,
    childAgeBands: [],
    travelModes: ['Namiot'],
    interests: ['Rowery', 'Plaża', 'Gry planszowe'],
    animals: { animals: [] },
  },
  {
    id: 'demo-6',
    name: 'Rodzina F',
    kind: 'family',
    adultCount: 2,
    childCount: 2,
    childAgeBands: ['10–12', '13–17'],
    travelModes: ['Kamper'],
    interests: ['Wędrówki', 'Rowery', 'Ognisko'],
    animals: { animals: [{ kind: 'dog' }] },
  },
];
export const DEMO_TRIPS: TripPlan[] = [
  {
    id: 'demo-coast',
    publishedAt: '2026-10-20T08:00:00.000Z',
    animals: { animals: [{ kind: 'dog' }] },

    groupId: 'demo-1',
    mode: 'planned',
    destination: {
      name: 'Chłapowo',
      region: 'Pomorze',
      locationId: 'pl-locality:4259',
    },
    startDate: '2027-05-22',
    endDate: '2027-05-25',
    description:
      'Plaża, rowery i dużo czasu na wspólną zabawę. Spokojny weekend nad Bałtykiem.',
    interests: ['Rowery', 'Plaża', 'Spokojny wypoczynek'],
    landscape: 'coast',
  },
  {
    id: 'demo-lake',
    publishedAt: '2026-10-20T12:00:00.000Z',
    animals: { animals: [] },

    groupId: 'demo-2',
    mode: 'planned',
    destination: {
      name: 'Mikołajki',
      region: 'Mazury',
      locationId: 'pl-locality:21411',
    },
    startDate: '2027-06-04',
    endDate: '2027-06-07',
    description:
      'Kajaki w ciągu dnia, a wieczorem rozmowy przy ognisku. Jest czas, żeby się poznać.',
    interests: ['Kajaki', 'Ognisko', 'Przyroda'],
    landscape: 'lake',
  },
  {
    id: 'demo-mountains',
    publishedAt: '2026-10-21T08:00:00.000Z',
    animals: { animals: [{ kind: 'cat' }] },

    groupId: 'demo-3',
    mode: 'flexible',
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
    publishedAt: '2026-10-21T10:00:00.000Z',
    animals: { animals: [] },

    groupId: 'demo-4',
    mode: 'flexible',
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
    publishedAt: '2026-10-21T14:00:00.000Z',
    animals: { animals: [] },

    groupId: 'demo-5',
    mode: 'planned',
    destination: {
      name: 'Łeba',
      region: 'Pomorze',
      locationId: 'pl-locality:19313',
    },
    startDate: '2027-06-18',
    endDate: '2027-06-21',
    description:
      'Kilka dni na świeżym powietrzu. Chętnie poznamy innych fanów rowerów i gier.',
    interests: ['Rowery', 'Plaża', 'Gry planszowe'],
    landscape: 'coast',
  },
  {
    id: 'demo-bieszczady',
    publishedAt: '2026-10-21T18:00:00.000Z',
    animals: { animals: [{ kind: 'dog' }] },

    groupId: 'demo-6',
    mode: 'planned',
    destination: {
      name: 'Wetlina',
      region: 'Bieszczady',
      locationId: 'pl-locality:38408',
    },
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
    publishedAt: '2026-10-18T09:00:00.000Z',
    animals: { animals: [{ kind: 'dog' }] },

    groupId: MY_GROUP.id,
    mode: 'planned',
    destination: { name: 'Chłapowo', region: 'Pomorze' },
    startDate: '2027-05-21',
    endDate: '2027-05-24',
    description:
      'Przyczepa, rowery i rodzinny czas na plaży. Chętnie poznamy inne ekipy nad morzem.',
    interests: ['Rowery', 'Plaża'],
    landscape: 'coast',
  },
  {
    id: 'demo-my-idea',
    publishedAt: '2026-10-19T09:00:00.000Z',
    animals: { animals: [] },

    groupId: MY_GROUP.id,
    mode: 'flexible',
    travelArea: { name: 'Kaszuby', region: 'Pomorze' },
    startDate: '2027-06-04',
    endDate: '2027-06-07',
    description:
      'Mamy wolny termin i ochotę na przygodę. Miejsce wybierzemy razem z towarzyszami.',
    interests: ['Ognisko', 'Spokojny wypoczynek'],
    landscape: 'lake',
  },
];
export const DEMO_PROPOSALS: TripProposal[] = DEMO_TRIPS.flatMap((trip) => {
  const group = DEMO_GROUPS.find((candidate) => candidate.id === trip.groupId);
  return group ? [{ trip, group }] : [];
});
