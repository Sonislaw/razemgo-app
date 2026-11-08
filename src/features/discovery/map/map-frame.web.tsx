import { useCallback, useEffect, useRef, useState } from 'react';
import { createRequestKey } from '@/lib/request-key';
import { googleMapsWebKey } from '@/lib/google-maps-config';
import { MAP_CHANNEL, parseMapMessage } from './map-data';
import type { MapFrameProps } from './map-frame.types';

export function MapFrame({
  camera,
  points,
  fit,
  onMessage,
  onError,
  picker,
  selectedPoint,
  area,
}: MapFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null),
    [token] = useState(createRequestKey),
    [ready, setReady] = useState(false);
  const callbacks = useRef({ onMessage, onError });
  useEffect(() => {
    callbacks.current = { onMessage, onError };
  }, [onMessage, onError]);
  const send = useCallback(
    (value: Record<string, unknown>) => {
      frame.current?.contentWindow?.postMessage(
        { ...value, channel: MAP_CHANNEL, token },
        window.location.origin,
      );
    },
    [token],
  );
  const init = useCallback(
    () => send({ type: 'init', camera, apiKey: googleMapsWebKey, picker, selectedPoint, area }),
    [send, camera, picker, selectedPoint, area],
  );
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== window.location.origin
      )
        return;
      const message = parseMapMessage(event.data);
      if (!message) return;
      if (message.type === 'ready') {
        init();
        return;
      }
      if (event.data.token !== token) return;
      if (message.type === 'error') { callbacks.current.onError(); return; }
      if (message.type === 'viewport') setReady(true);
      if (message.type === 'attribution') {
        window.open(message.url, '_blank', 'noopener,noreferrer');
        return;
      }
      callbacks.current.onMessage(message);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [init, token]);
  useEffect(() => {
    if (ready) send({ type: 'points', points });
  }, [ready, points, send]);
  useEffect(() => {
    if (ready && fit) send({ type: 'fit', bounds: fit.bounds });
  }, [ready, fit, send]);
  return (
    <iframe
      ref={frame}
      title="Mapa wyjazdów"
      data-testid="discovery-map-frame"
      src="/razemgo-map.html"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={init}
      onError={onError}
      style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
