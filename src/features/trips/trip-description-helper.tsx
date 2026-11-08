import {useEffect, useRef, useState} from 'react';
import {Keyboard, Pressable, StyleSheet, View} from 'react-native';
import {BottomSheet} from '@/components/ui/bottom-sheet';
import {Icon} from '@/components/ui/icon';
import {AppText, Button, Card} from '@/components/ui/primitives';
import {ProfileTextField} from '@/features/profile/profile-form-fields';
import {useTheme} from '@/hooks/use-theme';
import type {TripForm} from '@/types/owned-trip';
import type {SelectedPlace} from '@/types/place';
import {resolvePlace} from './places-repository';
import {MAX_TRIP_DESCRIPTION_LENGTH, MIN_TRIP_DESCRIPTION_LENGTH, tripDescriptionLength} from './own-trips-state';
import {
  DESCRIPTION_ACTIVITIES, DESCRIPTION_COMPANIES, DESCRIPTION_PACES,
  initialDescriptionAnswers, suggestTripDescription, type DescriptionAnswers,
} from './trip-description';

export function TripDescriptionHelper({form, onApply}: {form: TripForm; onApply: (text: string) => void}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Pomóż mi napisać opis" accessibilityHint="Odpowiedz na trzy krótkie pytania i ułóż propozycję opisu."
      onPress={() => { Keyboard.dismiss(); setOpen(true); }}
      style={({pressed}) => [styles.trigger, {backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1}]}>
      <AppText accessible={false} aria-hidden style={{fontSize: 18}}>✨</AppText>
      <AppText variant="caption" color="primaryStrong" style={{fontWeight: '700', flexShrink: 1}}>Pomóż mi napisać opis</AppText>
    </Pressable>
    {open ? <DescriptionSheet form={form} onClose={() => setOpen(false)} onApply={text => {onApply(text); setOpen(false);}} /> : null}
  </>;
}

