// Provider-independent response shared by the authenticated proxy and the UI.
export interface WeatherDay {
  date: string;
  condition: string;
  description: string;
  minC: number | null;
  maxC: number | null;
  precipitationPercent: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  gustKmh: number | null;
}
export interface WeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: string;
  startTime: string;
  endTime: string;
  source: string;
  sourceUrl: string | null;
}
export interface WeatherForecast {
  days: WeatherDay[];
  alerts: WeatherAlert[];
  alertsAvailable: boolean;
  timeZone: string;
  fetchedAt: string;
  alertsFetchedAt?: string | null;
}
export type WeatherMessageState = 'future' | 'past' | 'needs_dates' | 'needs_location' | 'area' | 'unavailable';
export type TripWeather = {state: WeatherMessageState} | (WeatherForecast & {state: 'forecast'; partial: boolean});

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
const number = (value: unknown, min: number, max: number): number | null => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const max = (values: (number | null)[]) => values.every(v => v === null) ? null : Math.max(...values.filter((v): v is number => v !== null));
export function validWeatherDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function weatherDate(now: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function weatherDateOffset(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
// The preliminary UTC window has a one-day margin for the destination's zone.
// Actual days are selected from Google's civil displayDate, never the phone zone.
export function weatherAvailability(start: unknown, end: unknown, now = new Date()): WeatherMessageState | null {
  if (!validWeatherDate(start) || !validWeatherDate(end) || end < start) return 'needs_dates';
  const today = weatherDate(now);
  if (end < weatherDateOffset(today, -1)) return 'past';
  if (start > weatherDateOffset(today, 10)) return 'future';
  return null;
}
export function parseGoogleForecast(raw: unknown): Pick<WeatherForecast, 'days' | 'timeZone'> {
  const data = object(raw), zone = text(object(data.timeZone).id, 80);
  if (!zone || !Array.isArray(data.forecastDays) || !data.forecastDays.length || data.forecastDays.length > 10) throw Error('Invalid forecast');
  weatherDate(new Date(), zone); // Reject unsupported provider time zones.
  const days = data.forecastDays.map(value => {
    const day = object(value), date = object(day.displayDate);
    const dateString = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    if (!validWeatherDate(dateString)) throw Error('Invalid forecast date');
    const parts = day.fullDayForecast ? [object(day.fullDayForecast)] : [object(day.daytimeForecast), object(day.nighttimeForecast)];
    const condition = object(parts[0].weatherCondition);
    const quantities = parts.map(p => number(object(object(p.precipitation).qpf).quantity, 0, 10000));
    return {date: dateString, condition: text(condition.type, 80), description: text(object(condition.description).text, 160),
      minC: number(object(day.minTemperature).degrees, -100, 70), maxC: number(object(day.maxTemperature).degrees, -100, 70),
      precipitationPercent: max(parts.map(p => number(object(object(p.precipitation).probability).percent, 0, 100))),
      precipitationMm: quantities.every(v => v === null) ? null : quantities.reduce<number>((sum, v) => sum + (v ?? 0), 0),
      windKmh: max(parts.map(p => number(object(object(p.wind).speed).value, 0, 500))),
      gustKmh: max(parts.map(p => number(object(object(p.wind).gust).value, 0, 500))),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(days.map(day => day.date)).size !== days.length) throw Error('Duplicate forecast date');
  return {days, timeZone: zone};
}
export function parseGoogleAlerts(raw: unknown): WeatherAlert[] {
  const data = object(raw);
  if (data.weatherAlerts !== undefined && !Array.isArray(data.weatherAlerts)) throw Error('Invalid alerts');
  return ((data.weatherAlerts ?? []) as unknown[]).map(value => {
    const alert = object(value), source = object(alert.dataSource);
    const startTime = text(alert.startTime, 40), endTime = text(alert.expirationTime, 40), sourceUrl = text(source.authorityUri, 1000);
    if (!Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(endTime)) || Date.parse(endTime) <= Date.parse(startTime)) return null;
    return {id: text(alert.alertId, 256), title: text(object(alert.alertTitle).text, 200) || 'Ostrzeżenie pogodowe',
      description: text(alert.description, 8000), severity: text(alert.severity, 40), startTime, endTime,
      source: text(source.name, 200), sourceUrl: /^https:\/\//i.test(sourceUrl) ? sourceUrl : null};
  }).filter((alert): alert is WeatherAlert => alert !== null);
}
export function selectTripWeather(forecast: WeatherForecast, start: string, end: string, now = new Date()): TripWeather {
  const today = weatherDate(now, forecast.timeZone);
  if (end < today) return {state: 'past'};
  const days = forecast.days.filter(day => day.date >= start && day.date <= end && day.date >= today);
  if (!days.length) return {state: start > (forecast.days.at(-1)?.date ?? today) ? 'future' : 'unavailable'};
  const alerts = forecast.alerts.filter(alert => Date.parse(alert.endTime) > now.getTime() &&
    weatherDate(new Date(Date.parse(alert.endTime) - 1), forecast.timeZone) >= start && weatherDate(new Date(alert.startTime), forecast.timeZone) <= end);
  const firstExpected = start < today ? today : start;
  const expectedCount = Math.round((Date.parse(end) - Date.parse(firstExpected)) / 86400000) + 1;
  return {...forecast, state: 'forecast', days, alerts, partial: days.length < expectedCount};
}
