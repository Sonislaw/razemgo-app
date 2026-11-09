import {Keyboard, Pressable, StyleSheet, View} from 'react-native';
import {useTheme} from '@/hooks/use-theme';
import {Icon} from './icon';
import {AppText} from './primitives';

export function DescriptionHelperTrigger({onPress, hint}: {onPress: () => void; hint: string}) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Pomóż mi napisać opis" accessibilityHint={hint}
    onPress={() => {Keyboard.dismiss(); onPress();}}
    style={({pressed}) => [styles.trigger, {backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1}]}>
    <AppText accessible={false} aria-hidden style={{fontSize: 18}}>✨</AppText>
    <AppText variant="caption" color="primaryStrong" style={{fontWeight: '700', flexShrink: 1}}>Pomóż mi napisać opis</AppText>
  </Pressable>;
}

export function DescriptionHelperChoice({label, selected, onPress, multiple = false}: {
  label: string; selected: boolean; onPress: () => void; multiple?: boolean;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={{checked: selected}} onPress={onPress} style={({pressed}) => [styles.choice, {
      borderColor: selected ? theme.primaryStrong : theme.border, backgroundColor: selected ? theme.backgroundSelected : theme.background,
      opacity: pressed ? 0.7 : 1,
    }]}>
    {selected ? <Icon name="check" size={16} /> : <View style={[styles.unchecked, {borderColor: theme.textSecondary, borderRadius: multiple ? 4 : 8}]} />}
    <AppText variant="caption" color={selected ? 'primaryStrong' : 'text'} style={{flexShrink: 1, fontWeight: selected ? '700' : '400'}}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: {alignSelf: 'flex-start', minHeight: 44, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8},
  choice: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10},
  unchecked: {width: 16, height: 16, borderWidth: 1},
});
