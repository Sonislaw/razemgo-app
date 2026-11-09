import type {DateRange, DiscoveryFilters} from '../../types/travel';
import {isValidDate, shiftDate} from '../../lib/calendar-date.ts';
import {clearDiscoveryDates, resolveDiscoveryRange, updateDiscoveryDateRange} from './filter-trips.ts';

export const QUICK_DATE_FILTERS = [
  {id: 'today', label: 'Dzisiaj'},
  {id: 'tomorrow', label: 'Jutro'},
  {id: 'weekend', label: 'Weekend'},
  {id: 'week', label: '7 dni'},
  {id: 'next-weekend', label: 'Następny weekend'},
  {id: '30-days', label: '30 dni'},
] as const;
export type QuickDateFilterId = typeof QUICK_DATE_FILTERS[number]['id'];

export function quickDateRange(id: QuickDateFilterId, today: string): DateRange | undefined {
  if (!isValidDate(today)) return undefined;
  if (id === 'today') return {startDate: today, endDate: shiftDate(today, 1)};
  if (id === 'tomorrow') return {startDate: shiftDate(today, 1), endDate: shiftDate(today, 2)};
  if (id === 'week') return {startDate: today, endDate: shiftDate(today, 7)};
  if (id === '30-days') return {startDate: today, endDate: shiftDate(today, 30)};
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  const fridayOffset = weekday === 0 ? -2 : 5 - weekday;
  const startDate = shiftDate(today, fridayOffset + (id === 'next-weekend' ? 7 : 0));
  // Search periods are half-open. Monday is the upper bound so trips starting
  // on Sunday still match the Friday/Saturday/Sunday weekend.
  return {startDate, endDate: shiftDate(startDate, 3)};
}

export function activeQuickDateFilter(filters: DiscoveryFilters, today: string): QuickDateFilterId | undefined {
  const range = resolveDiscoveryRange(filters);
  if (!range || (filters.dateFlexibilityDays ?? 0) !== 0) return undefined;
  return QUICK_DATE_FILTERS.find(option => {
    const candidate = quickDateRange(option.id, today);
    return candidate?.startDate === range.startDate && candidate.endDate === range.endDate;
  })?.id;
}

export function toggleQuickDateFilter(filters: DiscoveryFilters, id: QuickDateFilterId, today: string): DiscoveryFilters {
  const range = quickDateRange(id, today);
  if (!range) return filters;
  return activeQuickDateFilter(filters, today) === id
    ? clearDiscoveryDates(filters)
    : updateDiscoveryDateRange(filters, range);
}
