import type { PushHealthCode } from '../../../shared/monitoring-policy.ts';
export { PUSH_HEALTH_CODES, type PushHealthCode } from '../../../shared/monitoring-policy.ts';
export type PushHealth = {
  pending:number; awaiting_receipts:number; in_flight:number; overdue:number; retrying:number;
  failed_recent:number; credential_errors:number; dispatcher_schedule_ok:boolean; monitor_schedule_ok:boolean; dispatcher_tick_ok:boolean;
  proposal_pending:number; proposal_overdue:number; proposal_schedule_ok:boolean; proposal_tick_ok:boolean;
  last_proposal_tick:string|null;
};
const COUNTS=['pending','awaiting_receipts','in_flight','overdue','retrying','failed_recent','credential_errors','proposal_pending','proposal_overdue'] as const;
const FLAGS=['dispatcher_schedule_ok','monitor_schedule_ok','dispatcher_tick_ok','proposal_schedule_ok','proposal_tick_ok'] as const;
export function readPushHealth(value:unknown):PushHealth {
  if (!value || typeof value!=='object') throw new Error('Invalid push health snapshot');
  const source=value as Record<string,unknown>;
  const safe:Record<string,number|boolean|string|null>={};
  for (const key of COUNTS) {
    const count=source[key];
    if (typeof count!=='number' || !Number.isSafeInteger(count) || count<0) throw new Error('Invalid push health counter');
    safe[key]=count;
  }
  for (const key of FLAGS) {
    if (typeof source[key]!=='boolean') throw new Error('Invalid push health schedule');
    safe[key]=source[key];
  }
  const tick=source.last_proposal_tick;
  if (tick!==null && (typeof tick!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(tick) || !Number.isFinite(Date.parse(tick))))
    throw new Error('Invalid proposal heartbeat');
  safe.last_proposal_tick=tick===null ? null : new Date(tick).toISOString();
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
  if (!snapshot.proposal_schedule_ok) alerts.push('PROPOSAL_SCHEDULE_INVALID');
  if (!snapshot.proposal_tick_ok) alerts.push('PROPOSAL_PROCESSOR_STOPPED');
  if (snapshot.proposal_overdue>0) alerts.push('PROPOSAL_QUEUE_STALLED');
  return alerts;
}
