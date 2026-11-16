import { Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { useDiscovery } from './discovery-context';

export function DiscoveryFavoritesButton({ kind }: { kind: 'trips' | 'groups' }) {
  const theme = useTheme();
  const { filters, setFilters, groupFilters, setGroupFilters } = useDiscovery();
  const selected = kind === 'trips' ? !!filters.favoritesOnly : groupFilters.favoritesOnly;
  const toggle = () => {
    if (kind === 'trips') setFilters(current => ({ ...current, favoritesOnly: !current.favoritesOnly }));
    else setGroupFilters(current => ({ ...current, favoritesOnly: !current.favoritesOnly }));
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={kind === 'trips' ? 'Tylko ulubione wyjazdy' : 'Tylko ulubione ekipy'}
      accessibilityHint="Włącza lub wyłącza widok ulubionych, zachowując pozostałe kryteria"
      accessibilityState={{ selected }} aria-pressed={selected} onPress={toggle}
      style={({ pressed }) => [styles.button, {
        backgroundColor: selected ? theme.backgroundSelected : theme.iconBackground,
        opacity: pressed ? 0.65 : 1,
      }]}>
      <Icon name={selected ? 'heart-filled' : 'heart'} size={22} color={selected ? '#DC2626' : theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, flexShrink: 0, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
