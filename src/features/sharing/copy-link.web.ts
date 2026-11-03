export async function copySharedLink(link: string): Promise<void> {
  // Call directly from the press to retain the browser's clipboard permission.
  // Do not report success from a legacy copy command that may silently fail.
  await navigator.clipboard.writeText(link);
}
