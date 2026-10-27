export type PushKind = 'invitation_received' | 'invitation_accepted' | 'message' | 'favorite_trip' | 'trip_reaction' | 'proposal';
export type PushJob = {
  delivery_id: string; event_id: string; device_id: string; push_token: string;
  kind: PushKind; recipient_group_id: string; invitation_id: string | null;
  conversation_id: string | null; ticket_id: string | null; claim_key: string; attempts: number;
  trip_id?: string | null;
  notification_id?: string | null;
  proposal_count?: number;
};
type Result = 'ticket' | 'sent' | 'retry' | 'invalid' | 'failed';
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type ExpoResult = { status?: string; id?: string; details?: { error?: string } };
const PROVIDER_CODES=new Set(['DeviceNotRegistered','InvalidCredentials','MismatchSenderId','MessageTooBig','MessageRateExceeded',
  'ExpoUnauthorized','ExpoForbidden','ExpoInvalidRequest','ExpoRateLimited','ExpoUnavailable','ExpoInvalidResponse','ProviderError','ReceiptPending']);
function safeProviderCode(code:unknown):string {
  return typeof code==='string' && PROVIDER_CODES.has(code) ? code : 'ProviderError';
}
function requestFailureCode(error:unknown):string {
  return error && typeof error==='object' && 'pushCode' in error ? safeProviderCode(error.pushCode) : 'ExpoUnavailable';
}
const COPY = {
  invitation_received: { title: 'Nowe zaproszenie', body: 'Ktoś chce poznać Twoją ekipę. Sprawdź zaproszenie w RazemGo.' },
  invitation_accepted: { title: 'Zaproszenie zaakceptowane', body: 'Możesz już rozpocząć rozmowę i zaplanować wspólny wyjazd.' },
  message: { title: 'Nowa wiadomość', body: 'Masz nową wiadomość w RazemGo.' },
  favorite_trip: { title: 'Nowy wyjazd ulubionej ekipy', body: 'Ekipa z Twoich ulubionych opublikowała nowy wyjazd. Zobacz szczegóły w RazemGo.' },
  trip_reaction: { title: 'Nowa reakcja na Twoje ogłoszenie', body: 'Ktoś zostawił emocję pod Twoim wyjazdem. Zobacz reakcję w RazemGo.' },
  proposal: { title: 'Nowa propozycja wyjazdu', body: 'Pojawił się wyjazd pasujący do Twojego planu. Zobacz szczegóły w RazemGo.' },
};
export function pushMessage(job: PushJob) {
  const key = job.kind === 'message' ? 'chat-' + job.conversation_id : job.event_id;
  const copy = job.kind === 'proposal' && (job.proposal_count ?? 0)>1
    ? {title:'Nowe propozycje wyjazdów',body:'Pojawiły się nowe wyjazdy pasujące do Twoich planów. Sprawdź propozycje w RazemGo.'}
    : COPY[job.kind];
  return {
    to: job.push_token, ...copy, sound: 'default', priority: 'high', ttl: 86400,
    channelId: job.kind === 'proposal' ? 'razemgo-proposals' : job.kind === 'favorite_trip' ? 'razemgo-favorite-trips' : job.kind === 'trip_reaction' ? 'razemgo-reactions' : 'razemgo-contact', collapseId: key, tag: key,
    ...(job.conversation_id ? { threadId: job.conversation_id } : {}),
    data: { v: 1, eventId: job.event_id, kind: job.kind, recipientGroupId: job.recipient_group_id,
      ...(job.invitation_id ? { invitationId: job.invitation_id } : {}),
      ...(job.conversation_id ? { conversationId: job.conversation_id } : {}),
      ...(job.kind === 'favorite_trip' || job.kind === 'trip_reaction' || job.kind === 'proposal' ? { tripId: job.trip_id } : {}),
      ...(job.kind === 'proposal' ? { notificationId: job.notification_id } : {}) },
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
    if (!response.ok) {
      const pushCode=response.status===401 ? 'ExpoUnauthorized' : response.status===403 ? 'ExpoForbidden'
        : response.status===429 ? 'ExpoRateLimited' : response.status>=500 ? 'ExpoUnavailable' : 'ExpoInvalidRequest';
      throw Object.assign(new Error('Expo request failed'),{pushCode});
    }
    return await response.json();
  };
  const sending = jobs.filter(j => !j.ticket_id);
  if (sending.length) {
    let result: { data?: ExpoResult | ExpoResult[] } | null = null;
    let failureCode='ExpoInvalidResponse';
    try { result = await post('send', sending.map(pushMessage)); } catch (error) { failureCode=requestFailureCode(error); }
    const tickets = result?.data ? (Array.isArray(result.data) ? result.data : [result.data]) : [];
    for (let i=0;i<sending.length;i++) {
      const ticket = tickets[i];
      if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0 && ticket.id.length < 200)
        await finish(sending[i], 'ticket', ticket.id);
      else {
        const code=ticket?.details?.error===undefined ? failureCode : safeProviderCode(ticket.details.error);
        await finish(sending[i],errorResult(code),undefined,code);
      }
    }
  }
  const checking = jobs.filter(j => j.ticket_id);
  if (checking.length) {
    let receipts: Record<string,ExpoResult> = {};
    let failureCode='ReceiptPending';
    try { receipts = (await post('getReceipts', { ids: checking.map(j => j.ticket_id) })).data ?? {}; } catch (error) { failureCode=requestFailureCode(error); }
    for (const job of checking) {
      const receipt = receipts[job.ticket_id!];
      if (receipt?.status === 'ok') await finish(job, 'sent');
      else {
        const code=receipt?.details?.error===undefined ? failureCode : safeProviderCode(receipt.details.error);
        await finish(job,errorResult(code),undefined,code);
      }
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
