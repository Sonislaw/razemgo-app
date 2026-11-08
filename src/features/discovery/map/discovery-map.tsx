import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/auth-context';
import { DiscoveryFilterBar } from '../discovery-controls';
import { DiscoveryFiltersSheet } from '../discovery-filters-sheet';
import { useDiscovery } from '../discovery-context';
import { INITIAL_FILTERS } from '../filter-trips';
import { SavedFiltersButton } from '@/features/saved-filters/saved-filter-ui';
import { MapFrame } from './map-frame';
import { createTripMapStore } from './map-store';
import { fetchMapItems, fetchTripMap } from './map-repository';
import {
  initialMapCamera,
  sameMapQuery,
  type MapMemory,
  type MapMessage,
  type MapProposal,
  type MapQuery,
} from './map-data';
import type { MapFit } from './map-frame.types';
import { MapSelection } from './map-selection';
import { MapPreview } from './map-preview';
import { useFavoriteIds } from '@/features/favorites/favorites-context';
import { useMessagingSelector } from '@/features/messaging/messaging-context';
import { resolvePlaceGeometry } from '@/features/trips/places-repository';
import { placeSearchRadiusKm } from '@/features/trips/place-data';
import {
  hasResettableMapFilters,
  plannedMapFilters,
} from '../trip-discovery-state';

