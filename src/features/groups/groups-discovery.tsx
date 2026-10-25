import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { Button, EmptyState } from '@/components/ui/primitives';
import { SortOptionsSheet } from '@/components/ui/sort-options-sheet';
import { DiscoveryFilterBar, DiscoveryResultsHeader } from '@/features/discovery/discovery-controls';
import { useProfile } from '@/features/profile/profile-context';
import { DataStatus } from '@/components/ui/data-status';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { ANIMAL_OPTIONS } from '@/features/animals/animal-data';
import { useMessaging } from '@/features/messaging/messaging-context';
import { USE_DEMO_DATA } from '@/constants/app';
import { GroupCard } from './group-card';
import { GroupFiltersSheet } from './group-filters-sheet';
import { fetchPublicGroups } from './group-repository';
import { filterPublicGroups, sortPublicGroups, groupDirectoryError, INITIAL_GROUP_FILTERS, type GroupPage, type GroupSort } from './group-data';
import { DEMO_PUBLIC_GROUPS, withDemoGroupCompatibility } from './group-demo';

const SORT_OPTIONS: { value: GroupSort; label: string }[] = [
  { value: 'compatibility', label: 'Najwyższa zgodność' },
  { value: 'alphabetical', label: 'Alfabetycznie' },
];

export function GroupsDiscovery() {
  const [filters, setFilters] = useState(INITIAL_GROUP_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<GroupSort>('compatibility');
  const [showSort, setShowSort] = useState(false);
  const { profile } = useProfile();
  const [page, setPage] = useState<GroupPage>({ items: [], hasMore: false, cursor: null });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const loadingMore = useRef(false);
  const { state: mailbox } = useMessaging();
  const blocked = mailbox.blockedGroupIds;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    loadingMore.current = false;
    setStatus('loading'); setError(null); setPage({ items: [], hasMore: false, cursor: null });
    try {
      const result = USE_DEMO_DATA
        ? { items: sortPublicGroups(filterPublicGroups(DEMO_PUBLIC_GROUPS.map(item => withDemoGroupCompatibility(item, profile)), filters), sort), hasMore: false, cursor: null }
        : await fetchPublicGroups(filters, undefined, sort);
      if (alive.current && version === generation.current) { setPage(result); setStatus('ready'); }
    } catch (e) { if (alive.current && version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
  }, [filters, sort, profile]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const more = async () => {
    if (!page.hasMore || !page.cursor || loadingMore.current) return;
    loadingMore.current = true;
    const version = generation.current;
    setStatus('loading'); setError(null);
    try {
      const next = await fetchPublicGroups(filters, page.cursor, sort);
      if (alive.current && version === generation.current) {
        setPage(prev => ({ ...next, items: [...new Map([...prev.items, ...next.items].map(x => [x.group.id, x])).values()] })); setStatus('ready');
      }
    } catch (e) { if (alive.current && version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
    finally { if (version === generation.current) loadingMore.current = false; }
  };
  const items = page.items.filter(x => !blocked.includes(x.group.id));
  const activeCount = Number(Boolean(filters.name.trim())) + Number(Boolean(filters.groupKinds.length))
    + Number(Boolean(filters.childAgeBands.length)) + Number(Boolean(filters.travelModes.length))
    + Number(Boolean(filters.interests.length)) + Number(Boolean(filters.animalKinds.length)) + Number(filters.hasTrips);
  const summary = [
    filters.name.trim() ? 'Nazwa: ' + filters.name.trim() : '',
    GROUP_KIND_OPTIONS.filter(option => filters.groupKinds.includes(option.value)).map(option => option.label).join(', '),
    filters.childAgeBands.length ? 'Dzieci ' + filters.childAgeBands.join(', ') + ' lat' : '',
    filters.travelModes.map(mode => mode === 'Van' ? 'Kampervan' : mode).join(', '),
    filters.interests.join(', '),
    filters.animalKinds.length ? 'Zwierzęta: ' + ANIMAL_OPTIONS.filter(option => filters.animalKinds.includes(option.kind)).map(option => option.label).join(', ') : '',
    filters.hasTrips ? 'Z aktywnymi ogłoszeniami' : '',
  ].filter(Boolean).join(' · ');
  const reset = () => setFilters({ ...INITIAL_GROUP_FILTERS });
  return <View style={{ gap: 16 }}>
    <DiscoveryFilterBar activeCount={activeCount} summary={summary} placeholder="Nazwa, rodzaj ekipy i zainteresowania"
      filterLabel="Filtry ekip" filterHint="Wybierz nazwę, rodzaj ekipy, wiek dzieci i sposób podróżowania"
      clearLabel="Wyczyść filtry ekip" refreshLabel="Odśwież ekipy" onOpen={() => setShowFilters(true)} onClear={reset} onRefresh={() => void load()} />
    <DiscoveryResultsHeader title={'Ekipy · ' + items.length + (page.hasMore ? '+' : '')}
      sortLabel={sort === 'compatibility' ? 'Zgodność' : 'Alfabetycznie'}
      sortAccessibilityLabel={'Sortowanie ekip: ' + (sort === 'compatibility' ? 'Najwyższa zgodność' : 'Alfabetycznie')}
      onSort={() => setShowSort(true)} />
    {items.map(item => <GroupCard key={item.group.id} item={item} />)}
    <DataStatus status={status} error={error} label="Wczytywanie ekip" onRetry={() => { void (page.items.length ? more() : load()); }} />
    {status === 'ready' && !items.length ? <EmptyState title="Jeszcze nie ma tu ekip" description="Zmień filtry albo wróć później. W wyszukiwarce pojawiają się widoczne profile ekip."
      action={<Button label="Pokaż wszystkie ekipy" onPress={reset} />} /> : null}
    {page.hasMore && status !== 'loading' ? <Button label="Pokaż więcej ekip" variant="secondary" onPress={() => void more()} /> : null}
    <Button label="Ustaw widoczność mojej ekipy" variant="secondary" onPress={() => router.push('/group-visibility')} />
    {showFilters ? <GroupFiltersSheet filters={filters} onClose={() => setShowFilters(false)} onApply={next => { setFilters(next); setShowFilters(false); }} /> : null}
    {showSort ? <SortOptionsSheet title="Sortowanie ekip" value={sort} options={SORT_OPTIONS}
      caption="Przy sortowaniu po zgodności profile bez wystarczających danych są na końcu. Niska zgodność nie ukrywa ekipy."
      onClose={() => setShowSort(false)} onSelect={value => { setSort(value); setShowSort(false); }} /> : null}
  </View>;
}
