import { TripParticipantsFields } from './trip-participants-fields';
import { DateRangeField } from '@/components/trips/date-range-field';
import { DiscoveryTripCard } from '@/components/trips/discovery-trip-card';
import { TripPlanningIcon } from '@/components/trips/trip-planning-icon';
import { ExpandableSection } from '@/components/ui/expandable-section';
import { ChipRow } from '@/components/ui/chip-row';
import { Icon } from '@/components/ui/icon';
import { AppText, Card, Chip, FieldLabel, SectionTitle, layout } from '@/components/ui/primitives';
import { TripAnimalFields } from '@/features/animals/animal-fields';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { INTEREST_OPTIONS } from '@/features/profile/profile-options';
import { TravelModePicker } from '@/features/profile/travel-mode-ui';
import {
  MAX_TRIP_DESCRIPTION_LENGTH,
  MIN_TRIP_DESCRIPTION_LENGTH,
  tripDescriptionLength,
} from '@/features/trips/own-trips-state';
import { TripLandscapePicker } from '@/features/trips/trip-landscape-picker';
import { TripLocationField, type TripLocationFieldHandle } from '@/features/trips/trip-location-field';
import { TripCampgroundField, type TripCampgroundFieldHandle } from './trip-campground-field';
import type { Campground } from './campgrounds';
import {
  findTripLocation,
  isConcreteTripLocation,
} from '@/features/trips/trip-locations';
import {
  ownTripDates,
  ownTripPlace,
} from '@/features/trips/trip-ui';
import { useTheme } from '@/hooks/use-theme';
import type { TripForm, OwnedTrip, TripStatus } from '@/types/owned-trip';
import { TripEditorField, tripFieldErrorId, type TripEditorFields } from './trip-editor-field';
import { useRef, useState } from 'react';

import { Pressable, View, type TextInputInstance, type ViewInstance } from 'react-native';

import type { TravelerProfile } from '@/types/profile';
const toggle = <T,>(values: T[], value: T): T[] =>
  values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
