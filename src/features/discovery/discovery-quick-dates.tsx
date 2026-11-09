import {View} from 'react-native';
import {ChipRow} from '@/components/ui/chip-row';
import {Chip} from '@/components/ui/primitives';
import {useCurrentDate} from '@/hooks/use-current-date';
import {useDiscovery} from './discovery-context';
import {activeQuickDateFilter, QUICK_DATE_FILTERS, toggleQuickDateFilter} from './quick-date-filters';

export function DiscoveryQuickDates() {
  const {filters, setFilters} = useDiscovery();
  const today = useCurrentDate();
  if (!today) return null;
  const active = activeQuickDateFilter(filters, today);
  return <View testID="discovery-quick-dates">
    <ChipRow horizontal label="Szybkie filtry dat">
      {QUICK_DATE_FILTERS.map(option => <Chip key={option.id} compact label={option.label} selected={active === option.id}
        onPress={() => setFilters(current => toggleQuickDateFilter(current, option.id, today))} />)}
    </ChipRow>
  </View>;
}
