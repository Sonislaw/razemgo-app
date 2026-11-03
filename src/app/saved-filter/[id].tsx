import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { useSavedFilters } from '@/features/saved-filters/saved-filter-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { createRequestKey } from '@/lib/request-key';

export default function OpenSavedFilterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store, status, error } = useSavedFilters();
  const { applySavedFilterSet } = useDiscovery();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const opened = useRef(false);
  useEffect(() => {
    if (!store) return;
    let alive = true;
    void store.refresh().then(() => {
      if (!alive || opened.current) return;
      const snapshot = store.getSnapshot();
      if (snapshot.error || snapshot.status !== 'ready') { setLoaded(true); return; }
      const item = snapshot.items.find(item => item.id === id && item.kind === 'trips');
      if (item) {
        opened.current = true; applySavedFilterSet(item);
        router.replace({ pathname: '/explore', params: { openTrips: createRequestKey() } });
      } else setLoaded(true);
    });
    return () => { alive = false; };
  }, [id, store, attempt, applySavedFilterSet]);
  return <Screen><Card>
    <AppText variant="heading">Zapisane filtry</AppText>
    <DataStatus status={error ? 'error' : !loaded ? 'loading' : status} error={error}
      label="Wczytywanie zestawu filtrów" onRetry={() => { setLoaded(false); setAttempt(value => value + 1); }} />
    {loaded && !error && status === 'ready' ? <AppText>Ten zestaw filtrów jest już niedostępny.</AppText> : null}
    <Button label="Przejdź do Odkrywaj" variant="secondary" onPress={() => router.replace('/explore')} />
  </Card></Screen>;
}
