import {useState} from 'react';
import {Keyboard, StyleSheet, View} from 'react-native';
import {BottomSheet} from '@/components/ui/bottom-sheet';
import {DescriptionHelperChoice as Choice, DescriptionHelperTrigger} from '@/components/ui/description-helper-controls';
import {AppText, Button, Card} from '@/components/ui/primitives';
import {useTheme} from '@/hooks/use-theme';
import type {TravelerProfile} from '@/types/profile';
import {MAX_GROUP_ABOUT_LENGTH} from './profile-data';
import {ProfileTextField} from './profile-form-fields';
import {
  initialProfileDescriptionAnswers, PROFILE_DESCRIPTION_ACTIVITIES,
  PROFILE_DESCRIPTION_CONNECTIONS, PROFILE_DESCRIPTION_PACES,
  suggestProfileDescription, type ProfileDescriptionAnswers,
} from './profile-description';

export function ProfileDescriptionHelper({profile, onApply}: {profile: TravelerProfile; onApply: (text: string) => void}) {
  const [open, setOpen] = useState(false);
  return <>
    <DescriptionHelperTrigger onPress={() => setOpen(true)} hint="Odpowiedz na trzy krótkie pytania i ułóż propozycję opisu swojej ekipy." />
    {open ? <DescriptionSheet profile={profile} onClose={() => setOpen(false)} onApply={text => {onApply(text); setOpen(false);}} /> : null}
  </>;
}

function DescriptionSheet({profile, onClose, onApply}: {profile: TravelerProfile; onClose: () => void; onApply: (text: string) => void}) {
  const theme = useTheme();
  const [answers, setAnswers] = useState(() => initialProfileDescriptionAnswers(profile.group));
  const [stage, setStage] = useState<'questions' | 'preview' | 'replace'>('questions');
  const [text, setText] = useState('');
  const [variant, setVariant] = useState(0);
  const ready = !!answers.pace && !!answers.connection;
  const validText = !!text.trim() && text.trim().length <= MAX_GROUP_ABOUT_LENGTH;
  const create = (nextVariant = variant) => {
    Keyboard.dismiss();
    setVariant(nextVariant);
    setText(suggestProfileDescription(profile.group, answers, nextVariant));
    setStage('preview');
  };
  const apply = () => {
    Keyboard.dismiss();
    if (profile.about?.trim() && profile.about.trim() !== text.trim()) setStage('replace');
    else onApply(text.trim());
  };
  const update = <K extends keyof ProfileDescriptionAnswers>(key: K, value: ProfileDescriptionAnswers[K]) => setAnswers(current => ({...current, [key]: value}));
  return <BottomSheet title="Pomóż mi napisać opis" onClose={onClose} footer={
    stage === 'questions' ? <>
      {!ready ? <AppText variant="caption" color="textSecondary">Wybierz tempo podróżowania i to, co cenisz we wspólnym czasie.</AppText> : null}
      <Button label="Utwórz propozycję opisu" disabled={!ready} onPress={() => create()} icon="edit" />
    </> : stage === 'preview' ? <>
      <Button label="Wstaw opis" disabled={!validText} onPress={apply} icon="check" />
      <Button label="Zmień odpowiedzi" variant="secondary" onPress={() => {Keyboard.dismiss(); setStage('questions');}} />
    </> : <>
      <Button label="Zastąp opis" disabled={!validText} onPress={() => onApply(text.trim())} />
      <Button label="Wróć do propozycji" variant="secondary" onPress={() => setStage('preview')} />
    </>
  }>
    {stage === 'questions' ? <>
      <AppText color="textSecondary">Opowiedz, jak lubisz podróżować. Z odpowiedzi i danych ekipy ułożymy propozycję „O mojej ekipie”, którą dopasujesz po swojemu.</AppText>
      <View style={styles.section}>
        <AppText variant="label" accessibilityRole="header">1. Jakie tempo podróżowania lubisz?</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Tempo podróżowania" style={styles.choices}>
          {PROFILE_DESCRIPTION_PACES.map(o => <Choice key={o.id} label={o.label} selected={answers.pace === o.id} onPress={() => update('pace', o.id)} />)}
        </View>
      </View>
      <View style={[styles.section, {borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16}]}>
        <AppText variant="label" accessibilityRole="header">2. Co najbardziej lubisz na wyjazdach?</AppText>
        <AppText variant="caption" color="textSecondary">Możesz wybrać kilka opcji lub pominąć to pytanie. Te wybory dotyczą tylko opisu.</AppText>
        <View style={styles.choices}>
          {PROFILE_DESCRIPTION_ACTIVITIES.map(o => <Choice key={o.id} multiple label={o.id} selected={answers.activities.includes(o.id)}
            onPress={() => update('activities', answers.activities.includes(o.id) ? answers.activities.filter(id => id !== o.id) : [...answers.activities, o.id])} />)}
        </View>
      </View>
      <View style={[styles.section, {borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16}]}>
        <AppText variant="label" accessibilityRole="header">3. Co cenisz we wspólnym czasie z innymi?</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel="Wspólny czas z innymi" style={styles.choices}>
          {PROFILE_DESCRIPTION_CONNECTIONS.map(o => <Choice key={o.id} label={o.label} selected={answers.connection === o.id} onPress={() => update('connection', o.id)} />)}
        </View>
      </View>
    </> : stage === 'preview' ? <>
      <AppText color="textSecondary">Możesz poprawić propozycję przed wstawieniem. Opis zapisze się dopiero razem z profilem.</AppText>
      <ProfileTextField label="Propozycja opisu" value={text} onChangeText={setText} multiline maxLength={MAX_GROUP_ABOUT_LENGTH} showCounter />
      <Button label="Zaproponuj inaczej" variant="secondary" onPress={() => create(variant + 1)} />
    </> : <>
      <AppText variant="label" accessibilityRole="header">Zastąpić dotychczasowy opis?</AppText>
      <AppText color="textSecondary">W formularzu jest już Twój tekst. Nowa propozycja zastąpi go po potwierdzeniu.</AppText>
      <Card style={{backgroundColor: theme.background, gap: 8}}>
        <AppText variant="caption" color="textSecondary">Dotychczasowy opis</AppText>
        <AppText numberOfLines={4}>{profile.about}</AppText>
      </Card>
      <Card style={{backgroundColor: theme.background, gap: 8}}>
        <AppText variant="caption" color="textSecondary">Nowy opis</AppText>
        <AppText numberOfLines={4}>{text}</AppText>
      </Card>
    </>}
  </BottomSheet>;
}

const styles = StyleSheet.create({
  section: {gap: 10, marginTop: 4},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
});
