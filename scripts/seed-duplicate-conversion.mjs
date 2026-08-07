#!/usr/bin/env node
// scripts/seed-duplicate-conversion.mjs — STAGING-ONLY seed for the flexible_report external_event_id
// DEDUP proof. Writes TWO $conversion rows sharing the SAME non-null external_event_id (a "second
// pixel re-posted the same purchase" duplicate) into BOTH staging stores, backdated in-window, so
// route_ab_diff.mjs --target flexible-report can prove the pipe's ported dedup COLLAPSES the
// duplicate to match the HogQL leg (attribution-engine.js:2397-2409).
//
// ── WHY A DIRECT SEED (not the webhook) — same as #165 ───────────────────────
// The webhook is Tinybird-only post-#150 (ph.capture removed) so PostHog 469905 never gets it, and
// its dualWriteEvent passes no timestamp so normalizeEvent defaults to now() (out of window). A
// direct dual-store write with explicit backdated timestamps is the only way to reach both stores
// in-window. (See scripts/seed-multitouch-carrier.mjs header.)
//
// ── WHAT IS SEEDED ───────────────────────────────────────────────────────────
// TWO $conversion events, SAME external_event_id='dup_test_evt_001', SAME site, SAME
// first_touch_source='google', SAME conversion_value=49, in-window, DIFFERENT timestamps:
//   • DUP_A  event_id='dup_evt_a'  @ 2026-07-03T10:00:00Z  -> SURVIVES (earliest timestamp)
//   • DUP_B  event_id='dup_evt_b'  @ 2026-07-03T11:00:00Z  -> DROPPED by the dedup
// NOTE: unlike the #165 multitouch carrier, the flexible_report BASE CASE groups by
// first_touch_source read OFF THE CONVERSION EVENT (COALESCE(NULLIF(first_touch_source,''),'direct'))
// — it does NOT join pageviews. So NO pageview is needed; the source lives on the conversion rows.
// The two rows carry DISTINCT event_id (Tinybird dedup id, via deriveEventId branch-1 raw.event_id)
// and PostHog auto-assigns distinct uuids — required so each store has two physical rows to collapse.
//
// ── EXPECTED POST-SEED RESULT (for the --live verifier) ──────────────────────
// google bucket, metric=conversions: WITHOUT dedup = 2 ; WITH dedup = 1  (drops by 1).
// google bucket, metric=revenue:     WITHOUT dedup = $98 ; WITH dedup = $49 (drops by the dup's $49).
// SURVIVING row in BOTH stores = DUP_A (earliest timestamp 10:00): Tinybird argMin(event_id,timestamp)
// -> 'dup_evt_a'; PostHog argMin(uuid,timestamp) -> the 10:00 uuid. Different id, but DUP_A and DUP_B
// share source+value, so the collapsed bucket (1 conv / $49) is identical in both stores -> parity.
// PASS = pipe(google) == HogQL(google) == 1 conv / $49  (before this fix the pipe returned 2 / $98).
//
// ── POSTHOG TIMESTAMP CAVEAT (same as #165) ──────────────────────────────────
// PostHog may reconcile an event's timestamp toward server-receive-time. If the PostHog verify
// returns nothing in-window, re-query WITHOUT the window filter (by external_event_id) to find it.
//
// ── RUN ──────────────────────────────────────────────────────────────────────
//   Dry-run (default, no writes):  railway run --environment staging -s SourceTrack-Api \
//                                    node scripts/seed-duplicate-conversion.mjs
//   Write:                         … node scripts/seed-duplicate-conversion.mjs --confirm
//   Needs (staging env): POSTHOG_PROJECT_ID=469905, POSTHOG_HOST, POSTHOG_API_KEY
//   (+POSTHOG_PERSONAL_API_KEY for the pre-check read), TINYBIRD_HOST, TINYBIRD_APPEND_TOKEN +
//   TINYBIRD_DUAL_WRITE=true (write), TINYBIRD_READ_TOKEN (pre-check).
// Guards (scripts/lib/staging-seed-guard.mjs): refuses to write unless (1) --i-am-targeting-staging is
// passed, the SITE_ID is the de200000 fixture, and the append token's workspace is ST_Staging, AND
// (2) a live probe confirms the target Tinybird workspace already holds the de200000 fixture (prod
// SourceTrack has no such site — a prod token fails closed). Requires --i-am-targeting-staging in
// addition to --confirm. Its own dedup pre-check is separately FAIL-CLOSED — aborts if the fixture
// already exists OR if ST_Staging cannot be verified (no double-seed).

// D3: PostHog is decommissioned — the ph.capture write + the queryHogQL PostHog pre-check were
// removed. This seeder is now Tinybird-only and still functions END-TO-END: it writes via
// dualWriteEvent and fail-closed pre-checks against ST_Staging (the PostHog half of the pre-check
// is gone, not broken — it was a second store that no longer exists).
import { initTinybirdDualWrite } from '../tinybird/adapter/boot.js'
import { dualWriteEvent, __getDualWriteBatcher } from '../tinybird/adapter/dual-write.js'
import { esc } from '../api/lib/utils.js'
import { assertStagingSeedTarget, assertStagingWorkspaceLive, decodeTinybirdWorkspaceId } from './lib/staging-seed-guard.mjs'

