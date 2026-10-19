import type { DateRange } from '../../types/travel';
import { isValidDate } from './own-trips-state.ts';

export const EMPTY_CALENDAR_RANGE: DateRange = { startDate: '', endDate: '' };
export const DATE_TOLERANCES = [0, 1, 2, 3, 7] as const;

export function selectCalendarDate(range: DateRange, date: string): DateRange {
  if (!isValidDate(date)) return range;
  if (!range.startDate || range.endDate || date <= range.startDate)
    return { startDate: date, endDate: '' };
  return { startDate: range.startDate, endDate: date };
}

export function shiftCalendarMonth(month: string, shift: number): string {
  return new Date(
    Date.UTC(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + shift,
      1,
    ),
  )
    .toISOString()
    .slice(0, 7);
}

export function calendarMonthCells(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const offset = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  return Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, cell) => {
      const day = cell - offset + 1;
      return day > 0 && day <= days
        ? month + '-' + String(day).padStart(2, '0')
        : '';
    },
  );
}

export function dateToleranceLabel(days: number): string {
  return days ? `±${days} ${days === 1 ? 'dzień' : 'dni'}` : 'Dokładny termin';
}

export function rangeDurationLabel(range: DateRange): string {
  const nights = Math.round(
    (Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000,
  );
  return `${nights} ${nights === 1 ? 'noc' : nights % 10 >= 2 && nights % 10 <= 4 && (nights % 100 < 12 || nights % 100 > 14) ? 'noce' : 'nocy'}`;
}
