import { getTripHeadline } from '@/features/trips/trip-headline';
import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { OwnedTrip } from '@/types/owned-trip';
import { useOwnTrips, type TripMutation } from './own-trips-context';
import { getTripStatus, todayDate } from './own-trips-state';

export function TripActions({
  trip,
  onClose,
  onDeleted,
}: {
  trip: OwnedTrip;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { mutateTrip, isSaving } = useOwnTrips();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    'cancel' | 'delete' | 'publish' | 'complete' | null
  >(null);
  const today = todayDate();
  const status = getTripStatus(trip, today);
  const active = status === 'published' || status === 'paused';
  const perform = async (action: TripMutation, after?: (id?: string) => void) => {
    const result = await mutateTrip(action);
    setError(result.errors.join(' ') || null);
    if (result.errors.length) return;
    onClose();
    after?.(result.id);
  };
  return (
    <BottomSheet
      title={
        confirm === 'delete'
          ? 'Usunąć wyjazd?'
          : confirm === 'cancel'
            ? 'Anulować wyjazd?'
            : confirm === 'complete'
              ? 'Zakończyć wyjazd?'
              : confirm === 'publish'
                ? 'Wznowić poszukiwania?'
                : 'Zarządzaj wyjazdem'
      }
      onClose={() => { if (!isSaving) onClose(); }}
    >
      <AppText variant="label">{getTripHeadline(trip)}</AppText>
      {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      {isSaving ? <AppText variant="caption" accessibilityLiveRegion="polite">Zapisywanie zmiany…</AppText> : null}
      {confirm ? (
        <>
          <AppText color="textSecondary">
            {confirm === 'delete'
              ? 'Wyjazd zniknie z Twojej listy. Rozmowy pozostaną w Wiadomościach. Tej operacji nie można cofnąć.'
              : confirm === 'cancel'
                ? 'Wyjazd trafi do archiwum i nie będzie przyjmował nowych zaproszeń. Dotychczasowe rozmowy pozostaną dostępne.'
                : confirm === 'complete'
                  ? 'Wyjazd zostanie oznaczony jako zakończony i trafi do archiwum. Dotychczasowe rozmowy pozostaną dostępne.'
                  : 'Plan będzie widoczny dla społeczności i otwarty na nowe zaproszenia.'}
          </AppText>
          <Button
            disabled={isSaving}
            label={
              confirm === 'delete'
                ? 'Usuń wyjazd'
                : confirm === 'cancel'
                  ? 'Tak, anuluj wyjazd'
                  : confirm === 'complete'
                    ? 'Tak, zakończ wyjazd'
                    : 'Wznów poszukiwania'
            }
            onPress={() => {
              if (confirm === 'delete') {
                void perform({ type: 'delete', id: trip.id }, onDeleted);
              } else {
                void perform({
                  type: 'status',
                  id: trip.id,
                  status:
                    confirm === 'cancel'
                      ? 'cancelled'
                      : confirm === 'complete'
                        ? 'completed'
                        : 'published',
                  today,
                  publishedAt: new Date().toISOString(),
                });
              }
            }}
          />
          <Button
            disabled={isSaving}
            label="Wróć bez zmian"
            variant="secondary"
            onPress={() => setConfirm(null)}
          />
        </>
      ) : (
        <>
          <Button
            disabled={isSaving}
            label={status === 'draft' ? 'Dokończ szkic' : 'Edytuj wyjazd'}
            icon="edit"
            variant="secondary"
            onPress={() => {
              onClose();
              router.push({
                pathname: '/trip-editor',
                params: { id: trip.id },
              });
            }}
          />
          {status === 'published' ? (
            <Button
              disabled={isSaving}
              label="Wstrzymaj poszukiwania"
              icon="pause"
              variant="secondary"
              onPress={() => {
                void perform({
                  type: 'status',
                  id: trip.id,
                  status: 'paused',
                  today,
                });
              }}
            />
          ) : status === 'paused' ? (
            <Button
              disabled={isSaving}
              label="Wznów poszukiwania"
              icon="people"
              variant="secondary"
              onPress={() => setConfirm('publish')}
            />
          ) : null}
          <Button
            disabled={isSaving}
            label="Duplikuj jako szkic"
            icon="copy"
            variant="secondary"
            onPress={() => {
              void perform({ type: 'duplicate', id: trip.id }, id => {
                if (id) router.push({ pathname: '/trip-editor', params: { id } });
              });
            }}
          />
          {active ? (
            <Button
              disabled={isSaving}
              label="Oznacz jako zakończony"
              icon="check"
              variant="secondary"
              onPress={() => setConfirm('complete')}
            />
          ) : null}
          {active ? (
            <Button
              disabled={isSaving}
              label="Anuluj wyjazd"
              icon="close"
              variant="secondary"
              onPress={() => setConfirm('cancel')}
            />
          ) : null}
          <Button
            disabled={isSaving}
            label="Usuń wyjazd"
            icon="trash"
            variant="secondary"
            onPress={() => setConfirm('delete')}
          />
        </>
      )}
    </BottomSheet>
  );
}
