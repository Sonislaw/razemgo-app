// Shared by the app and Edge Functions. Never forward arbitrary error objects.
export const PUSH_HEALTH_CODES = ['PUSH_QUEUE_STALLED','PUSH_CREDENTIALS','PUSH_RETRIES','PUSH_DELIVERY_FAILURES','PUSH_SCHEDULE_INVALID','PUSH_DISPATCH_STOPPED'] as const;
export type PushHealthCode = typeof PUSH_HEALTH_CODES[number];
export const OPERATIONS = [
  'app.unhandled', 'app.render', 'monitoring.test',
  'auth.restore', 'auth.google', 'auth.callback', 'auth.sign_in', 'auth.sign_up',
  'auth.confirm', 'auth.resend', 'auth.reset_request', 'auth.password', 'auth.sign_out', 'auth.reset_session', 'account.delete', 'account.access',
  'moderation.list','moderation.detail','moderation.action','trips.report',
  'profile.load', 'profile.preferences', 'profile.save', 'trips.load', 'trips.save', 'trips.status', 'trips.duplicate', 'trips.delete',
  'discovery.load', 'mailbox.load', 'invitations.send', 'invitations.respond', 'messages.send', 'messages.load', 'messages.read',
  'groups.search', 'groups.detail', 'groups.visibility', 'groups.save_visibility', 'groups.report',
  'presence.heartbeat', 'presence.lookup',
  'contacts.block', 'contacts.report', 'notifications.load', 'notifications.read', 'notifications.preferences', 'push.register', 'push.unregister',
  'server.delete_account', 'server.dispatch_push', 'server.push_health',
] as const;
export type MonitoringOperation = typeof OPERATIONS[number];
export function monitoringEnvironment(value: string | undefined): 'development' | 'preview' | 'production' {
  return value === 'production' || value === 'preview' ? value : 'development';
}
// The original Preview backend already reports as "development". The isolated
// Dev uses "dev" so its errors and heartbeats cannot mask that backend's health.
export function serverMonitoringConfiguration(value: string | undefined) {
  const environment = value === 'dev' ? 'dev' : monitoringEnvironment(value);
  return {
    environment,
    monitorSlug: environment === 'dev' ? 'razemgo-push-health-dev' : 'razemgo-push-health',
    diagnostics: value === 'dev' || value === 'development',
  };
}
export type Failure = { category: 'network' | 'timeout' | 'permission' | 'server' | 'unexpected'; code: string; status?: number };
const EXPECTED_AUTH = new Set(['invalid_credentials','email_not_confirmed','user_already_exists','email_exists','weak_password',
  'same_password','otp_expired','otp_disabled','bad_code_verifier','flow_state_expired','flow_state_not_found','validation_failed',
  'over_email_send_rate_limit','over_request_rate_limit','access_denied','user_banned','session_not_found','refresh_token_not_found','refresh_token_already_used']);
const KNOWN_CODES = new Set<string>([...PUSH_HEALTH_CODES,'42501','22023','P0002','23505','23503','23514','54000','57014','53300','53400','08000','08006','PGRST000','PGRST001','PGRST002','PGRST003','PGRST116','PGRST202','PGRST204','unexpected_failure','request_timeout','provider_disabled','bad_oauth_state','bad_oauth_callback','oauth_provider_not_supported','oauth_callback_error']);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
export function classifyFailure(error: unknown, operation: MonitoringOperation, timedOut = false, httpStatus?: number): Failure | null {
  const value = record(error);
  const code = typeof value.code === 'string' ? value.code : '';
  const responseStatus = value.status ?? record(value.context).status ?? httpStatus;
  const status = typeof responseStatus === 'number' && Number.isInteger(responseStatus) && responseStatus >= 400 && responseStatus <= 599 ? responseStatus : undefined;
  if (operation.startsWith('auth.') && (EXPECTED_AUTH.has(code) || status === 400 && !KNOWN_CODES.has(code))) return null;
  if (['22023','P0002','23505','54000'].includes(code)) return null;
  const name = value.name;
  // Inspect messages only locally to classify network errors; never include them in a report.
  const message = typeof value.message === 'string' ? value.message : '';
  if (timedOut || name === 'TimeoutError' || code === 'request_timeout' || code === '57014') return { category: 'timeout', code: 'TIMEOUT' };
  if (name === 'AbortError') return null; // Navigation/caller cancellation.
  if (/network request failed|failed to fetch|fetch failed|load failed|networkerror|network connection|network is offline/i.test(message)) return { category: 'network', code: 'NETWORK' };
  if (code === '42501' || status === 403) return { category: 'permission', code: 'PERMISSION_DENIED', status };
  if (status === 401) return null;
  if (status === 429) return null;
  return { category: status && status >= 500 ? 'server' : 'unexpected', code: KNOWN_CODES.has(code) ? code : status ? 'HTTP_' + status : 'UNEXPECTED', status };
}
const ROUTES = new Set(['/', '/welcome','/auth/sign-in','/auth/sign-up','/auth/confirm','/auth/forgot-password','/auth/reset-password','/auth/callback',
  '/onboarding','/account-loading','/explore','/trips','/messages','/profile','/edit-profile','/group-visibility','/settings','/notifications','/messaging-safety','/trip-editor','/admin']);
