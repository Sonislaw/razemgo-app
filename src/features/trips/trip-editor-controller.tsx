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
  validateTripFormIssues,
  type TripFormField,
  type TripFormIssue,
} from '@/features/trips/own-trips-state';
import {
  TripPublicationFields,
  TripDestinationStep,
  TripTimingStep,
} from '@/features/trips/trip-editor-steps';
import { TripDemoNote } from '@/features/trips/trip-ui';
import type { TripEditorFields, TripFieldTarget } from './trip-editor-field';
import { useTheme } from '@/hooks/use-theme';
import { createRequestKey } from '@/lib/request-key';
import type { TripForm } from '@/types/owned-trip';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ScrollViewInstance,
  type ViewInstance,
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
    const values = existing ? toTripForm(existing, profile) : newTripForm(profile);
    return changeTripMode(values, values.mode);
  });
  const [form, setForm] = useState<TripForm>(initial);
  const modeLabel = form.mode === 'planned' ? 'Mam plan' : 'Szukam pomysłu';
  const titles = [
    'Jaki masz plan?',
    'Szczegóły wyjazdu',
  ];
  const [step, setStep] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [issues, setIssues] = useState<TripFormIssue[]>([]);
  const [pendingFocus, setPendingFocus] = useState<TripFormField | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showDates, setShowDates] = useState(false);
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [requestKey] = useState(createRequestKey);
  const formScroll = useRef<ScrollViewInstance>(null);
  const formContent = useRef<ViewInstance>(null);
  const fieldTargets = useRef<Partial<Record<TripFormField, TripFieldTarget>>>({});
  const registerField = useCallback((field: TripFormField, target: TripFieldTarget | null) => {
    if (target) fieldTargets.current[field] = target;
    else delete fieldTargets.current[field];
  }, []);
  const fields: TripEditorFields = {
    errors: issues.reduce<TripEditorFields['errors']>((result, issue) => {
      result[issue.field] = [result[issue.field], issue.message].filter(Boolean).join(' ');
      return result;
    }, {}),
    register: registerField,
  };
  useEffect(() => {
    if (!pendingFocus) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      const target = fieldTargets.current[pendingFocus];
      const content = formContent.current;
      if (!target || !content) return;
      target.node.measureLayout(content, (_x, y) => {
        if (!active) return;
        formScroll.current?.scrollTo({ y: Math.max(0, y + 4), animated: false });
        if (target.focus) target.focus();
        else target.node.focus();
        setPendingFocus(null);
      });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [pendingFocus, step]);
  const clearFieldErrors = (field: string) => {
    setIssues(current => current.filter(issue => issue.field !== field));
    setErrors([]);
  };
  const showIssues = (validation: TripFormIssue[]) => {
    setIssues(validation);
    setErrors([]);
    const first = (['dates', 'locationId', 'campgroundName', 'campgroundAddress',
      'description', 'participants', 'animals', 'travelModes'] as const).find(field => validation.some(issue => issue.field === field));
    if (first) {
      setStep(first === 'dates' ? 1 : 2);
      setPendingFocus(first);
    }
  };
  const update = <K extends keyof TripForm>(key: K, value: TripForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    clearFieldErrors(key === 'startDate' || key === 'endDate' ? 'dates' : key);
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
    if (!draft) {
      const validation = validateTripFormIssues(form);
      if (previousStatus !== 'completed' && previousStatus !== 'cancelled' && form.endDate && form.endDate <= todayDate())
        validation.push({ field: 'dates', message: 'Wybierz termin z powrotem w przyszłości.' });
      if (validation.length) { showIssues(validation); return; }
    }
    setIssues([]);
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
    const validation = validateTripFormIssues(form, 1);
    if (
      step === 1 &&
      previousStatus !== 'completed' &&
      previousStatus !== 'cancelled' &&
      form.endDate &&
      form.endDate <= todayDate()
    )
      validation.push({ field: 'dates', message: 'Wybierz termin z powrotem w przyszłości.' });
    showIssues(validation);
    if (!validation.length) {
      Keyboard.dismiss();
      setStep(2);
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
                    setStep(1);
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
                  Krok {step} z 2
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
              accessibilityLabel={`Krok ${step} z 2`}
              style={{ flexDirection: 'row', gap: 6 }}
            >
              {[1, 2].map((value) => (
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
          // RN Web also dismisses focus during programmatic scrolling to an error.
          keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
          testID="trip-editor-form"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 16,
            paddingLeft: Math.max(24, insets.left),
            paddingRight: Math.max(24, insets.right),
          }}
        >
          <View
            ref={formContent}
            collapsable={false}
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
                fields={fields}
                onModeChange={(mode) => {
                  setForm((current) => changeTripMode(current, mode));
                  clearFieldErrors('locationId');
                }}
                onDates={() => {
                  Keyboard.dismiss();
                  setShowDates(true);
                }}
              />
            ) : (
              <>
                <TripDestinationStep
                  form={form}
                  fields={fields}
                  update={update}
                  onLocationChange={(id) => {
                    setForm((current) => changeTripLocation(current, id));
                    clearFieldErrors('locationId');
                  }}
                />
                <TripPublicationFields
                  form={form}
                  update={update}
                  previousStatus={previousStatus}
                  preview={preview}
                  profile={profile}
                />
              </>
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
                  step < 2
                    ? 'Dalej'
                    : existing && previousStatus !== 'draft'
                      ? 'Zapisz zmiany'
                      : form.visibility === 'private'
                        ? 'Zapisz plan prywatny'
                        : 'Opublikuj wyjazd'
                }
                disabled={saving}
                icon={step < 2 ? 'arrow' : 'check'}
                onPress={() => (step < 2 ? next() : save(false))}
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
            clearFieldErrors('dates');
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
