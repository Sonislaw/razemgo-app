import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { AppText, Button, Chip, IconButton, layout } from '@/components/ui/primitives';
import { Radius } from '@/constants/theme';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { useCurrentDate } from '@/hooks/use-current-date';
import { useTheme } from '@/hooks/use-theme';
import { createRequestKey } from '@/lib/request-key';
import { useSavedFilters } from './saved-filter-context';
import {
  FILTER_SET_LIMIT, filterSetExpired, filterSetNameError, filterSetPayload, filterSetSummary,
  type FilterSetDraft, type SavedFilterKind, type SavedFilterSet,
} from './saved-filter-data';

function CatalogStatus() {
  const { status, error, store } = useSavedFilters();
  if (status === 'ready' && !error) return null;
  return <View style={layout.stack}>
    <AppText variant="caption" accessibilityRole={error ? 'alert' : undefined}>
      {error ?? 'Wczytywanie zapisanych filtrów…'}
    </AppText>
    {error ? <Button label="Spróbuj ponownie" variant="secondary" onPress={() => void store?.refresh()} /> : null}
  </View>;
}

export function SaveFilterSetButton({ value, disabled, onSaved }: {
  value: FilterSetDraft;
  disabled?: boolean;
  onSaved: (item: SavedFilterSet) => void;
}) {
  const [open, setOpen] = useState(false);
  return <View style={styles.flex}>
    <Button label="Zapisz zestaw" variant="secondary" icon="bookmark" disabled={disabled} onPress={() => setOpen(true)} />
    {open ? <SaveFilterSetSheet value={value} onClose={() => setOpen(false)} onSaved={item => { setOpen(false); onSaved(item); }} /> : null}
  </View>;
}

function SaveFilterSetSheet({ value, onClose, onSaved }: {
  value: FilterSetDraft;
  onClose: () => void;
  onSaved: (item: SavedFilterSet) => void;
}) {
  const { items, status, busy, store } = useSavedFilters();
  const [id] = useState(createRequestKey);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [targetId, setTargetId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const today = useCurrentDate();
  const siblings = items.filter(item => item.kind === value.kind);
  const target = siblings.find(item => item.id === targetId);
  // A committed request whose acknowledgement was lost can be retried at the
  // capacity limit with the same id, even after a catalog refresh.
  const atLimit = siblings.length >= FILTER_SET_LIMIT && !siblings.some(item => item.id === id);
  useEffect(() => { void store?.refresh(); }, [store]);
  const save = async () => {
    const chosenName = mode === 'new' ? name : target?.name ?? '';
    const invalid = filterSetNameError(chosenName);
    if (invalid) { setError(invalid); return; }
    if (!store || busy || status !== 'ready') return;
    try {
      const result = await store.save({ id: mode === 'new' ? id : target!.id, kind: value.kind,
        name: chosenName, filters: filterSetPayload(value) });
      if (result.item) onSaved(result.item);
      else setError(result.error);
    } catch { setError('Sprawdź kryteria zestawu i spróbuj ponownie.'); }
  };
  return <BottomSheet title="Zapisz zestaw filtrów" onClose={() => { if (!busy) onClose(); }}>
    <AppText variant="caption" color="textSecondary">{filterSetSummary(value)}</AppText>
    {filterSetExpired(value, today) ? <AppText variant="caption">Termin w tym zestawie już minął</AppText> : null}
    <View style={layout.wrap}>
      <Chip label="Nowy zestaw" selected={mode === 'new'} onPress={busy ? undefined : () => { setMode('new'); setError(null); }} />
      <Chip label="Zastąp istniejący" selected={mode === 'replace'} onPress={busy ? undefined : () => { setMode('replace'); setError(null); }} />
    </View>
    <CatalogStatus />
    {mode === 'new' ? <>
      <ProfileTextField label="Nazwa zestawu" value={name} onChangeText={text => { if (!busy) { setName(text); setError(null); } }}
        maxLength={80} hint="Od 1 do 40 znaków, np. Majówka nad morzem." required />
      {atLimit ? <AppText variant="caption">Masz już 10 zestawów w tej zakładce. Zastąp istniejący lub usuń jeden z zapisów.</AppText> : null}
    </> : <>
      <AppText variant="caption">Wybierz zestaw z tej zakładki. Zastąpienie zmieni wszystkie jego kryteria i zachowa nazwę.</AppText>
      {siblings.length ? siblings.map(item => <Chip key={item.id} label={item.name} selected={item.id === targetId}
        onPress={busy ? undefined : () => { setTargetId(item.id); setError(null); }} />)
        : <AppText variant="caption">Nie masz jeszcze zestawów do zastąpienia.</AppText>}
      {target ? <AppText variant="caption">Potwierdź zastąpienie „{target.name}” kryteriami pokazanymi powyżej.</AppText> : null}
    </>}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    <Button label={busy ? 'Zapisywanie…' : mode === 'new' ? 'Zapisz i pokaż wyniki' : 'Zastąp zestaw'}
      disabled={busy || status !== 'ready' || !store || (mode === 'new' ? atLimit || !!filterSetNameError(name) : !target)} onPress={() => void save()} />
  </BottomSheet>;
}

export function SavedFiltersButton({ kind, onApply }: { kind: SavedFilterKind; onApply: (item: SavedFilterSet) => void }) {
  const { items, status } = useSavedFilters();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const count = status === 'loading' ? '…' : items.filter(item => item.kind === kind).length;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Zapisane · ${count}`} onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.savedButton, { opacity: pressed ? 0.65 : 1 }]}>
      <Icon name="bookmark" size={18} color={theme.primaryStrong} />
      <AppText variant="label" style={{ fontSize: 13, color: theme.primaryStrong }}>Zapisane · {count}</AppText>
    </Pressable>
    {open ? <SavedFilterListSheet kind={kind} onClose={() => setOpen(false)} onApply={item => { setOpen(false); onApply(item); }} /> : null}
  </>;
}

function SavedFilterListSheet({ kind, onClose, onApply }: {
  kind: SavedFilterKind; onClose: () => void; onApply: (item: SavedFilterSet) => void;
}) {
  const { items, status, store, busy } = useSavedFilters();
  const theme = useTheme();
  const today = useCurrentDate();
  const [managedId, setManagedId] = useState<string>();
  const selected = items.find(item => item.id === managedId);
  const siblings = items.filter(item => item.kind === kind);
  useEffect(() => { void store?.refresh(); }, [store]);
  if (selected) return <ManageFilterSetSheet key={selected.id} item={selected} onClose={() => setManagedId(undefined)} />;
  return <BottomSheet title={kind === 'trips' ? 'Zapisane filtry wyjazdów' : 'Zapisane filtry ekip'} onClose={onClose}>
    <CatalogStatus />
    {status === 'ready' && !siblings.length ? <AppText color="textSecondary">Nie masz jeszcze zapisanych zestawów. Otwórz filtry, wybierz kryteria i użyj „Zapisz zestaw”.</AppText> : null}
    {siblings.map(item => <View key={item.id} style={[styles.item, { borderColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Wczytaj zestaw: ${item.name}`} disabled={busy}
        onPress={() => onApply(item)} style={({ pressed }) => [styles.itemContent, { opacity: pressed ? 0.65 : 1 }]}>
        <AppText variant="label">{item.name}</AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={3}>{filterSetSummary(item)}</AppText>
        {filterSetExpired(item, today) ? <AppText variant="caption">Termin w tym zestawie już minął</AppText> : null}
      </Pressable>
      <IconButton icon="more" label={`Opcje zestawu: ${item.name}`} onPress={() => setManagedId(item.id)} />
    </View>)}
  </BottomSheet>;
}

