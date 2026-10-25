import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { AppText, Button, EmptyState } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { useMessaging } from '@/features/messaging/messaging-context';
import { USE_DEMO_DATA } from '@/constants/app';
import { GroupCard } from './group-card';
import { GroupFiltersSheet } from './group-filters-sheet';
import { fetchPublicGroups } from './group-repository';
import { filterPublicGroups, groupDirectoryError, INITIAL_GROUP_FILTERS, type GroupPage } from './group-data';
import { DEMO_PUBLIC_GROUPS } from './group-demo';

export function GroupsDiscovery() {
  const [filters, setFilters] = useState(INITIAL_GROUP_FILTERS);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState<GroupPage>({ items: [], hasMore: false, cursor: null });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const loadingMore = useRef(false);
  const { state: mailbox } = useMessaging();
  const blocked = mailbox.blockedGroupIds;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setFilters(prev => prev.name === query ? prev : { ...prev, name: query }), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(async () => {
    const version = ++generation.current;
    loadingMore.current = false;
    setStatus('loading'); setError(null); setPage({ items: [], hasMore: false, cursor: null });
    try {
      const result = USE_DEMO_DATA
        ? { items: filterPublicGroups(DEMO_PUBLIC_GROUPS, filters), hasMore: false, cursor: null }
        : await fetchPublicGroups(filters);
      if (alive.current && version === generation.current) { setPage(result); setStatus('ready'); }
    } catch (e) { if (alive.current && version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
  }, [filters]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const more = async () => {
    if (!page.hasMore || !page.cursor || loadingMore.current) return;
    loadingMore.current = true;
    const version = generation.current;
    setStatus('loading'); setError(null);
    try {
      const next = await fetchPublicGroups(filters, page.cursor);
      if (alive.current && version === generation.current) {
        setPage(prev => ({ ...next, items: [...new Map([...prev.items, ...next.items].map(x => [x.group.id, x])).values()] })); setStatus('ready');
      }
    } catch (e) { if (alive.current && version === generation.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
    finally { if (version === generation.current) loadingMore.current = false; }
  };
  const items = page.items.filter(x => !blocked.includes(x.group.id));
  return <View style={{ gap: 14 }}>
    <ProfileTextField label="Szukaj po nazwie ekipy" value={query} onChangeText={setQuery} maxLength={80} />
    <Button label="Filtry ekip" icon="filters" variant="secondary" onPress={() => setShowFilters(true)} />
    <AppText variant="caption" color="textSecondary">{filters.groupKinds.length ? filters.groupKinds.map(k => ({ family: 'Rodziny z dziećmi', couple: 'Pary', solo: 'Osoby solo', friends: 'Grupy znajomych' })[k]).join(' · ') : 'Wszystkie rodzaje ekip'} · kolejność alfabetyczna</AppText>
    <AppText variant="heading" accessibilityRole="header">Ekipy{items.length ? ' · ' + items.length + (page.hasMore ? '+' : '') : ''}</AppText>
    {items.map(item => <GroupCard key={item.group.id} item={item} />)}
    <DataStatus status={status} error={error} label="Wczytywanie ekip" onRetry={() => { void (page.items.length ? more() : load()); }} />
    {status === 'ready' && !items.length ? <EmptyState title="Jeszcze nie ma tu ekip" description="Zmień filtry albo wróć później. W wyszukiwarce pojawiają się widoczne profile ekip."
      action={<Button label="Pokaż wszystkie ekipy" onPress={() => { setQuery(''); setFilters({ ...INITIAL_GROUP_FILTERS, groupKinds: [] }); }} />} /> : null}
    {page.hasMore && status !== 'loading' ? <Button label="Pokaż więcej ekip" variant="secondary" onPress={() => void more()} /> : null}
    <Button label="Ustaw widoczność mojej ekipy" variant="secondary" onPress={() => router.push('/group-visibility')} />
    {showFilters ? <GroupFiltersSheet filters={filters} onClose={() => setShowFilters(false)} onApply={next => { setFilters(next); setShowFilters(false); }} /> : null}
  </View>;
}
