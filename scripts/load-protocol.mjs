import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { localRpc } from './local-backend-check.mjs';
import { safeErrorCode, validReadResult } from './load-results.mjs';

export const loadOperations = [
  { id: 'summary', rpc: 'get_my_sync_state', args: {}, kind: 'summary', ranking: false },
  { id: 'trips', rpc: 'search_public_trips', args: { page_size: 5 }, kind: 'trips', ranking: false },
  { id: 'groups', rpc: 'list_ranked_public_groups', args: { sort_mode: 'alphabetical', page_size: 5 }, kind: 'groups', ranking: false },
  { id: 'mailbox', rpc: 'get_my_mailbox_page', args: {}, kind: 'mailbox', ranking: false },
  { id: 'tripRanking', rpc: 'search_public_trips', args: { sort_mode: 'compatibility', page_size: 5 }, kind: 'trips', ranking: true },
  { id: 'groupRanking', rpc: 'list_ranked_public_groups', args: { sort_mode: 'compatibility', page_size: 5 }, kind: 'groups', ranking: true },
];

export const syntheticUuid = text => createHash('md5').update(text).digest('hex')
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');

// Only the bounded, checked aggregate leaves this function. Never retain a body,
// error message, token or response identifier in benchmark diagnostics.
export async function readLoadPage(config, token, query) {
  const started = performance.now();
  let bytes = 0, status = 0;
  try {
    const response = await localRpc(config, token, query.rpc, query.args);
    status = response.status;
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
    let value;
    try { value = JSON.parse(new TextDecoder().decode(body)); }
    catch { return { ok: false, status, bytes, ms: performance.now() - started, code: 'INVALID_JSON' }; }
    const ok = response.ok && validReadResult(query.kind, value);
    return { ok, status, bytes, ms: performance.now() - started,
      code: ok ? null : response.ok ? 'INVALID_CONTRACT' : safeErrorCode(value?.code) };
  } catch (error) {
    return { ok: false, status, bytes, ms: performance.now() - started,
      code: error?.name === 'TimeoutError' ? 'CLIENT_TIMEOUT' : 'TRANSPORT_ERROR' };
  }
}