function ManageFilterSetSheet({ item, onClose }: { item: SavedFilterSet; onClose: () => void }) {
  const { store, busy } = useSavedFilters();
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const [name, setName] = useState(item.name);
  const [error, setError] = useState<string | null>(null);
  const rename = async () => {
    const result = await store?.save({ id: item.id, kind: item.kind, name, filters: null });
    if (result?.item) onClose(); else setError(result?.error ?? null);
  };
  const remove = async () => {
    const result = await store?.remove(item.id);
    if (result?.ok) onClose(); else setError(result?.error ?? null);
  };
  return <BottomSheet title={mode === 'delete' ? 'Usunąć zestaw?' : mode === 'rename' ? 'Zmień nazwę zestawu' : item.name}
    onClose={() => { if (!busy) onClose(); }}>
    {mode === 'menu' ? <>
      <Button label="Zmień nazwę" icon="edit" variant="secondary" onPress={() => setMode('rename')} />
      <Button label="Usuń zestaw" icon="trash" variant="secondary" onPress={() => setMode('delete')} />
    </> : mode === 'rename' ? <>
      <ProfileTextField label="Nazwa zestawu" value={name} onChangeText={text => { if (!busy) { setName(text); setError(null); } }} maxLength={80} required />
      <Button label={busy ? 'Zapisywanie…' : 'Zapisz nazwę'} disabled={busy || !!filterSetNameError(name)} onPress={() => void rename()} />
    </> : <>
      <AppText>Usuniesz zapis „{item.name}”. Bieżące filtry pozostaną bez zmian.</AppText>
      <Button label={busy ? 'Usuwanie…' : 'Potwierdź usunięcie'} disabled={busy} onPress={() => void remove()} />
    </>}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    <Button label="Wróć do zapisanych" variant="secondary" disabled={busy} onPress={onClose} />
  </BottomSheet>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  savedButton: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
  item: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.small, paddingRight: 4 },
  itemContent: { flex: 1, minWidth: 0, minHeight: 64, padding: 12, gap: 4 },
});
