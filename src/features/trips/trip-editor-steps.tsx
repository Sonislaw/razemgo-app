import { DateRangeField } from '@/components/trips/date-range-field';
import { TripListingCard } from '@/components/trips/trip-listing-card';
import { TripPlanningIcon } from '@/components/trips/trip-planning-icon';
import { ChipRow } from '@/components/ui/chip-row';
import { Icon } from '@/components/ui/icon';
import { AppText, Chip, FieldLabel, layout } from '@/components/ui/primitives';
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
import { TripLocationField } from '@/features/trips/trip-location-field';
import {
  findTripLocation,
  isConcreteTripLocation,
} from '@/features/trips/trip-locations';
import {
  TripStatusBadge,
  ownTripDates,
  ownTripPlace,
} from '@/features/trips/trip-ui';
import { useTheme } from '@/hooks/use-theme';
import type { TripForm, OwnedTrip, TripStatus } from '@/types/owned-trip';

import { Pressable, View } from 'react-native';

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
}: {
  form: TripForm;
  onModeChange: (mode: TripForm['mode']) => void;
  onDates: () => void;
}) {
  const theme = useTheme();
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
      <View style={{ gap: 8 }}>
        <FieldLabel required>Termin wyjazdu</FieldLabel>
        <DateRangeField
          leadingIcon={<TripPlanningIcon kind="dates" size={40} />}
          range={{ startDate: form.startDate, endDate: form.endDate }}
          onPress={() => {
            onDates();
          }}
        />
      </View>
    </>
  );
}
export function TripDestinationStep({
  form,
  update,
  onLocationChange,
}: {
  form: TripForm;
  update: Update;
  onLocationChange: (id: string) => void;
}) {
  return (
    <>
      <TripLocationField
        mode={form.mode}
        value={form.locationId}
        label={
          form.mode === 'flexible' ? 'Preferowany obszar wyjazdu' : undefined
        }
        hint={
          form.mode === 'flexible'
            ? 'Wskaż miejscowość, region lub kraj, w którym chcesz podróżować. Konkretne miejsce wybierzesz wspólnie z ekipą.'
            : undefined
        }
        onChange={(id) => {
          onLocationChange(id);
        }}
      />
      {form.mode === 'planned' &&
      isConcreteTripLocation(findTripLocation(form.locationId)) ? (
        <>
          <ProfileTextField
            label="Nazwa kempingu"
            value={form.campgroundName}
            onChangeText={(value) => update('campgroundName', value)}
            maxLength={120}
            hint="Jeśli wiesz już, gdzie się zatrzymasz."
          />
          <ProfileTextField
            label="Adres kempingu"
            value={form.campgroundAddress ?? ''}
            onChangeText={(value) => update('campgroundAddress', value)}
            maxLength={200}
            hint="Ulica i numer. Adres pomoże dokładniej wskazać miejsce na mapie."
          />
        </>
      ) : null}
      <ProfileTextField
        label="Opis wyjazdu"
        required
        value={form.description}
        onChangeText={(value) => update('description', value)}
        maxLength={MAX_TRIP_DESCRIPTION_LENGTH}
        multiline
        hint={`Min. ${MIN_TRIP_DESCRIPTION_LENGTH} znaków · ${tripDescriptionLength(form.description)}/${MAX_TRIP_DESCRIPTION_LENGTH}. Początek opisu pokażemy na karcie wyjazdu.`}
      />
      <View style={{ gap: 8 }}>
        <FieldLabel required>Jak podróżujesz na ten wyjazd?</FieldLabel>
        <TravelModePicker
          horizontal
          value={form.travelModes}
          onChange={(travelModes) => update('travelModes', travelModes)}
        />
      </View>
      <View style={{ gap: 8 }}>
        <FieldLabel>Co chcesz robić?</FieldLabel>
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
        <FieldLabel>Klimat wyjazdu</FieldLabel>
        <TripLandscapePicker
          value={form.landscape}
          onChange={(value) => update('landscape', value)}
        />
      </View>
      <TripAnimalFields
        value={form.animals}
        onChange={(animals) => update('animals', animals)}
      />
    </>
  );
}
export function TripPublicationFields({
  form,
  update,
  previousStatus,
  preview,
  previewStatus,
  profile,
}: {
  form: TripForm;
  update: Update;
  previousStatus: TripStatus;
  preview: OwnedTrip;
  previewStatus: TripStatus;
  profile: TravelerProfile;
}) {
  return (
    <>
      <View style={{ gap: 8 }}>
        <FieldLabel>Widoczność planu</FieldLabel>
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
                ? 'Zapis zachowa wstrzymane poszukiwania. Możesz je później wznowić z menu wyjazdu.'
                : 'Opublikowany plan będzie otwarty na zaproszenia.'}
        </AppText>
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="caption" color="textSecondary">
          PODGLĄD PLANU
        </AppText>
        <TripListingCard
          testID="trip-editor-preview"
          trip={preview}
          group={profile.group}
          travelModes={form.travelModes}
          locationLabel={ownTripPlace(preview)}
          datesLabel={ownTripDates(preview)}
          rightBadge={<TripStatusBadge status={previewStatus} />}
          footer={
            <AppText variant="caption" color="textSecondary">
              {form.visibility === 'private'
                ? 'Prywatny plan'
                : 'Dla społeczności'}
            </AppText>
          }
        >
          {preview.mode === 'planned' && preview.campgroundAddress ? (
            <AppText variant="caption" color="textSecondary">
              {preview.campgroundAddress}
            </AppText>
          ) : null}
          {form.description ? (
            <AppText style={{ fontSize: 14, lineHeight: 21 }}>
              {form.description}
            </AppText>
          ) : null}
        </TripListingCard>
      </View>
    </>
  );
}
