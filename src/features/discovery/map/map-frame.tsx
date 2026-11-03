import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { openURL } from 'expo-linking';
import { createRequestKey } from '@/lib/request-key';
import html from './map-document.cjs';
import { MAP_CHANNEL, parseMapMessage } from './map-data';
import type { MapFrameProps } from './map-frame.types';

export function MapFrame({
  camera,
  points,
  fit,
  onMessage,
  onError,
}: MapFrameProps) {
  const frame = useRef<WebView<object>>(null),
    [token] = useState(createRequestKey),
    [ready, setReady] = useState(false);
  const source = useMemo(
    () => ({ html, baseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL }),
    [],
  );
  const send = useCallback(
    (value: Record<string, unknown>) => {
      frame.current?.injectJavaScript(
        'window.RazemGoMap && window.RazemGoMap.receive(' +
          JSON.stringify({ ...value, channel: MAP_CHANNEL, token }) +
          ');true;',
      );
    },
    [token],
  );
  useEffect(() => {
    if (ready) send({ type: 'points', points });
  }, [ready, points, send]);
  useEffect(() => {
    if (ready && fit) send({ type: 'fit', bounds: fit.bounds });
  }, [ready, fit, send]);
  return (
    <WebView<object>
      ref={frame}
      testID="discovery-map-frame"
      accessibilityLabel="Mapa wyjazdów"
      source={source}
      style={{ flex: 1 }}
      originWhitelist={['*']}
      applicationNameForUserAgent="RazemGoDev/1.5.0"
      cacheEnabled
      geolocationEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      mixedContentMode="never"
      onShouldStartLoadWithRequest={(request) =>
        (request.isTopFrame ?? true) === false ||
        request.url === 'about:blank' ||
        request.url === source.baseUrl ||
        request.url === source.baseUrl + '/'
      }
      onError={onError}
      onHttpError={(event) => {
        if (event.nativeEvent.url.startsWith('https://tile.openstreetmap.org/'))
          onMessage({ type: 'tiles', ok: false });
        else onError();
      }}
      onContentProcessDidTerminate={onError}
      onMessage={(event) => {
        if (event.nativeEvent.data.length > 3000) return;
        try {
          const raw = JSON.parse(event.nativeEvent.data),
            message = parseMapMessage(raw);
          if (!message) return;
          if (message.type === 'ready') {
            send({ type: 'init', camera });
            return;
          }
          if (raw.token !== token) return;
          if (message.type === 'viewport') setReady(true);
          if (message.type === 'attribution') {
            void openURL(message.url).catch(() => undefined);
            return;
          }
          onMessage(message);
        } catch {
          /* Ignore malformed bridge traffic. */
        }
      }}
    />
  );
}
