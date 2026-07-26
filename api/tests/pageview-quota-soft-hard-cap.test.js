// QUOTA SOFT/HARD CAP — exceeding a quota must never destroy data irreversibly.
//
// THE DEFECT: at quota, claimPageviewUsage returned allowed:false and every ingest
// path (track.js, proxy.js /e + /pixel, server-events.js) dropped the event before any
// write. Permanent, unrecoverable loss. For an attribution product a gap in the event
// stream does not produce MISSING numbers — it produces confidently WRONG ones
// (sessions split, first-touch lost, revenue attributed to the wrong source), which is
// the §6 violation: a fabricated answer is worse than a withheld one.
//
// THE CONSTRAINT THAT SHAPES THE FIX: claim_site_pageview_usage
// (baseline_schema.sql:164-205) does NOT increment when v_current_count >= p_limit — it
// returns FALSE with the count frozen. So the stored counter can never exceed whatever
// p_limit it was called with, and "collect past the soft limit" is impossible while the
// plan limit is passed as p_limit. The fix passes the HARD CAP as p_limit (so the counter
// is free to climb past the plan limit) and derives the lock state in the app by comparing
// the returned count against the SOFT plan limit. No RPC change, no migration.
//
// The RPC fake below is FAITHFUL to that freeze/increment logic rather than hand-feeding
// booleans, because the interplay between p_limit and the freeze is the entire mechanism
// under test — a mock that ignores p_limit would pass no matter what we passed.
//
// BOUNDARY, stated explicitly because it is a judgment call: the RPC returns the
// POST-increment count, and 'over_soft' begins at count === soft (not soft + 1). So the
// 10,000th pageview of a 10,000 allowance is the first one flagged — it is the event that
// consumes 100% of quota. This matches the 100% usage-threshold email, which also fires at
// count >= limit. Exactly `soft` events are unflagged, same as the number the old code
// allowed before it started dropping.

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  claimPageviewUsage,
  hardCapFor,
  HARD_CAP_MULTIPLIER_FREE,
  HARD_CAP_MULTIPLIER_PAID
} = await import('../lib/pageview-limits.js')
const { getSupabase } = await import('../lib/supabase.js')
const { track } = await import('../routes/track.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

const PV_RPC = 'claim_site_pageview_usage'
const client = getSupabase()
const originalRpc = client.rpc
const originalFrom = client.from

// Faithful stand-in for claim_site_pageview_usage: freeze at p_limit (no increment),
// otherwise increment and return the NEW count — exactly baseline_schema.sql:189-201.
function installRpc (startCount = 0) {
  let count = startCount
  const calls = []
  client.rpc = async (fn, params) => {
    calls.push({ fn, params })
    if (fn !== PV_RPC) return { data: null, error: null }
    if (count >= params.p_limit) return { data: [{ allowed: false, current_count: count }], error: null }
    count += 1
    return { data: [{ allowed: true, current_count: count }], error: null }
  }
  return { calls, current: () => count }
}
function restore () {
  client.rpc = originalRpc
  client.from = originalFrom
}

// ── The hard-cap derivation ───────────────────────────────────────────────────────────

test('🔴 hard cap is a MULTIPLE of the soft limit: 3x free-tier, 10x paid (a safety valve, not a product limit)', () => {
  assert.strictEqual(HARD_CAP_MULTIPLIER_FREE, 3)
  assert.strictEqual(HARD_CAP_MULTIPLIER_PAID, 10)
  // free + trial are both non-paying, so both get the tighter valve.
  assert.strictEqual(hardCapFor('free', 10_000), 30_000)
  assert.strictEqual(hardCapFor('trial', 10_000), 30_000)
  // paying plans get the wide valve — cutting off a paying customer's data is the worse failure.
  assert.strictEqual(hardCapFor('starter', 250_000), 2_500_000)
  assert.strictEqual(hardCapFor('growth', 1_000_000), 10_000_000)
  assert.strictEqual(hardCapFor('scale', 5_000_000), 50_000_000)
  // legacy aliases resolve through normalizePlan, so they are paid too.
  assert.strictEqual(hardCapFor('pro', 1_000_000), 10_000_000)
  assert.strictEqual(hardCapFor('agency', 5_000_000), 50_000_000)
})

test('🔴 the HARD CAP is what reaches the RPC as p_limit — otherwise the counter can never pass the soft limit', async (t) => {
  t.after(restore)
  const { calls } = installRpc(0)

  await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })

  const pv = calls.filter(c => c.fn === PV_RPC)
  assert.strictEqual(pv.length, 1)
  assert.strictEqual(pv[0].params.p_limit, 30_000,
    'passing the SOFT limit here is the bug: the RPC freezes at p_limit, so the count could never ' +
    'exceed the plan limit and over_soft collection would be impossible')
})

// ── The three states — never collapsed to a boolean ───────────────────────────────────

