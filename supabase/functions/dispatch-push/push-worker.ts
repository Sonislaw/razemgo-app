export type PushKind = 'invitation_received' | 'invitation_accepted' | 'message';
export type PushJob = {
  delivery_id: string; event_id: string; device_id: string; push_token: string;
  kind: PushKind; recipient_group_id: string; invitation_id: string | null;
  conversation_id: string | null; ticket_id: string | null; claim_key: string; attempts: number;
};
type Result = 'ticket' | 'sent' | 'retry' | 'invalid' | 'failed';
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type ExpoResult = { status?: string; id?: string; details?: { error?: string } };
const COPY = {
  invitation_received: { title: 'Nowe zaproszenie', body: 'Ktoś chce poznać Twoją ekipę. Sprawdź zaproszenie w RazemGo.' },
  invitation_accepted: { title: 'Zaproszenie zaakceptowane', body: 'Możesz już rozpocząć rozmowę i zaplanować wspólny wyjazd.' },
  message: { title: 'Nowa wiadomość', body: 'Masz nową wiadomość w RazemGo.' },
};
export function pushMessage(job: PushJob) {
  const key = job.kind === 'message' ? 'chat-' + job.conversation_id : job.event_id;
  return {
    to: job.push_token, ...COPY[job.kind], sound: 'default', priority: 'high', ttl: 86400,
    channelId: 'razemgo-contact', collapseId: key, tag: key,
    ...(job.conversation_id ? { threadId: job.conversation_id } : {}),
    data: { v: 1, eventId: job.event_id, kind: job.kind, recipientGroupId: job.recipient_group_id,
      ...(job.invitation_id ? { invitationId: job.invitation_id } : {}),
      ...(job.conversation_id ? { conversationId: job.conversation_id } : {}) },
  };
}
function errorResult(code?: string): Result {
  if (code === 'DeviceNotRegistered') return 'invalid';
  if (code === 'MessageTooBig') return 'failed';
  return 'retry';
}
export async function dispatchPush(client: RpcClient, fetcher: typeof fetch = fetch, accessToken?: string) {
  const claimed = await client.rpc('claim_push_deliveries', { batch_size: 30 });
  if (claimed.error) throw new Error('Unable to claim deliveries');
  const jobs = (claimed.data ?? []) as PushJob[];
  const stats = { claimed: jobs.length, submitted: 0, confirmed: 0, retried: 0, invalid: 0, failed: 0 };
  const finish = async (job: PushJob, result: Result, ticket?: string, code?: string) => {
    const saved = await client.rpc('finish_push_delivery', { delivery_id: job.delivery_id, lease: job.claim_key,
      result, expected_token: job.push_token, expo_ticket_id: ticket ?? null, failure_code: code ?? null });
    if (saved.error) throw new Error('Unable to persist delivery outcome');
    if (result === 'ticket') stats.submitted++;
    else if (result === 'sent') stats.confirmed++;
    else if (result === 'retry') stats.retried++;
    else if (result === 'invalid') stats.invalid++;
    else stats.failed++;
  };
  const post = async (path: 'send' | 'getReceipts', body: unknown) => {
    const headers: Record<string,string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
    const response = await fetcher('https://exp.host/--/api/v2/push/' + path, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Expo request failed');
    return await response.json();
  };
  const sending = jobs.filter(j => !j.ticket_id);
  if (sending.length) {
    let result: { data?: ExpoResult | ExpoResult[] } | null = null;
    try { result = await post('send', sending.map(pushMessage)); } catch { /* Network retry, with a stable collapse ID. */ }
    const tickets = result?.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    for (let i=0;i<sending.length;i++) {
      const ticket = tickets[i];
      if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0 && ticket.id.length < 200)
        await finish(sending[i], 'ticket', ticket.id);
      else await finish(sending[i], errorResult(ticket?.details?.error), undefined, ticket?.details?.error ?? 'ExpoUnavailable');
    }
  }
  const checking = jobs.filter(j => j.ticket_id);
  if (checking.length) {
    let receipts: Record<string,ExpoResult> = {};
    try { receipts = (await post('getReceipts', { ids: checking.map(j => j.ticket_id) })).data ?? {}; } catch { /* Retry receipts without re-sending. */ }
    for (const job of checking) {
      const receipt = receipts[job.ticket_id!];
      if (receipt?.status === 'ok') await finish(job, 'sent');
      else await finish(job, errorResult(receipt?.details?.error), undefined, receipt?.details?.error ?? 'ReceiptPending');
    }
  }
  return stats;
}
export function validDispatchSecret(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected || actual.length !== 64 || expected.length !== 64) return false;
  let difference=0;
  for (let i=0;i<64;i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference===0;
}
