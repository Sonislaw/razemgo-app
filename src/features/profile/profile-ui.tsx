import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, IconButton, layout } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ProfileSubpageHeader({
  title,
  onBack,
  backLabel = 'Wróć do profilu',
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <View style={layout.row}>
      <IconButton icon="back" label={backLabel} onPress={onBack} />
      <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </AppText>
    </View>
  );
}

export function ProfileSectionCard({
  title,
  icon,
  onPress,
  children,
}: {
  title: string;
  icon: IconName;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Edytuj: ' + title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.section,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={layout.row}>
        <Icon name={icon} size={21} />
        <AppText variant="label" style={styles.title}>
          {title}
        </AppText>
        <Icon name="chevron" size={18} color={theme.textSecondary} />
      </View>
      {children}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: 14,
    gap: 10,
    minHeight: 48,
  },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700' },
});