test("🔴 state 'ok': below the soft limit — event is written, not flagged", async (t) => {
  t.after(restore)
  installRpc(41)

  const r = await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })
  assert.strictEqual(r.state, 'ok')
  assert.strictEqual(r.allowed, true, 'allowed means "write the event"')
  assert.strictEqual(r.overQuota, false)
  assert.strictEqual(r.count, 42)
  assert.strictEqual(r.limit, 10_000, 'limit stays the SOFT plan limit — what the customer bought')
  assert.strictEqual(r.softLimit, 10_000)
  assert.strictEqual(r.hardCap, 30_000)
})

test("🔴 state 'over_soft': AT and PAST the soft limit — the event is STILL WRITTEN, only flagged", async (t) => {
  t.after(restore)
  installRpc(9_999)

  // The 10,000th pageview: consumes 100% of a 10,000 allowance -> first flagged event.
  const atLimit = await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })
  assert.strictEqual(atLimit.count, 10_000)
  assert.strictEqual(atLimit.state, 'over_soft')
  assert.strictEqual(atLimit.allowed, true, 'THE WHOLE POINT: past quota we keep collecting, we do not drop')
  assert.strictEqual(atLimit.overQuota, true)

  // ...and it keeps collecting well past it, rather than freezing at the plan limit.
  const past = await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })
  assert.strictEqual(past.count, 10_001, 'the counter MUST keep climbing past the soft limit')
  assert.strictEqual(past.state, 'over_soft')
  assert.strictEqual(past.allowed, true)
})

test("🔴 state 'hard_cap': at the hard cap the event IS dropped — the only case that drops", async (t) => {
  t.after(restore)
  installRpc(30_000)

  const r = await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })
  assert.strictEqual(r.state, 'hard_cap')
  assert.strictEqual(r.allowed, false)
  assert.strictEqual(r.overQuota, true)
  assert.strictEqual(r.count, 30_000, 'the RPC froze the count — no increment past the hard cap')
  assert.strictEqual(r.limit, 10_000)
  assert.strictEqual(r.hardCap, 30_000)
})

test('🔴 the transition is monotonic across the whole range: ok -> over_soft -> hard_cap, exactly once each', async (t) => {
  t.after(restore)
  // Tiny limits so the full range is walkable: soft 3, hard 9 (free 3x).
  installRpc(0)
  const seen = []
  for (let i = 0; i < 11; i++) {
    const r = await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 3 })
    seen.push(r.state)
  }
  // counts 1,2 -> ok | 3..9 -> over_soft (7 events collected PAST quota) | then frozen at 9 -> hard_cap
  assert.deepStrictEqual(seen, [
    'ok', 'ok',
    'over_soft', 'over_soft', 'over_soft', 'over_soft', 'over_soft', 'over_soft', 'over_soft',
    'hard_cap', 'hard_cap'
  ], 'under the OLD behaviour events 4..11 were all destroyed; now 7 of them are retained')
})

// ── The pre-existing fast paths must NOT be routed through the new logic ──────────────

test('inactive/archived (limit 0) keeps its existing fast path — blocked with NO RPC call', async (t) => {
  t.after(restore)
  const { calls } = installRpc(0)

  for (const plan of ['inactive', 'archived']) {
    const r = await claimPageviewUsage({ id: 'site-1', plan })
    assert.strictEqual(r.allowed, false, `${plan} must stay blocked`)
    assert.strictEqual(r.state, 'hard_cap', `${plan} drops, so it reports the dropping state`)
    assert.strictEqual(r.limit, 0)
  }
  assert.strictEqual(calls.length, 0, 'the limit-0 fast path must not touch the DB (pageview-limits.js:30)')
})

test('unlimited (Infinity) still bypasses the RPC entirely', async (t) => {
  t.after(restore)
  const { calls } = installRpc(0)

  const r = await claimPageviewUsage({ id: 'site-1', plan: 'scale', pv_limit: Infinity })
  assert.strictEqual(r.state, 'ok')
  assert.strictEqual(r.allowed, true)
  assert.strictEqual(r.limit, Infinity)
  assert.strictEqual(r.hardCap, Infinity)
  assert.strictEqual(calls.length, 0)
})

test('a DB/RPC error still THROWS so callers keep failing open (pageview-limits.js:12)', async (t) => {
  t.after(restore)
  client.rpc = async () => { throw new Error('simulated RPC outage') }
  await assert.rejects(
    () => claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 }),
    /simulated RPC outage/
  )
})

// ── Runaway visibility (item 4) ───────────────────────────────────────────────────────

test('🔴 crossing an integer multiple of the soft limit logs a WARN, so runaway usage is visible before the hard cap', async (t) => {
  t.after(restore)
  installRpc(19_999) // next event lands exactly on 2x of a 10,000 soft limit
  const warns = []
  const origWarn = console.warn
  console.warn = (...a) => warns.push(a.join(' '))
  try {
    await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })   // count 20_000 = 2x
    await claimPageviewUsage({ id: 'site-1', plan: 'free', pv_limit: 10_000 })   // count 20_001 — no warn
  } finally {
    console.warn = origWarn
  }
  const crossings = warns.filter(w => w.includes('over-quota'))
  assert.strictEqual(crossings.length, 1, 'exactly one WARN per crossing — not one per event past quota')
  assert.match(crossings[0], /2x/, 'the WARN must say which multiple was crossed')
  assert.match(crossings[0], /site-1/, 'and which site')
})

