import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { loadOperations } from './load-protocol.mjs';
import { meetsTargets, percentile, summarizeSamples } from './load-results.mjs';

export const sessionDefaults = Object.freeze({ sessions: 200, rampMs: 60000, steadyMs: 180000,
  syncMs: 20000, actionMinMs: 10000, actionMaxMs: 20000, maxInFlightPerSession: 2,
  randomSeed: 4282026, minimumSamples: 50 });

// Fixed pseudorandom schedule: changing response latency never silently lowers
// the intended request rate. A busy session records a missed slot explicitly.
export function makeSessionSchedule(options = sessionDefaults) {
  const settings = { ...sessionDefaults, ...options };
  for (const key of ['sessions', 'rampMs', 'steadyMs', 'syncMs', 'actionMinMs', 'actionMaxMs', 'maxInFlightPerSession', 'minimumSamples']) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] <= 0) throw Error('Invalid session scenario configuration');
  }
  if (settings.sessions > 200 || settings.actionMaxMs < settings.actionMinMs ||
      settings.rampMs + settings.steadyMs > 3600000) throw Error('Session scenario limit exceeded');
  if (!Number.isSafeInteger(settings.randomSeed) || settings.randomSeed < 0 || settings.randomSeed > 0xffffffff)
    throw Error('Invalid session scenario seed');
  let seed = settings.randomSeed >>> 0;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const endMs = settings.rampMs + settings.steadyMs, events = [];
  const add = (session, atMs, id) => {
    if (events.length >= 100000) throw Error('Session schedule too large');
    events.push({ session, atMs: Math.round(atMs), id, phase: atMs < settings.rampMs ? 'ramp' : 'steady' });
  };
  for (let session = 0; session < settings.sessions; session++) {
    const arrival = Math.floor(session * settings.rampMs / settings.sessions);
    for (let at = arrival; at < endMs; at += settings.syncMs) add(session, at, 'summary');
    let at = arrival + Math.max(1, Math.floor(settings.actionMinMs * random()));
    while (at < endMs) {
      const choice = random();
      const id = choice < 0.45 ? 'trips' : choice < 0.70 ? 'groups' : choice < 0.90 ? 'mailbox'
        : choice < 0.95 ? 'tripRanking' : 'groupRanking';
      add(session, at, id);
      at += settings.actionMinMs + Math.floor(random() * (settings.actionMaxMs - settings.actionMinMs + 1));
    }
  }
  return { settings, endMs, events: events.sort((a, b) => a.atMs - b.atMs || a.session - b.session || a.id.localeCompare(b.id)) };
}

function emptyCounters() {
  return new Map(loadOperations.map(({ id }) => [id, { samples: [], scheduled: 0, missed: 0, delays: [] }]));
}

export async function runSessionSchedule(schedule, read, {
  now = () => performance.now(), sleep = ms => delay(ms), onProgress = () => {}, progressMs = 15000,
} = {}) {
  const phases = { ramp: emptyCounters(), steady: emptyCounters() };
  const busy = new Map(), busyOperations = new Set(), pending = new Set();
  const started = now();
  let peakInFlight = 0, lastProgress = started;
  const progress = () => {
    const completed = [...Object.values(phases)].flatMap(map => [...map.values()]).reduce((n, x) => n + x.samples.length, 0);
    const missed = [...Object.values(phases)].flatMap(map => [...map.values()]).reduce((n, x) => n + x.missed, 0);
    onProgress({ elapsedMs: Math.round(now() - started), inFlight: pending.size, completed, missed });
  };
  for (const event of schedule.events) {
    const remaining = started + event.atMs - now();
    if (remaining > 0) await sleep(remaining);
    if (now() - lastProgress >= progressMs) { progress(); lastProgress = now(); }
    const counter = phases[event.phase].get(event.id), key = event.session + ':' + event.id;
    counter.scheduled++;
    const lag = Math.max(0, now() - started - event.atMs);
    if ((busy.get(event.session) ?? 0) >= schedule.settings.maxInFlightPerSession || busyOperations.has(key) ||
        now() - started >= schedule.endMs) {
      counter.missed++;
      continue;
    }
    counter.delays.push(lag);
    busy.set(event.session, (busy.get(event.session) ?? 0) + 1);
    busyOperations.add(key);
    const work = Promise.resolve().then(() => read(event.session, event.id));
    const tracked = work.then(sample => { counter.samples.push(sample); }, () => {
      // A failed adapter must fail the measurement without exposing its error.
      counter.samples.push({ ok: false, status: 0, bytes: 0, ms: Math.max(0, now() - started - event.atMs - lag), code: 'TRANSPORT_ERROR' });
    }).finally(() => {
      pending.delete(tracked); busyOperations.delete(key);
      busy.set(event.session, busy.get(event.session) - 1);
    });
    pending.add(tracked);
    peakInFlight = Math.max(peakInFlight, pending.size);
  }
  const remaining = started + schedule.endMs - now();
  if (remaining > 0) await sleep(remaining);
  const drainStarted = now();
  await Promise.all(pending);
  progress();
  const result = { durationMs: Math.round(now() - started), drainMs: Math.round(now() - drainStarted), peakInFlight };
  for (const phase of ['ramp', 'steady']) {
    const operations = loadOperations.map(({ id, ranking }) => {
      const counter = phases[phase].get(id);
      return { id, ranking, scheduled: counter.scheduled, missed: counter.missed,
        missedRate: counter.scheduled ? counter.missed / counter.scheduled : null,
        schedulingP95Ms: percentile(counter.delays, 0.95), metrics: summarizeSamples(counter.samples) };
    });
    result[phase] = { operations,
      metrics: summarizeSamples([...phases[phase].values()].flatMap(x => x.samples)) };
  }
  result.targetsMet = meetsTargets(result.steady.operations) && result.steady.operations.every(
    row => row.metrics.attempts >= schedule.settings.minimumSamples && row.missedRate !== null && row.missedRate < 0.01 &&
      row.schedulingP95Ms !== null && row.schedulingP95Ms <= 100,
  );
  return result;
}
