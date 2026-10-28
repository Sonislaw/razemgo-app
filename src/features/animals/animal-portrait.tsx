import { Icon } from '@/components/ui/icon';
import { IllustrationChoice } from '@/components/ui/illustration-choice';
import { Chip } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { AnimalKind } from '@/types/animals';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { ANIMAL_OPTIONS } from './animal-data';

const ANIMAL_IMAGES = {
  dog: require('../../../assets/images/animals/dog.webp'),
  cat: require('../../../assets/images/animals/cat.webp'),
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
          backgroundColor:
            kind === 'dog' ? theme.hero : theme.backgroundSelected,
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
    <IllustrationChoice
      label={accessibilityLabel}
      selected={selected}
      onPress={onPress}
    >
      <AnimalPortrait kind={kind} size={54} />
    </IllustrationChoice>
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
});