const SITE_ID = 'de200000-babe-41d4-a716-446655441111'
const EXTERNAL_EVENT_ID = 'dup_test_evt_001'   // shared non-null key -> exercises the dedup
const VISITOR = 'dup_test_visitor_001'
const SOURCE = 'google'
const VALUE = 49
const CONFIRM = process.argv.includes('--confirm')
const TARGETING_STAGING = process.argv.includes('--i-am-targeting-staging')

// The two duplicate $conversion rows — distinct event_id, SAME external_event_id.
const DUPS = [
  { event_id: 'dup_evt_a', ts: '2026-07-03T10:00:00.000Z', survives: true },  // earliest -> survives
  { event_id: 'dup_evt_b', ts: '2026-07-03T11:00:00.000Z', survives: false }  // later    -> dropped
]
const convProps = (d) => ({
  site_id: SITE_ID,
  event_id: d.event_id,                 // deriveEventId branch-1 -> Tinybird event_id column
  external_event_id: EXTERNAL_EVENT_ID, // the dedup key (same on both rows)
  conversion_value: VALUE,
  currency: 'USD',
  conversion_type: 'purchase',
  first_touch_source: SOURCE,           // base-case dim reads this OFF the conversion (no pageview)
  first_touch_medium: 'cpc',
  utm_source: SOURCE,
  ingestion_method: 'server_routed',
  occurred_at: d.ts
})

// FAIL-CLOSED pre-checks: return a Number count, or null when the store could not be verified.
async function tinybirdDupCount () {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_READ_TOKEN
  if (!host || !token) return null
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(SITE_ID)}' AND event_type='$conversion' AND external_event_id='${esc(EXTERNAL_EVENT_ID)}' FORMAT JSON`
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = await res.json()
    const c = body?.data?.[0]?.c
    return c == null ? null : Number(c)
  } catch { return null }
}

async function main () {
  const host = process.env.TINYBIRD_HOST
  const workspaceId = decodeTinybirdWorkspaceId(process.env.TINYBIRD_APPEND_TOKEN)
  console.log(`[seed] write target — workspace=${workspaceId || '<undecodable>'}  SITE_ID=${SITE_ID}  (--i-am-targeting-staging=${TARGETING_STAGING})`)

  if (!CONFIRM) {
    console.log('DRY RUN (no --confirm) — nothing written. Would seed into ST_Staging:')
    for (const d of DUPS) console.log(`  $conversion ${VISITOR} @ ${d.ts}  event_id=${d.event_id} (${d.survives ? 'SURVIVES' : 'dropped'})  ${JSON.stringify(convProps(d))}`)
    console.log(`Expected post-dedup: google bucket 2->1 conversions, $98->$49 (DUP_A survives). Re-run with --confirm to write.`)
    return
  }

  // GATE 1 (pure): explicit staging opt-in + de200000 fixture + append token's workspace == ST_Staging.
  const gate = assertStagingSeedTarget({ appendToken: process.env.TINYBIRD_APPEND_TOKEN, siteId: SITE_ID, targetingStaging: TARGETING_STAGING })
  if (!gate.ok) { console.error(gate.reason); process.exit(3) }
  // GATE 2 (live): the target workspace must already hold the de200000 fixture — prod has no such site.
  const live = await assertStagingWorkspaceLive({ host, readToken: process.env.TINYBIRD_READ_TOKEN })
  if (!live.ok) { console.error(live.reason); process.exit(3) }
  console.log(`[seed] staging workspace CONFIRMED — de200000 fixture holds ${live.count} events (prod SourceTrack has none).`)

  // FAIL-CLOSED: abort if the fixture already exists OR if ST_Staging cannot be verified.
  const tb = await tinybirdDupCount()
  if (tb === null) {
    console.error(`ABORT (fail-closed): could not verify ST_Staging (${tb}). Refusing to seed without a clean pre-check.`)
    process.exit(2)
  }
  if (tb > 0) {
    console.error(`ABORT: duplicate fixture ${EXTERNAL_EVENT_ID} already present (ST_Staging=${tb}). No double-seed.`)
    process.exit(2)
  }
  console.log(`pre-check clear (ST_Staging=${tb}). Seeding 2 duplicate conversions...`)

  initTinybirdDualWrite()
  for (const d of DUPS) {
    const props = convProps(d)
    dualWriteEvent({ distinctId: VISITOR, event: '$conversion', timestamp: d.ts, properties: props })
  }

  const b = __getDualWriteBatcher(); if (b) await b.flush()
  console.log(`SEEDED 2x $conversion (${EXTERNAL_EVENT_ID}) into ST_Staging. Expect google to dedup 2->1 / $98->$49; DUP_A survives.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
