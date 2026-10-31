import { SortOptionsSheet } from '@/components/ui/sort-options-sheet';
import type { DiscoverySort } from './sort-proposals';

const OPTIONS: { value: DiscoverySort; label: string }[] = [
  { value: 'default', label: 'Domyślnie' },
  { value: 'compatibility', label: 'Polecane' },
];

export function DiscoverySortSheet({
  sort,
  onSelect,
  onClose,
}: {
  sort: DiscoverySort;
  onSelect: (value: DiscoverySort) => void;
  onClose: () => void;
}) {
  return <SortOptionsSheet value={sort} options={OPTIONS} caption="Najpierw zbieżny termin i kierunek, następnie zainteresowania i preferencje ekipy."
    onSelect={onSelect} onClose={onClose} />;
}
