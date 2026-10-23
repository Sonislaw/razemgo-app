import type { GoogleMapFrameProps } from './google-map-frame.types';

export function GoogleMapFrame({
  uri,
  title,
  previewOnly,
  onLoad,
  onError,
}: GoogleMapFrameProps) {
  return (
    <iframe
      title={title}
      src={uri}
      onLoad={onLoad}
      onError={onError}
      referrerPolicy="strict-origin-when-cross-origin"
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