// ── §6: the 100% usage email must not claim tracking stopped, because it hasn't ───────
// Static source assertion: usage-threshold-emails.js exports nothing and calls run() at
// import time (with a process.exit inside), so importing it here would execute the job.
// Same convention as onboarding-step6-truthful-signals.test.js.

const JOB_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../jobs/usage-threshold-emails.js'),
  'utf8'
)

test('🔴 §6: the at-limit email must NOT claim tracking has paused — it no longer does', () => {
  // Strip comments so the assertion cannot be satisfied (or broken) by prose about the fix.
  const code = JOB_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(code, /has paused/,
    'ingestion now collects past the soft limit, so "tracking has paused" is a false status ' +
    '— the customer would assume a data gap that does not exist')
  assert.match(code, /still collecting your traffic/,
    'the at-limit email must state the truth: collection continues, the allowance is exceeded')
})

test('the 50/80/100 crossing logic survives count > limit: no double-send, no skip, no div-by-zero', () => {
  const code = JOB_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  // usagePct is unbounded now (up to 300% free / 1000% paid), and `crossed` filters
  // `usagePct >= t`, so an over-limit site still matches all three thresholds rather than
  // overflowing past them — no threshold can be skipped.
  assert.match(code, /THRESHOLDS\.filter\(t => usagePct >= t\)/,
    'a >= filter is what keeps every lower threshold reachable once the count runs past 100%')
  // Idempotency is per (site, month, threshold), so matching all three sends each at most once.
  assert.match(code, /\.eq\('threshold', threshold\)/,
    'the usage_email_log guard is what prevents a re-send on the next daily run')
  // The divide is guarded, so a 0 limit can never produce NaN/Infinity percentages.
  assert.match(code, /if \(!limit \|\| limit <= 0\) \{ skipped\+\+; continue \}/,
    'the limit<=0 guard must stay above the usagePct divide')
})

// ── THE CRITICAL BEHAVIOURAL ASSERTION: over_soft actually reaches Tinybird ───────────

function recorder () {
  const payloads = []
  return {
    transport: async (payload) => { payloads.push(payload) },
    lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
}
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 } // never auto-flush; flush explicitly

function trackReq () {
  return {
    headers: { 'user-agent': 'Mozilla/5.0' },
    site: { id: 'site-track-quota', plan: 'free', pv_limit: 10_000, excluded_paths: null, custom_url_params: null },
    body: { page_url: 'https://example.com/' } // no event -> defaults to $pageview
  }
}
function trackRes () {
  const out = { statusCode: 200, body: null }
  const res = {
    status (c) { out.statusCode = c; return res },
    json (b) { out.body = b; return res }
  }
  return { res, out }
}

test('🔴 track.js in over_soft: the pageview IS WRITTEN to Tinybird and NOT 402 — the data-loss fix', async (t) => {
  t.after(() => { restore(); setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE })
  installRpc(15_000) // between soft (10k) and hard (30k)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)

  const { res, out } = trackRes()
  await track(trackReq(), res)
  await __getDualWriteBatcher()?.flush()   // null when nothing was enqueued (i.e. the event was dropped)

  assert.notStrictEqual(out.statusCode, 402,
    'past the soft limit the event must NOT be rejected — that is the permanent data loss this fixes')
  assert.strictEqual(out.statusCode, 200)
  assert.strictEqual(rec.lines().length, 1, 'THE LOAD-BEARING ASSERTION: the event reached Tinybird')
  assert.strictEqual(rec.lines()[0].event_type, '$pageview')
  assert.strictEqual(out.body.data.received, true)
  assert.strictEqual(out.body.data.over_quota, true,
    'the response must carry an over-quota marker so the tracker/UI can surface it')
})

test('🔴 track.js in hard_cap: 402 with the EXISTING { limit_reached: true } shape, and nothing written', async (t) => {
  t.after(() => { restore(); setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE })
  installRpc(30_000) // at the hard cap
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)

  const { res, out } = trackRes()
  await track(trackReq(), res)
  await __getDualWriteBatcher()?.flush()   // null when nothing was enqueued (i.e. the event was dropped)

  assert.strictEqual(out.statusCode, 402)
  // Unchanged contract — clients may branch on limit_reached.
  assert.strictEqual(out.body.data.limit_reached, true)
  assert.strictEqual(out.body.data.received, false)
  assert.strictEqual(out.body.success, false)
  assert.strictEqual(rec.lines().length, 0, 'at the hard cap nothing is written')
})

test('🔴 track.js in ok: unchanged — written, 200, and NO over-quota marker', async (t) => {
  t.after(() => { restore(); setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE })
  installRpc(5)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)

  const { res, out } = trackRes()
  await track(trackReq(), res)
  await __getDualWriteBatcher()?.flush()   // null when nothing was enqueued (i.e. the event was dropped)

  assert.strictEqual(out.statusCode, 200)
  assert.strictEqual(rec.lines().length, 1)
  assert.strictEqual(out.body.data.received, true)
  assert.strictEqual(out.body.data.over_quota, undefined,
    'a normal pageview must not carry the marker — it would train clients to ignore it')
})
