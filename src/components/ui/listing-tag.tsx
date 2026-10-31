import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Icon, type IconName } from './icon';
import { AppText } from './primitives';

const INTEREST_ICONS: Record<string, IconName> = {
  Plaża: 'water',
  Kajaki: 'water',
  Rowery: 'bike',
  Ognisko: 'campfire',
  Las: 'leaf',
  Przyroda: 'leaf',
  Wędrówki: 'mountain',
  'Spokojny wypoczynek': 'sun',
};

interface ListingTagProps {
  label: string;
  icon?: IconName;
  tone?: 'default' | 'warm';
  children?: ReactNode;
}

export function ListingTag({ label, icon, tone = 'default', children }: ListingTagProps) {
  const theme = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: tone === 'warm' ? theme.hero : theme.muted }]}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
      <AppText variant="caption" style={styles.label}>{label}</AppText>
    </View>
  );
}

export function InterestTag({ interest }: { interest: string }) {
  return <ListingTag label={interest} icon={INTEREST_ICONS[interest] ?? 'compass'} />;
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, maxWidth: '100%',
  },
  label: { flexShrink: 1 },
});
