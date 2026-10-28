import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { localToken } from './local-backend-check.mjs';
import { readLoadPage, loadOperations, syntheticUuid } from './load-protocol.mjs';
import { makeSessionSchedule, runSessionSchedule } from './session-load.mjs';

// The generator owns a separate process. Sampling psql/docker in the parent
// cannot block its JavaScript event loop. Both still share the same machine.
process.once('message', async ({ config, settings }) => {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const cpuStart = process.cpuUsage(), timeStart = performance.now();
  const eluStart = performance.eventLoopUtilization();
  let peakRssBytes = process.memoryUsage().rss;
  const memory = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 1000);
  try {
    const url = new URL(config.API_URL);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('Local only');
    const schedule = makeSessionSchedule(settings);
    const tokens = Array.from({ length: schedule.settings.sessions }, (_, i) => localToken(config,
      syntheticUuid('synthetic-user-' + (i + 1)), syntheticUuid('synthetic-session-' + (i + 1))));
    const queries = new Map(loadOperations.map(query => [query.id, query]));
    process.send({ type: 'ready' });
    const result = await runSessionSchedule(schedule, (session, id) => readLoadPage(config, tokens[session], queries.get(id)), {
      onProgress: progress => process.send({ type: 'progress', progress }),
    });
    const cpu = process.cpuUsage(cpuStart), elapsedMs = performance.now() - timeStart;
    process.send({ type: 'complete', result, generator: {
      cpuCorePercent: Math.round((cpu.user + cpu.system) / (elapsedMs * 1000) * 10000) / 100,
      eventLoopUtilization: performance.eventLoopUtilization(eluStart).utilization,
      eventLoopP95Ms: Math.round(histogram.percentile(95) / 1e6),
      eventLoopMaxMs: Math.round(histogram.max / 1e6), peakRssBytes,
    } });
  } catch {
    process.send({ type: 'failed' });
    process.exitCode = 1;
  } finally {
    clearInterval(memory); histogram.disable(); process.disconnect();
  }
});