export function monitoringRoute(path: string): string {
  const route = path.split(/[?#]/,1)[0];
  if (ROUTES.has(route)) return route;
  if (/^\/(chat|trip|trips|crew)\/[^/]+$/.test(route)) return '/' + route.split('/')[1] + '/[id]';
  return 'unknown';
}
export function createReportLimiter(now: () => number = Date.now) {
  const recent = new Map<string, number>(); let windowStart = now(); let count = 0;
  return (key: string) => {
    const time = now();
    if (time - windowStart >= 60000) { count = 0; windowStart = time; }
    if (count >= 10 || time - (recent.get(key) ?? -Infinity) < 60000) return false;
    if (recent.size >= 100) recent.clear();
    recent.set(key,time); count++; return true;
  };
}
export type ReportContext = { operation?: MonitoringOperation; screen?: string; category?: Failure['category']; code?: string; status?: number; requestId?: string };
export type SafeMetadata = { release: string; environment: string; platform: 'android' | 'ios' | 'web' | 'deno'; osVersion?: string; installationId?: string };
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const EVENT_ID = /^[a-f\d]{32}$/i;
function safeFrames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-40).map(item => {
    const frame = record(item); const filename = typeof frame.filename === 'string' ? frame.filename.split(/[?#]/,1)[0] : '';
    // Keep bundle identities for source maps, never origins, local user directories or URL parameters.
    const file = filename.match(/(?:^|[/\\])([a-zA-Z0-9_.-]+\.(?:js|hbc|bundle|tsx?|jsx))$/)?.[1];
    return { ...(file ? { filename: 'app:///' + file } : {}),
      ...(typeof frame.lineno === 'number' && frame.lineno >= 0 ? { lineno: frame.lineno } : {}),
      ...(typeof frame.colno === 'number' && frame.colno >= 0 ? { colno: frame.colno } : {}),
      ...(typeof frame.in_app === 'boolean' ? { in_app: frame.in_app } : {}) };
  });
}
export function sanitizeMonitoringEvent(input: unknown, metadata: SafeMetadata, context: ReportContext = {}) {
  const event = record(input);
  if (event.type && event.type !== 'error') return null;
  const operation = OPERATIONS.includes(context.operation as MonitoringOperation) ? context.operation! : 'app.unhandled';
  const category = ['network','timeout','permission','server','unexpected'].includes(context.category ?? '') ? context.category! : 'unexpected';
  const code = /^(?:HTTP_[45]\d\d|TIMEOUT|NETWORK|PERMISSION_DENIED|UNEXPECTED)$/.test(context.code ?? '') || KNOWN_CODES.has(context.code ?? '') ? context.code! : 'UNEXPECTED';
  const tags: Record<string,string> = { operation, category, code, screen: monitoringRoute(context.screen ?? 'unknown'), platform: metadata.platform };
  if (context.status && Number.isInteger(context.status) && context.status >= 400 && context.status <= 599) tags.http_status=String(context.status);
  if (context.requestId && UUID.test(context.requestId)) tags.request_id=context.requestId;
  const exceptions = record(event.exception).values;
  const values = Array.isArray(exceptions) ? exceptions.slice(-1).map(item => {
    const exception = record(item); const type = ['TypeError','ReferenceError','RangeError','SyntaxError','URIError','Error','UnhandledRejection'].includes(String(exception.type)) ? String(exception.type) : 'Error';
    const mechanism = record(exception.mechanism);
    return { type, value: operation + ': ' + code,
      stacktrace: { frames: safeFrames(record(exception.stacktrace).frames) },
      mechanism: { type: 'generic', handled: mechanism.handled !== false } };
  }) : [];
  const images = record(event.debug_meta).images;
  const debugImages = Array.isArray(images) ? images.flatMap(item => {
    const image = record(item);
    if (typeof image.debug_id !== 'string' || !UUID.test(image.debug_id) || image.type !== 'sourcemap') return [];
    const file = typeof image.code_file === 'string' ? image.code_file.split(/[?#]/,1)[0].split(/[/\\]/).at(-1) : '';
    return file && /^[a-zA-Z0-9_.-]+\.(js|hbc|bundle)$/.test(file) ? [{ type: 'sourcemap' as const, debug_id: image.debug_id, code_file:'app:///' + file }] : [];
  }) : [];
  return {
    type: undefined,
    ...(typeof event.event_id === 'string' && EVENT_ID.test(event.event_id) ? { event_id:event.event_id } : {}),
    ...(typeof event.timestamp === 'number' && Number.isFinite(event.timestamp) ? { timestamp:event.timestamp } : {}),
    platform: metadata.platform === 'deno' ? 'node' : 'javascript',
    level: 'error' as const, release: metadata.release, environment: metadata.environment,
    message: operation + ': ' + code, tags,
    fingerprint: [operation, code, ...(operation.startsWith('app.') ? [JSON.stringify(values.map(v=>v.stacktrace.frames.slice(-3)))] : [])],
    ...(values.length ? { exception: { values } } : {}),
    ...(debugImages.length ? { debug_meta:{images:debugImages} } : {}),
    ...(metadata.installationId && UUID.test(metadata.installationId) ? { user:{id:metadata.installationId} } : {}),
    contexts: { os:{name:metadata.platform, ...(metadata.osVersion && /^[\d.]{1,20}$/.test(metadata.osVersion) ? {version:metadata.osVersion}: {})} },
  };
}
