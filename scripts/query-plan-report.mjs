// Preserve operator statistics, not SQL, predicates, parameters or row values.
const fields = new Set([
  'Node Type', 'Parent Relationship', 'Subplan Name', 'Relation Name',
  'Schema', 'Index Name', 'Function Name', 'Join Type', 'Strategy',
  'Plan Rows', 'Plan Width', 'Actual Rows', 'Actual Loops',
  'Actual Startup Time', 'Actual Total Time', 'Rows Removed by Filter',
  'Rows Removed by Join Filter', 'Shared Hit Blocks', 'Shared Read Blocks',
  'Temp Read Blocks', 'Temp Written Blocks', 'Sort Method',
  'Sort Space Used', 'Sort Space Type', 'Peak Memory Usage',
]);
export function sanitizePlan(plan) {
  const result = {};
  for (const [key, value] of Object.entries(plan ?? {})) {
    if (fields.has(key) && ['number', 'string', 'boolean'].includes(typeof value))
      result[key] = value;
  }
  if (Array.isArray(plan?.Plans)) result.Plans = plan.Plans.map(sanitizePlan);
  return result;
}

export function nestedPlans(stderr) {
  const results = [];
  for (const chunk of stderr.split(/LOG:\s+duration:/).slice(1)) {
    const duration = Number(chunk.match(/^\s*([\d.]+)\s+ms/)?.[1]);
    const start = chunk.indexOf('{');
    if (start < 0 || !Number.isFinite(duration)) continue;
    let depth = 0, quoted = false, escaped = false;
    for (let index = start; index < chunk.length; index++) {
      const char = chunk[index];
      if (escaped) { escaped = false; continue; }
      if (quoted && char === '\\') { escaped = true; continue; }
      if (char === '"') quoted = !quoted;
      if (!quoted && char === '{') depth++;
      if (!quoted && char === '}' && --depth === 0) {
        const value = JSON.parse(chunk.slice(start, index + 1));
        results.push({ durationMs: duration, plan: sanitizePlan(value.Plan) });
        break;
      }
    }
  }
  return results;
}
