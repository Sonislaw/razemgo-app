import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type MapMarker } from 'react-native-maps';
import { travelModeLabel } from '@/features/profile/profile-options';
import type { MapPoint } from './map-data';
import type { MapFrameProps } from './map-frame.types';

const images: Record<string, ImageSourcePropType> = {
  Kamper: require('../../../../assets/images/travel-modes/motorhome.webp'),
  Van: require('../../../../assets/images/travel-modes/van.webp'),
  Przyczepa: require('../../../../assets/images/travel-modes/caravan.webp'),
  Samochód: require('../../../../assets/images/travel-modes/car.webp'),
  Namiot: require('../../../../assets/images/travel-modes/tent.webp'),
};

const TripMarker = memo(function TripMarker({
  point, onSelect,
}: { point: MapPoint; onSelect: (key: string) => void }) {
  const marker = useRef<MapMarker>(null);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>marker.current?.redraw());
    return ()=>cancelAnimationFrame(frame);
  },[point.count,point.travelMode]);
  const image = point.count === 1 && point.travelMode ? images[point.travelMode] : undefined;
  const label = point.count > 1 ? 'Wyjazdy: ' + point.count :
    point.label + (point.travelMode ? ' · ' + travelModeLabel(point.travelMode) : '');
  return (
    <Marker ref={marker} identifier={point.key} coordinate={point}
      anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}
      accessibilityLabel={label}
      onPress={event => { event.stopPropagation(); onSelect(point.key); }}>
      <View collapsable={false} style={[styles.marker, point.count === 1 && styles.single]}>
        {image ? <Image source={image} style={styles.image} fadeDuration={0}
          onLoad={() => marker.current?.redraw()} /> :
          <Text style={[styles.count, point.count === 1 && styles.dot]}>{point.count > 1 ? point.count : '●'}</Text>}
      </View>
    </Marker>
  );
});

export function MapFrame({
  camera, points, fit, picker, selectedPoint, area, onMessage, onError,
}: MapFrameProps) {
  const map = useRef<MapView>(null);
  const mounted = useRef(true), loaded = useRef(false), sequence = useRef(0);
  const reason = useRef<'pan' | 'cluster'>('pan');
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onMessage, onError });
  useEffect(() => { callbacks.current = { onMessage, onError }; }, [onMessage, onError]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const publish = useCallback(async (cause: 'initial' | 'pan' | 'cluster') => {
    const version = ++sequence.current;
    try {
      if (!map.current) return;
      const [bounds, current] = await Promise.all([map.current.getMapBoundaries(), map.current.getCamera()]);
      if (!mounted.current || version !== sequence.current) return;
      const west = bounds.southWest.longitude, east = bounds.northEast.longitude;
      const viewport = {
        south: Math.max(-85, bounds.southWest.latitude),
        north: Math.min(85, bounds.northEast.latitude),
        west: west < east ? west : -180,
        east: west < east ? east : 180,
      };
      if (viewport.south >= viewport.north || viewport.west >= viewport.east) return;
      callbacks.current.onMessage({
        type: 'viewport', reason: cause,
        camera: {
          latitude: Math.max(-85, Math.min(85, current.center.latitude)),
          longitude: current.center.longitude,
          zoom: Math.max(2, Math.min(18, Math.round(current.zoom ?? camera.zoom))),
        },
        query: { bounds: viewport, zoom: Math.max(2, Math.min(18, Math.round(current.zoom ?? camera.zoom))) },
      });
    } catch {
      // A map can be torn down while the native camera request is in flight.
      if (mounted.current && version === sequence.current) callbacks.current.onError();
    }
  }, [camera.zoom]);
  useEffect(() => {
    if (!ready || !fit) return;
    reason.current = 'cluster';
    map.current?.fitToCoordinates([
      { latitude: fit.bounds.south, longitude: fit.bounds.west },
      { latitude: fit.bounds.north, longitude: fit.bounds.east },
    ], { edgePadding: { top: 55, right: 55, bottom: 55, left: 55 }, animated: true });
  }, [fit, ready]);
  const select = useCallback((key: string) => callbacks.current.onMessage({ type: 'select', key }), []);
  const pin = (coordinate: { latitude: number; longitude: number }) => {
    if (Math.abs(coordinate.latitude) <= 85) callbacks.current.onMessage({ type: 'pin', ...coordinate });
  };
  return (
    <MapView ref={map} testID="discovery-map-frame" accessibilityLabel="Mapa wyjazdów"
      style={styles.map} provider={PROVIDER_GOOGLE}
      initialCamera={{ center: camera, zoom: camera.zoom, pitch: 0, heading: 0, altitude: 0 }}
      minZoomLevel={2} maxZoomLevel={18}
      showsUserLocation={false} showsMyLocationButton={false} showsCompass={false}
      toolbarEnabled={false} moveOnMarkerPress={false} rotateEnabled={false} pitchEnabled={false}
      onMapReady={() => setReady(true)}
      onMapLoaded={() => {
        const first = !loaded.current;
        loaded.current = true;
        callbacks.current.onMessage({ type: 'tiles', ok: true });
        if (first) void publish('initial');
      }}
      onRegionChangeStart={(_region, details) => { if (details.isGesture) reason.current = 'pan'; }}
      onRegionChangeComplete={() => {
        if (!loaded.current) return;
        const cause = reason.current; reason.current = 'pan';
        void publish(cause);
      }}
      onPress={event => { if (picker) pin(event.nativeEvent.coordinate); }}>
      {points.map(point => <TripMarker key={point.key} point={point} onSelect={select} />)}
      {area ? <Circle center={area} radius={area.radiusMeters} fillColor="#08699626" strokeColor="#086996" strokeWidth={2}/> : null}
      {selectedPoint ? <Marker coordinate={selectedPoint} draggable={!!picker}
        accessibilityLabel="Wybrane miejsce" onDragEnd={event => pin(event.nativeEvent.coordinate)} /> : null}
    </MapView>
  );
}
const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#086996', alignItems: 'center', justifyContent: 'center' },
  single: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, backgroundColor: '#EAF5F8' },
  image: { width: 42, height: 42, borderRadius: 21, resizeMode: 'contain' },
  count: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dot: { color: '#086996' },
});
