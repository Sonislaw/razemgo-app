import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { USE_DEMO_DATA } from '@/constants/app';
import { useAuth } from '@/features/auth/auth-context';
import { useProfile } from '@/features/profile/profile-context';
import { useMessaging } from '@/features/messaging/messaging-context';
import { notificationCount } from '@/features/messaging/messaging-state';
import { parsePushTarget, pushDestination, pushNavigationReady, pushPreferenceAllows, type PushTarget } from './push-data';
import { clearDeviceNotifications, loadPushModule, pushCapability, pushOptedOut, registerPushDevice, setPushOptedOut, unregisterPushDevice } from './push-platform';
import { useNotifications } from './notifications-context';
import type { NotificationPreferences } from './notification-types';

type PushStatus = 'checking' | 'enabled' | 'off' | 'permission' | 'denied' | 'needs-build' | 'unsupported' | 'error';
interface PushState {
  status: PushStatus; busy: boolean; error: string | null; pending: PushTarget | null;
  receivedVersion: number;
  tokenVersion: number;
  synchronize: (userId: string, ask?: boolean) => Promise<void>;
  disable: () => Promise<void>;
  consume: (id: string) => void;
  bindGroup: (id: string | null) => void;
  bindPreferences: (preferences: NotificationPreferences | null) => void;
}
const Context=createContext<PushState | null>(null);
export function PushProvider({children}: {children: ReactNode}) {
  const {session}=useAuth();
  const [status,setStatus]=useState<PushStatus>(() => { const capability=pushCapability(); return capability==='supported' ? 'checking' : capability; });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string | null>(null);
  const [pending,setPending]=useState<PushTarget | null>(null);
  const [receivedVersion,setReceivedVersion]=useState(0);
  const [tokenVersion,setTokenVersion]=useState(0);
  const running=useRef(false);
  const queued=useRef<{userId: string; ask: boolean} | null>(null);
  const group=useRef<string | null>(null);
  const preferences=useRef<NotificationPreferences | null>(null);
  const user=useRef(session?.user.id);
  const handled=useRef(new Set<string>());
  const path=usePathname();
  const currentPath=useRef(path);
  useEffect(() => { currentPath.current=path; },[path]);
  useEffect(() => { user.current=session?.user.id; if(!session) group.current=null; },[session]);
  const bindGroup=useCallback((id: string | null) => { group.current=id; },[]);
  const bindPreferences=useCallback((value: NotificationPreferences | null) => { preferences.current=value; },[]);
  const consume=useCallback((id: string) => { handled.current.add(id); setPending(value => value?.eventId===id ? null : value); },[]);
  useEffect(() => {
    if(USE_DEMO_DATA) return;
    let alive=true;
    const subscriptions: {remove: () => void}[]=[];
    void loadPushModule().then(notifications => {
      if(!notifications || !alive) return;
      const accept=(data: unknown) => {
        const target=parsePushTarget(data);
        if(target && !handled.current.has(target.eventId)) setPending(target);
        notifications.clearLastNotificationResponse();
      };
      notifications.setNotificationHandler({handleNotification: async notification => {
        const target=parsePushTarget(notification.request.content.data);
        const allowed=!!target && target.recipientGroupId===group.current &&
          pushPreferenceAllows(target.kind,preferences.current) &&
          !(target.conversationId && currentPath.current==='/chat/'+target.conversationId);
        return {shouldShowBanner:allowed,shouldShowList:allowed,shouldPlaySound:allowed,shouldSetBadge:false};
      }});
      subscriptions.push(notifications.addNotificationResponseReceivedListener(response => accept(response.notification.request.content.data)));
      subscriptions.push(notifications.addNotificationReceivedListener(() => setReceivedVersion(value => value+1)));
      subscriptions.push(notifications.addPushTokenListener(() => setTokenVersion(value => value+1)));
      const initial=notifications.getLastNotificationResponse();
      if(initial) accept(initial.notification.request.content.data);
    }).catch(() => { if(alive) setStatus('needs-build'); });
    return () => { alive=false; subscriptions.forEach(subscription => subscription.remove()); };
  },[]);
  const synchronize=useCallback(async function synchronizeDevice(userId: string, ask=false): Promise<void> {
    if(USE_DEMO_DATA || user.current!==userId) return;
    if(running.current) { queued.current={userId,ask}; return; }
    const capability=pushCapability();
    if(capability!=='supported') { setStatus(capability); return; }
    running.current=true; setBusy(true); setError(null);
    try {
      const notifications=await loadPushModule();
      if(!notifications) { setStatus('needs-build'); return; }
      if(ask) await setPushOptedOut(false);
      if(await pushOptedOut()) { setStatus('off'); return; }
      if(Platform.OS==='android') await notifications.setNotificationChannelAsync('razemgo-contact',{
        name:'Wiadomości i zaproszenia',importance:notifications.AndroidImportance.HIGH,
        // Omit sound to keep Android's default. SDK 58 validates strings as bundled sound filenames.
        vibrationPattern:[0,200,100,200],lightColor:'#087FA4',lockscreenVisibility:notifications.AndroidNotificationVisibility.PRIVATE,
      });
      if(Platform.OS==='android') await notifications.setNotificationChannelAsync('razemgo-favorite-trips',{
        name:'Wyjazdy ulubionych ekip',importance:notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility:notifications.AndroidNotificationVisibility.PRIVATE,
      });
      if(Platform.OS==='android') await notifications.setNotificationChannelAsync('razemgo-reactions',{
        name:'Reakcje na ogłoszenia',importance:notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility:notifications.AndroidNotificationVisibility.PRIVATE,
      });
      let permission=await notifications.getPermissionsAsync();
      if(!permission.granted && ask && permission.canAskAgain) permission=await notifications.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:true,allowSound:true}});
      if(!permission.granted) {
        setStatus(permission.canAskAgain ? 'permission' : 'denied');
        await unregisterPushDevice().catch(() => undefined);
        return;
      }
      const projectId=Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      const token=await notifications.getExpoPushTokenAsync({projectId});
      if(user.current!==userId) return;
      if(await registerPushDevice(token.data,userId)) setStatus('enabled');
    } catch {
      if(user.current===userId) { setStatus('error'); setError('Nie udało się włączyć powiadomień na tym urządzeniu. Spróbuj ponownie.'); }
    } finally {
      running.current=false; setBusy(false);
      const next=queued.current; queued.current=null;
      if(next && user.current===next.userId) void synchronizeDevice(next.userId,next.ask);
    }
  },[]);
  const disable=async () => {
    if(running.current) return;
    running.current=true; setBusy(true); setError(null);
    try { await unregisterPushDevice(); await setPushOptedOut(true); await clearDeviceNotifications(); setStatus('off'); }
    catch { setError('Nie udało się wyłączyć powiadomień. Sprawdź połączenie i spróbuj ponownie.'); }
    finally { running.current=false; setBusy(false); }
  };
  return <Context value={{status,busy,error,pending,receivedVersion,tokenVersion,synchronize,disable,consume,bindGroup,bindPreferences}}>{children}</Context>;
}
export function usePush() { const context=useContext(Context); if(!context) throw new Error('PushProvider is required'); return context; }

