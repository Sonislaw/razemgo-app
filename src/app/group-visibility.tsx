import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Switch, View } from 'react-native';
import { AppText, Button, Card, Screen, layout } from '@/components/ui/primitives';
import { DataStatus } from '@/components/ui/data-status';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { fetchGroupVisibility, saveGroupVisibility } from '@/features/groups/group-repository';
import { groupDirectoryError, type GroupVisibility } from '@/features/groups/group-data';
import { USE_DEMO_DATA } from '@/constants/app';

export default function GroupVisibilityScreen() {
  const [draft, setDraft] = useState<GroupVisibility>({ about: '', discoverable: true });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    setStatus('loading'); setError(null);
    try {
      const loaded = USE_DEMO_DATA ? { about: '', discoverable: true } : await fetchGroupVisibility();
      if (alive.current) { setDraft(loaded); setStatus('ready'); }
    } catch (e) { if (alive.current) { setError(groupDirectoryError(e)); setStatus('error'); } }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const back = () => router.canGoBack() ? router.back() : router.replace('/profile');
  const save = async () => {
    if (pending.current || status !== 'ready' || USE_DEMO_DATA) return;
    pending.current = true; setSaving(true); setError(null);
    try {
      await saveGroupVisibility(draft);
      if (alive.current) back();
    } catch { if (alive.current) setError('Nie udało się zapisać. Zmiany pozostają w formularzu. Spróbuj ponownie.'); }
    finally { pending.current = false; if (alive.current) setSaving(false); }
  };
  return <Screen>
    <ProfileSubpageHeader title="Profil publiczny" onBack={back} />
    <DataStatus status={status} error={error} label="Wczytywanie ustawień profilu" onRetry={() => void load()} />
    {status === 'ready' ? <>
      <Card>
        <View style={layout.row}>
          <AppText variant="label" style={{ flex: 1 }}>Pokaż moją ekipę w wyszukiwarce</AppText>
          <Switch accessibilityLabel="Pokaż moją ekipę w wyszukiwarce" disabled={saving} value={draft.discoverable}
            onValueChange={discoverable => setDraft(prev => ({ ...prev, discoverable }))} />
        </View>
        <AppText color="textSecondary">Inni zalogowani podróżnicy zobaczą nazwę, avatar, skład ekipy, przybliżony wiek dzieci, sposób podróżowania, zainteresowania i zwierzęta. Będą mogli zaprosić Cię do kontaktu również bez ogłoszenia.</AppText>
        <AppText variant="caption" color="textSecondary">Profil jest domyślnie widoczny. Wyłączenie ukrywa ekipę z wyszukiwarki. Profil nadal jest dostępny z publicznych ogłoszeń i nawiązanych kontaktów. Rozmowy pozostają w skrzynce.</AppText>
      </Card>
      <Card>
        <ProfileTextField label="O mojej ekipie" value={draft.about} maxLength={600} multiline onChangeText={about => setDraft(prev => ({ ...prev, about }))}
          hint="Publiczny opis: co lubisz i jak podróżujesz? Bez adresu zamieszkania, danych kontaktowych i szczegółowych danych dzieci." />
        <AppText variant="caption" color="textSecondary">{draft.about.length}/600</AppText>
      </Card>
      {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      {USE_DEMO_DATA ? <AppText color="textSecondary">Podgląd lokalny. Ustawienia nie są zapisywane.</AppText> : null}
      <Button label={saving ? 'Zapisywanie…' : 'Zapisz widoczność profilu'} disabled={saving || USE_DEMO_DATA} icon="check" onPress={() => void save()} />
    </> : null}
  </Screen>;
}
