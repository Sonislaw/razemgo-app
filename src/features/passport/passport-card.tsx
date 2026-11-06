import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { DataStatus } from '@/components/ui/data-status';
import { useTheme } from '@/hooks/use-theme';
import type { TravelGroup } from '@/types/travel';
import { PASSPORT_ENABLED } from './passport-config';
import { useOwnPassport } from './passport-context';
import { EMPTY_PASSPORT_SUMMARY, PASSPORT_BADGE_COUNT, PASSPORT_CATEGORIES } from './passport-data';
import { PassportLevelProgress, PassportStamp } from './passport-ui';

export function PassportCard({ group, own = false }: { group: TravelGroup; own?: boolean }) {
  const theme = useTheme();
  const state = useOwnPassport();
  if (!PASSPORT_ENABLED) return null;
  const summary = own ? state.data?.summary : group.passport ?? EMPTY_PASSPORT_SUMMARY;
  const earned = own ? [...(state.data?.categories ?? [])].filter(c => c.tier > 0)
    .sort((a, b) => (b.awards.at(-1)?.earned_at ?? '').localeCompare(a.awards.at(-1)?.earned_at ?? '')).slice(0, 3) : [];
  return <Card testID="passport-profile-section" style={[styles.card, { borderColor: theme.border }]}>
    <View style={styles.heading}>
      <View style={[styles.coverIcon, { backgroundColor: theme.hero }]}><Icon name="compass" size={26} color={theme.heroText} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading" accessibilityRole="header">Paszport podróżnika</AppText>
        <AppText variant="caption" color="textSecondary">Pamiątki ze wspólnych przygód w RazemGo</AppText>
      </View>
    </View>
    {own && !state.data ? <DataStatus status={state.status} error={state.error} label="Wczytywanie paszportu" onRetry={() => void state.refresh?.()} /> : null}
    {summary ? <>
      <AppText variant="label">Poziom {summary.level} · {summary.title}</AppText>
      <AppText color="textSecondary">{summary.badge_count} z {PASSPORT_BADGE_COUNT} odznak</AppText>
      {own ? <PassportLevelProgress summary={summary} /> : null}
      {earned.length ? <View style={styles.stamps}>{earned.map(item => {
        const category = PASSPORT_CATEGORIES.find(c => c.id === item.id)!;
        return <View key={item.id} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
          <PassportStamp category={category} tier={item.tier} small />
          <AppText variant="caption" numberOfLines={2} style={{ textAlign: 'center' }}>{category.name}</AppText>
        </View>;
      })}</View> : own ? <AppText variant="caption" color="textSecondary">Każda zdobyta odznaka dodaje punkty do poziomu ekipy.</AppText> : null}
      <Button label={own ? 'Otwórz paszport' : 'Zobacz odznaki ekipy'} variant="secondary" icon="compass"
        onPress={() => router.push(own ? '/traveler-passport' : { pathname: '/traveler-passport', params: { groupId: group.id, name: group.name } })} />
    </> : null}
    {own && state.data && state.error ? <AppText variant="caption" color="textSecondary">{state.error}</AppText> : null}
  </Card>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverIcon: { width: 48, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stamps: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
});