// Mounted only when the protected navigator exists. Taps received during cold
// start or sign-in wait here for session restoration and profile onboarding.
export function PushAccountBridge({ready}: {ready: boolean}) {
  const {session}=useAuth();
  const {profile}=useProfile();
  const {refresh,dispatch,state}=useMessaging();
  const {refresh:refreshNotifications,read:readNotifications,preferences,status:notificationStatus}=useNotifications();
  const push=usePush();
  const navigation=useRootNavigationState();
  const pathname=usePathname();
  const handled=useRef<string | null>(null);
  const userId=session?.user.id;
  const groupId=profile.group.id;
  const {synchronize,bindGroup,bindPreferences,receivedVersion,tokenVersion,pending,consume}=push;
  useEffect(() => { bindGroup(ready ? groupId : null); return () => bindGroup(null); },[ready,groupId,bindGroup]);
  useEffect(() => { bindPreferences(ready && notificationStatus==='ready' ? preferences : null); return () => bindPreferences(null); },[ready,notificationStatus,preferences,bindPreferences]);
  useEffect(() => {
    if(!ready || !userId) return;
    void synchronize(userId);
    const foreground=AppState.addEventListener('change',value => { if(value==='active') void synchronize(userId); });
    return () => foreground.remove();
  },[ready,userId,synchronize,tokenVersion]);
  useEffect(() => { if(ready && receivedVersion) { void refresh(); void refreshNotifications(); } },[ready,receivedVersion,refresh,refreshNotifications]);
  const count=notificationCount(state);
  useEffect(() => { if(ready) void loadPushModule().then(module => module?.setBadgeCountAsync(count)).catch(() => undefined); },[ready,count]);
  useEffect(() => {
    if(!pushNavigationReady(ready,navigation?.key,pathname) || !pending || handled.current===pending.eventId) return;
    handled.current=pending.eventId;
    const destination=pushDestination(pending,groupId);
    consume(pending.eventId);
    if(!destination) return;
    void readNotifications([pending.eventId]);
    void refresh();
    if(pending.kind==='invitation_received') dispatch({type:'view',view:'invitations',direction:'received'});
    router.navigate(destination);
  },[ready,navigation?.key,pathname,pending,groupId,consume,refresh,dispatch,readNotifications]);
  return null;
}
