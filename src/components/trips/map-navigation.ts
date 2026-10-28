// The embed has no reason to navigate to arbitrary pages, custom schemes or
// files. Match full hosts/paths; suffix tricks such as google.com.evil fail.
export function isGoogleMapUrl(uri: string) {
  try {
    const url = new URL(uri);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['maps.google.com', 'www.google.com', 'www.google.pl'].includes(
        url.hostname,
      ) &&
      /^\/maps(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export function allowMapNavigation(uri: string, isTopFrame = true) {
  // HTML is loaded locally; Google is embedded only inside its frame. A tap
  // cannot replace the app's document, even with an otherwise allowed URL.
  return uri === 'about:blank' || (!isTopFrame && isGoogleMapUrl(uri));
}
