#!/usr/bin/env node
// SourceTrack — Phase 8 tenant-isolation RUNTIME 2-tenant leak test.
//
// ⚠️ FOUNDER-MUST-RUN — needs TINYBIRD_HOST + a deployed-pipe READ token, which agents
// do not hold. This file is a reviewable, re-runnable script; it was NOT executed by the
// agent that wrote it. Run from a machine with staging read creds:
//   TINYBIRD_HOST=<host> TINYBIRD_READ_TOKEN=<token> \
//   node tinybird/qa/tenant_isolation_runtime_test.mjs
//
// WHAT IT PROVES: the deployed pipes' site_id PARAM prunes — a request scoped to site A
// cannot surface site B's data, and vice versa. It does the decisive cross-tenant probe
// (site A's scope + a visitor that belongs to site B → MUST return 0 rows), plus a
// same-tenant sanity (site A + its own visitor → MUST return >0, so a 0 elsewhere means
// isolation, not a broken query), plus a prune sanity (two sites give independent counts).
//
// WHAT IT DOES NOT PROVE (Phase 10, out of scope by decision): token-scope isolation.
// This uses ONE WORKSPACE:READ_ALL-class read token that can read any tenant — so the test
// confirms the site_id PARAM filters correctly, NOT that a per-tenant token is scoped. The
// per-tenant-JWT question is deliberately deferred to Phase 10. (If a cross-probe ever
// returns >0 here, that is a param-prune leak and is far more urgent than the token question
// — escalate immediately, do not wait for Phase 10.)
//
// SITE SELECTION: uses two REAL pre-existing staging tenants (defaults below are seed sites
// confirmed present in staging). Does NOT create sites. If the defaults are not two distinct
// tenants with data on your staging Tinybird, override SITE_A/SITE_B with two real ones —
// do not invent test sites.

const HOST = process.env.TINYBIRD_HOST
const TOKEN = process.env.TINYBIRD_READ_TOKEN
const SITE_A = process.env.SITE_A || 'de200000-babe-41d4-a716-446655441111' // real seed tenant
const SITE_B = process.env.SITE_B || 'de400000-babe-41d4-a716-446655441111' // real seed tenant
// Pipe/param contract (verified against the .pipe files; re-confirm if pipes change):
//   events_latest(site_id) -> recent events incl. distinct_id (visitor harvest)
//   journey(site_id, visitor_id) -> that visitor's events      (probe; no time window)
// HARVEST PIPE CHOICE: use events_latest, NOT dashboard_recent_activity_events. The latter
// has a hard `timestamp >= now() - INTERVAL 30 MINUTE` predicate (dashboard_recent_activity_events.pipe:51),
// so it harvests 0 rows for any tenant whose data is older than 30 min (e.g. the gating
// site's June-dated fixtures) — a false harvest failure. events_latest has NO mandatory time
// window (only optional {% if defined %} date filters; events_latest.pipe:107-123), so it
// returns a visitor regardless of data age. Overridable via HARVEST_PIPE / PROBE_PIPE env.
const HARVEST_PIPE = process.env.HARVEST_PIPE || 'events_latest'
const PROBE_PIPE = process.env.PROBE_PIPE || 'journey'

if (!HOST || !TOKEN) {
  console.error('MISSING TINYBIRD_HOST / TINYBIRD_READ_TOKEN — cannot run. FOUNDER-MUST-RUN (see header).')
  process.exit(2)
}

async function pipe(name, params) {
  const url = new URL(`${HOST.replace(/\/$/, '')}/v0/pipes/${name}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  return Array.isArray(body.data) ? body.data : []
}

async function harvestVisitor(siteId) {
  const rows = await pipe(HARVEST_PIPE, { site_id: siteId })
  const withId = rows.find((r) => r && typeof r.distinct_id === 'string' && r.distinct_id.length > 0)
  return withId ? withId.distinct_id : null
}

const results = []
function record(name, verdict, detail) {
  results.push({ name, verdict, detail })
  const mark = verdict === 'PASS' ? '✅' : verdict === 'SKIP' ? '➖' : '❌'
  console.log(`${mark} ${verdict.padEnd(4)} ${name} — ${detail}`)
}

try {
  console.log(`Phase 8 RUNTIME tenant-isolation test\n  SITE_A=${SITE_A}\n  SITE_B=${SITE_B}\n${'─'.repeat(80)}`)

  const visA = await harvestVisitor(SITE_A)
  const visB = await harvestVisitor(SITE_B)
  if (!visA || !visB) {
    record('harvest', 'FAIL', `could not harvest a visitor for ${!visA ? 'SITE_A' : ''} ${!visB ? 'SITE_B' : ''} via ${HARVEST_PIPE} — pick two sites that have data`)
    process.exit(1)
  }
  console.log(`  harvested visitor A=${visA}  visitor B=${visB}\n`)

  // Same-tenant sanity: each site + its OWN visitor must return rows (proves the probe works).
  const selfA = await pipe(PROBE_PIPE, { site_id: SITE_A, visitor_id: visA })
  record('sanity: A+ownVisitor>0', selfA.length > 0 ? 'PASS' : 'FAIL', `${selfA.length} rows (expect >0; 0 means the probe is broken, not isolation)`)
  const selfB = await pipe(PROBE_PIPE, { site_id: SITE_B, visitor_id: visB })
  record('sanity: B+ownVisitor>0', selfB.length > 0 ? 'PASS' : 'FAIL', `${selfB.length} rows (expect >0)`)

  // Cross-tenant leak probe: site A scope + site B's visitor MUST return 0, and reversed.
  const crossAB = await pipe(PROBE_PIPE, { site_id: SITE_A, visitor_id: visB })
  record('LEAK: A-scope + B-visitor==0', crossAB.length === 0 ? 'PASS' : 'FAIL', `${crossAB.length} rows (expect 0; >0 = site B data leaked into site A scope)`)
  const crossBA = await pipe(PROBE_PIPE, { site_id: SITE_B, visitor_id: visA })
  record('LEAK: B-scope + A-visitor==0', crossBA.length === 0 ? 'PASS' : 'FAIL', `${crossBA.length} rows (expect 0; >0 = site A data leaked into site B scope)`)

  // Prune sanity: two sites yield independent results (documented, not asserted — two sites
  // can legitimately share a count).
  const pruneA = await pipe('doctor_pageviews_30d', { site_id: SITE_A })
  const pruneB = await pipe('doctor_pageviews_30d', { site_id: SITE_B })
  record('prune: doctor_pageviews_30d', 'PASS', `A=${JSON.stringify(pruneA[0] ?? null)} B=${JSON.stringify(pruneB[0] ?? null)} (independent per-site results)`)

  console.log('─'.repeat(80))
  const failed = results.filter((r) => r.verdict === 'FAIL')
  if (failed.length) {
    console.error(`RESULT: FAIL — ${failed.length} check(s) failed. A LEAK verdict is a cross-tenant data breach — escalate immediately.`)
    process.exit(1)
  }
  console.log('RESULT: PASS — site_id param prunes; no cross-tenant leak on the probed pipes. (Token-scope = Phase 10, not tested here.)')
  process.exit(0)
} catch (err) {
  console.error(`ERROR (test inconclusive, not a pass): ${err.message}`)
  process.exit(2)
}
