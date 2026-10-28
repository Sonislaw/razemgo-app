import { isGoogleMapUrl } from './map-navigation.ts';
// Google embeds require an iframe even inside a native WebView.
export function googleMapFrameHtml(uri: string): string {
  if (!isGoogleMapUrl(uri)) throw new Error('Invalid map URL');
  const escapedUri = uri
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html lang="pl"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src https://maps.google.com https://www.google.com https://www.google.pl; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
    </head><body><iframe src="${escapedUri}" title="Google Maps"
    onload="window.ReactNativeWebView.postMessage('loaded')"
    onerror="window.ReactNativeWebView.postMessage('error')"></iframe></body></html>`;
}
