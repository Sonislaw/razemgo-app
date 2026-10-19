import { getTripHeadline } from '@/features/trips/trip-headline';
import { router } from 'expo-router';
import { useState } from 'react';
import { AppText, Button } from '@/components/ui/primitives';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { OwnedTrip } from '@/types/owned-trip';
import { useOwnTrips } from './own-trips-context';
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
  const { state, dispatch } = useOwnTrips();
  const [confirm, setConfirm] = useState<
    'cancel' | 'delete' | 'publish' | 'complete' | null
  >(null);
  const today = todayDate();
  const status = getTripStatus(trip, today);
  const active = status === 'published' || status === 'paused';
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
      onClose={onClose}
    >
      <AppText variant="label">{getTripHeadline(trip)}</AppText>
      {confirm ? (
        <>
          <AppText color="textSecondary">
            {confirm === 'delete'
              ? 'Wyjazd zniknie z Waszej listy. Lokalne rozmowy pozostaną w Wiadomościach. Tej operacji nie można cofnąć w bieżącej sesji.'
              : confirm === 'cancel'
                ? 'Wyjazd trafi do archiwum i nie będzie przyjmował nowych zaproszeń. Dotychczasowe rozmowy pozostaną dostępne.'
                : confirm === 'complete'
                  ? 'Wyjazd zostanie oznaczony jako zakończony i trafi do archiwum. Dotychczasowe rozmowy pozostaną dostępne.'
                  : 'Plan będzie widoczny dla społeczności i otwarty na nowe zaproszenia. W tej wersji jest to wyłącznie stan lokalny.'}
          </AppText>
          <Button
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
                dispatch({ type: 'delete', id: trip.id });
                onClose();
                onDeleted?.();
              } else {
                dispatch({
                  type: 'status',
                  id: trip.id,
                  status:
                    confirm === 'cancel'
                      ? 'cancelled'
                      : confirm === 'complete'
                        ? 'completed'
                        : 'published',
                  today,
                });
                onClose();
              }
            }}
          />
          <Button
            label="Wróć bez zmian"
            variant="secondary"
            onPress={() => setConfirm(null)}
          />
        </>
      ) : (
        <>
          <Button
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
              label="Wstrzymaj poszukiwania"
              icon="pause"
              variant="secondary"
              onPress={() => {
                dispatch({
                  type: 'status',
                  id: trip.id,
                  status: 'paused',
                  today,
                });
                onClose();
              }}
            />
          ) : status === 'paused' ? (
            <Button
              label="Wznów poszukiwania"
              icon="people"
              variant="secondary"
              onPress={() => setConfirm('publish')}
            />
          ) : null}
          <Button
            label="Duplikuj jako szkic"
            icon="copy"
            variant="secondary"
            onPress={() => {
              const id = `local-trip-${state.nextSequence}`;
              dispatch({ type: 'duplicate', id: trip.id });
              onClose();
              router.push({ pathname: '/trip-editor', params: { id } });
            }}
          />
          {active ? (
            <Button
              label="Oznacz jako zakończony"
              icon="check"
              variant="secondary"
              onPress={() => setConfirm('complete')}
            />
          ) : null}
          {active ? (
            <Button
              label="Anuluj wyjazd"
              icon="close"
              variant="secondary"
              onPress={() => setConfirm('cancel')}
            />
          ) : null}
          <Button
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