function DescriptionSheet({form, onClose, onApply}: {form: TripForm; onClose: () => void; onApply: (text: string) => void}) {
  const theme = useTheme();
  const [answers, setAnswers] = useState(() => initialDescriptionAnswers(form));
  const [stage, setStage] = useState<'questions' | 'preview' | 'replace'>('questions');
  const [text, setText] = useState('');
  const [variant, setVariant] = useState(0);
  const [generating, setGenerating] = useState(false);
  const resolvedPlace = useRef<SelectedPlace | undefined>(form.place);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {request.current?.abort(); request.current = null;}, []);
  const ready = !!answers.company && !!answers.pace;
  const validText = tripDescriptionLength(text) >= MIN_TRIP_DESCRIPTION_LENGTH && text.trim().length <= MAX_TRIP_DESCRIPTION_LENGTH;
  const create = async (nextVariant = variant) => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller; setGenerating(true);
    try {
      let place = resolvedPlace.current;
      // Saved Google metadata contains the user's original search label. Fetch
      // the provider's name for this preview, keeping it out of the place cache.
      if (place?.source === 'google' && !place.resolvedAt) {
        try { place = await resolvePlace(place.googlePlaceId!, place.userLabel ?? place.name, undefined, controller.signal, form.mode === 'flexible'); }
        catch { place = undefined; }
      }
      if (controller.signal.aborted) return;
      resolvedPlace.current = place;
      setVariant(nextVariant);
      setText(suggestTripDescription({...form, place}, answers, nextVariant));
      setStage('preview');
    } finally {
      if (request.current === controller) { request.current = null; setGenerating(false); }
    }
  };
  const apply = () => {
    Keyboard.dismiss();
    if (form.description.trim() && form.description.trim() !== text.trim()) setStage('replace');
    else onApply(text.trim());
  };
  const update = <K extends keyof DescriptionAnswers>(key: K, value: DescriptionAnswers[K]) => setAnswers(current => ({...current, [key]: value}));
  return <BottomSheet title="Pomóż mi napisać opis" onClose={onClose} footer={
    stage === 'questions' ? <>
      {!ready ? <AppText variant="caption" color="textSecondary">Wybierz towarzystwo i tempo wyjazdu.</AppText> : null}
      <Button label={generating ? 'Pobieranie nazwy miejsca…' : 'Utwórz propozycję opisu'} disabled={!ready || generating} onPress={() => {void create();}} icon="edit" />
    </> : stage === 'preview' ? <>
      <Button label="Wstaw opis" disabled={!validText || generating} onPress={apply} icon="check" />
      <Button label="Zmień odpowiedzi" disabled={generating} variant="secondary" onPress={() => {Keyboard.dismiss(); setStage('questions');}} />
    </> : <>
      <Button label="Zastąp opis" onPress={() => onApply(text.trim())} />
      <Button label="Wróć do propozycji" variant="secondary" onPress={() => setStage('preview')} />
    </>
  }>
    {stage === 'questions' ? <>
      <AppText color="textSecondary">Dwa wybory i kilka pomysłów wystarczą na początek. Gotowy opis dopasujesz po swojemu.</AppText>
      <View style={styles.section}>
        <AppText variant="label" accessibilityRole="header">1. Z kim chcecie spędzić czas?</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Towarzystwo do opisu" style={styles.choices}>
          {DESCRIPTION_COMPANIES.map(o => <Choice key={o.id} label={o.label} selected={answers.company === o.id} onPress={() => update('company', o.id)} />)}
        </View>
      </View>
      <View style={[styles.section, {borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16}]}>
        <AppText variant="label" accessibilityRole="header">2. Jaki ma być wyjazd?</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Tempo wyjazdu" style={styles.choices}>
          {DESCRIPTION_PACES.map(o => <Choice key={o.id} label={o.label} selected={answers.pace === o.id} onPress={() => update('pace', o.id)} />)}
        </View>
      </View>
      <View style={[styles.section, {borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16}]}>
        <AppText variant="label" accessibilityRole="header">3. Co chcielibyście robić?</AppText>
        <AppText variant="caption" color="textSecondary">Możesz wybrać kilka opcji lub pominąć to pytanie.</AppText>
        <View style={styles.choices}>
          {DESCRIPTION_ACTIVITIES.map(o => <Choice key={o.id} multiple label={o.id} selected={answers.activities.includes(o.id)}
            onPress={() => update('activities', answers.activities.includes(o.id) ? answers.activities.filter(id => id !== o.id) : [...answers.activities, o.id])} />)}
        </View>
      </View>
    </> : stage === 'preview' ? <>
      <AppText color="textSecondary">To propozycja na podstawie Twoich odpowiedzi. Możesz ją teraz zmienić albo edytować później w formularzu.</AppText>
      <ProfileTextField label="Propozycja opisu" value={text} onChangeText={setText} multiline maxLength={MAX_TRIP_DESCRIPTION_LENGTH}
        hint={`${tripDescriptionLength(text)}/${MAX_TRIP_DESCRIPTION_LENGTH} znaków · minimum ${MIN_TRIP_DESCRIPTION_LENGTH}`} />
      <Button label="Zaproponuj inaczej" disabled={generating} variant="secondary" onPress={() => {
        Keyboard.dismiss(); void create(variant + 1);
      }} />
    </> : <>
      <AppText variant="label" accessibilityRole="header">Zastąpić dotychczasowy opis?</AppText>
      <AppText color="textSecondary">W formularzu jest już Twój tekst. Nowa propozycja zastąpi go po potwierdzeniu.</AppText>
      <Card style={{backgroundColor: theme.background, gap: 8}}>
        <AppText variant="caption" color="textSecondary">Dotychczasowy opis</AppText>
        <AppText numberOfLines={4}>{form.description}</AppText>
      </Card>
      <Card style={{backgroundColor: theme.background, gap: 8}}>
        <AppText variant="caption" color="textSecondary">Nowy opis</AppText>
        <AppText numberOfLines={4}>{text}</AppText>
      </Card>
    </>}
  </BottomSheet>;
}

function Choice({label, selected, onPress, multiple = false}: {label: string; selected: boolean; onPress: () => void; multiple?: boolean}) {
  const theme = useTheme();
  return <Pressable accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={{checked: selected}} onPress={onPress} style={({pressed}) => [styles.choice, {
      borderColor: selected ? theme.primaryStrong : theme.border, backgroundColor: selected ? theme.backgroundSelected : theme.background,
      opacity: pressed ? 0.7 : 1,
    }]}>
    {selected ? <Icon name="check" size={16} /> : <View style={[styles.unchecked, {borderColor: theme.textSecondary, borderRadius: multiple ? 4 : 8}]} />}
    <AppText variant="caption" color={selected ? 'primaryStrong' : 'text'} style={{flexShrink: 1, fontWeight: selected ? '700' : '400'}}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: {alignSelf: 'flex-start', minHeight: 44, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8},
  section: {gap: 10, marginTop: 4},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  choice: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10},
  unchecked: {width: 16, height: 16, borderWidth: 1},
});
