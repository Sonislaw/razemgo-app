import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DataStatus } from '@/components/ui/data-status';
import { Icon } from '@/components/ui/icon';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { useTheme } from '@/hooks/use-theme';
import { PASSPORT_ENABLED } from './passport-config';
import { useOwnPassport, usePublicPassport } from './passport-context';
import { badgeProgress, PASSPORT_BADGE_COUNT, PASSPORT_CATEGORIES, PASSPORT_TIERS, PASSPORT_TIER_POINTS } from './passport-data';
import { PassportLevelProgress, PassportProgressBar, PassportStamp } from './passport-ui';

export function PassportScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ groupId?: string; name?: string }>();
  const own = useOwnPassport();
  const { ready: ownReady, refresh: refreshOwn } = own;
  const publicView = !!params.groupId && params.groupId !== own.groupId;
  const other = usePublicPassport(params.groupId ?? '', publicView);
  const state = publicView ? other : own;
  const data = state.data;
  const [selected, setSelected] = useState<string | null>(null);
  const [collected, setCollected] = useState(false);
  useFocusEffect(useCallback(() => { if (!publicView && ownReady) void refreshOwn?.(); }, [publicView, ownReady, refreshOwn]));
  const back = () => router.canGoBack() ? router.back() : router.replace('/profile');
  const category = PASSPORT_CATEGORIES.find(c => c.id === selected);
  const achievement = data?.categories.find(c => c.id === selected);
  const items = PASSPORT_CATEGORIES.filter(c => !collected || (data?.categories.find(a => a.id === c.id)?.tier ?? 0) > 0);
  return <Screen testID="traveler-passport-screen">
    <ProfileSubpageHeader title="Paszport podróżnika" onBack={back} backLabel="Wróć" />
    {!PASSPORT_ENABLED ? <EmptyState title="Paszport nie jest dostępny" description="Ta funkcja jest obecnie dostępna w wersji Dev."
      action={<Button label="Wróć do profilu" onPress={back} />} /> : <>
      {!data ? <DataStatus status={state.status} error={state.error} label="Wczytywanie paszportu" onRetry={() => void state.refresh?.()} /> : null}
      {!data && state.status === 'ready' ? <EmptyState title="Ten paszport jest niedostępny" description="Profil ekipy mógł zostać usunięty lub dostęp do niego został ograniczony." /> : null}
      {data ? <>
        <Card style={[styles.cover, { backgroundColor: theme.hero, borderColor: theme.border }]}>
          <View style={styles.coverTop}><Icon name="compass" size={34} color={theme.heroText} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="caption" style={{ color: theme.heroText, letterSpacing: 1.5 }}>RAZEMGO · PASZPORT PODRÓŻNIKA</AppText>
              <AppText variant="heading" style={{ color: theme.heroText }}>{publicView ? params.name || 'Ekipa' : own.groupName || 'Nasza ekipa'}</AppText>
            </View>
          </View>
          <AppText variant="title" style={{ color: theme.heroText }}>Poziom {data.summary.level}</AppText>
          <AppText variant="heading" style={{ color: theme.heroText }}>{data.summary.title}</AppText>
          <PassportLevelProgress summary={data.summary} />
          <View style={[styles.totals, { borderColor: theme.border }]}>
            <AppText variant="label">{data.summary.badge_count} z {PASSPORT_BADGE_COUNT} odznak</AppText>
            <AppText variant="label">{data.summary.points} pkt</AppText>
          </View>
        </Card>
        <View style={{ gap: 6 }}>
          <AppText variant="heading" accessibilityRole="header">Kolekcja odznak</AppText>
          <AppText color="textSecondary">{data.own ? 'Każda odznaka to pamiątka za aktywność. Dotknij jej, żeby zobaczyć kolejne progi i zdobyte stopnie.' :
            'Pamiątki zdobyte przez ekipę w RazemGo. Dotknij odznaki, aby poznać jej historię.'}</AppText>
        </View>
        <View style={styles.filters}>
          {[false, true].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: collected === value }}
            onPress={() => setCollected(value)} style={[styles.filter, { backgroundColor: collected === value ? theme.backgroundSelected : theme.backgroundElement, borderColor: collected === value ? theme.primaryStrong : theme.border }]}>
            <AppText variant="label">{value ? 'Zdobyte' : 'Wszystkie'}</AppText>
          </Pressable>)}
        </View>
        <View style={styles.grid}>
          {items.map(c => {
            const a = data.categories.find(item => item.id === c.id)!;
            const progress = badgeProgress(c, a.tier, a.count ?? 0);
            return <Pressable key={c.id} testID={'passport-badge-' + c.id} accessibilityRole="button"
              accessibilityLabel={`${c.name}. ${a.tier ? PASSPORT_TIERS[a.tier - 1] : 'Do zdobycia'}. Zobacz progi odznaki`}
              onPress={() => setSelected(c.id)} style={({ pressed }) => [styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.75 : 1 }]}>
              <PassportStamp category={c} tier={a.tier} />
              <AppText variant="label" style={styles.center}>{c.name}</AppText>
              <AppText variant="caption" color="textSecondary" style={styles.center}>
                {a.tier ? `${PASSPORT_TIERS[a.tier - 1]} · ${a.tier}/${c.thresholds.length}` : 'Do zdobycia'}
              </AppText>
              {data.own && progress.target !== undefined ? <View style={{ width: '100%', gap: 5 }}>
                <PassportProgressBar fraction={progress.fraction} label={'Postęp odznaki ' + c.name} />
                <AppText variant="caption" color="textSecondary" style={styles.center}>{a.count} / {progress.target}</AppText>
              </View> : a.tier === c.thresholds.length ? <AppText variant="caption" color="positive">Komplet stopni</AppText> : null}
            </Pressable>;
          })}
        </View>
        {!items.length ? <Card><AppText color="textSecondary">Pierwsze odznaki jeszcze przed {data.own ? 'Wami' : 'tą ekipą'}. Każda zaczyna się od małego kroku.</AppText></Card> : null}
        <Card>
          <AppText variant="label">Jak rośnie poziom ekipy?</AppText>
          <AppText color="textSecondary">Kolejne stopnie odznak dodają 10, 20, 35 i 60 punktów. Punkty wszystkich kategorii składają się na poziom ekipy.</AppText>
          <AppText variant="caption" color="textSecondary">Zdobyte odznaki zostają w paszporcie. Ponowne dodanie tej samej rzeczy nie nalicza jej drugi raz. Poziom opisuje aktywność w aplikacji; odznaki za opublikowane plany nie potwierdzają odbycia podróży.</AppText>
        </Card>
        {state.error ? <Card><AppText color="textSecondary">{state.error}</AppText><Button label="Spróbuj ponownie" variant="secondary" onPress={() => void state.refresh?.()} /></Card> : null}
      </> : null}
    </>}
    {category && achievement && data ? <BottomSheet title={category.name} onClose={() => setSelected(null)}>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}><PassportStamp category={category} tier={achievement.tier} /></View>
      <AppText>{category.description}</AppText>
      {data.own ? <AppText variant="label">Twój postęp: {achievement.count} · {category.unit}</AppText> : null}
      {category.thresholds.map((threshold, i) => {
        const earned = achievement.awards.find(a => a.tier === i + 1);
        return <View key={i} style={[styles.milestone, { borderColor: theme.border, backgroundColor: earned ? theme.positiveBackground : theme.background }]}>
          <Icon name={earned ? 'check' : 'lock'} size={20} color={earned ? theme.positive : theme.textSecondary} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="label">{PASSPORT_TIERS[i]} · próg {threshold}</AppText>
            <AppText variant="caption" color="textSecondary">{earned ? `Zdobyta ${new Date(earned.earned_at).toLocaleDateString('pl-PL')}` : 'Jeszcze do zdobycia'}</AppText>
          </View>
          <AppText variant="label">+{PASSPORT_TIER_POINTS[i]} pkt</AppText>
        </View>;
      })}
      <Button label="Gotowe" variant="secondary" onPress={() => setSelected(null)} />
    </BottomSheet> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  cover: { borderRadius: 26, borderWidth: 1, padding: 22, gap: 10 },
  coverTop: { flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 10 },
  totals: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 14, borderTopWidth: 1 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, paddingHorizontal: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 120, alignItems: 'center', borderRadius: 22,
    borderWidth: 1, padding: 14, gap: 10, minHeight: 194 },
  center: { textAlign: 'center' },
  milestone: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
