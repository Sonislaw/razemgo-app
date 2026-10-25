import type { NotificationPreferences } from './notification-types';

export type PushKind = 'invitation_received' | 'invitation_accepted' | 'message' | 'favorite_trip' | 'trip_reaction';
export interface PushTarget {
  v: 1;
  eventId: string;
  kind: PushKind;
  recipientGroupId: string;
  invitationId?: string;
  conversationId?: string;
  tripId?: string;
}
export function pushPreferenceAllows(kind: PushKind, preferences: Partial<NotificationPreferences> | null) {
  if (kind === 'favorite_trip') return preferences?.push_favorite_trips !== false;
  if (kind === 'trip_reaction') return preferences?.push_reactions !== false;
  return kind === 'message' ? preferences?.push_messages !== false : preferences?.push_invitations !== false;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePushTarget(value: unknown): PushTarget | null {
  if (!value || typeof value !== 'object') return null;
  const data=value as Record<string,unknown>;
  const uuid=(v: unknown): v is string => typeof v==='string' && UUID.test(v);
  if (data.v!==1 || !uuid(data.eventId) || !uuid(data.recipientGroupId)) return null;
  if ((data.kind==='favorite_trip' || data.kind==='trip_reaction') && uuid(data.tripId))
    return {v:1,eventId:data.eventId,recipientGroupId:data.recipientGroupId,kind:data.kind,tripId:data.tripId};
  if (data.kind==='invitation_received' && uuid(data.invitationId))
    return {v:1,eventId:data.eventId,recipientGroupId:data.recipientGroupId,kind:data.kind,invitationId:data.invitationId};
  if ((data.kind==='message' || data.kind==='invitation_accepted') && uuid(data.conversationId))
    return {v:1,eventId:data.eventId,recipientGroupId:data.recipientGroupId,kind:data.kind,conversationId:data.conversationId};
  return null;
}
export function pushDestination(target: PushTarget, groupId: string) {
  if (target.recipientGroupId!==groupId) return null;
  if (target.kind==='trip_reaction') return { pathname: '/trips/[id]' as const, params: { id: target.tripId! } };
  if (target.kind==='favorite_trip') return { pathname: '/trip/[id]' as const, params: { id: target.tripId! } };
  return target.kind==='invitation_received'
    ? { pathname: '/messages' as const }
    : { pathname: '/chat/[id]' as const, params: { id: target.conversationId! } };
}
export function pushNavigationReady(ready: boolean, navigationKey: string | undefined, pathname: string) {
  return ready && !!navigationKey && pathname!=='/account-loading' && pathname!=='/welcome' &&
    pathname!=='/onboarding' && !pathname.startsWith('/auth/');
}
