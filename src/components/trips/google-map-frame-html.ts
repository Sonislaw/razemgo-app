// Google embeds require an iframe even inside a native WebView.
export function googleMapFrameHtml(uri: string): string {
  const escapedUri = uri
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html lang="pl"><head>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
    </head><body><iframe src="${escapedUri}" title="Google Maps"
    onload="window.ReactNativeWebView.postMessage('loaded')"
    onerror="window.ReactNativeWebView.postMessage('error')"></iframe></body></html>`;
}
