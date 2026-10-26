import type { DateRange } from '../../types/travel';
import { isValidDate } from './own-trips-state.ts';

export type TimelineTrip = DateRange & { status?: string };
export interface TimelineMarker {
  key: 'today' | 'start' | 'end';
  label: string;
  position: number;
  isToday: boolean;
}
export interface TripTimelineModel {
  phase: 'upcoming' | 'ongoing' | 'past';
  muted: boolean;
  caption: string;
  accessibilityLabel: string;
  daysUntilStart: number;
  daysUntilEnd: number;
  startPosition: number;
  endPosition: number;
  todayPosition: number;
  markers: TimelineMarker[];
}

const DAY = 86400000;
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const day = (value: string) => Date.parse(value + 'T00:00:00Z') / DAY;
const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullDate = (value: string) => dateFormatter.format(new Date(value + 'T12:00:00Z'));
function shortDate(value: string, showYear: boolean) {
  return `${Number(value.slice(8))} ${MONTHS[Number(value.slice(5, 7)) - 1]}${showYear ? ' ’' + value.slice(2, 4) : ''}`;
}

export function getTripTimeline(trip: TimelineTrip, today: string): TripTimelineModel | null {
  const { startDate, endDate, status } = trip;
  if (!isValidDate(today) || !isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) return null;
  const daysUntilStart = day(startDate) - day(today);
  const daysUntilEnd = day(endDate) - day(today);
  const phase = daysUntilStart > 0 ? 'upcoming' : daysUntilEnd > 0 ? 'ongoing' : 'past';
  const muted = status === 'cancelled' || status === 'completed' || phase === 'past';
  const caption = status === 'cancelled' ? 'Wyjazd anulowany'
    : status === 'completed' && phase !== 'past' ? 'Wyjazd zakończony'
    : daysUntilStart > 0 ? daysUntilStart === 1 ? 'Start jutro' : `Za ${daysUntilStart} dni`
    : daysUntilEnd > 0 ? daysUntilStart === 0 ? 'Start dziś' : `Trwa · jeszcze ${daysUntilEnd} ${daysUntilEnd === 1 ? 'dzień' : 'dni'}`
    : daysUntilEnd === 0 ? 'Zakończony dziś'
    : daysUntilEnd === -1 ? 'Zakończony wczoraj' : `Zakończony ${-daysUntilEnd} dni temu`;

  // The same one-year reference makes waiting times comparable across cards.
  // Minimum visual spacing keeps short stays and adjacent date labels readable;
  // the coloured segment marks the stay, rather than claiming a linear duration scale.
  let startPosition: number, endPosition: number, todayPosition: number;
  if (phase === 'upcoming') {
    todayPosition = 8;
    startPosition = 28 + 44 * clamp(daysUntilStart / 365, 0, 1);
    endPosition = startPosition + 20;
  } else if (phase === 'ongoing') {
    startPosition = 8; endPosition = 92;
    todayPosition = daysUntilStart === 0 ? startPosition : clamp(8 + 84 * (-daysUntilStart / (day(endDate) - day(startDate))), 28, 72);
  } else {
    todayPosition = 92;
    endPosition = daysUntilEnd === 0 ? todayPosition : 72 - 44 * clamp(-daysUntilEnd / 365, 0, 1);
    startPosition = endPosition - 20;
  }
  const showYear = startDate.slice(0, 4) !== endDate.slice(0, 4);
  const markers: TimelineMarker[] = [
    { key: 'start', label: startDate === today ? 'Dziś · start' : shortDate(startDate, showYear), position: startPosition, isToday: startDate === today },
    { key: 'end', label: endDate === today ? 'Dziś · koniec' : shortDate(endDate, showYear), position: endPosition, isToday: endDate === today },
  ];
  if (startDate !== today && endDate !== today) markers.push({ key: 'today', label: 'Dziś', position: todayPosition, isToday: true });
  markers.sort((a, b) => a.position - b.position);
  return { phase, muted, caption, daysUntilStart, daysUntilEnd, startPosition, endPosition, todayPosition, markers,
    accessibilityLabel: `Oś czasu wyjazdu. Dziś ${fullDate(today)}. Początek ${fullDate(startDate)}, koniec ${fullDate(endDate)}. ${caption}.` };
}
