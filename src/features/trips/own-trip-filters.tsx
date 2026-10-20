import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import type { OwnTripFilters } from '@/types/owned-trip';
import { EMPTY_TRIP_FILTERS } from './own-trips-state';
import { TripDateField } from './trip-date-field';

export function OwnTripFiltersSheet({
  initial,
  onApply,
  onClose,
}: {
  initial: OwnTripFilters;
  onApply: (filters: OwnTripFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...initial });
  const [error, setError] = useState('');
  return (
    <BottomSheet title="Filtry moich wyjazdów" onClose={onClose}>
      <ProfileTextField
        label="Opis, miejscowość lub region"
        value={draft.query}
        onChangeText={(query) => setDraft({ ...draft, query })}
        maxLength={80}
      />
      <AppText variant="caption" color="textSecondary">
        Możesz określić jedną granicę terminu lub cały przedział.
      </AppText>
      <View style={{ gap: 12 }}>
        <TripDateField
          label="Od"
          value={draft.startDate}
          onChange={(startDate) => {
            setDraft({ ...draft, startDate });
            setError('');
          }}
        />
        <TripDateField
          label="Do"
          value={draft.endDate}
          onChange={(endDate) => {
            setDraft({ ...draft, endDate });
            setError('');
          }}
        />
      </View>
      {error ? (
        <AppText accessibilityRole="alert" variant="label">
          {error}
        </AppText>
      ) : null}
      <Button
        label="Pokaż wyjazdy"
        onPress={() => {
          if (
            draft.startDate &&
            draft.endDate &&
            draft.endDate <= draft.startDate
          ) {
            setError('Koniec przedziału musi przypadać po jego początku.');
            return;
          }
          onApply(draft);
        }}
      />
      <Button
        label="Wyczyść filtry"
        variant="secondary"
        onPress={() => {
          setDraft({ ...EMPTY_TRIP_FILTERS });
          setError('');
        }}
      />
    </BottomSheet>
  );
}
