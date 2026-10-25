import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  FieldLabel,
  PageHeader,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import { IS_DEMO_MODE } from '@/constants/app';
import { useProfile } from '@/features/profile/profile-context';
import { cloneProfile } from '@/features/profile/profile-data';
import {
  ProfileCounter,
  ProfileTextField,
} from '@/features/profile/profile-form-fields';
import {
  GROUP_KIND_OPTIONS,
  INTEREST_OPTIONS,
} from '@/features/profile/profile-options';
import { TravelModePicker } from '@/features/profile/travel-mode-ui';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import type { ProfileSection } from '@/types/profile';
import { useTheme } from '@/hooks/use-theme';
import { GroupAnimalFields } from '@/features/animals/animal-fields';
import { ProfileAvatarPicker } from '@/features/profile/profile-avatar-picker';
import { useAuth } from '@/features/auth/auth-context';

const titles: Record<ProfileSection, string> = {
  crew: 'Moja ekipa',
  travel: 'Jak podróżuję',
  interests: 'Co lubię',
  matching: 'Kogo chcę poznać?',
  animals: 'Zwierzęta w mojej ekipie',
};
const toggle = <T,>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
function isProfileSection(value: unknown): value is ProfileSection {
  return (
    typeof value === 'string' &&
    ['crew', 'travel', 'interests', 'matching', 'animals'].includes(value)
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
  const [draft, setDraft] = useState(() => cloneProfile(profile));
  const [errors, setErrors] = useState<string[]>([]);
  const sectionName =
    !onboarding && isProfileSection(section) ? section : undefined;
  const show = (name: ProfileSection) =>
    onboarding
      ? ['crew', 'travel'].includes(name)
      : sectionName ? sectionName === name : name !== 'matching';
  const back = () => {
    Keyboard.dismiss();
    router.dismissTo(from === 'home' ? '/' : '/profile');
  };
  const save = async () => {
    const nextErrors = await saveProfile(draft);
    setErrors(nextErrors);
    if (!nextErrors.length) {
      if (onboarding) router.replace('/account-loading');
      else back();
    }
  };
  return (
    <Screen>
      {onboarding ? (
        <>
          <PageHeader title="Poznajmy Twoją ekipę" />
          <AppText color="textSecondary">
            Uzupełnij podstawy. Zainteresowania i preferencje możesz dodać
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
            maxLength={40}
            onChangeText={(name) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, name },
              }))
            }
          />
          <FieldLabel required>Rodzaj ekipy</FieldLabel>
          <View style={layout.wrap}>
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
          </View>
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
              <View style={layout.wrap}>
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
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}
      {show('animals') ? (
        <Card>
          <SectionTitle title="Zwierzęta w mojej ekipie" />
          <GroupAnimalFields
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
          <View style={layout.wrap}>
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
          </View>
        </Card>
      ) : null}
      {show('matching') ? (
        <Card>
          <SectionTitle title="Kogo chcę poznać?" />
          <FieldLabel>Towarzystwo na wyjazd</FieldLabel>
          <View style={layout.wrap}>
            {GROUP_KIND_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                accessibilityLabel={'Towarzystwo: ' + option.label}
                selected={draft.matching.groupKinds.includes(option.value)}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    matching: {
                      ...current.matching,
                      groupKinds: toggle(
                        current.matching.groupKinds,
                        option.value,
                      ),
                    },
                  }))
                }
              />
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">
            Brak wyboru oznacza otwartość na wszystkich podróżników.
          </AppText>
          <FieldLabel>Preferowany wiek dzieci</FieldLabel>
          <View style={layout.wrap}>
            {CHILD_AGE_BANDS.map((band) => (
              <Chip
                key={band}
                label={band + ' lat'}
                accessibilityLabel={'Preferowany wiek dzieci: ' + band + ' lat'}
                selected={draft.matching.childAgeBands.includes(band)}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    matching: {
                      ...current.matching,
                      childAgeBands: toggle(
                        current.matching.childAgeBands,
                        band,
                      ),
                    },
                  }))
                }
              />
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">
            To preferencja dotycząca towarzystwa, niezależna od wieku Twoich
            dzieci.
          </AppText>
          <ProfileTextField
            label="Kilka słów o towarzystwie"
            value={draft.matching.description}
            maxLength={240}
            multiline
            onChangeText={(description) =>
              setDraft((current) => ({
                ...current,
                matching: { ...current.matching, description },
              }))
            }
          />
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
  );
}
