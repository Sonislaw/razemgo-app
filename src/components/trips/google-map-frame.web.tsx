import type { GoogleMapFrameProps } from './google-map-frame.types';
import { isGoogleMapUrl } from './map-navigation';

export function GoogleMapFrame({
  uri,
  title,
  previewOnly,
  onLoad,
  onError,
}: GoogleMapFrameProps) {
  if (!isGoogleMapUrl(uri)) return null;
  return (
    <iframe
      title={title}
      src={uri}
      onLoad={onLoad}
      onError={onError}
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 0,
        pointerEvents: previewOnly ? 'none' : 'auto',
      }}
      tabIndex={previewOnly ? -1 : 0}
    />
  );
}
