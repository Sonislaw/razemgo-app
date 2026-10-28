import { WebView } from 'react-native-webview';
import { googleMapFrameHtml } from './google-map-frame-html';
import type { GoogleMapFrameProps } from './google-map-frame.types';
import { allowMapNavigation } from './map-navigation';

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
      // Let every origin reach this callback. A whitelist miss would otherwise
      // open an untrusted link in an external app instead of rejecting it.
      onShouldStartLoadWithRequest={(request) =>
        allowMapNavigation(request.url, request.isTopFrame ?? true)
      }
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
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      mixedContentMode="never"
    />
  );
}
