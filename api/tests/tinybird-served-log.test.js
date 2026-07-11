// W4 decommission prereq — queryTinybirdPipe POSITIVE served-from-pipe dispatch log.
// A SUCCESSFUL (non-null array) pipe response emits exactly one structured
// '[tinybird-read] served pipe '<name>' rows=<n>' line (pipe NAME + row COUNT only — no row
// content/PII). The null/fallback path stays silent on the served-log and keeps its existing
// fallback warn. This replaces "infer pipe-served from the ABSENCE of a fallback warn" with a
// POSITIVE per-read signal — required before HogQL/PostHog reads are decommissioned in W4.

import test from 'node:test'
import assert from 'node:assert'

process.env.TINYBIRD_READ_ENABLED = 'true'
process.env.TINYBIRD_HOST = 'https://tb.example.com'
process.env.TINYBIRD_READ_TOKEN = 'mock-read-token'
delete process.env.TINYBIRD_READ_PIPES // no allowlist → all pipes serve

const { queryTinybirdPipe } = await import('../lib/tinybird-read.js')

// Swap global.fetch + capture console.log (served-log) / console.warn (fallback); always restore.
// The served-log emits via console.LOG (proven-visible prod channel), NOT console.debug and NOT the
// sanitizing logInfo (which mangles first_touch/last_touch pipe names) — so we assert on the plain line.
async function withCapture (fetchImpl, fn) {
  const orig = { fetch: global.fetch, log: console.log, warn: console.warn }
  const log = []; const warn = []
  global.fetch = fetchImpl
  console.log = (...a) => log.push(a.join(' '))
  console.warn = (...a) => warn.push(a.join(' '))
  try { const out = await fn(); return { out, log, warn } } finally {
    global.fetch = orig.fetch; console.log = orig.log; console.warn = orig.warn
  }
}
const okJson = (data) => async () => ({ ok: true, status: 200, json: async () => ({ data }), text: async () => '' })
const servedLines = (log) => log.filter((l) => l.includes('[tinybird-read] served pipe'))

test('SERVED: non-null array response emits one served-log (console.log) with pipe name + row count', async () => {
  const { out, log } = await withCapture(okJson([{ a: 1 }, { a: 2 }, { a: 3 }]), () => queryTinybirdPipe('events_latest', {}))
  assert.ok(Array.isArray(out) && out.length === 3, 'rows returned')
  assert.strictEqual(servedLines(log).length, 1, 'exactly one served-log line')
  assert.match(servedLines(log)[0], /served pipe 'events_latest' rows=3/, 'pipe name + count present')
})

test('NAME-SAFE: a last_touch/first_touch pipe name is NOT mangled (logInfo sanitizer would redact st_)', async () => {
  const { log } = await withCapture(okJson([{ a: 1 }]), () => queryTinybirdPipe('last_touch_non_direct_by_site', {}))
  assert.match(servedLines(log)[0], /served pipe 'last_touch_non_direct_by_site' rows=1/, 'full pipe name preserved (not [REDACTED_KEY])')
})

test('NO CONTENT: served-log carries counts only — never row values (PII-safe)', async () => {
  const { log } = await withCapture(
    okJson([{ email: 'user@secret.example', anonymous_id: 'SENSITIVE_VISITOR_ID' }]),
    () => queryTinybirdPipe('sessions_pageviews', {})
  )
  const line = servedLines(log)[0] || ''
  assert.match(line, /rows=1/, 'count logged')
  assert.ok(!line.includes('user@secret.example'), 'no email value leaked')
  assert.ok(!line.includes('SENSITIVE_VISITOR_ID'), 'no visitor id value leaked')
})

test('EMPTY-BUT-SERVED: [] is a genuine pipe hit (non-null) → served-log rows=0 still fires', async () => {
  const { out, log } = await withCapture(okJson([]), () => queryTinybirdPipe('alert_recent', {}))
  assert.ok(Array.isArray(out) && out.length === 0, 'empty array served (not null)')
  assert.strictEqual(servedLines(log).length, 1, 'served-log fires for an empty served array')
  assert.match(servedLines(log)[0], /rows=0/, 'rows=0')
})

test('FALLBACK (null body.data): returns null → NO served-log', async () => {
  const { out, log } = await withCapture(okJson(null), () => queryTinybirdPipe('events_latest', {}))
  assert.strictEqual(out, null, 'non-array data → null (fallback)')
  assert.strictEqual(servedLines(log).length, 0, 'no served-log on the null/fallback path')
})

test('FALLBACK (non-2xx): returns null, keeps its fallback WARN, emits NO served-log', async () => {
  const notOk = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'upstream error' })
  const { out, log, warn } = await withCapture(notOk, () => queryTinybirdPipe('events_latest', {}))
  assert.strictEqual(out, null, 'non-2xx → null')
  assert.strictEqual(servedLines(log).length, 0, 'no served-log')
  assert.ok(warn.some((l) => l.includes("[tinybird-read] pipe 'events_latest' failed")), 'existing fallback warn preserved (untouched)')
})
