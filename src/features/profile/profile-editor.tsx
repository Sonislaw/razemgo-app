import {
  AppText,
  Button,
  Card,
  Chip,
  FieldLabel,
  layout,
  PageHeader,
  Screen,
  SectionTitle,
} from '@/components/ui/primitives';
import { IS_DEMO_MODE } from '@/constants/app';
import { CHILD_AGE_BANDS } from '@/constants/travel';
import { GroupAnimalFields } from '@/features/animals/animal-fields';
import { ChipRow } from '@/components/ui/chip-row';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileAvatarPicker } from '@/features/profile/profile-avatar-picker';
import { useProfile } from '@/features/profile/profile-context';
import {
  cloneProfile,
  MAX_GROUP_ABOUT_LENGTH,
  MAX_GROUP_NAME_LENGTH,
} from '@/features/profile/profile-data';
import {
  ProfileCounter,
  ProfileTextField,
} from '@/features/profile/profile-form-fields';
import {
  GROUP_KIND_OPTIONS,
  INTEREST_OPTIONS,
} from '@/features/profile/profile-options';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import { TravelModePicker } from '@/features/profile/travel-mode-ui';
import { useTheme } from '@/hooks/use-theme';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { ProfileSection } from '@/types/profile';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';

const titles: Record<ProfileSection, string> = {
  crew: 'Moja ekipa',
  travel: 'Jak podróżuję',
  interests: 'Co lubię',
  animals: 'Zwierzęta w mojej ekipie',
};
const toggle = <T,>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
function isProfileSection(value: unknown): value is ProfileSection {
  return (
    typeof value === 'string' &&
    ['crew', 'travel', 'interests', 'animals'].includes(value)
  );
}

