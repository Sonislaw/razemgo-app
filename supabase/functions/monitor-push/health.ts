import type { PushHealthCode } from '../../../shared/monitoring-policy.ts';
export { PUSH_HEALTH_CODES, type PushHealthCode } from '../../../shared/monitoring-policy.ts';
export type PushHealth = {
  pending:number; awaiting_receipts:number; in_flight:number; overdue:number; retrying:number;
  failed_recent:number; credential_errors:number; dispatcher_schedule_ok:boolean; monitor_schedule_ok:boolean; dispatcher_tick_ok:boolean;
};
const COUNTS=['pending','awaiting_receipts','in_flight','overdue','retrying','failed_recent','credential_errors'] as const;
const FLAGS=['dispatcher_schedule_ok','monitor_schedule_ok','dispatcher_tick_ok'] as const;
export function readPushHealth(value:unknown):PushHealth {
  if (!value || typeof value!=='object') throw new Error('Invalid push health snapshot');
  const source=value as Record<string,unknown>;
  const safe:Record<string,number|boolean>={};
  for (const key of COUNTS) {
    const count=source[key];
    if (typeof count!=='number' || !Number.isSafeInteger(count) || count<0) throw new Error('Invalid push health counter');
    safe[key]=count;
  }
  for (const key of FLAGS) {
    if (typeof source[key]!=='boolean') throw new Error('Invalid push health schedule');
    safe[key]=source[key];
  }
  return safe as PushHealth;
}
export function pushHealthAlerts(snapshot:PushHealth):PushHealthCode[] {
  const alerts:PushHealthCode[]=[];
  if (snapshot.overdue>0) alerts.push('PUSH_QUEUE_STALLED');
  if (snapshot.credential_errors>0) alerts.push('PUSH_CREDENTIALS');
  if (snapshot.retrying>0) alerts.push('PUSH_RETRIES');
  if (snapshot.failed_recent>0) alerts.push('PUSH_DELIVERY_FAILURES');
  if (!snapshot.dispatcher_schedule_ok || !snapshot.monitor_schedule_ok) alerts.push('PUSH_SCHEDULE_INVALID');
  if (!snapshot.dispatcher_tick_ok) alerts.push('PUSH_DISPATCH_STOPPED');
  return alerts;
}
