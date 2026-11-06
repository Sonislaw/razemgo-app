import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { useTheme } from '@/hooks/use-theme';
import { Colors, Shadows } from '@/constants/theme';
import type { TravelGroup } from '@/types/travel';
import { PASSPORT_ENABLED } from './passport-config';
import { useOwnPassport } from './passport-context';
import { EMPTY_PASSPORT_SUMMARY, PASSPORT_BADGE_COUNT, PASSPORT_CATEGORIES } from './passport-data';
import { PassportLevelProgress, PassportStamp } from './passport-ui';
import { PassportLevelArtwork } from './passport-level-artwork';

export function PassportCard({ group, own = false }: { group: TravelGroup; own?: boolean }) {
  const theme = useTheme();
  const state = useOwnPassport();
  if (!PASSPORT_ENABLED) return null;
  const summary = own ? state.data?.summary : group.passport ?? EMPTY_PASSPORT_SUMMARY;
  const earned = own ? [...(state.data?.categories ?? [])].filter(c => c.tier > 0)
    .sort((a, b) => (b.awards.at(-1)?.earned_at ?? '').localeCompare(a.awards.at(-1)?.earned_at ?? '')).slice(0, 3) : [];
  return <Card testID="passport-profile-section" style={[styles.card, { borderColor: theme.border }]}>
    {summary ? <View style={styles.cover}><PassportLevelArtwork level={summary.level} /></View> : null}
    <View style={[styles.content, summary && styles.overlaidContent]}>
      <View style={{ gap: 4 }}>
        <AppText variant="heading" accessibilityRole="header" style={styles.title}>Paszport podróżnika</AppText>
        <AppText variant="caption" style={styles.secondary}>Pamiątki ze wspólnych przygód w RazemGo</AppText>
      </View>
      {own && !state.data ? <DataStatus status={state.status} error={state.error} label="Wczytywanie paszportu" onRetry={() => void state.refresh?.()} /> : null}
      {summary ? <>
        <AppText variant="label" style={styles.text}>Poziom {summary.level} · {summary.title}</AppText>
        <AppText style={styles.secondary}>{summary.badge_count} z {PASSPORT_BADGE_COUNT} odznak</AppText>
        {own ? <PassportLevelProgress summary={summary} onArtwork /> : null}
        {earned.length ? <View style={styles.stamps}>{earned.map(item => {
          const category = PASSPORT_CATEGORIES.find(c => c.id === item.id)!;
          return <View key={item.id} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
            <PassportStamp category={category} tier={item.tier} small />
            <AppText variant="caption" numberOfLines={2} style={[styles.text, { textAlign: 'center' }]}>{category.name}</AppText>
          </View>;
        })}</View> : own ? <AppText variant="caption" style={styles.secondary}>Każda zdobyta odznaka dodaje punkty do poziomu ekipy.</AppText> : null}
        <Button label={own ? 'Otwórz paszport' : 'Zobacz odznaki ekipy'} variant="secondary" icon="passport"
          onPress={() => router.push(own ? '/traveler-passport' : { pathname: '/traveler-passport', params: { groupId: group.id, name: group.name } })} />
      </> : null}
      {own && state.data && state.error ? <AppText variant="caption" style={styles.secondary}>{state.error}</AppText> : null}
    </View>
  </Card>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, padding: 0, gap: 0, overflow: 'hidden', backgroundColor: '#FAFCF8', boxShadow: Shadows.profileCard },
  cover: { height: 260 },
  content: { padding: 16, gap: 14 },
  overlaidContent: { marginTop: -180 },
  title: { color: Colors.light.text },
  text: { color: Colors.light.text },
  secondary: { color: Colors.light.textSecondary },
  stamps: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
});
