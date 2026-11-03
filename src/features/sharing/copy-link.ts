export async function copySharedLink(link: string): Promise<void> {
  // Do not load the native module before an older Dev binary has been upgraded.
  const clipboard = await import('expo-clipboard');
  if (!await clipboard.setStringAsync(link)) throw new Error('Copy failed');
}
