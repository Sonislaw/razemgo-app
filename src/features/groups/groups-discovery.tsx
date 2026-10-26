import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
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
import { filterPublicGroups, sortPublicGroups, groupDirectoryError, GROUP_SEARCH_PAGE_SIZE, INITIAL_GROUP_FILTERS, type GroupPage, type GroupSort, type RankedGroupCursor } from './group-data';
import { DEMO_PUBLIC_GROUPS, withDemoGroupCompatibility } from './group-demo';
import { isPresenceActive } from '@/features/presence/presence-context';
import { PRESENCE_POLL_MS } from '@/features/presence/presence-controller';
import { useFavorites } from '@/features/favorites/favorites-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useTheme } from '@/hooks/use-theme';

const EMPTY_PAGE: GroupPage = { items: [], totalCount: 0, hasMore: false, cursor: null };

const SORT_OPTIONS: { value: GroupSort; label: string }[] = [
  { value: 'compatibility', label: 'Najwyższa zgodność' },
  { value: 'alphabetical', label: 'Alfabetycznie' },
];

export function GroupsDiscovery() {
  const { groupFilters: filters, setGroupFilters: setFilters, groupSort: sort, setGroupSort: setSort } = useDiscovery();
  const theme = useTheme();
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const { profile } = useProfile();
  const { store: favoritesStore } = useFavorites();
  const [page, setPage] = useState<GroupPage>(EMPTY_PAGE);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const loadingMore = useRef(false);
  const currentPage = useRef(page);
  const failedRequest = useRef<'load' | 'more'>('load');
  const returnLoad = useRef<((quiet?: boolean) => Promise<void>) | null>(null);
  const publishPage = useCallback((next: GroupPage) => { currentPage.current = next; setPage(next); }, []);
  const { state: mailbox } = useMessaging();
  const blocked = mailbox.blockedGroupIds;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const fetchPage = useCallback(async (cursor?: RankedGroupCursor): Promise<GroupPage> => {
    if (!USE_DEMO_DATA) return fetchPublicGroups(filters, cursor, sort);
    const sorted = sortPublicGroups(filterPublicGroups(DEMO_PUBLIC_GROUPS.map(item => withDemoGroupCompatibility(item, profile)), filters, undefined, favoritesStore?.getSnapshot().groupIds), sort);
    const offset = cursor ? sorted.findIndex(item => item.group.id === cursor.id) + 1 : 0;
    const items = sorted.slice(offset, offset + GROUP_SEARCH_PAGE_SIZE);
    const last = items.at(-1);
    return { items, totalCount: sorted.length, hasMore: offset + items.length < sorted.length,
      cursor: last ? { id: last.group.id, name: last.group.name, score: last.compatibility?.score ?? null, sort } : null };
  }, [filters, sort, profile, favoritesStore]);
  const load = useCallback(async (quiet = false) => {
    if (quiet && loadingMore.current) return;
    const version = ++generation.current;
    loadingMore.current = true;
    failedRequest.current = 'load';
    const desiredCount = quiet ? Math.max(GROUP_SEARCH_PAGE_SIZE, currentPage.current.items.length) : GROUP_SEARCH_PAGE_SIZE;
    if (!quiet) { setStatus('loading'); setError(null); setIsLoadingMore(false); setHasLoaded(false); publishPage(EMPTY_PAGE); }
    try {
      let result = await fetchPage();
      while (result.hasMore && result.cursor && result.items.length < desiredCount && alive.current && version === generation.current) {
        const previous = result.cursor;
        const next = await fetchPage(previous);
        if (next.hasMore && (!next.cursor || JSON.stringify(next.cursor) === JSON.stringify(previous))) throw new Error('Invalid cursor progression');
        result = { ...next, items: [...new Map([...result.items, ...next.items].map(item => [item.group.id, item])).values()] };
      }
      if (alive.current && version === generation.current) { publishPage(result); setHasLoaded(true); setStatus('ready'); setError(null); }
    } catch (e) { if (alive.current && version === generation.current) { failedRequest.current = 'load'; setError(groupDirectoryError(e)); setStatus('error'); } }
    finally { if (version === generation.current) loadingMore.current = false; }
  }, [fetchPage, publishPage]);
  const preserveOnReturn = useCallback(() => { returnLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    const restore = returnLoad.current === load;
    returnLoad.current = null;
    void load(restore);
    const dynamic = filters.onlineOnly || filters.favoritesOnly;
    const refreshOnline = () => { if (dynamic && isPresenceActive()) void load(true); };
    const timer = dynamic ? setInterval(refreshOnline, PRESENCE_POLL_MS) : undefined;
    const foreground = dynamic ? AppState.addEventListener('change', refreshOnline) : null;
    if (dynamic && Platform.OS === 'web') document.addEventListener('visibilitychange', refreshOnline);
    let revision = favoritesStore?.getSnapshot().revision;
    const unsubscribe = favoritesStore?.subscribe(() => {
      const next = favoritesStore.getSnapshot().revision;
      if (next !== revision && filters.favoritesOnly) refreshOnline();
      revision = next;
    });
    return () => {
      generation.current++; loadingMore.current = false; setIsLoadingMore(false); clearInterval(timer); foreground?.remove();
      unsubscribe?.();
      if (dynamic && Platform.OS === 'web') document.removeEventListener('visibilitychange', refreshOnline);
    };
  }, [load, filters.onlineOnly, filters.favoritesOnly, favoritesStore]));
  const more = async () => {
    if (!page.hasMore || !page.cursor || loadingMore.current) return;
    loadingMore.current = true;
    const version = generation.current;
    setStatus('loading'); setError(null); setIsLoadingMore(true);
    try {
      const next = await fetchPage(page.cursor);
      if (next.hasMore && (!next.cursor || JSON.stringify(next.cursor) === JSON.stringify(page.cursor))) throw new Error('Invalid cursor progression');
      if (alive.current && version === generation.current) {
        publishPage({ ...next, items: [...new Map([...currentPage.current.items, ...next.items].map(x => [x.group.id, x])).values()] }); setHasLoaded(true); setStatus('ready');
      }
    } catch (e) { if (alive.current && version === generation.current) { failedRequest.current = 'more'; setError(groupDirectoryError(e)); setStatus('error'); } }
    finally { if (alive.current && version === generation.current) { loadingMore.current = false; setIsLoadingMore(false); } }
  };
  const items = page.items.filter(x => !blocked.includes(x.group.id));
  const activeCount = Number(Boolean(filters.name.trim())) + Number(Boolean(filters.groupKinds.length))
    + Number(Boolean(filters.childAgeBands.length)) + Number(Boolean(filters.travelModes.length))
    + Number(Boolean(filters.interests.length)) + Number(Boolean(filters.animalKinds.length)) + Number(filters.hasTrips) + Number(filters.onlineOnly) + Number(filters.favoritesOnly);
  const summary = [
    filters.name.trim() ? 'Nazwa: ' + filters.name.trim() : '',
    GROUP_KIND_OPTIONS.filter(option => filters.groupKinds.includes(option.value)).map(option => option.label).join(', '),
    filters.childAgeBands.length ? 'Dzieci ' + filters.childAgeBands.join(', ') + ' lat' : '',
    filters.travelModes.map(mode => mode === 'Van' ? 'Kampervan' : mode).join(', '),
    filters.interests.join(', '),
    filters.animalKinds.length ? 'Zwierzęta: ' + ANIMAL_OPTIONS.filter(option => filters.animalKinds.includes(option.kind)).map(option => option.label).join(', ') : '',
    filters.hasTrips ? 'Z aktywnymi ogłoszeniami' : '',
    filters.onlineOnly ? 'Tylko online' : '',
    filters.favoritesOnly ? 'Tylko ulubione' : '',
  ].filter(Boolean).join(' · ');
  const reset = () => setFilters({ ...INITIAL_GROUP_FILTERS });
  return <View style={{ gap: 16 }}>
    <DiscoveryFilterBar activeCount={activeCount} summary={summary} placeholder="Nazwa, rodzaj ekipy i zainteresowania"
      filterLabel="Filtry ekip" filterHint="Wybierz nazwę, rodzaj ekipy, wiek dzieci i sposób podróżowania"
      clearLabel="Wyczyść filtry ekip" refreshLabel="Odśwież ekipy" onOpen={() => setShowFilters(true)} onClear={reset} onRefresh={() => void load(true)} />
    <DiscoveryResultsHeader title={hasLoaded ? 'Ekipy · ' + page.totalCount : 'Ekipy'}
      sortLabel={sort === 'compatibility' ? 'Zgodność' : 'Alfabetycznie'}
      sortAccessibilityLabel={'Sortowanie ekip: ' + (sort === 'compatibility' ? 'Najwyższa zgodność' : 'Alfabetycznie')}
      onSort={() => setShowSort(true)} />
    {items.map(item => <GroupCard key={item.group.id} item={item} onNavigate={preserveOnReturn} />)}
    <DataStatus status={isLoadingMore ? 'ready' : status} error={error} label="Wczytywanie ekip" onRetry={() => { void (failedRequest.current === 'more' ? more() : load(true)); }} />
    {status === 'ready' && !items.length ? <EmptyState title="Jeszcze nie ma tu ekip" description="Zmień filtry albo wróć później. W wyszukiwarce pojawiają się widoczne profile ekip."
      action={<Button label="Pokaż wszystkie ekipy" onPress={reset} />} /> : null}
    {page.hasMore && (status !== 'loading' || isLoadingMore) ? <Button label={isLoadingMore ? 'Wczytywanie ekip' : 'Pokaż więcej ekip'} variant="secondary"
      disabled={isLoadingMore} leading={isLoadingMore ? <ActivityIndicator size="small" color={theme.primaryStrong} accessibilityLabel="Wczytywanie kolejnych ekip" /> : undefined}
      onPress={() => void more()} /> : null}
    <Button label="Ustaw widoczność mojej ekipy" variant="secondary" onPress={() => router.push('/group-visibility')} />
    {showFilters ? <GroupFiltersSheet filters={filters} onClose={() => setShowFilters(false)} onApply={next => { setFilters(next); setShowFilters(false); }} /> : null}
    {showSort ? <SortOptionsSheet title="Sortowanie ekip" value={sort} options={SORT_OPTIONS}
      caption="Przy sortowaniu po zgodności profile bez wystarczających danych są na końcu. Niska zgodność nie ukrywa ekipy."
      onClose={() => setShowSort(false)} onSelect={value => { setSort(value); setShowSort(false); }} /> : null}
  </View>;
}
