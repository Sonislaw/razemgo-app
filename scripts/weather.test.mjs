import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseGoogleForecast, parseGoogleAlerts, selectTripWeather, weatherAvailability} from '../shared/trip-weather.ts';

const part = (p, mm, wind, gust) => ({weatherCondition: {type: 'RAIN', description: {text: 'Deszcz'}},
  precipitation: {probability: {percent: p}, qpf: {quantity: mm}}, wind: {speed: {value: wind}, gust: {value: gust}}});
const raw = (zone = 'Europe/Warsaw') => ({timeZone: {id: zone}, forecastDays: [10, 11, 12].map(day => ({
  displayDate: {year: 2026, month: 11, day}, minTemperature: {degrees: 2}, maxTemperature: {degrees: 9},
  daytimeForecast: part(50, 2, 15, 30), nighttimeForecast: part(70, 3, 20, 40),
}))});
const alert = (patch = {}) => ({alertId: 'warning', alertTitle: {text: 'Silny wiatr'}, severity: 'SEVERE',
  startTime: '2026-11-11T12:00:00Z', expirationTime: '2026-11-12T12:00:00Z', description: 'Porywy wiatru.',
  dataSource: {name: 'Meteoalarm', authorityUri: 'https://meteoalarm.org/'}, ...patch});
test('weather uses real civil dates, day/night totals, peak probability and wind without replacing missing values by zero', () => {
  const parsed = parseGoogleForecast(raw());
  assert.equal(parsed.timeZone, 'Europe/Warsaw');
  assert.deepEqual(parsed.days[0], {date: '2026-11-10', condition: 'RAIN', description: 'Deszcz', minC: 2, maxC: 9,
    precipitationPercent: 70, precipitationMm: 5, windKmh: 20, gustKmh: 40});
  const missing = raw(); delete missing.forecastDays[0].daytimeForecast; delete missing.forecastDays[0].nighttimeForecast;
  assert.equal(parseGoogleForecast(missing).days[0].precipitationPercent, null);
  assert.equal(parseGoogleForecast(missing).days[0].windKmh, null);
  const full = raw('Asia/Tokyo'); full.forecastDays[0].fullDayForecast = part(30, 4, 10, 22);
  assert.equal(parseGoogleForecast(full).days[0].precipitationMm, 4);
  assert.equal(parseGoogleForecast(full).days[0].windKmh, 10);
  for (const input of [{}, {...raw(), timeZone: {id: 'wrong'}}, {...raw(), forecastDays: [...raw().forecastDays, raw().forecastDays[0]]}]) assert.throws(() => parseGoogleForecast(input));
});
test('weather waits for future dates, handles incomplete/finished trips, and includes return day with partial coverage', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  assert.equal(weatherAvailability('2027-05-01', '2027-05-04', now), 'future');
  assert.equal(weatherAvailability('', '', now), 'needs_dates');
  assert.equal(weatherAvailability('2026-02-30', '2026-03-04', now), 'needs_dates');
  assert.equal(weatherAvailability('2026-11-01', '2026-11-02', now), 'past');
  const forecast = {...parseGoogleForecast(raw()), alerts: [], alertsAvailable: true, fetchedAt: now.toISOString()};
  assert.deepEqual(selectTripWeather(forecast, '2026-11-11', '2026-11-12', now).days.map(day => day.date), ['2026-11-11', '2026-11-12']);
  assert.equal(selectTripWeather(forecast, '2026-11-11', '2026-11-12', now).partial, false);
  assert.equal(selectTripWeather(forecast, '2026-11-11', '2026-11-15', now).partial, true);
  assert.equal(selectTripWeather(forecast, '2026-11-01', '2026-11-10', now).days.length, 1);
  assert.equal(selectTripWeather(forecast, '2026-11-01', '2026-11-10', now).partial, false);
  assert.deepEqual(selectTripWeather(forecast, '2026-11-13', '2026-11-15', now), {state: 'future'});
  const late = new Date('2026-11-10T23:30:00Z'); // Already the 11th at destination.
  assert.deepEqual(selectTripWeather(forecast, '2026-11-10', '2026-11-10', late), {state: 'past'});
});
test('only unexpired official alerts overlapping the trip are shown; midnight end is exclusive and unsafe links are discarded', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const alerts = parseGoogleAlerts({weatherAlerts: [alert(), alert({alertId: 'expired', expirationTime: '2026-11-10T00:00:00Z'}),
    alert({alertId: 'before', startTime: '2026-11-10T12:00:00Z', expirationTime: '2026-11-10T23:00:00Z'}),
    alert({alertId: 'after', startTime: '2026-11-15T12:00:00Z', expirationTime: '2026-11-16T12:00:00Z'}),
    alert({alertId: 'unsafe', dataSource: {authorityUri: 'javascript:alert(1)'}})]});
  const forecast = {...parseGoogleForecast(raw()), alerts, alertsAvailable: true, fetchedAt: now.toISOString()};
  const selected = selectTripWeather(forecast, '2026-11-11', '2026-11-12', now);
  assert.deepEqual(selected.alerts.map(a => a.id), ['warning', 'unsafe']);
  assert.equal(selected.alerts[1].sourceUrl, null);
});
