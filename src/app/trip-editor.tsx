import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { ChipRow } from '@/components/ui/chip-row';
import { Icon } from '@/components/ui/icon';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import { ScenicHeaderBackground } from '@/components/ui/scenic-header';
import { CHILD_AGE_BANDS } from '@/data/mocks/travel';
import { MaxContentWidth } from '@/constants/theme';
import { LANDSCAPE_OPTIONS } from '@/constants/landscape-options';
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
  MAX_TRIP_DESCRIPTION_LENGTH,
  MIN_TRIP_DESCRIPTION_LENGTH,
  changeTripLocation,
  changeTripMode,
  newTripForm,
  toTripForm,
  todayDate,
  tripFromForm,
  tripDescriptionLength,
  validateTripForm,
} from '@/features/trips/own-trips-state';
import { DateRangeField } from '@/components/trips/date-range-field';
import { DateRangeSheet } from '@/components/trips/date-range-sheet';
import {
  ownTripDates,
  ownTripPlace,
  TripDemoNote,
  TripStatusBadge,
} from '@/features/trips/trip-ui';
import type { TripForm } from '@/types/owned-trip';
import { TripAnimalFields } from '@/features/animals/animal-fields';
import { AnimalInformation } from '@/features/animals/animal-ui';
import { TripLocationField } from '@/features/trips/trip-location-field';
import {
  findTripLocation,
  isConcreteTripLocation,
} from '@/features/trips/trip-locations';

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
  const [initial] = useState(() => {
    const values = existing ? toTripForm(existing) : newTripForm(profile);
    return changeTripMode(values, values.mode);
  });
  const [form, setForm] = useState<TripForm>(initial);
  const modeLabel = form.mode === 'planned' ? 'Mam plan' : 'Szukam pomysłu';
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const submitting = useRef(false);
  const formScroll = useRef<ScrollView>(null);
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
          Mógł zostać usunięty. Wróćcie do listy swoich wyjazdów.
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
    if (result.errors.length) {
      formScroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
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
    if (validation.length)
      formScroll.current?.scrollTo({ y: 0, animated: true });
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
        <View
          style={{
            backgroundColor: theme.background,
            paddingTop: insets.top + 16,
            paddingBottom: 12,
            paddingHorizontal: Math.max(24, insets.left, insets.right),
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          <ScenicHeaderBackground style={{ top: insets.top + 4 }} />
          <View
            style={{
              width: '100%',
              maxWidth: MaxContentWidth,
              alignSelf: 'center',
              gap: 8,
            }}
          >
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
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText accessibilityRole="header" variant="heading">
                  {existing ? 'Edytuj wyjazd' : 'Nowy wyjazd'}
                </AppText>
              </View>
              <IconButton
                label="Zamknij kreator"
                icon="close"
                onPress={close}
              />
            </View>
            <View style={[layout.row, { gap: 4 }]}>
              <View
                style={{
                  flexShrink: 0,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 12,
                  backgroundColor: `${theme.backgroundElement}E6`,
                }}
              >
                <AppText variant="caption" color="text" numberOfLines={1}>
                  Krok {step} z 3
                </AppText>
              </View>
              <View
                accessible
                accessibilityLabel={'Typ wyjazdu: ' + modeLabel}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 1,
                  minWidth: 0,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 12,
                  backgroundColor: theme.backgroundSelected,
                }}
              >
                <Icon
                  name={form.mode === 'planned' ? 'pin' : 'compass'}
                  size={14}
                />
                <AppText
                  variant="caption"
                  color="primaryStrong"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {modeLabel}
                </AppText>
              </View>
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
          </View>
        </View>
        <ScrollView
          key={step}
          ref={formScroll}
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 16,
            paddingLeft: Math.max(24, insets.left),
            paddingRight: Math.max(24, insets.right),
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: MaxContentWidth,
              alignSelf: 'center',
              gap: 16,
              paddingBottom: 32,
            }}
          >
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
                        setForm((current) =>
                          changeTripMode(current, option.mode),
                        );
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
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Termin wyjazdu</AppText>
                  <DateRangeField
                    range={{ startDate: form.startDate, endDate: form.endDate }}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowDates(true);
                    }}
                  />
                </View>
              </>
            ) : step === 2 ? (
              <>
                <TripLocationField
                  mode={form.mode}
                  value={form.locationId}
                  onChange={(id) => {
                    setForm((current) => changeTripLocation(current, id));
                    setErrors([]);
                  }}
                />
                {form.mode === 'planned' &&
                isConcreteTripLocation(findTripLocation(form.locationId)) ? (
                  <ProfileTextField
                    label="Nazwa kempingu"
                    value={form.campgroundName}
                    onChangeText={(value) => update('campgroundName', value)}
                    maxLength={120}
                    hint="Opcjonalnie — jeśli wiecie już, gdzie się zatrzymacie."
                  />
                ) : null}
                <ProfileTextField
                  label="Opis wyjazdu · wymagane"
                  value={form.description}
                  onChangeText={(value) => update('description', value)}
                  maxLength={MAX_TRIP_DESCRIPTION_LENGTH}
                  multiline
                  hint={`Min. ${MIN_TRIP_DESCRIPTION_LENGTH} znaków · ${tripDescriptionLength(form.description)}/${MAX_TRIP_DESCRIPTION_LENGTH}. Początek opisu pokażemy na karcie wyjazdu.`}
                />
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Jak podróżujecie na ten wyjazd?
                  </AppText>
                  <ChipRow horizontal label="Sposób podróżowania">
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
                  </ChipRow>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Co chcecie robić? · opcjonalnie
                  </AppText>
                  <ChipRow horizontal label="Zainteresowania">
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
                  </ChipRow>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Klimat wyjazdu</AppText>
                  <ChipRow horizontal label="Klimat wyjazdu">
                    {LANDSCAPE_OPTIONS.map((item) => (
                      <Chip
                        key={item.value}
                        label={item.label}
                        selected={form.landscape === item.value}
                        onPress={() => update('landscape', item.value)}
                      />
                    ))}
                  </ChipRow>
                </View>
                <TripAnimalFields
                  value={form.animals}
                  onChange={(animals) => update('animals', animals)}
                />
              </>
            ) : (
              <>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Towarzystwo na wyjazd</AppText>
                  <AppText variant="caption" color="textSecondary">
                    Możecie wybrać kilka grup. Brak wyboru oznacza dowolne
                    towarzystwo.
                  </AppText>
                  <ChipRow horizontal label="Towarzystwo na wyjazd">
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
                  </ChipRow>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">
                    Preferowany wiek dzieci · opcjonalnie
                  </AppText>
                  <ChipRow horizontal label="Preferowany wiek dzieci">
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
                  </ChipRow>
                </View>
                <View style={{ gap: 8 }}>
                  <AppText variant="label">Widoczność planu</AppText>
                  <ChipRow horizontal label="Widoczność planu">
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
                  </ChipRow>
                  <AppText variant="caption" color="textSecondary">
                    {['completed', 'cancelled'].includes(previousStatus)
                      ? 'Zapis zachowa status archiwalnego wyjazdu. Aby zaplanować kolejny, wybierz „Duplikuj jako szkic” z jego menu.'
                      : form.visibility === 'private'
                        ? 'Prywatny plan będzie wstrzymany i niewidoczny w wyszukiwarce. Wznowienie poszukiwań udostępni go społeczności.'
                        : previousStatus === 'paused'
                          ? 'Zapis zachowa wstrzymane poszukiwania. Możecie je później wznowić z menu wyjazdu.'
                          : 'Opublikowany plan będzie otwarty na zaproszenia.'}
                  </AppText>
                </View>
                <Card style={{ gap: 8, backgroundColor: theme.hero }}>
                  <AppText variant="caption" color="textSecondary">
                    PODGLĄD PLANU
                  </AppText>
                  <TripStatusBadge status={previewStatus} />
                  <AppText variant="heading">
                    {getTripHeadline(preview)}
                  </AppText>
                  <AppText variant="label">
                    {modeLabel} · {ownTripPlace(preview)}
                  </AppText>
                  {preview.campgroundName ? (
                    <AppText variant="label">
                      Kemping: {preview.campgroundName}
                    </AppText>
                  ) : null}
                  <AppText variant="label">{ownTripDates(preview)}</AppText>
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
          <ScenicFooter
            leftInset={Math.max(24, insets.left)}
            rightInset={Math.max(24, insets.right)}
          />
        </ScrollView>
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
      {showDates ? (
        <DateRangeSheet
          initialRange={{ startDate: form.startDate, endDate: form.endDate }}
          onClose={() => setShowDates(false)}
          onApply={(range) => {
            setForm((current) => ({ ...current, ...range }));
            setErrors([]);
            setShowDates(false);
          }}
        />
      ) : null}
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
