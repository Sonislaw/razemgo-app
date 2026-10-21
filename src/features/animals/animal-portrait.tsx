import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chip } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import type { AnimalKind } from '@/types/animals';
import { ANIMAL_OPTIONS } from './animal-data';

const ANIMAL_IMAGES = {
  dog: require('../../../assets/images/animals/dog.png'),
  cat: require('../../../assets/images/animals/cat.png'),
};

export function AnimalPortrait({
  kind,
  size = 32,
}: {
  kind: AnimalKind;
  size?: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.portrait,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: kind === 'dog' ? theme.hero : theme.backgroundSelected,
        },
      ]}
    >
      {kind === 'other' ? (
        <Icon name="paw" size={size * 0.55} />
      ) : (
        <Image
          source={ANIMAL_IMAGES[kind]}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
          accessible={false}
          alt=""
        />
      )}
    </View>
  );
}

export function AnimalChoice({
  kind,
  label,
  accessibilityLabel = label,
  selected = false,
  onPress,
}: {
  kind: AnimalKind;
  label: string;
  accessibilityLabel?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  if (kind === 'other')
    return (
      <Chip
        label={label}
        accessibilityLabel={accessibilityLabel}
        selected={selected}
        onPress={onPress}
      />
    );
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? theme.primaryStrong : theme.border,
          backgroundColor: theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <AnimalPortrait kind={kind} size={54} />
      {selected ? (
        <View style={[styles.check, { backgroundColor: theme.primaryStrong }]}>
          <Icon name="check" size={12} color={theme.onPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function AnimalBadge({ kind }: { kind: AnimalKind }) {
  const label = ANIMAL_OPTIONS.find((option) => option.kind === kind)?.label;
  if (kind === 'other') return <Chip label={label ?? 'Inne zwierzę'} />;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <AnimalPortrait kind={kind} size={48} />
    </View>
  );
}

const styles = StyleSheet.create({
  portrait: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  choice: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    padding: 3,
    flexShrink: 0,
  },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
