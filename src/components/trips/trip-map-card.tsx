import { openURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  ScreenFullWidth,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import {
  areaViewport,
  getTripMapTarget,
  googleMapsEmbedUrl,
  googleMapsSearchUrl,
  type TripMapTarget,
} from '@/features/trips/trip-map-data';
import { GoogleMapFrame } from './google-map-frame';

export function TripMapCard({ trip }: { trip: TripPlan }) {
  const target = getTripMapTarget(trip);
  return target ? (
    <TripMapContent key={JSON.stringify(target)} target={target} />
  ) : null;
}

function TripMapContent({ target }: { target: TripMapTarget }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);
  const [openError, setOpenError] = useState(false);
  const approximate = target.kind === 'area';
  const uri = googleMapsEmbedUrl(target, width);
  const diameter = target.area ? areaViewport(target.area, width).diameter : 0;
  useEffect(() => {
    if (!width || status !== 'loading') return;
    const timeout = setTimeout(() => setStatus('error'), 20000);
    return () => clearTimeout(timeout);
  }, [width, uri, status, attempt]);
  return (
    <View testID="trip-map-card" style={layout.stack}>
      <SectionTitle title="Lokalizacja wyjazdu" />
      <AppText variant="label">{target.label}</AppText>
      <AppText variant="caption" color="textSecondary">
        {approximate
          ? 'Przybliżony obszar wyjazdu. Dokładne miejsce spotkania jest jeszcze do ustalenia.'
          : 'Wyszukiwanie kempingu lub adresu w Google Maps.'}
      </AppText>
      <ScreenFullWidth>
        <View
          testID="trip-google-map"
          onLayout={(event) =>
            setWidth(Math.round(event.nativeEvent.layout.width))
          }
          style={[styles.map, { backgroundColor: theme.muted }]}
        >
          {width && status !== 'error' ? (
            <GoogleMapFrame
              key={uri + ':' + attempt}
              uri={uri}
              title={
                approximate
                  ? 'Mapa okolicy: ' + target.label
                  : 'Mapa kempingu: ' + target.label
              }
              previewOnly={approximate}
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('error')}
            />
          ) : null}
          {approximate && target.area && status === 'ready' ? (
            <View pointerEvents="none" style={styles.areaLayer}>
              <View
                testID="trip-map-approximate-area"
                accessible
                accessibilityLabel="Orientacyjny obszar wyjazdu"
                style={{
                  width: diameter,
                  height: diameter,
                  borderRadius: diameter / 2,
                  borderWidth: 2,
                  borderColor: theme.primaryStrong,
                  backgroundColor: theme.primaryStrong + '26',
                }}
              />
            </View>
          ) : null}
          {status === 'loading' ? (
            <View
              pointerEvents="none"
              style={[styles.state, { backgroundColor: theme.muted }]}
            >
              <ActivityIndicator color={theme.primaryStrong} />
              <AppText variant="caption" color="textSecondary">
                Wczytywanie mapy…
              </AppText>
            </View>
          ) : status === 'error' ? (
            <View style={styles.state}>
              <AppText variant="label">Nie udało się wczytać mapy</AppText>
              <AppText
                variant="caption"
                color="textSecondary"
                style={styles.center}
              >
                Sprawdź połączenie lub otwórz lokalizację bezpośrednio w Google
                Maps.
              </AppText>
              <Button
                label="Wczytaj mapę ponownie"
                variant="secondary"
                onPress={() => {
                  setAttempt((value) => value + 1);
                  setStatus('loading');
                }}
              />
            </View>
          ) : null}
        </View>
      </ScreenFullWidth>
      {approximate && target.area ? (
        <AppText variant="caption" color="textSecondary">
          Zaznaczony krąg wskazuje orientacyjną okolicę, a nie granice
          miejscowości lub regionu.
        </AppText>
      ) : null}
      <Button
        label="Otwórz w Google Maps"
        icon="arrow"
        variant="secondary"
        onPress={() => {
          setOpenError(false);
          void openURL(googleMapsSearchUrl(target)).catch(() =>
            setOpenError(true),
          );
        }}
      />
      {openError ? (
        <AppText variant="caption" accessibilityRole="alert">
          Nie udało się otworzyć Google Maps. Spróbuj ponownie.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 260,
    width: '100%',
    overflow: 'hidden',
  },
  areaLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  center: { textAlign: 'center' },
});
