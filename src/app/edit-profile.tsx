import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
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
  TRAVEL_MODE_OPTIONS,
} from '@/features/profile/profile-options';
import { ProfileSubpageHeader } from '@/features/profile/profile-ui';
import type { ProfileSection } from '@/types/profile';
import { useTheme } from '@/hooks/use-theme';
import { GroupAnimalFields } from '@/features/animals/animal-fields';

const titles: Record<ProfileSection, string> = {
  crew: 'Nasza ekipa',
  travel: 'Jak podróżujemy',
  interests: 'Co lubimy',
  matching: 'Kogo chcemy poznać?',
  animals: 'Zwierzęta w naszej ekipie',
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

export default function EditProfileScreen() {
  const { section, from } = useLocalSearchParams<{
    section?: string;
    from?: string;
  }>();
  const { profile, saveProfile } = useProfile();
  const theme = useTheme();
  const [draft, setDraft] = useState(() => cloneProfile(profile));
  const [errors, setErrors] = useState<string[]>([]);
  const sectionName = isProfileSection(section) ? section : undefined;
  const show = (name: ProfileSection) => !sectionName || sectionName === name;
  const back = () => {
    Keyboard.dismiss();
    router.dismissTo(from === 'home' ? '/' : '/profile');
  };
  const save = () => {
    const nextErrors = saveProfile(draft);
    setErrors(nextErrors);
    if (!nextErrors.length) back();
  };
  return (
    <Screen>
      <ProfileSubpageHeader
        title={sectionName ? titles[sectionName] : 'Edytuj profil'}
        onBack={back}
        backLabel={from === 'home' ? 'Wróć na Start' : 'Wróć do profilu'}
      />
      {show('crew') ? (
        <Card>
          <SectionTitle title="Nasza ekipa" />
          <ProfileTextField
            label="Nazwa ekipy"
            value={draft.group.name}
            maxLength={40}
            onChangeText={(name) =>
              setDraft((current) => ({
                ...current,
                group: { ...current.group, name },
              }))
            }
          />
          <ProfileCounter
            label="Dorośli"
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
              <AppText variant="label">Wiek dzieci</AppText>
              <AppText variant="caption" color="textSecondary">
                Opcjonalnie. Wybierz przybliżone przedziały — bez imion i dat
                urodzenia.
              </AppText>
              <View style={layout.wrap}>
                {CHILD_AGE_BANDS.map((band) => (
                  <Chip
                    key={band}
                    label={band + ' lat'}
                    accessibilityLabel={'Wiek naszych dzieci: ' + band + ' lat'}
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
          <SectionTitle title="Zwierzęta w naszej ekipie" />
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
            title="Jak podróżujemy"
            detail="Możecie wybrać kilka sposobów."
          />
          <View style={layout.wrap}>
            {TRAVEL_MODE_OPTIONS.map((mode) => (
              <Chip
                key={mode}
                label={mode}
                accessibilityLabel={'Sposób podróżowania: ' + mode}
                selected={draft.group.travelModes.includes(mode)}
                onPress={() =>
                  setDraft((current) => ({
                    ...current,
                    group: {
                      ...current.group,
                      travelModes: toggle(current.group.travelModes, mode),
                    },
                  }))
                }
              />
            ))}
          </View>
        </Card>
      ) : null}
      {show('interests') ? (
        <Card>
          <SectionTitle
            title="Co lubimy"
            detail="Co najchętniej robicie na wyjazdach?"
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
          <SectionTitle title="Kogo chcemy poznać?" />
          <AppText variant="label">Towarzystwo na wyjazd</AppText>
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
          <AppText variant="label">Preferowany wiek dzieci</AppText>
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
            Opcjonalnie. To preferencja dotycząca towarzystwa, niezależna od
            wieku Waszych dzieci.
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
      <Button label="Zapisz zmiany" icon="check" onPress={save} />
      {IS_DEMO_MODE ? (
        <AppText variant="caption" color="textSecondary">
          Edycja dotyczy profilu demonstracyjnego. Zmiany zachowują się do
          ponownego uruchomienia aplikacji.
        </AppText>
      ) : null}
    </Screen>
  );
}
