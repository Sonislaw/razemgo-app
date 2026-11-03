import { useWindowDimensions, View } from 'react-native';
import { FavoriteButton } from '@/features/favorites/favorite-button';
import { compactFavoriteInset, FavoriteIconButton } from '@/features/favorites/favorite-icon-button';
import { DEV_SHARING_ENABLED } from './share-config';
import { ShareLinkButton } from './share-link-button';
import { createShareLink, type SharedKind } from './share-links';

export function CardShareActions({ kind, targetId, preview = false, onExamplePress, favoriteTestID }: {
  kind: SharedKind;
  targetId: string;
  preview?: boolean;
  onExamplePress?: () => void;
  favoriteTestID?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const paired = DEV_SHARING_ENABLED && (preview || !!onExamplePress || !!createShareLink(kind, targetId));
  const inset = paired ? compactFavoriteInset(fontScale) : 0;
  const subject = kind === 'trip' ? 'wyjazd' : 'ekipę';
  // Move the tap areas right and inset the heart equally, preserving its position.
  // Both buttons retain separate targets of at least 44 px.
  return <View style={{ flexDirection: 'row', marginRight: -inset }}>
    <ShareLinkButton kind={kind} targetId={targetId} compact translucent disabled={preview}
      label={onExamplePress ? `Udostępnij ${subject} — załóż konto` : undefined} onPress={onExamplePress} />
    {preview || onExamplePress
      ? <FavoriteIconButton label={`Dodaj ${subject} do ulubionych${onExamplePress ? ' — załóż konto' : ''}`}
          compact translucent paired={paired} disabled={preview} onPress={onExamplePress ?? (() => {})} testID={favoriteTestID} />
      : <FavoriteButton kind={kind} targetId={targetId} compact translucent paired={paired} />}
  </View>;
}
