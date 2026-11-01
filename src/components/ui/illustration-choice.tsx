import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from './icon';
import { AppText } from './primitives';

export function IllustrationChoice({
  label,
  caption,
  selected = false,
  selectionMode = 'multiple',
  onPress,
  children,
}: {
  label: string;
  caption?: string;
  selected?: boolean;
  selectionMode?: 'single' | 'multiple';
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touchTarget,
        caption ? styles.captionedChoice : null,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[
          styles.choice,
          {
            borderColor: selected ? theme.primaryStrong : theme.border,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        {children}
        {selected ? (
          <View style={[styles.check, { backgroundColor: theme.primaryStrong }]}>
            <Icon name="check" size={12} color={theme.onPrimary} />
          </View>
        ) : null}
      </View>
      {caption ? (
        <AppText
          variant="label"
          color={selected ? 'primaryStrong' : 'text'}
          style={styles.caption}
        >
          {caption}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: { alignItems: 'center', flexShrink: 0 },
  captionedChoice: { width: 80, gap: 4 },
  caption: { textAlign: 'center', alignSelf: 'stretch' },
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