type Update = <K extends keyof TripForm>(key: K, value: TripForm[K]) => void;
export function TripTimingStep({
  form,
  onModeChange,
  onDates,
  fields,
}: {
  form: TripForm;
  onModeChange: (mode: TripForm['mode']) => void;
  onDates: () => void;
  fields: TripEditorFields;
}) {
  const theme = useTheme();
  const dateButton = useRef<ViewInstance>(null);
  return (
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
              description: 'Znam cel i termin. Szukam towarzystwa.',
            },
            {
              mode: 'flexible',
              label: 'Szukam pomysłu',
              description: 'Mam wolny termin. Miejsce wybiorę razem z ekipą.',
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
              onModeChange(option.mode);
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
            <TripPlanningIcon kind={option.mode} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label">{option.label}</AppText>
              <AppText variant="caption" color="textSecondary">
                {option.description}
              </AppText>
            </View>
            {form.mode === option.mode ? <Icon name="check" size={20} /> : null}
          </Pressable>
        ))}
      </View>
      <TripEditorField name="dates" label="Termin wyjazdu" fields={fields} focus={() => dateButton.current?.focus()}>
        <FieldLabel required>Termin wyjazdu</FieldLabel>
        <DateRangeField
          buttonRef={dateButton}
          leadingIcon={<TripPlanningIcon kind="dates" size={40} />}
          range={{ startDate: form.startDate, endDate: form.endDate }}
          onPress={() => {
            onDates();
          }}
        />
      </TripEditorField>
    </>
  );
}
export function TripDestinationStep({
  form,
  update,
  onLocationChange,
  onCampgroundSelect,
  fields,
}: {
  form: TripForm;
  update: Update;
  onLocationChange: (id: string) => void;
  onCampgroundSelect: (campground: Campground) => void;
  fields: TripEditorFields;
}) {
  const locationInput = useRef<TripLocationFieldHandle>(null);
  const campgroundName = useRef<TripCampgroundFieldHandle>(null);
  const campgroundAddress = useRef<TextInputInstance>(null);
  const descriptionInput = useRef<TextInputInstance>(null);
  return (
    <>
      <Card testID="trip-editor-location" style={{ gap: 20 }}>
        <SectionTitle title="Lokalizacja" />
        <TripEditorField name="locationId" label="Miejsce wyjazdu" fields={fields} focus={() => locationInput.current?.focus()}>
          <TripLocationField
            inputRef={locationInput}
            errorId={fields.errors.locationId ? tripFieldErrorId('locationId') : undefined}
            mode={form.mode}
            value={form.locationId}
            label={form.mode === 'flexible' ? 'Preferowany obszar wyjazdu' : undefined}
            hint={form.mode === 'flexible'
              ? 'Wskaż miejscowość, region lub kraj, w którym chcesz podróżować. Konkretne miejsce wybierzesz wspólnie z ekipą.'
              : undefined}
            onChange={onLocationChange}
          />
        </TripEditorField>
        {form.mode === 'planned' && isConcreteTripLocation(findTripLocation(form.locationId)) ? <>
          <TripEditorField name="campgroundName" label="Nazwa kempingu" fields={fields} focus={() => campgroundName.current?.focus()}>
            <TripCampgroundField value={form.campgroundName} inputRef={campgroundName} locationId={form.locationId}
              errorId={fields.errors.campgroundName ? tripFieldErrorId('campgroundName') : undefined}
              onChangeText={value => update('campgroundName', value)} onSelect={onCampgroundSelect} />
          </TripEditorField>
          <TripEditorField name="campgroundAddress" label="Adres kempingu" fields={fields} focus={() => campgroundAddress.current?.focus()}>
            <ProfileTextField label="Adres kempingu" value={form.campgroundAddress ?? ''} inputRef={campgroundAddress}
              errorId={fields.errors.campgroundAddress ? tripFieldErrorId('campgroundAddress') : undefined}
              onChangeText={value => update('campgroundAddress', value)} maxLength={200} hint="Opcjonalnie. Po wyborze kempingu uzupełnimy dostępny adres. Możesz go zmienić lub wpisać ręcznie." />
          </TripEditorField>
        </> : null}
      </Card>

      <Card testID="trip-editor-plan" style={{ gap: 20 }}>
        <SectionTitle title="Plan wyjazdu" />
        <TripEditorField name="description" label="Opis wyjazdu" fields={fields} focus={() => descriptionInput.current?.focus()}>
          <ProfileTextField
            inputRef={descriptionInput}
            errorId={fields.errors.description ? tripFieldErrorId('description') : undefined}
            label="Opis wyjazdu"
            required
            value={form.description}
            onChangeText={value => update('description', value)}
            maxLength={MAX_TRIP_DESCRIPTION_LENGTH}
            multiline
            hint={`Min. ${MIN_TRIP_DESCRIPTION_LENGTH} znaków · ${tripDescriptionLength(form.description)}/${MAX_TRIP_DESCRIPTION_LENGTH}. Początek opisu pokażemy na karcie wyjazdu.`}
          />
        </TripEditorField>
        <View style={{ gap: 8 }}>
          <FieldLabel>Klimat wyjazdu</FieldLabel>
          <TripLandscapePicker value={form.landscape} onChange={value => update('landscape', value)} />
        </View>
        <View style={{ gap: 8 }}>
          <FieldLabel>Co chcesz robić?</FieldLabel>
          <ChipRow horizontal label="Zainteresowania">
            {INTEREST_OPTIONS.map(interest => <Chip key={interest} label={interest} selected={form.interests.includes(interest)}
              onPress={() => update('interests', toggle(form.interests, interest))} />)}
          </ChipRow>
        </View>
      </Card>

      <Card testID="trip-editor-crew" style={{ gap: 20 }}>
        <TripEditorField name="participants" label="Kto jedzie?" fields={fields}>
          <TripParticipantsFields value={form.participants} onChange={value => update('participants', value)} />
        </TripEditorField>
        <TripEditorField name="animals" label="Zwierzęta na wyjeździe" fields={fields}>
          <TripAnimalFields value={form.animals} onChange={animals => update('animals', animals)} />
        </TripEditorField>
        <TripEditorField name="travelModes" label="Sposób podróżowania" fields={fields}>
          <FieldLabel required>Jak podróżujesz na ten wyjazd?</FieldLabel>
          <TravelModePicker
            horizontal
            value={form.travelModes}
            onChange={travelModes => update('travelModes', travelModes)}
          />
        </TripEditorField>
      </Card>
    </>
  );
}

export function TripPublicationFields({
  form,
  update,
  previousStatus,
  preview,
  profile,
}: {
  form: TripForm;
  update: Update;
  previousStatus: TripStatus;
  preview: OwnedTrip;
  profile: TravelerProfile;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <>
      <Card testID="trip-editor-visibility" style={{ gap: 12 }}>
        <SectionTitle title="Widoczność planu" />
        <ChipRow label="Widoczność planu">
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
                ? 'Zapis zachowa wstrzymane poszukiwania. Możesz je później wznowić z menu wyjazdu.'
                : 'Opublikowany plan będzie otwarty na zaproszenia.'}
        </AppText>
      </Card>
      <ExpandableSection title="Podgląd planu" summary="Zobacz, jak Twoje ogłoszenie będzie wyglądać w Odkrywaj." fullWidthContent
        expanded={previewOpen} onToggle={() => setPreviewOpen(value => !value)}>
        <DiscoveryTripCard
          preview
          testID="trip-editor-preview"
          trip={preview}
          group={profile.group}
          locationLabel={ownTripPlace(preview)}
          datesLabel={ownTripDates(preview)}
        />
      </ExpandableSection>
    </>
  );
}
