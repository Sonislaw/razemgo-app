export type PushKind = 'invitation_received' | 'invitation_accepted' | 'message';
export interface PushTarget {
  v: 1;
  eventId: string;
  kind: PushKind;
  recipientGroupId: string;
  invitationId?: string;
  conversationId?: string;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePushTarget(value: unknown): PushTarget | null {
  if (!value || typeof value !== 'object') return null;
  const data=value as Record<string,unknown>;
  const uuid=(v: unknown): v is string => typeof v==='string' && UUID.test(v);
  if (data.v!==1 || !uuid(data.eventId) || !uuid(data.recipientGroupId)) return null;
  if (data.kind==='invitation_received' && uuid(data.invitationId))
    return {v:1,eventId:data.eventId,recipientGroupId:data.recipientGroupId,kind:data.kind,invitationId:data.invitationId};
  if ((data.kind==='message' || data.kind==='invitation_accepted') && uuid(data.conversationId))
    return {v:1,eventId:data.eventId,recipientGroupId:data.recipientGroupId,kind:data.kind,conversationId:data.conversationId};
  return null;
}
export function pushDestination(target: PushTarget, groupId: string) {
  if (target.recipientGroupId!==groupId) return null;
  return target.kind==='invitation_received'
    ? { pathname: '/messages' as const }
    : { pathname: '/chat/[id]' as const, params: { id: target.conversationId! } };
}
export function pushNavigationReady(ready: boolean, navigationKey: string | undefined, pathname: string) {
  return ready && !!navigationKey && pathname!=='/account-loading' && pathname!=='/welcome' &&
    pathname!=='/onboarding' && !pathname.startsWith('/auth/');
}
