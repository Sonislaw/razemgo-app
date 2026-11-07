import type { TravelGroup } from '@/types/travel';
import { PASSPORT_ENABLED } from './passport-config';
import { useOwnPassport } from './passport-context';
import { EMPTY_PASSPORT_SUMMARY } from './passport-data';

export function usePassportLevelSummary(group: TravelGroup) {
  const own = useOwnPassport();
  if (!PASSPORT_ENABLED) return null;
  return own.groupId === group.id
    ? own.data?.summary ?? group.passport
    : group.passport ?? EMPTY_PASSPORT_SUMMARY;
}