export function DiscoveryMap({
  memory,
  onRemember,
  summary,
  activeCount,
  notice,
  onClose,
  onNavigate,
}: {
  memory: MapMemory;
  onRemember: (value: MapMemory) => void;
  summary: string;
  activeCount: number;
  notice?: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const theme = useTheme(),
    { session } = useAuth(),
    userId = session?.user.id ?? '';
  const { filters, setFilters, activeTripSet, applySavedFilterSet } =
    useDiscovery();
  const favorites = useFavoriteIds('trip', !!filters.favoritesOnly);
  const blocked = useMessagingSelector((value) => value.state.blockedGroupIds);
  const memoryRef = useRef(memory);
  const [camera] = useState(() => initialMapCamera(filters, memory));
  const previousAccess = useRef({ favorites, blocked });
  const [latest, setLatest] = useState<MapQuery>();
  const [loaded, setLoaded] = useState(false),
    [mapFailed, setMapFailed] = useState(false),
    [tilesFailed, setTilesFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [fit, setFit] = useState<MapFit | null>(null),
    fitVersion = useRef(0);
  const placeKey=filters.locationId??filters.location.trim();
  const lastPlace=useRef(memory.locationKey);
  const selectedPlace=filters.place;
  useEffect(()=>{
    if(!selectedPlace){lastPlace.current=placeKey;return;}
    if(lastPlace.current===placeKey)return;
    lastPlace.current=placeKey;
    const controller=new AbortController();
    const geometry=selectedPlace.googlePlaceId ? resolvePlaceGeometry(selectedPlace.googlePlaceId,controller.signal) :
      Promise.resolve(selectedPlace.latitude!=null&&selectedPlace.longitude!=null?{latitude:selectedPlace.latitude,longitude:selectedPlace.longitude,bounds:undefined}:undefined);
    void geometry.then(point=>{
      if(!point||controller.signal.aborted)return;
      const delta=placeSearchRadiusKm(selectedPlace.kind)/111;
      const bounds=point.bounds&&['country','region'].includes(selectedPlace.kind)?point.bounds:{south:Math.max(-85,point.latitude-delta),north:Math.min(85,point.latitude+delta),
        west:Math.max(-180,point.longitude-delta/Math.max(.1,Math.cos(point.latitude*Math.PI/180))),east:Math.min(180,point.longitude+delta/Math.max(.1,Math.cos(point.latitude*Math.PI/180)))};
      setFit({id:++fitVersion.current,bounds});
    }).catch(()=>undefined);
    return ()=>controller.abort();
  },[selectedPlace,placeKey]);
  const [selection, setSelection] = useState<{
      key: string;
      count: number;
    } | null>(null),
    [selected, setSelected] = useState<MapProposal | null>(null);
  const store = useMemo(
    () =>
      createTripMapStore((query, signal) =>
        fetchTripMap(userId, filters, query, signal),
      ),
    [userId, filters],
  );
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const { data } = state;
  const choose = useCallback((item: MapProposal) => {
    setSelected(item);
    setSelection(null);
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (selection) setSelection(null);
          else if (selected) setSelected(null);
          else onClose();
          return true;
        },
      );
      return () => subscription.remove();
    }, [selection, selected, onClose]),
  );
  useFocusEffect(
    useCallback(() => {
      store.activate();
      const refresh = () => {
        const query = store.getSnapshot().query;
        if (
          query &&
          (Platform.OS !== 'web' || document.visibilityState === 'visible')
        )
          void store.load(query, true);
      };
      refresh();
      const timer = setInterval(refresh, 45000);
      const native = AppState.addEventListener('change', (status) => {
        if (status === 'active') refresh();
      });
      if (Platform.OS === 'web')
        document.addEventListener('visibilitychange', refresh);
      return () => {
        clearInterval(timer);
        native.remove();
        if (Platform.OS === 'web')
          document.removeEventListener('visibilitychange', refresh);
        store.stop();
      };
    }, [store]),
  );
  useEffect(() => {
    const changed =
      previousAccess.current.favorites !== favorites ||
      previousAccess.current.blocked !== blocked;
    previousAccess.current = { favorites, blocked };
    const query = store.getSnapshot().query;
    if (changed && query) void store.load(query, true);
  }, [favorites, blocked, store]);
  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(() => setMapFailed(true), 15000);
    return () => clearTimeout(timeout);
  }, [loaded, attempt]);
  const selectedId = selected?.trip.id;
  useEffect(() => {
    if (!data || !selectedId) return;
    let alive = true;
    const controller = new AbortController();
    void fetchMapItems(
      userId,
      filters,
      data.query,
      'trip:' + selectedId,
      undefined,
      controller.signal,
    )
      .then((page) => {
        if (alive) setSelected(page.items[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      controller.abort();
    };
  }, [data, selectedId, userId, filters]);
  const search = useCallback(
    (query: MapQuery) => {
      setSelected(null);
      setSelection(null);
      void store.load(query, true);
    },
    [store],
  );
  const waitingForSearch = !!latest && !sameMapQuery(latest, state.query);
  useFocusEffect(
    useCallback(() => {
      if (
        !latest ||
        mapFailed ||
        sameMapQuery(latest, store.getSnapshot().query)
      )
        return;
      const timeout = setTimeout(() => search(latest), 450);
      return () => clearTimeout(timeout);
    }, [latest, mapFailed, search, store]),
  );
  const receive = (message: MapMessage) => {
    if (message.type === 'tiles') {
      setTilesFailed(!message.ok);
      return;
    }
    if (message.type === 'viewport') {
      setLoaded(true);
      setMapFailed(false);
      setLatest(message.query);
      memoryRef.current = {
        ...memoryRef.current,
        camera: message.camera,
        locationKey: filters.locationId ?? filters.location.trim(),
      };
      onRemember(memoryRef.current);
      if (message.reason !== 'pan' || !store.getSnapshot().query)
        search(message.query);
      return;
    }
    if (
      message.type === 'select' &&
      data &&
      !state.loading &&
      !waitingForSearch
    ) {
      const point = data.points.find((point) => point.key === message.key);
      if (!point) return;
      const currentZoom = memoryRef.current.camera?.zoom ?? camera.zoom;
      if (
        point.count > 1 &&
        currentZoom < 15 &&
        (point.north - point.south > 0.00001 ||
          point.east - point.west > 0.00001)
      )
        setFit({ id: ++fitVersion.current, bounds: point });
      else setSelection({ key: point.key, count: point.count });
    }
  };
  return (
    <SafeAreaView
      edges={['top']}
      testID="discovery-map-screen"
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        { backgroundColor: theme.background },
      ]}
    >
      <View style={styles.tools}>
        <View style={layout.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Wróć do listy wyjazdów"
            onPress={onClose}
            style={styles.back}
          >
            <AppText variant="label" style={{ color: theme.primaryStrong }}>
              ‹ Lista
            </AppText>
          </Pressable>
          <AppText variant="heading" style={{ flex: 1, fontSize: 18 }}>
            Mapa wyjazdów
          </AppText>
          <SavedFiltersButton kind="trips" onApply={applySavedFilterSet} />
        </View>
        <DiscoveryFilterBar
          activeCount={activeCount}
          showClear={hasResettableMapFilters(filters)}
          summary={summary}
          savedSetName={activeTripSet?.name}
          notice={notice}
          placeholder="Termin, miejsce i klimat"
          filterHint="Wybierz kryteria wyjazdów Mam plan widocznych na mapie"
          onClear={() => setFilters(plannedMapFilters(INITIAL_FILTERS))}
          renderFilters={(close) => (
            <DiscoveryFiltersSheet
              plannedOnly
              initialFilters={filters}
              onClose={close}
              onApply={(value) => {
                setFilters(value);
                close();
              }}
              onSaved={(item) => {
                applySavedFilterSet(item);
                close();
              }}
            />
          )}
        />
        <View style={[layout.row, { minHeight: 36 }]}>
          <AppText
            variant="caption"
            color="textSecondary"
            style={{ flex: 1 }}
            accessibilityLiveRegion="polite"
          >
            {state.loading || waitingForSearch
              ? 'Wczytywanie wyników…'
              : data
                ? 'Plany w obszarze: ' + data.plannedCount
                : 'Wybierz obszar na mapie'}
          </AppText>
        </View>
      </View>
      <View style={styles.canvas}>
        <MapFrame
          key={attempt}
          camera={camera}
          points={data?.points ?? []}
          fit={fit}
          onMessage={receive}
          onError={() => setMapFailed(true)}
        />
        {(!loaded || state.loading || waitingForSearch) && !mapFailed ? (
          <View
            pointerEvents="none"
            style={[
              styles.spinner,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ActivityIndicator
              color={theme.primaryStrong}
              accessibilityLabel="Wczytywanie mapy i wyjazdów"
            />
          </View>
        ) : null}
        {mapFailed ? (
          <View
            style={[
              styles.failure,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <AppText variant="label">Nie udało się wczytać mapy</AppText>
            <Button
              label="Wczytaj mapę ponownie"
              variant="secondary"
              onPress={() => {
                setLoaded(false);
                setMapFailed(false);
                setAttempt((value) => value + 1);
              }}
            />
            <Button
              label="Wróć do listy wyjazdów"
              variant="secondary"
              onPress={onClose}
            />
          </View>
        ) : null}
        {state.error ? (
          <View
            style={[
              styles.failure,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <AppText accessibilityRole="alert" variant="caption">
              {state.error}
            </AppText>
            <Button
              label="Pobierz wyjazdy ponownie"
              variant="secondary"
              onPress={() => void store.retry()}
            />
          </View>
        ) : null}
        {tilesFailed && !mapFailed ? (
          <View
            style={[
              styles.tileNotice,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <AppText variant="caption">
              Podkład mapy jest chwilowo niedostępny.
            </AppText>
          </View>
        ) : null}
        <View pointerEvents="box-none" style={styles.bottom}>
          {data?.unmappedCount ? (
            <View
              style={[
                styles.note,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <AppText variant="caption">
                Bez pozycji na mapie: {data.unmappedCount}. Te wyjazdy
                znajdziesz na liście.
              </AppText>
            </View>
          ) : null}
          {data &&
          !data.plannedCount &&
          !state.loading &&
          !waitingForSearch &&
          !selected ? (
            <View
              style={[
                styles.note,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <AppText variant="label">Brak wyjazdów w tym obszarze</AppText>
              <AppText variant="caption" color="textSecondary">
                Przesuń mapę, oddal ją lub zmień filtry.
              </AppText>
            </View>
          ) : null}
          {selected ? (
            <MapPreview
              item={selected}
              onClose={() => setSelected(null)}
              onNavigate={onNavigate}
            />
          ) : null}
        </View>
      </View>
      {selection && data ? (
        <MapSelection
          userId={userId}
          filters={filters}
          query={data.query}
          selection={selection}
          onChoose={choose}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { zIndex: 10 },
  tools: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 6 },
  back: { minHeight: 44, justifyContent: 'center', paddingRight: 4 },
  canvas: { flex: 1, minHeight: 180 },
  spinner: {
    position: 'absolute',
    top: 12,
    left: 12,
    padding: 10,
    borderRadius: 24,
  },
  failure: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    padding: 16,
    gap: 12,
    borderRadius: 20,
  },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 32, gap: 8 },
  note: { padding: 12, borderRadius: 18, gap: 4 },
  tileNotice: {
    position: 'absolute',
    top: 66,
    left: 12,
    right: 60,
    padding: 8,
    borderRadius: 12,
  },
});
