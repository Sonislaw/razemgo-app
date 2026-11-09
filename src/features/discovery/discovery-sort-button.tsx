import {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {BottomSheet} from '@/components/ui/bottom-sheet';
import {Icon} from '@/components/ui/icon';
import {AppText} from '@/components/ui/primitives';
import {useTheme} from '@/hooks/use-theme';
import {useDiscovery} from './discovery-context';
import {TRIP_SORT_OPTIONS} from './trip-sorting';

export function DiscoverySortButton() {
  const theme = useTheme();
  const {tripSort, setTripSort} = useDiscovery();
  const [open, setOpen] = useState(false);
  const active = TRIP_SORT_OPTIONS.find(option => option.value === tripSort)!;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Sortuj wyjazdy" accessibilityHint={'Wybrane sortowanie: ' + active.label}
      onPress={() => setOpen(true)} style={({pressed}) => [styles.trigger, {
        backgroundColor: theme.iconBackground, opacity: pressed ? 0.65 : 1,
      }]}>
      <Icon name="sort" size={22} color={tripSort === 'newest' ? theme.textSecondary : theme.primaryStrong} />
      {tripSort !== 'newest' ? <View pointerEvents="none" style={[styles.dot, {backgroundColor: theme.primaryStrong}]} /> : null}
    </Pressable>
    {open ? <BottomSheet title="Sortowanie wyjazdów" onClose={() => setOpen(false)}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Kolejność wyjazdów" style={{gap: 8}}>
        {TRIP_SORT_OPTIONS.map(option => {
          const selected = tripSort === option.value;
          return <Pressable key={option.value} accessibilityRole="radio" aria-checked={selected} accessibilityState={{checked: selected}}
            accessibilityLabel={option.label} accessibilityHint={option.detail}
            onPress={() => {setTripSort(option.value); setOpen(false);}}
            style={({pressed}) => [styles.option, {backgroundColor: selected ? theme.backgroundSelected : theme.background,
              borderColor: selected ? theme.primaryStrong : theme.border, opacity: pressed ? 0.7 : 1}]}>
            <View style={{flex: 1, gap: 4}}>
              <AppText variant="label" color={selected ? 'primaryStrong' : 'text'}>{option.label}</AppText>
              <AppText variant="caption" color="textSecondary">{option.detail}</AppText>
            </View>
            {selected ? <Icon name="check" size={20} /> : null}
          </Pressable>;
        })}
      </View>
    </BottomSheet> : null}
  </>;
}

const styles = StyleSheet.create({
  trigger: {minHeight: 44, minWidth: 44, borderRadius: 999, justifyContent: 'center', alignItems: 'center'},
  dot: {position: 'absolute', right: 7, top: 7, width: 5, height: 5, borderRadius: 3},
  option: {minHeight: 64, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12},
});
