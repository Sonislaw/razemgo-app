import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button } from '@/components/ui/primitives';
import { useState } from 'react';
import { View } from 'react-native';
import { FavoriteIconButton } from './favorite-icon-button';
import { useFavorite, useFavorites } from './favorites-context';
import { type FavoriteKind } from './favorites-store';

export function FavoriteButton({
  kind,
  targetId,
  compact = false,
  translucent = false,
}: {
  kind: FavoriteKind;
  targetId: string;
  compact?: boolean;
  translucent?: boolean;
}) {
  const { store, selected, pending, status } = useFavorite(kind, targetId);
  const [failedSelection, setFailedSelection] = useState<boolean | null>(null);
  const [retrying, setRetrying] = useState(false);
  if (!store) return null;
  const label =
    (selected ? 'Usuń ' : 'Dodaj ') +
    (kind === 'group' ? 'ekipę' : 'wyjazd') +
    (selected ? ' z ulubionych' : ' do ulubionych');
  const save = async (retrySelection?: boolean) => {
    if (store.getSnapshot().status !== 'ready') await store.refresh();
    const snapshot = store.getSnapshot();
    const current = (
      kind === 'group' ? snapshot.groupIds : snapshot.tripIds
    ).has(targetId);
    const desired = retrySelection ?? !current;
    const ok = await store.setFavorite(kind, targetId, desired);
    setFailedSelection(ok ? null : desired);
  };
  return (
    <>
      <FavoriteIconButton
        selected={selected}
        pending={pending}
        disabled={status === 'loading'}
        compact={compact}
        translucent={translucent}
        label={label}
        testID={'favorite-' + kind + '-' + targetId}
        onPress={() => {
          void save();
        }}
      />
      {failedSelection !== null ? (
        <BottomSheet
          title="Ulubione"
          onClose={() => {
            if (!retrying) setFailedSelection(null);
          }}
        >
          <AppText accessibilityRole="alert">
            Nie udało się zapisać ulubionych. Sprawdź połączenie albo dostępność
            tej pozycji i spróbuj ponownie.
          </AppText>
          <Button
            label={retrying ? 'Zapisywanie…' : 'Spróbuj ponownie'}
            disabled={retrying}
            onPress={async () => {
              setRetrying(true);
              try {
                await save(failedSelection);
              } finally {
                setRetrying(false);
              }
            }}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}

export function FavoritesNotice() {
  const { error, refresh } = useFavorites();
  if (!error) return null;
  return (
    <View style={{ gap: 8 }}>
      <AppText
        variant="caption"
        accessibilityRole="alert"
        color="textSecondary"
      >
        {error}
      </AppText>
      <Button
        label="Wczytaj ulubione ponownie"
        variant="secondary"
        onPress={() => void refresh()}
      />
    </View>
  );
}
