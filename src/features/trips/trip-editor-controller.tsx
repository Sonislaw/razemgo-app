import { DateRangeSheet } from '@/components/trips/date-range-sheet';
import { TripPlanningIcon } from '@/components/trips/trip-planning-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { ScenicFooter } from '@/components/ui/scenic-footer';
import { ScenicHeaderBackground } from '@/components/ui/scenic-header';
import { MaxContentWidth } from '@/constants/theme';
import { useProfile } from '@/features/profile/profile-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  changeTripLocation,
  changeTripMode,
  getTripStatus,
  newTripForm,
  toTripForm,
  todayDate,
  tripFromForm,
  validateTripForm,
} from '@/features/trips/own-trips-state';
import {
  TripCompanyStep,
  TripDestinationStep,
  TripTimingStep,
} from '@/features/trips/trip-editor-steps';
import { TripDemoNote } from '@/features/trips/trip-ui';
import { useTheme } from '@/hooks/use-theme';
import { createRequestKey } from '@/lib/request-key';
import type { TripForm } from '@/types/owned-trip';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TripEditorScreen() {
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
  const titles = [
    'Jaki masz plan?',
    form.mode === 'flexible'
      ? 'Jaki kierunek Cię interesuje?'
      : 'Dokąd i jak podróżujesz?',
    'Kogo chcesz poznać?',
  ];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [requestKey] = useState(createRequestKey);
  const formScroll = useRef<ScrollViewInstance>(null);
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
          Mógł zostać usunięty. Wróć do listy swoich wyjazdów.
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
  const save = async (draft: boolean) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    const result = await saveTrip(form, id, draft, requestKey);
    submitting.current = false;
    setSaving(false);
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
                <TripPlanningIcon kind={form.mode} size={16} framed={false} />
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
              <TripTimingStep
                form={form}
                onModeChange={(mode) => {
                  setForm((current) => changeTripMode(current, mode));
                  setErrors([]);
                }}
                onDates={() => {
                  Keyboard.dismiss();
                  setShowDates(true);
                }}
              />
            ) : step === 2 ? (
              <TripDestinationStep
                form={form}
                update={update}
                onLocationChange={(id) => {
                  setForm((current) => changeTripLocation(current, id));
                  setErrors([]);
                }}
              />
            ) : (
              <TripCompanyStep
                form={form}
                update={update}
                previousStatus={previousStatus}
                preview={preview}
                previewStatus={previewStatus}
                profile={profile}
              />
            )}
            <TripDemoNote />
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
                  disabled={saving}
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
                disabled={saving}
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
            Masz niezapisane zmiany. Możesz wrócić do edycji
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
