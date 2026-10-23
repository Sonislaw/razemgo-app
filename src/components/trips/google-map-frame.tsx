import { WebView } from 'react-native-webview';
import type { GoogleMapFrameProps } from './google-map-frame.types';
import { googleMapFrameHtml } from './google-map-frame-html';

export function GoogleMapFrame({
  uri,
  title,
  previewOnly,
  onLoad,
  onError,
}: GoogleMapFrameProps) {
  return (
    <WebView
      accessibilityLabel={title}
      source={{ html: googleMapFrameHtml(uri) }}
      originWhitelist={['*']}
      style={{ flex: 1 }}
      pointerEvents={previewOnly ? 'none' : 'auto'}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'loaded') onLoad();
        if (event.nativeEvent.data === 'error') onError();
      }}
      onError={onError}
      onHttpError={onError}
      scrollEnabled={!previewOnly}
      setSupportMultipleWindows={false}
      geolocationEnabled={false}
      mixedContentMode="never"
    />
  );
}
