import { DEMO_PROPOSALS } from '@/data/mocks/travel';
import type { PublicGroupDetail } from './group-data';
import type { TravelerProfile } from '@/types/profile';
import { groupCompatibility } from './group-compatibility';

export function withDemoGroupCompatibility(item: PublicGroupDetail, viewer: TravelerProfile): PublicGroupDetail {
  return { ...item, compatibility: groupCompatibility(viewer, { group: item.group, matching: {
    groupKinds: [item.group.kind], childAgeBands: item.group.childAgeBands, description: '',
  } }) };
}

export const DEMO_PUBLIC_GROUPS: PublicGroupDetail[] = [
  ...[...new Map(DEMO_PROPOSALS.map(p => [p.group.id, p.group])).values()].map(group => ({
    group, about: 'Lubimy podróże bez pośpiechu, wspólne ogniska i odkrywanie nowych miejsc. Chętnie poznamy towarzystwo na kolejną przygodę.',
    activeTripCount: DEMO_PROPOSALS.filter(p => p.group.id === group.id).length,
    trips: DEMO_PROPOSALS.filter(p => p.group.id === group.id),
  })),
  { group: { id: 'crew-without-trip', crewNumber: 100106, name: 'Leśne włóczykije', avatarId: 'camp-bear', kind: 'family', adultCount: 2,
    childCount: 2, childAgeBands: ['4–6', '7–9'], travelModes: ['Kamper'], interests: ['Przyroda', 'Rowery'],
    animals: { animals: [{ kind: 'dog' }] } }, about: 'Jeszcze nie mamy terminu. Najchętniej uciekamy do lasu i nad jeziora — może wspólnie wymyślimy następny wyjazd?',
    activeTripCount: 0, trips: [] },
  { group: { id: 'crew-weekend-duo', crewNumber: 100107, name: 'Dwoje w drodze', avatarId: 'trail-fox', kind: 'couple', adultCount: 2,
    childCount: 0, childAgeBands: [], travelModes: ['Van'], interests: ['Wędrówki', 'Fotografia'], animals: { animals: [] } },
    about: 'Weekend, kampervan i szlak za oknem. Chętnie poznamy innych miłośników gór.', activeTripCount: 0, trips: [] },
];
