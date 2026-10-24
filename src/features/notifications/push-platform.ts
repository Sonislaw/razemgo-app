import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createRequestKey } from '@/lib/request-key';
import { backendRequest } from '@/lib/backend-request';
import { getSupabase } from '@/lib/supabase';

type Module = typeof import('expo-notifications');
type Installation = { id: string; key: string };
let loading: Promise<Module | null> | undefined;
let installation: Promise<Installation> | undefined;
export function pushCapability(): 'supported' | 'needs-build' | 'unsupported' {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'unsupported';
  if (Constants.executionEnvironment === 'storeClient' ||
    !requireOptionalNativeModule('ExpoPushTokenManager') || !requireOptionalNativeModule('ExpoNotificationPermissionsModule') ||
    !requireOptionalNativeModule('ExpoNotificationsEmitter')) return 'needs-build';
  return 'supported';
}
export function loadPushModule(): Promise<Module | null> {
  if (!loading) loading = pushCapability() === 'supported' ? import('expo-notifications').catch(() => null) : Promise.resolve(null);
  return loading;
}
export function getPushInstallation(): Promise<Installation> {
  if (!installation) installation = (async () => {
    const stored=await SecureStore.getItemAsync('razemgo.push.installation');
    if (stored) {
      const value=JSON.parse(stored) as Installation;
      if (/^[\da-f-]{36}$/i.test(value.id) && /^[\da-f-]{36}$/i.test(value.key)) return value;
    }
    const value={id:createRequestKey(),key:createRequestKey()};
    await SecureStore.setItemAsync('razemgo.push.installation',JSON.stringify(value),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    return value;
  })().catch(error => { installation=undefined; throw error; });
  return installation;
}
export async function pushOptedOut() { return (await SecureStore.getItemAsync('razemgo.push.opted-out'))==='true'; }
export async function setPushOptedOut(value: boolean) { await SecureStore.setItemAsync('razemgo.push.opted-out',String(value)); }
export async function registerPushDevice(token: string, userId: string) {
  const saved=await getPushInstallation();
  const current=await getSupabase().auth.getSession();
  if (current.data.session?.user.id!==userId) return false;
  const projectId=Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Missing push project');
  const result=await backendRequest(signal => getSupabase().rpc('register_my_push_device', {
    installation_id:saved.id,installation_key:saved.key,push_token:token,device_platform:Platform.OS,expo_project_id:projectId,
  }).abortSignal(signal));
  if (result.error) throw result.error;
  return (await getSupabase().auth.getSession()).data.session?.user.id===userId;
}
export async function unregisterPushDevice() {
  const raw=await SecureStore.getItemAsync('razemgo.push.installation');
  if (!raw) return;
  const value=JSON.parse(raw) as Installation;
  const {error}=await backendRequest(signal => getSupabase().rpc('unregister_my_push_device', {
    installation_id:value.id,installation_key:value.key,
  }).abortSignal(signal));
  if (error) throw error;
}
export async function clearDeviceNotifications() {
  const notifications=await loadPushModule();
  if (notifications) {
    notifications.clearLastNotificationResponse();
    await notifications.dismissAllNotificationsAsync();
    await notifications.setBadgeCountAsync(0);
  }
}
