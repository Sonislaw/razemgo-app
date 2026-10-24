// No native imports in the web bundle; browser push is outside this stage.
export const pushCapability = () => 'unsupported' as const;
export const loadPushModule = async (): Promise<typeof import('expo-notifications') | null> => null;
export const pushOptedOut = async () => false;
export const setPushOptedOut = async (_value: boolean) => {};
export const registerPushDevice = async (_token: string, _userId: string) => false;
export const unregisterPushDevice = async () => {};
export const clearDeviceNotifications = async () => {};
