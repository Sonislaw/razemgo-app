import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Button,
  Card,
  Chip,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import {
  GROUP_KIND_OPTIONS,
  INTEREST_OPTIONS,
  TRAVEL_MODE_OPTIONS,
} from '@/features/profile/profile-options';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  getTripStatus,
  newTripForm,
  toTripForm,
  todayDate,
  tripFromForm,
  validateTripForm,
} from '@/features/trips/own-trips-state';
import { TripDateField } from '@/features/trips/trip-date-field';
import {
  ownTripDates,
  ownTripPlace,
  TripDemoNote,
  TripStatusBadge,
} from '@/features/trips/trip-ui';
import type { TripForm } from '@/types/owned-trip';
import { TripAnimalFields } from '@/features/animals/animal-fields';
import { AnimalInformation } from '@/features/animals/animal-ui';

const toggle = <T,>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
const titles = [
  'Jaki macie plan?',
  'Dokąd i jak podróżujecie?',
  'Kogo chcecie poznać?',
];

export default function TripEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, saveTrip } = useOwnTrips();
  const { profile } = useProfile();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const existing = state.trips.find((trip) => trip.id === id);
  const [initial] = useState(() =>
    existing ? toTripForm(existing) : newTripForm(profile),
  );
  const [form, setForm] = useState<TripForm>(initial);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const submitting = useRef(false);
  const update = <K extends keyof TripForm>(key: K, value: TripForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };
  const close = () => {
    Keyboard.dismiss();
    if (JSON.stringify(form) !== JSON.stringify(initial)) setConfirmExit(true);
    else router.dismissTo('/trips');
  };
  if (id && !existing)
    return (
      <Screen>
        <AppText accessibilityRole="header" variant="heading">
          Ten wyjazd nie jest dostępny
        </AppText>
        <AppText color="textSecondary">
          Mógł zostać usunięty albo pochodzi z poprzedniej sesji
          demonstracyjnej.
        </AppText>
        <Button
          label="Wróć do wyjazdów"
          onPress={() => router.dismissTo('/trips')}
        />
      </Screen>
    );
  const previousStatus = existing
    ? getTripStatus(existing, todayDate())
    : 'draft';
  const canDraft = previousStatus === 'draft';
  const previewStatus =
    previousStatus === 'draft'
      ? form.visibility === 'public'
        ? 'published'
        : 'paused'
      : previousStatus === 'published' && form.visibility === 'private'
        ? 'paused'
        : previousStatus;
  const preview = tripFromForm(
    form,
    id ?? 'preview',
    profile.group.id,
    previewStatus,
  );
  const save = (draft: boolean) => {
    if (submitting.current) return;
    const result = saveTrip(form, id, draft);
    setErrors(result.errors);
    if (result.errors.length) return;
    submitting.current = true;
    Keyboard.dismiss();
    router.dismissTo('/trips');
  };
  const next = () => {
    const validation = validateTripForm(form, step);
    if (
      step === 1 &&
      previousStatus !== 'completed' &&
      previousStatus !== 'cancelled' &&
      form.endDate &&
      form.endDate <= todayDate()
    )
      validation.push('Wybierz termin z powrotem w przyszłości.');
    setErrors(validation);
    if (!validation.length) {
      Keyboard.dismiss();
      setStep(step === 1 ? 2 : 3);
    }
  };
  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Screen key={step + '-' + errors.length} adjustKeyboardInsets={false}>
          <View style={{ gap: 16 }}>
            <View style={layout.row}>
              <IconButton
                label={step === 1 ? 'Wróć do wyjazdów' : 'Poprzedni krok'}
                icon="back"
                onPress={() => {
                  if (step === 1) close();
                  else {
                    setErrors([]);
                    setStep(step === 3 ? 2 : 1);
                    Keyboard.dismiss();
                  }
                }}
              />
              <View style={{ flex: 1 }}>
                <AppText accessibilityRole="header" variant="heading">
                  {existing ? 'Edytuj wyjazd' : 'Nowy wyjazd'}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  Krok {step} z 3
                </AppText>
              </View>
              <IconButton
                label="Zamknij kreator"
                icon="close"
                onPress={close}
              />
            </View>
            <View
              accessible
              accessibilityLabel={`Krok ${step} z 3`}
              style={{ flexDirection: 'row', gap: 6 }}
            >
              {[1, 2, 3].map((value) => (
                <View
                  key={value}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor:
                      value <= step ? theme.primaryStrong : theme.border,
                  }}
                />
              ))}
            </View>
            <AppText variant="heading" accessibilityRole="header">
              {titles[step - 1]}
            </AppText>
            {errors.length ? (
              <Card
                accessibilityRole="alert"
                style={{ gap: 6, backgroundColor: theme.hero }}
              >
                {errors.map((error) => (
                  <AppText key={error} variant="label">
                    {error}
                  </AppText>
                ))}
              </Card>
            ) : null}
            {step === 1 ? (
              <>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Typ wyjazdu"
                  style={{ gap: 16 }}
                >
                  {(
                    [
                      {
                        mode: 'planned',
                        label: 'Mam plan',
                        description: 'Znamy cel i termin. Szukamy towarzystwa.',
                        icon: 'pin',
                      },
                      {
                        mode: 'flexible',
                        label: 'Szukam pomysłu',
                        description:
                          'Mamy wolny termin. Miejsce wybierzemy razem.',
                        icon: 'compass',
                      },
                    ] as const
                  ).map((option) => (
                    <Pressable
                      key={option.mode}
                      accessibilityRole="radio"
                      aria-checked={form.mode === option.mode}
                      accessibilityLabel={option.label}
                      accessibilityState={{
                        checked: form.mode === option.mode,
                      }}
                      onPress={() => {
                        setForm((current) => ({
                          ...current,
                          mode: option.mode,
                          dateFlexibilityDays:
                            option.mode === 'planned'
                              ? 0
                              : current.dateFlexibilityDays,
                        }));
                        setErrors([]);
                      }}
                      style={[
                        layout.row,
                        {
                          borderWidth: 1,
                          borderColor:
                            form.mode === option.mode
                              ? theme.primaryStrong
                              : theme.border,
                          borderRadius: 20,
                          padding: 16,
                          minHeight: 80,
                          backgroundColor:
                            form.mode === option.mode
                              ? theme.muted
                              : theme.backgroundElement,
                        },
                      ]}
                    >
                      <Icon name={option.icon} size={24} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <AppText variant="label">{option.label}</AppText>
                        <AppText variant="caption" color="textSecondary">
                          {option.description}
                        </AppText>
                      </View>
                      {form.mode === option.mode ? (
                        <Icon name="check" size={20} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                <View style={[layout.row, { alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1 }}>
                    <TripDateField
                      label="Od"
                      value={form.startDate}
                      initialMonth={form.endDate}
                      onChange={(date) => update('startDate', date)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TripDateField
                      label="Do"
                      value={form.endDate}
                      initialMonth={form.startDate}
                      onChange={(date) => update('endDate', date)}
                    />
                  </View>
                </View>
                {form.mode === 'flexible' ? (
                  <View style={{ gap: 8 }}>
                    <AppText variant="label">Elastyczność terminu</AppText>
                    <View style={layout.wrap}>
                      {([0, 1, 3, 7] as const).map((days) => (
                        <Chip
                          key={days}
                          label={
                            days
                              ? `±${days} ${days === 1 ? 'dzień' : 'dni'}`
                              : 'Dokładne daty'
                          }
                          selected={form.dateFlexibilityDays === days}
                          onPress={() => update('dateFlexibilityDays', days)}
                        />
                      ))}
                    </View>
                    <AppText variant="caption" color="textSecondary">
                      Możecie przesunąć cały wyjazd o wybraną liczbę dni.
                      Długość pobytu pozostaje taka sama.
                    </AppText>
                  </View>
                ) : null}
              </>
            ) : step === 2 ? (
              <>
                <ProfileTextField
                  label="Nazwa wyjazdu"
                  value={form.title}
                  onChangeText={(value) => update('title', value)}
                  maxLength={64}
                />
                <ProfileTextField
                  label={
                    form.mode === 'planned'
                      ? 'Miejscowość'
                      : 'Preferowany obszar'
                  }
                  value={form.placeName}
                  onChangeText={(value) => update('placeName', value)}
                  maxLength={80}
                  hint={
                    form.mode === 'planned'
                      ? 'Np. Chłapowo — cel wspólnego wyjazdu.'
                      : 'Np. Kaszuby — dokładny cel możecie ustalić później.'
                  }
                />
                <ProfileTextField
                  label="Region"
                  value={form.region}
                  onChangeText={(value) => update('region', value)}
                  maxLength={80}
                  hint="Np. Pomorze. Miejsce zamieszkania nie określa celu wyjazdu."
                />
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Jak podróżujecie na ten wyjazd?
                  </AppText>
                  <View style={layout.wrap}>
                    {TRAVEL_MODE_OPTIONS.map((mode) => (
                      <Chip
                        key={mode}
                        label={mode}
                        selected={form.travelModes.includes(mode)}
                        onPress={() =>
                          update('travelModes', toggle(form.travelModes, mode))
                        }
                      />
                    ))}
                  </View>
                </View>
                <Card>
                  <TripAnimalFields
                    value={form.animals}
                    onChange={(animals) => update('animals', animals)}
                  />
                </Card>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Co chcecie robić? · opcjonalnie
                  </AppText>
                  <View style={layout.wrap}>
                    {INTEREST_OPTIONS.map((interest) => (
                      <Chip
                        key={interest}
                        label={interest}
                        selected={form.interests.includes(interest)}
                        onPress={() =>
                          update('interests', toggle(form.interests, interest))
                        }
                      />
                    ))}
                  </View>
                </View>
                <ProfileTextField
                  label="Opis wyjazdu"
                  value={form.description}
                  onChangeText={(value) => update('description', value)}
                  maxLength={1000}
                  multiline
                  hint="Opcjonalnie. Napiszcie, jaki macie pomysł na wspólny czas."
                />
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Klimat wyjazdu</AppText>
                  <View style={layout.wrap}>
                    {(
                      [
                        { value: 'coast', label: 'Morze' },
                        { value: 'lake', label: 'Jeziora' },
                        { value: 'mountain', label: 'Góry' },
                        { value: 'forest', label: 'Las' },
                      ] as const
                    ).map((item) => (
                      <Chip
                        key={item.value}
                        label={item.label}
                        selected={form.landscape === item.value}
                        onPress={() => update('landscape', item.value)}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Towarzystwo na wyjazd</AppText>
                  <AppText variant="caption" color="textSecondary">
                    Możecie wybrać kilka grup. Brak wyboru oznacza dowolne
                    towarzystwo.
                  </AppText>
                  <View style={layout.wrap}>
                    {GROUP_KIND_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={form.groupKinds.includes(option.value)}
                        onPress={() =>
                          update(
                            'groupKinds',
                            toggle(form.groupKinds, option.value),
                          )
                        }
                      />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Preferowany wiek dzieci · opcjonalnie
                  </AppText>
                  <View style={layout.wrap}>
                    {CHILD_AGE_BANDS.map((band) => (
                      <Chip
                        key={band}
                        label={band + ' lat'}
                        accessibilityLabel={
                          'Preferowany wiek: ' + band + ' lat'
                        }
                        selected={form.childAgeBands.includes(band)}
                        onPress={() =>
                          update(
                            'childAgeBands',
                            toggle(form.childAgeBands, band),
                          )
                        }
                      />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Widoczność planu</AppText>
                  <View style={layout.wrap}>
                    {(
                      [
                        { value: 'public', label: 'Dla społeczności' },
                        { value: 'private', label: 'Tylko dla nas' },
                      ] as const
                    ).map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={form.visibility === option.value}
                        onPress={() => update('visibility', option.value)}
                      />
                    ))}
                  </View>
                  <AppText variant="caption" color="textSecondary">
                    {['completed', 'cancelled'].includes(previousStatus)
                      ? 'Zapis zachowa status archiwalnego wyjazdu. Aby zaplanować kolejny, wybierz „Duplikuj jako szkic” z jego menu.'
                      : form.visibility === 'private'
                        ? 'Prywatny plan będzie wstrzymany i niewidoczny w wyszukiwarce. Wznowienie poszukiwań udostępni go społeczności.'
                        : previousStatus === 'paused'
                          ? 'Zapis zachowa wstrzymane poszukiwania. Możecie je później wznowić z menu wyjazdu.'
                          : 'Opublikowany plan będzie otwarty na zaproszenia. W demo wszystkie zmiany pozostają lokalne.'}
                  </AppText>
                </View>
                <Card style={{ gap: 8, backgroundColor: theme.hero }}>
                  <AppText variant="caption" color="textSecondary">
                    PODGLĄD PLANU
                  </AppText>
                  <TripStatusBadge status={previewStatus} />
                  <AppText variant="heading">{preview.title}</AppText>
                  <AppText variant="label">
                    {form.mode === 'planned' ? 'Mam plan' : 'Szukam pomysłu'} ·{' '}
                    {ownTripPlace(preview)}
                  </AppText>
                  <AppText variant="label">
                    {ownTripDates(preview)}
                    {preview.dateFlexibilityDays
                      ? ` · ±${preview.dateFlexibilityDays} ${preview.dateFlexibilityDays === 1 ? 'dzień' : 'dni'}`
                      : ''}
                  </AppText>
                  <AppText variant="caption">
                    {form.travelModes.join(', ')}
                  </AppText>
                  <AnimalInformation animals={form.animals} />
                  {form.description ? (
                    <AppText style={{ fontSize: 14, lineHeight: 21 }}>
                      {form.description}
                    </AppText>
                  ) : null}
                  {form.interests.length ? (
                    <AppText variant="caption">
                      {form.interests.join(' · ')}
                    </AppText>
                  ) : null}
                  <AppText variant="caption">
                    {GROUP_KIND_OPTIONS.filter((item) =>
                      form.groupKinds.includes(item.value),
                    )
                      .map((item) => item.label)
                      .join(', ') || 'Dowolne towarzystwo'}
                    {form.childAgeBands.length
                      ? ' · dzieci ' + form.childAgeBands.join(', ') + ' lat'
                      : ''}
                  </AppText>
                </Card>
              </>
            )}
            <TripDemoNote />
            <AppText variant="caption" color="textSecondary">
              Niezapisane zmiany znikają po opuszczeniu kreatora.
            </AppText>
          </View>
        </Screen>
        <View
          style={{
            backgroundColor: theme.backgroundElement,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingHorizontal: Math.max(16, insets.left, insets.right),
            paddingTop: 8,
            paddingBottom: Math.max(8, insets.bottom),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              width: '100%',
              maxWidth: MaxContentWidth,
              alignSelf: 'center',
            }}
          >
            {canDraft ? (
              <View style={{ flex: 1, minWidth: 100 }}>
                <Button
                  label="Zapisz szkic"
                  icon="edit"
                  variant="secondary"
                  onPress={() => save(true)}
                />
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 140 }}>
              <Button
                label={
                  step < 3
                    ? 'Dalej'
                    : existing && previousStatus !== 'draft'
                      ? 'Zapisz zmiany'
                      : form.visibility === 'private'
                        ? 'Zapisz plan prywatny'
                        : 'Opublikuj wyjazd'
                }
                icon={step < 3 ? 'arrow' : 'check'}
                onPress={() => (step < 3 ? next() : save(false))}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {confirmExit ? (
        <BottomSheet
          title="Opuścić kreator?"
          onClose={() => setConfirmExit(false)}
        >
          <AppText color="textSecondary">
            Macie niezapisane zmiany. Możecie wrócić do edycji
            {canDraft ? ' albo zachować plan jako szkic' : ''}.
          </AppText>
          <Button
            label="Wróć do edycji"
            onPress={() => setConfirmExit(false)}
          />
          {canDraft ? (
            <Button
              label="Zapisz szkic i wyjdź"
              variant="secondary"
              onPress={() => save(true)}
            />
          ) : null}
          <Button
            label="Odrzuć zmiany i wyjdź"
            variant="secondary"
            onPress={() => router.dismissTo('/trips')}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}
