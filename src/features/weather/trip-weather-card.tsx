import {useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, View} from 'react-native';
import {openURL} from 'expo-linking';
import {AppText, Button, Card, SectionTitle, layout} from '@/components/ui/primitives';
import {BottomSheet} from '@/components/ui/bottom-sheet';
import {Icon, type IconName} from '@/components/ui/icon';
import {useTheme} from '@/hooks/use-theme';
import {getTripLocation} from '@/features/discovery/filter-trips';
import {useLivePlace} from '@/features/trips/use-live-place';
import type {TripPlan} from '@/types/travel';
import {useTripWeather} from './use-trip-weather';
import type {WeatherDay, WeatherMessageState} from '../../../shared/trip-weather';

const messages: Record<WeatherMessageState, string> = {
  future: 'Prognoza będzie dostępna bliżej wyjazdu — na najbliższe 10 dni.',
  past: 'Ten wyjazd już się zakończył. Prognoza nie jest już dostępna.',
  needs_dates: 'Uzupełnij termin wyjazdu, aby zobaczyć prognozę.',
  needs_location: 'Do prognozy potrzebna jest lokalizacja miejsca. Uzupełnij ją w wyjeździe.',
  area: 'Prognozę pokażemy po wybraniu konkretnej miejscowości. Dla całego regionu lub kraju pogoda może się znacznie różnić.',
  unavailable: 'Prognoza dla tego terminu lub miejsca nie jest obecnie dostępna.',
};
const metric = (value: number | null, unit: string) => value === null ? '—' : Math.round(value) + unit;
function weatherIcon(condition: string): IconName {
  if (/THUNDER|STORM/.test(condition)) return 'thunderstorm';
  if (/SNOW|SLEET|ICE/.test(condition)) return 'snow';
  if (/RAIN|DRIZZLE|SHOWER/.test(condition)) return 'rain';
  if (/CLOUD|FOG|HAZE/.test(condition)) return 'cloud';
  return condition === 'CLEAR' || condition === 'MOSTLY_CLEAR' ? 'sun' : 'cloud';
}
export function TripWeatherCard({trip}: {trip: TripPlan}) {
  // Destination/date edits discard the previous location's in-flight response.
  const place = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  return <WeatherContent key={JSON.stringify([trip.id, trip.startDate, trip.endDate, place])} trip={trip} />;
}
function WeatherContent({trip}: {trip: TripPlan}) {
  const theme = useTheme();
  const {data, error, retry} = useTripWeather(trip);
  const originalPlace = trip.mode === 'planned' ? trip.destination : trip.travelArea;
  const place = useLivePlace(originalPlace.place);
  // Stored Google names contain the search text; wait for fresh Place Details.
  const locationLabel = place?.source === 'google' ? (place.resolvedAt ? place.name : null) : getTripLocation(trip);
  const [alertsOpen, setAlertsOpen] = useState(false), [linkError, setLinkError] = useState(false);
  const forecast = data?.state === 'forecast' ? data : null;
  return <Card testID="trip-weather">
    <View style={layout.row}><Icon name="sun" size={22} /><SectionTitle title="Pogoda na wyjazd" /></View>
    {error ? <>
      <AppText variant="caption" color="textSecondary">Nie udało się pobrać pogody. Spróbuj ponownie za chwilę.</AppText>
      <Button label="Wczytaj pogodę ponownie" variant="secondary" onPress={retry} />
    </> : !data ? <View style={layout.row}><ActivityIndicator color={theme.primaryStrong} /><AppText variant="caption" color="textSecondary">Wczytywanie prognozy…</AppText></View>
      : !forecast ? <AppText variant="caption" color="textSecondary">{messages[(data as {state: WeatherMessageState}).state]}</AppText> : <>
        {locationLabel ? <AppText variant="caption" color="textSecondary">{locationLabel}</AppText> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Prognoza dzienna na wyjazd" contentContainerStyle={styles.days}>
          {forecast.days.map(day => <Day key={day.date} day={day} />)}
        </ScrollView>
        {forecast.partial ? <AppText variant="caption" color="textSecondary">To prognoza na dostępne dni wyjazdu. Pozostałe pojawią się bliżej terminu.</AppText> : null}
        {forecast.alerts.length ? <Button label={'Ostrzeżenia pogodowe · ' + forecast.alerts.length} icon="warning" variant="secondary" onPress={() => setAlertsOpen(true)} /> : null}
        {!forecast.alertsAvailable ? <AppText variant="caption" color="textSecondary">Nie udało się sprawdzić wszystkich ostrzeżeń pogodowych.</AppText> : null}
        <AppText variant="caption" color="textSecondary">Google Maps · Aktualizacja {new Intl.DateTimeFormat('pl-PL', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: forecast.timeZone}).format(new Date(forecast.fetchedAt))} (czas miejsca)</AppText>
        {forecast.timeZone === 'Asia/Tokyo' ? <AppText variant="caption" color="textSecondary">気象データ提供：株式会社ウェザーニューズ</AppText> : null}
        {forecast.timeZone === 'Asia/Seoul' ? <AppText variant="caption" color="textSecondary">날씨 정보 제공: 웨더뉴스</AppText> : null}
      </>}
    {alertsOpen && forecast ? <BottomSheet title="Ostrzeżenia pogodowe" onClose={() => setAlertsOpen(false)}>
      <AppText variant="caption" color="textSecondary">Aktualnie opublikowane ostrzeżenia, których czas obowiązywania pokrywa się z terminem wyjazdu.</AppText>
      {forecast.alerts.map(alert => <View key={alert.id} style={[styles.alert, {borderColor: theme.border}]}>
        <View style={layout.row}><Icon name="warning" /><AppText variant="label" style={{flex: 1}}>{alert.title}</AppText></View>
        <AppText variant="caption" color="textSecondary">{new Intl.DateTimeFormat('pl-PL', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: forecast.timeZone}).format(new Date(alert.startTime))} – {new Intl.DateTimeFormat('pl-PL', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: forecast.timeZone}).format(new Date(alert.endTime))} (czas miejsca)</AppText>
        {alert.description ? <AppText color="textSecondary">{alert.description}</AppText> : null}
        {alert.source ? <AppText variant="caption" color="textSecondary">Źródło: {alert.source}</AppText> : null}
        {alert.sourceUrl ? <Button label="Sprawdź komunikat źródłowy" variant="secondary" icon="arrow" onPress={() => {setLinkError(false); void openURL(alert.sourceUrl!).catch(() => setLinkError(true));}} /> : null}
      </View>)}
      {linkError ? <AppText accessibilityRole="alert">Nie udało się otworzyć komunikatu. Spróbuj ponownie.</AppText> : null}
    </BottomSheet> : null}
  </Card>;
}
function Day({day}: {day: WeatherDay}) {
  const theme = useTheme();
  const date = new Intl.DateTimeFormat('pl-PL', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(day.date + 'T12:00:00Z'));
  return <View style={[styles.day, {backgroundColor: theme.background, borderColor: theme.border}]}>
    <AppText variant="caption" style={{fontWeight: '600'}}>{date}</AppText>
    <View style={layout.row}><Icon name={weatherIcon(day.condition)} size={24} /><AppText variant="label">{metric(day.maxC, '°')}</AppText><AppText variant="caption" color="textSecondary">/ {metric(day.minC, '°')}</AppText></View>
    <AppText variant="caption" color="textSecondary" numberOfLines={2} style={{minHeight: 36}}>{day.description || 'Brak opisu warunków'}</AppText>
    <AppText variant="caption" color="textSecondary">Opady: {metric(day.precipitationPercent, '%')}{day.precipitationMm === null ? '' : ' · ' + Math.round(day.precipitationMm * 10) / 10 + ' mm'}</AppText>
    <AppText variant="caption" color="textSecondary">Wiatr: {metric(day.windKmh, ' km/h')}</AppText>
    {day.gustKmh !== null ? <AppText variant="caption" color="textSecondary">Porywy: {metric(day.gustKmh, ' km/h')}</AppText> : null}
  </View>;
}
const styles = StyleSheet.create({
  days: {gap: 8},
  day: {width: 152, padding: 10, gap: 6, borderRadius: 14, borderWidth: 1},
  alert: {gap: 10, borderWidth: 1, borderRadius: 14, padding: 14},
});