export default function ProfileEditor({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const { section, from } = useLocalSearchParams<{
    section?: string;
    from?: string;
  }>();
  const { profile, saveProfile, isSaving } = useProfile();
  const { signOut } = useAuth();
  const theme = useTheme();
  const [initial] = useState(() => cloneProfile(profile));
  const [draft, setDraft] = useState(() => cloneProfile(initial));
  const [errors, setErrors] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [exitAction, setExitAction] = useState<(() => void) | null>(null);
  const saving = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const disablePrevention = usePreventRemove(!onboarding && dirty && !leaving, ({ repeat }) => {
    Keyboard.dismiss();
    if (!saving.current) setExitAction(() => repeat);
  });
  const returnToProfile = () => router.dismissTo(from === 'home' ? '/' : '/profile');
  const leave = (action = returnToProfile) => {
    setLeaving(true);
    disablePrevention();
    setExitAction(null);
    action();
  };
  const sectionName =
    !onboarding && isProfileSection(section) ? section : undefined;
  const show = (name: ProfileSection) =>
    onboarding
      ? ['crew', 'travel'].includes(name)
      : sectionName
        ? sectionName === name
        : true;
  const back = () => {
    Keyboard.dismiss();
    if (saving.current) return;
    if (dirty) setExitAction(() => returnToProfile);
    else returnToProfile();
  };
  const save = async (afterSave = returnToProfile) => {
    if (saving.current) return;
    saving.current = true;
    try {
      const next = { ...draft };
      // Other profile edits must not overwrite a description changed elsewhere.
      if (draft.about === profile.about) delete next.about;
      const nextErrors = await saveProfile(next);
      setErrors(nextErrors);
      if (!nextErrors.length) {
        if (onboarding) router.replace('/account-loading');
        else leave(afterSave);
      }
    } finally { saving.current = false; }
  };
  return (
    <>
    <Screen>
      {onboarding ? (
        <>
          <PageHeader title="Poznajmy Twoją ekipę" />
          <AppText color="textSecondary">
            Uzupełnij podstawy. Zainteresowania i zwierzęta możesz dodać
            później w profilu.
          </AppText>
        </>
      ) : (
        <ProfileSubpageHeader
          title={sectionName ? titles[sectionName] : 'Edytuj profil'}
          onBack={back}
          backLabel={from === 'home' ? 'Wróć na Start' : 'Wróć do profilu'}
        />
      )}
      {show('crew') ? (
        <Card>
          <SectionTitle title="Moja ekipa" />
          <ProfileAvatarPicker
            value={draft.group.avatarId}
            onChange={(avatarId) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, avatarId },
              }))
            }
          />
          <ProfileTextField
            label="Nazwa ekipy"
            required
            value={draft.group.name}
            maxLength={MAX_GROUP_NAME_LENGTH}
            hint="Maksymalnie 20 znaków."
            onChangeText={(name) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, name },
              }))
            }
          />
          {!onboarding ? (
            <>
              <ProfileTextField
                label="O mojej ekipie"
                value={draft.about ?? ''}
                maxLength={MAX_GROUP_ABOUT_LENGTH}
                multiline
                onChangeText={(about) =>
                  setDraft((current) => ({ ...current, about }))
                }
                hint="Publiczny opis: co lubisz i jak podróżujesz? Bez adresu zamieszkania, danych kontaktowych i szczegółowych danych dzieci."
              />
              <AppText variant="caption" color="textSecondary">
                {(draft.about ?? '').length}/{MAX_GROUP_ABOUT_LENGTH}
              </AppText>
            </>
          ) : null}
          <FieldLabel required>Rodzaj ekipy</FieldLabel>
          <ChipRow horizontal label="Rodzaj ekipy">
            {GROUP_KIND_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={draft.group.kind === option.value}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    group: { ...current.group, kind: option.value },
                  }))
                }
              />
            ))}
          </ChipRow>
          <ProfileCounter
            label="Dorośli"
            required
            value={draft.group.adultCount}
            min={1}
            max={8}
            onChange={(adultCount) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, adultCount },
              }))
            }
          />
          <ProfileCounter
            label="Dzieci"
            value={draft.group.childCount}
            min={0}
            max={6}
            onChange={(childCount) =>
              setDraft((current) => ({
                ...current,
                group: {
                  ...current.group,
                  childCount,
                  childAgeBands: childCount ? current.group.childAgeBands : [],
                },
              }))
            }
          />
          {draft.group.childCount > 0 ? (
            <View style={layout.stack}>
              <FieldLabel>Wiek dzieci</FieldLabel>
              <AppText variant="caption" color="textSecondary">
                Wybierz przybliżone przedziały — bez imion i dat urodzenia.
              </AppText>
              <ChipRow horizontal label="Wiek dzieci">
                {CHILD_AGE_BANDS.map((band) => (
                  <Chip
                    key={band}
                    label={band + ' lat'}
                    accessibilityLabel={'Wiek moich dzieci: ' + band + ' lat'}
                    selected={draft.group.childAgeBands.includes(band)}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        group: {
                          ...current.group,
                          childAgeBands: toggle(
                            current.group.childAgeBands,
                            band,
                          ),
                        },
                      }))
                    }
                  />
                ))}
              </ChipRow>
            </View>
          ) : null}
        </Card>
      ) : null}
      {show('animals') ? (
        <Card>
          <SectionTitle title="Zwierzęta w mojej ekipie" />
          <GroupAnimalFields
            horizontal
            value={draft.group.animals}
            onChange={(animals) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, animals },
              }))
            }
          />
        </Card>
      ) : null}
      {show('travel') ? (
        <Card>
          <SectionTitle
            title="Jak podróżuję"
            required
            detail="Wybierz jeden sposób podróżowania."
          />
          <TravelModePicker
            horizontal
            value={draft.group.travelModes}
            onChange={(travelModes) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, travelModes },
              }))
            }
          />
        </Card>
      ) : null}
      {show('interests') ? (
        <Card>
          <SectionTitle
            title="Co lubię"
            detail="Co najchętniej robisz na wyjazdach?"
          />
          <ChipRow horizontal label="Co lubię">
            {INTEREST_OPTIONS.map((interest) => (
              <Chip
                key={interest}
                label={interest}
                accessibilityLabel={'Zainteresowanie: ' + interest}
                selected={draft.group.interests.includes(interest)}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    group: {
                      ...current.group,
                      interests: toggle(current.group.interests, interest),
                    },
                  }))
                }
              />
            ))}
          </ChipRow>
        </Card>
      ) : null}
      {errors.length ? (
        <Card
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={{ backgroundColor: theme.hero }}
        >
          <AppText variant="label">Sprawdź dane przed zapisem</AppText>
          {errors.map((error) => (
            <AppText key={error} variant="label">
              {error}
            </AppText>
          ))}
        </Card>
      ) : null}
      <Button
        label={
          isSaving
            ? 'Zapisywanie…'
            : onboarding
              ? 'Zapisz profil i zacznij'
              : 'Zapisz zmiany'
        }
        disabled={isSaving}
        icon="check"
        onPress={() => void save()}
      />
      {onboarding ? (
        <Button
          label="Wyloguj się"
          variant="secondary"
          disabled={isSaving}
          onPress={() =>
            void signOut().catch(() =>
              setErrors(['Nie udało się wylogować. Spróbuj ponownie.']),
            )
          }
        />
      ) : null}
      {IS_DEMO_MODE ? (
        <AppText variant="caption" color="textSecondary">
          Edycja dotyczy profilu demonstracyjnego. Zmiany zachowują się do
          ponownego uruchomienia aplikacji.
        </AppText>
      ) : null}
    </Screen>
    {exitAction ? (
      <BottomSheet title="Zapisać zmiany profilu?" onClose={() => { if (!saving.current) setExitAction(null); }}>
        <AppText color="textSecondary">Masz niezapisane zmiany. Zapisz je przed wyjściem lub wróć do edycji.</AppText>
        {errors.map(error => <AppText key={error} accessibilityRole="alert">{error}</AppText>)}
        <Button label={isSaving ? 'Zapisywanie…' : 'Zapisz i wyjdź'} icon="check" disabled={isSaving}
          onPress={() => void save(exitAction)} />
        <Button label="Kontynuuj edycję" variant="secondary" disabled={isSaving} onPress={() => setExitAction(null)} />
        <Button label="Odrzuć zmiany i wyjdź" variant="secondary" disabled={isSaving} onPress={() => leave(exitAction)} />
      </BottomSheet>
    ) : null}
    </>
  );
}
