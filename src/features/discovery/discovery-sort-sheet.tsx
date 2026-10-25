import { SortOptionsSheet } from '@/components/ui/sort-options-sheet';
import type { DiscoverySort } from './sort-proposals';

const OPTIONS: { value: DiscoverySort; label: string }[] = [
  { value: 'default', label: 'Domyślnie' },
  { value: 'compatibility', label: 'Najwyższa zgodność' },
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
  return <SortOptionsSheet value={sort} options={OPTIONS} caption="Zgodność od najwyższej do najniższej."
    onSelect={onSelect} onClose={onClose} />;
}
