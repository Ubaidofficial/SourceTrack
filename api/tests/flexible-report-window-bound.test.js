// (c)-safe scan reduction: the windowJoin (_win) PAGEVIEW subquery is date-bounded to
// [fromDate - windowDays, toDate), cutting the full-pageview-history scan WITHOUT changing results
// (a qualifying touchpoint must be within windowDays before an in-window conversion, so pageviews
// outside that range can never qualify). This is a STRUCTURAL proof the bound is applied and that the
// external_event_id dedup subquery is left UNbounded (its global-earliest semantics must not change).
// Value parity is proven by the --live harness (the flexible targets stay GREEN).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictFlexibleReportCache } =
  await import('../lib/attribution-engine.js')

// source + first_touch + window=30 -> pipe=NONE (source is a touchpoint dim, windowed) -> the main
// HogQL sql which builds the _win windowJoin. Capture that sql and inspect it.
async function captureFlexSql () {
  let captured = null
  __evictFlexibleReportCache('site-wb', 'first_touch', '2026-07-01', '2026-07-06', 'source', 'conversions', {}, null, 'day', '30', 'conversion_date')
  __setAttributionReadDeps({
    queryTinybird: async () => null,
    queryHog: async (sql, name) => { if (name === 'flexible_report') captured = sql; return [] }
  })
  try {
    await getFlexibleReport('site-wb', 'first_touch', '2026-07-01', '2026-07-06', 'source', 'conversions', {}, null, 'day', '30', 'conversion_date')
  } finally { __resetAttributionReadDeps() }
  return captured
}

test('_win pageview subquery is date-bounded to [fromDate - windowDays, toDate)', async () => {
  const sql = await captureFlexSql()
  assert.ok(sql, 'source+window -> pipe=NONE -> the HogQL flexible_report sql was built (has a _win join)')
  // My bound is `${fromDate} - INTERVAL 30 DAY`, where fromDate is a toDateTime('...') literal.
  // The per-touchpoint argMaxIf predicate uses `cv.timestamp - INTERVAL 30 DAY` (no toDateTime), so this
  // regex matches ONLY the added _pv WHERE lower bound.
  assert.match(sql, /toDateTime\([^)]*\) - INTERVAL 30 DAY/, '_pv lower bound = fromDate - windowDays')
})

test('the external_event_id dedup subquery stays date-UNbounded (global-earliest semantics preserved)', async () => {
  const sql = await captureFlexSql()
  // HogQL dedup marker is argMin(uuid, timestamp); its body runs to GROUP BY … external_event_id.
  const m = sql.indexOf('argMin(uuid, timestamp)')
  assert.ok(m > 0, 'dedup subquery present (argMin(uuid, timestamp))')
  const dedupBody = sql.slice(m, m + 400)
  assert.match(dedupBody, /GROUP BY[\s\S]*external_event_id/, 'dedup groups by external_event_id')
  assert.ok(!/timestamp\s*>=|timestamp\s*</.test(dedupBody), 'dedup subquery has NO date filter (all-time = global-earliest, matching the pipe; must NOT be bounded)')
})
