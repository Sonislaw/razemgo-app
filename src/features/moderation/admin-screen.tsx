import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  FieldLabel,
  IconButton,
} from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import { createRequestKey } from '@/lib/request-key';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccountAccess } from './account-access-context';
import {
  applyModeration,
  fetchReport,
  fetchReports,
  moderationError,
} from './moderation-repository';
import {
  ACTION_LABELS,
  STATUS_LABELS,
  validateModerationNote,
  type ModerationAction,
  type ReportDetail,
  type ReportFilter,
  type ReportsPage,
  type ReportSummary,
} from './moderation-types';

const date = (value: string) =>
  new Date(value).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const ACTION_DESCRIPTIONS: Record<ModerationAction, string> = {
  in_progress: 'Oznacz zgłoszenie jako aktualnie obsługiwane.',
  close: 'Zakończ obsługę i zapisz wynik w historii.',
  reopen: 'Przywróć zgłoszenie do kolejki nowych spraw.',
  hide_trip:
    'Ogłoszenie zniknie z Odkrywaj i propozycji. Nowe zaproszenia do tego wyjazdu będą niedostępne. Możesz później przywrócić widoczność.',
  restore_trip:
    'Usuń blokadę moderacji. Widoczność nadal zależy od statusu i ustawień wyjazdu.',
  suspend_account:
    'Konto utraci dostęp do funkcji RazemGo, także w istniejącej sesji. Dane pozostaną zapisane. Blokadę można cofnąć.',
  restore_account:
    'Przywróć dostęp do RazemGo. Wcześniejsze powiadomienia push nie zostaną wysłane ponownie.',
};
function Badge({ status }: { status: ReportSummary['status'] }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor:
          status === 'new'
            ? theme.hero
            : status === 'closed'
              ? theme.positiveBackground
              : theme.muted,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
      }}
    >
      <AppText variant="caption" style={{ fontWeight: '700' }}>
        {STATUS_LABELS[status]}
      </AppText>
    </View>
  );
}
export default function AdminScreen() {
  const access = useAccountAccess();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const [filter, setFilter] = useState<ReportFilter>('open');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<ReportsPage>({
    items: [],
    has_more: false,
    counts: { new: 0, in_progress: 0, closed: 0 },
  });
  const [loading, setLoading] = useState(access.is_admin);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    action: ModerationAction;
    key: string;
  } | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requests = useRef({ list: 0, detail: 0 });
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    const current = requests.current;
    active.current = true;
    return () => {
      active.current = false;
      current.list++;
      current.detail++;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (cursor?: ReportSummary) => {
      if (!access.is_admin) return;
      const revision = ++requests.current.list;
      setLoading(true);
      setListError(null);
      if (!cursor)
        setPage((previous) => ({ ...previous, items: [], has_more: false }));
      try {
        const next = await fetchReports(filter, search, cursor);
        if (active.current && revision === requests.current.list)
          setPage((previous) => ({
            ...next,
            items: cursor
              ? [
                  ...previous.items,
                  ...next.items.filter(
                    (item) => !previous.items.some((p) => p.id === item.id),
                  ),
                ]
              : next.items,
          }));
      } catch (error) {
        if (active.current && revision === requests.current.list)
          setListError(moderationError(error));
      } finally {
        if (active.current && revision === requests.current.list)
          setLoading(false);
      }
    },
    [access.is_admin, filter, search],
  );
  useEffect(() => {
    const current = requests.current;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      current.list++;
    };
  }, [load]);
  const open = useCallback(async (id: string) => {
    const revision = ++requests.current.detail;
    setSelected(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setNotice(null);
    try {
      const next = await fetchReport(id);
      if (active.current && revision === requests.current.detail)
        setDetail(next);
    } catch (error) {
      if (active.current && revision === requests.current.detail)
        setDetailError(moderationError(error));
    } finally {
      if (active.current && revision === requests.current.detail)
        setDetailLoading(false);
    }
  }, []);
  const chooseAction = (action: ModerationAction) => {
    setConfirmation({ action, key: createRequestKey() });
    setNote('');
    setActionError(null);
  };
  const submit = async () => {
    if (!detail || !confirmation || busy.current) return;
    const validation = validateModerationNote(note);
    if (validation) {
      setActionError(validation);
      return;
    }
    busy.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const next = await applyModeration(
        detail.report.id,
        confirmation.action,
        note,
        confirmation.key,
        detail.report.updated_at,
      );
      if (!active.current) return;
      setDetail(next);
      setConfirmation(null);
      setNotice('Decyzja została zapisana w historii zgłoszenia.');
      void load();
    } catch (error) {
      if (active.current) setActionError(moderationError(error));
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };
  if (!access.is_admin)
    return (
      <View style={styles.denied}>
        <EmptyState
          icon="lock"
          title="Brak dostępu do panelu"
          description="Ten obszar jest dostępny wyłącznie dla administratorów RazemGo."
          action={
            <Button
              label="Wróć do aplikacji"
              onPress={() => router.replace('/')}
            />
          }
        />
      </View>
    );
  const detailBody = (
    <View style={{ gap: 18, flex: 1, minWidth: 0 }}>
      {detailLoading ? (
        <Card>
          <ActivityIndicator accessibilityLabel="Wczytywanie zgłoszenia" />
        </Card>
      ) : detailError ? (
        <Card>
          <AppText accessibilityRole="alert">{detailError}</AppText>
          <Button
            label="Ponów pobieranie szczegółów"
            onPress={() => selected && void open(selected)}
          />
        </Card>
      ) : detail ? (
        <>
          <Card style={styles.detailCard}>
            <View style={styles.row}>
              <Icon
                name={
                  detail.report.target_kind === 'profile'
                    ? 'people'
                    : detail.report.target_kind === 'trip'
                      ? 'trips'
                      : 'chat'
                }
                size={24}
              />
              <AppText
                variant="caption"
                color="textSecondary"
                style={{ flex: 1 }}
              >
                ZGŁOSZENIE{' '}
                {detail.report.target_kind === 'profile'
                  ? 'PROFILU'
                  : detail.report.target_kind === 'trip'
                    ? 'WYJAZDU'
                    : 'ROZMOWY'}
              </AppText>
              <Badge status={detail.report.status} />
            </View>
            <AppText
              variant="title"
              accessibilityRole="header"
              style={{ fontSize: 26, lineHeight: 33 }}
            >
              {detail.report.reported_name}
            </AppText>
            <AppText variant="heading">{detail.report.reason}</AppText>
            <AppText variant="caption" color="textSecondary">
              Zgłasza: {detail.report.reporter_name} ·{' '}
              {date(detail.report.created_at)}
            </AppText>
            {notice ? (
              <View
                style={[
                  styles.notice,
                  { backgroundColor: theme.positiveBackground },
                ]}
              >
                <AppText accessibilityLiveRegion="polite" color="positive">
                  {notice}
                </AppText>
              </View>
            ) : null}
            {detail.trip_hidden || detail.account_suspended ? (
              <View style={styles.wrap}>
                {detail.trip_hidden ? <Chip label="Ogłoszenie ukryte" /> : null}
                {detail.account_suspended ? (
                  <Chip label="Konto zablokowane" />
                ) : null}
              </View>
            ) : null}
          </Card>
          <Card style={styles.detailCard}>
            <AppText variant="heading" accessibilityRole="header">
              Zgłoszona treść
            </AppText>
            <AppText variant="caption" color="textSecondary">
              Zapis z chwili zgłoszenia. Panel nie pobiera pozostałych rozmów
              tej ekipy.
            </AppText>
            {detail.evidence.trip ? (
              <View
                style={[styles.evidence, { backgroundColor: theme.background }]}
              >
                <AppText variant="label">Wyjazd</AppText>
                <AppText selectable>
                  {detail.evidence.trip.description ||
                    'Opis nie jest już dostępny.'}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {[
                    detail.evidence.trip.location_name,
                    detail.evidence.trip.location_region,
                    detail.evidence.trip.campground_name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {detail.evidence.trip.start_date} —{' '}
                  {detail.evidence.trip.end_date}
                </AppText>
              </View>
            ) : null}
            {detail.evidence.messages
              ?.slice()
              .reverse()
              .map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.evidence,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <AppText variant="caption" color="textSecondary">
                    {message.sender_group_id === detail.report.reported_group_id
                      ? detail.report.reported_name
                      : detail.report.reporter_name}{' '}
                    · {date(message.created_at)}
                  </AppText>
                  <AppText selectable>{message.text}</AppText>
                </View>
              ))}
            {detail.evidence.profile ? (
              <View
                style={[styles.evidence, { backgroundColor: theme.background }]}
              >
                <AppText variant="label">
                  {detail.evidence.profile.name}
                </AppText>
                <AppText selectable>
                  {detail.evidence.profile.about || 'Brak opisu ekipy.'}
                </AppText>
              </View>
            ) : null}
            {!detail.evidence.trip &&
            !detail.evidence.profile &&
            !detail.evidence.messages?.length ? (
              <AppText color="textSecondary">Brak zachowanej treści.</AppText>
            ) : null}
          </Card>
          <Card style={styles.detailCard}>
            <AppText variant="heading" accessibilityRole="header">
              Działania moderatora
            </AppText>
            <View style={styles.actionGrid}>
              {detail.report.status !== 'in_progress' &&
              detail.report.status !== 'closed' ? (
                <Button
                  label={ACTION_LABELS.in_progress}
                  variant="secondary"
                  onPress={() => chooseAction('in_progress')}
                />
              ) : null}
              <Button
                label={
                  detail.report.status === 'closed'
                    ? ACTION_LABELS.reopen
                    : ACTION_LABELS.close
                }
                icon="check"
                onPress={() =>
                  chooseAction(
                    detail.report.status === 'closed' ? 'reopen' : 'close',
                  )
                }
              />
              {detail.trip_id ? (
                <Button
                  label={
                    detail.trip_hidden
                      ? ACTION_LABELS.restore_trip
                      : ACTION_LABELS.hide_trip
                  }
                  variant="secondary"
                  onPress={() =>
                    chooseAction(
                      detail.trip_hidden ? 'restore_trip' : 'hide_trip',
                    )
                  }
                />
              ) : null}
              {detail.can_suspend ? (
                <Button
                  label={
                    detail.account_suspended
                      ? ACTION_LABELS.restore_account
                      : ACTION_LABELS.suspend_account
                  }
                  icon="block"
                  variant="secondary"
                  onPress={() =>
                    chooseAction(
                      detail.account_suspended
                        ? 'restore_account'
                        : 'suspend_account',
                    )
                  }
                />
              ) : null}
            </View>
          </Card>
          <Card style={styles.detailCard}>
            <AppText variant="heading" accessibilityRole="header">
              Historia działań
            </AppText>
            {!detail.history.length ? (
              <AppText color="textSecondary">
                To zgłoszenie nie było jeszcze obsługiwane.
              </AppText>
            ) : (
              detail.history.map((entry) => (
                <View
                  key={entry.id}
                  style={[styles.history, { borderColor: theme.border }]}
                >
                  <AppText variant="label">
                    {ACTION_LABELS[entry.action]}
                  </AppText>
                  <AppText selectable>{entry.note}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {entry.actor_name} · {date(entry.created_at)}
                  </AppText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : (
        <Card style={{ gap: 16, padding: 32, alignItems: 'center' }}>
          <Icon name="shield" size={40} />
          <AppText variant="heading">Każde zgłoszenie ma znaczenie</AppText>
          <AppText color="textSecondary" style={{ textAlign: 'center' }}>
            Wybierz sprawę z listy, aby zobaczyć zapis treści i podjąć
            działanie.
          </AppText>
        </Card>
      )}
    </View>
  );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        paddingTop: insets.top,
      }}
    >
      <View
        style={[
          styles.topbar,
          {
            borderColor: theme.border,
            backgroundColor: theme.backgroundElement,
          },
        ]}
      >
        <Image
          source={require('@/assets/images/zgrana-symbol.svg')}
          style={{ width: 36, height: 36 }}
          contentFit="contain"
        />
        <AppText variant="heading">RazemGo</AppText>
        <View style={[styles.adminPill, { backgroundColor: theme.muted }]}>
          <AppText variant="caption" color="primaryStrong">
            Panel administracyjny
          </AppText>
        </View>
        <View style={{ flex: 1 }} />
        <IconButton
          label="Wróć do aplikacji"
          icon="home"
          onPress={() => router.replace('/')}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: wide ? 32 : 16,
          paddingBottom: 32 + insets.bottom,
          alignItems: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: '100%', maxWidth: 1360, gap: 24 }}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 6 }}>
              <AppText variant="caption" color="primaryStrong">
                SPOŁECZNOŚĆ RAZEMGO
              </AppText>
              <AppText
                accessibilityRole="header"
                variant="title"
                style={{ fontSize: wide ? 32 : 26 }}
              >
                Zadbaj o dobrą atmosferę
              </AppText>
              <AppText color="textSecondary">
                Zgłoszenia, decyzje i historia moderacji w jednym miejscu.
              </AppText>
            </View>
            <IconButton
              label="Odśwież zgłoszenia"
              icon="refresh"
              onPress={() => {
                void load();
                if (selected) void open(selected);
                access.refresh();
              }}
            />
          </View>
          <View style={styles.stats}>
            {(['new', 'in_progress', 'closed'] as const).map(
              (status, index) => (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityLabel={'Filtr: ' + STATUS_LABELS[status]}
                  onPress={() => setFilter(status)}
                  style={[
                    styles.stat,
                    {
                      backgroundColor: [
                        theme.hero,
                        theme.muted,
                        theme.positiveBackground,
                      ][index],
                      borderColor:
                        filter === status ? theme.primary : 'transparent',
                    },
                  ]}
                >
                  <AppText variant="caption">{STATUS_LABELS[status]}</AppText>
                  <AppText
                    variant="title"
                    style={{ fontSize: 30, lineHeight: 36 }}
                  >
                    {page.counts[status]}
                  </AppText>
                </Pressable>
              ),
            )}
          </View>
          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              gap: 24,
              alignItems: 'flex-start',
            }}
          >
            {wide || !selected ? (
              <View
                style={{
                  flex: wide ? 0.9 : undefined,
                  width: wide ? undefined : '100%',
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <View style={styles.row}>
                  <Icon name="flag" />
                  <AppText variant="heading">Zgłoszenia</AppText>
                </View>
                <TextInput
                  accessibilityLabel="Szukaj zgłoszenia"
                  placeholder="Ekipa lub powód zgłoszenia"
                  placeholderTextColor={theme.textSecondary}
                  value={query}
                  maxLength={100}
                  onChangeText={setQuery}
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.border,
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}
                />
                <View style={styles.wrap}>
                  <Chip
                    label="Otwarte"
                    selected={filter === 'open'}
                    onPress={() => setFilter('open')}
                  />
                  <Chip
                    label="Wszystkie"
                    selected={filter === 'all'}
                    onPress={() => setFilter('all')}
                  />
                </View>
                {loading && !page.items.length ? (
                  <ActivityIndicator accessibilityLabel="Wczytywanie zgłoszeń" />
                ) : null}
                {listError ? (
                  <Card>
                    <AppText accessibilityRole="alert">{listError}</AppText>
                    <Button
                      label="Ponów pobieranie zgłoszeń"
                      onPress={() => void load()}
                    />
                  </Card>
                ) : null}
                {!loading && !listError && !page.items.length ? (
                  <Card>
                    <AppText variant="heading">Wszystko spokojnie</AppText>
                    <AppText color="textSecondary">
                      Brak zgłoszeń spełniających wybrane filtry.
                    </AppText>
                  </Card>
                ) : null}
                {page.items.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.reported_name + ', ' + item.reason}
                    onPress={() => void open(item.id)}
                    style={[
                      styles.reportRow,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor:
                          selected === item.id ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.row}>
                      <Badge status={item.status} />
                      <View style={{ flex: 1 }} />
                      <AppText variant="caption" color="textSecondary">
                        {date(item.created_at)}
                      </AppText>
                    </View>
                    <AppText variant="heading" numberOfLines={1}>
                      {item.reported_name}
                    </AppText>
                    <AppText>{item.reason}</AppText>
                    <View style={styles.row}>
                      <Icon
                        name={
                          item.target_kind === 'profile'
                            ? 'people'
                            : item.target_kind === 'trip'
                              ? 'trips'
                              : 'chat'
                        }
                        size={16}
                      />
                      <AppText variant="caption" color="textSecondary">
                        {item.target_kind === 'profile'
                          ? 'Profil'
                          : item.target_kind === 'trip'
                            ? 'Ogłoszenie'
                            : 'Rozmowa'}{' '}
                        · zgłasza {item.reporter_name}
                      </AppText>
                    </View>
                  </Pressable>
                ))}
                {page.has_more ? (
                  <Button
                    label={
                      loading ? 'Wczytywanie…' : 'Pokaż kolejne zgłoszenia'
                    }
                    disabled={loading}
                    variant="secondary"
                    onPress={() => void load(page.items.at(-1))}
                  />
                ) : null}
              </View>
            ) : null}
            {wide || selected ? (
              <View
                style={{
                  flex: wide ? 1.25 : undefined,
                  width: wide ? undefined : '100%',
                  minWidth: 0,
                  gap: 12,
                }}
              >
                {!wide ? (
                  <Button
                    label="Wróć do zgłoszeń"
                    icon="back"
                    variant="secondary"
                    onPress={() => {
                      requests.current.detail++;
                      setSelected(null);
                      setDetail(null);
                    }}
                  />
                ) : null}
                {detailBody}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
      {confirmation ? (
        <BottomSheet
          title={ACTION_LABELS[confirmation.action]}
          onClose={() => {
            if (!saving) setConfirmation(null);
          }}
        >
          <AppText>{ACTION_DESCRIPTIONS[confirmation.action]}</AppText>
          <FieldLabel required>Uzasadnienie</FieldLabel>
          <TextInput
            accessibilityLabel="Uzasadnienie działania"
            multiline
            maxLength={500}
            placeholder="Opisz powód swojej decyzji…"
            placeholderTextColor={theme.textSecondary}
            value={note}
            editable={!saving}
            onChangeText={setNote}
            style={[
              styles.input,
              {
                minHeight: 110,
                textAlignVertical: 'top',
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
          />
          <AppText variant="caption" color="textSecondary">
            {note.trim().length}/500 · zapis zostanie dodany do historii.
          </AppText>
          {actionError ? (
            <AppText accessibilityRole="alert">{actionError}</AppText>
          ) : null}
          <Button
            label={saving ? 'Zapisywanie…' : 'Potwierdź działanie'}
            disabled={saving}
            onPress={() => void submit()}
          />
          <Button
            label="Anuluj"
            variant="secondary"
            disabled={saving}
            onPress={() => setConfirmation(null)}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  denied: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    maxWidth: 660,
    alignSelf: 'center',
    width: '100%',
  },
  topbar: {
    minHeight: 80,
    borderBottomWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, padding: 18, borderRadius: 20, gap: 6, borderWidth: 1 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
  },
  reportRow: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 10 },
  detailCard: { padding: 24, gap: 16 },
  evidence: { padding: 16, borderRadius: 14, gap: 8 },
  history: { borderTopWidth: 1, paddingTop: 14, gap: 6 },
  actionGrid: { gap: 10 },
  notice: { padding: 12, borderRadius: 12 },
});
