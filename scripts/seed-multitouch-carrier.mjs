#!/usr/bin/env node
// scripts/seed-multitouch-carrier.mjs — STAGING-ONLY seed for the multitouch $0-carrier
// exclusion proof. Writes ONE sourced (google) pageview + ONE $0 subscription-checkout
// carrier $conversion for a single-touch visitor into BOTH staging stores, backdated
// in-window (2026-07-01..06), so route_ab_diff.mjs --target multitouch can prove
// isSubscriptionCheckoutCarrier excludes the carrier identically on the Tinybird pipe leg
// and the PostHog HogQL leg.
//
// ── WHY NOT THE REAL WEBHOOK (do not retry that path) ────────────────────────
// stripe-webhook.js POST /:site_key maps a mode:'subscription' checkout.session.completed
// to exactly this carrier, BUT firing it cannot produce this fixture — two blockers:
//   (1) Tinybird-only: post-Wave-2b (#150) ph.capture is REMOVED from the webhook; the sole
//       write is dualWriteEvent(...). PostHog 469905 (the harness OFF leg) never receives it.
//   (2) No backdate: the checkout dualWriteEvent passes no `timestamp`, and normalizeEvent
//       (normalize.js:255-256) defaults an absent timestamp to now() -> the conversion lands
//       at run-time, outside 07-01..06. `occurred_at` is stored but the pipe filters `timestamp`.
// So a direct dual-store write with explicit timestamps (this script) is the ONLY correct path.
//
// ── WHICH BUCKET THE DELTA CHECK INSPECTS ────────────────────────────────────
// getMultiTouchAttributionLive (model:'linear', groupBy:'source') buckets credit by the
// TOUCHPOINT (pageview) source (share.source <- pvObj.utm_source/derived_source), NOT the
// conversion's utm_source. This visitor's single touchpoint is the google pageview, so the
// carrier's credit would land in the **'google'** bucket (populated by the 4A/4C fixtures).
// The conversion's utm_source='stripe' is IRRELEVANT to source-grouping — there is no lone
// 'stripe' bucket. SINGLE-TOUCH (exactly one google pageview) => the exclusion delta on the
// 'google' bucket is exactly 1.0 under linear. >>> Post-seed, inspect the 'google' bucket. <<<
//
// ── POSTHOG TIMESTAMP CAVEAT ─────────────────────────────────────────────────
// PostHog may reconcile/re-stamp an event's timestamp toward server-receive-time. If the
// PostHog verification query (below) returns NOTHING in the 07-01..06 window, that is the
// cause — NOT this script. Re-query PostHog WITHOUT the window filter
// (…AND properties.stripe_subscription_id='sub_test_carrier_001') to find where it landed.
//
// ── RUN ──────────────────────────────────────────────────────────────────────
//   Dry-run (default, no writes):   railway run --environment staging -s SourceTrack-Api \
//                                     node scripts/seed-multitouch-carrier.mjs
//   Write:                          … node scripts/seed-multitouch-carrier.mjs --confirm
//   Needs (staging env, injected by railway run): POSTHOG_PROJECT_ID=469905, POSTHOG_HOST,
//   POSTHOG_API_KEY (+ POSTHOG_PERSONAL_API_KEY for the pre-check read), TINYBIRD_HOST,
//   TINYBIRD_APPEND_TOKEN + TINYBIRD_DUAL_WRITE=true (write), TINYBIRD_READ_TOKEN (pre-check).
// Guards: refuses unless staging (POSTHOG_PROJECT_ID===469905 and staging fixture site_id),
// and aborts if a sub_test_carrier_001 conversion already exists in EITHER store (no double-seed).

import { ph, queryHogQL } from '../api/lib/posthog.js'
import { initTinybirdDualWrite } from '../tinybird/adapter/boot.js'
import { dualWriteEvent, __getDualWriteBatcher } from '../tinybird/adapter/dual-write.js'
import { esc } from '../api/lib/utils.js'

const SITE_ID = 'de200000-babe-41d4-a716-446655441111'
const SUB_ID = 'sub_test_carrier_001'
const VISITOR = 'carrier_test_visitor_001'   // single-touch => delta 1.0
const PV_TS = '2026-07-03T10:00:00.000Z'      // in-window
const CONV_TS = '2026-07-03T11:00:00.000Z'    // in-window, after the pv
const CONFIRM = process.argv.includes('--confirm')

// The ONE prior sourced (google) pageview — this is what puts the carrier in the 'google' bucket.
const pvProps = {
  site_id: SITE_ID, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand',
  page_url: 'https://www.example.com/pricing', server_timestamp: PV_TS
}
// The $0 subscription-checkout CARRIER $conversion (faithful to the webhook's conversionProperties).
const convProps = {
  site_id: SITE_ID,
  conversion_value: 0,                              // subscription-mode carrier => $0
  currency: 'USD',
  conversion_type: 'purchase',
  provider: 'stripe',
  stripe_event_type: 'checkout.session.completed',  // -> properties bag (pipe JSONExtractStrings it)
  stripe_subscription_id: SUB_ID,                   // -> typed column
  conversion_event_id: 'cs_test_carrier_001',
  ingestion_method: 'webhook_stripe',
  stitching_method: 'metadata.anonymous_id',
  attribution_status: 'attributed',
  utm_source: 'stripe', utm_medium: 'webhook',
  first_touch_source: 'google', first_touch_medium: 'cpc', first_touch_campaign: 'brand',
  occurred_at: CONV_TS
}

function assertStaging () {
  const proj = String(process.env.POSTHOG_PROJECT_ID || '')
  if (proj !== '469905') {
    console.error(`REFUSING: POSTHOG_PROJECT_ID=${proj || '<unset>'} is not staging (469905; prod is 416017). Aborting.`)
    process.exit(3)
  }
  if (!SITE_ID.startsWith('de200000')) {
    console.error('REFUSING: SITE_ID is not the staging fixture site. Aborting.')
    process.exit(3)
  }
}

async function tinybirdCarrierCount () {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_READ_TOKEN
  if (!host || !token) return null // can't verify this store
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(SITE_ID)}' AND event_type='$conversion' AND stripe_subscription_id='${esc(SUB_ID)}' FORMAT JSON`
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = await res.json()
    return Number(body?.data?.[0]?.c) || 0
  } catch { return null }
}
async function posthogCarrierCount () {
  try {
    const rows = await queryHogQL(`SELECT count() FROM events WHERE properties.site_id='${esc(SITE_ID)}' AND event='$conversion' AND properties.stripe_subscription_id='${esc(SUB_ID)}'`, 'seed_carrier_precheck')
    return Number(rows?.[0]?.[0]) || 0
  } catch { return null }
}

async function main () {
  if (!CONFIRM) {
    console.log('DRY RUN (no --confirm) — nothing written. Would seed into ST_Staging + PostHog 469905:')
    console.log(`  $pageview   ${VISITOR} @ ${PV_TS}  ${JSON.stringify(pvProps)}`)
    console.log(`  $conversion ${VISITOR} @ ${CONV_TS}  ${JSON.stringify(convProps)}`)
    console.log('Bucket to inspect post-seed: google (touchpoint source). Re-run with --confirm to write.')
    return
  }

  assertStaging()

  // No double-seed: abort if the carrier already exists in EITHER store.
  const [tb, phc] = await Promise.all([tinybirdCarrierCount(), posthogCarrierCount()])
  if ((tb || 0) > 0 || (phc || 0) > 0) {
    console.error(`ABORT: carrier ${SUB_ID} already present (ST_Staging=${tb}, PostHog=${phc}). No double-seed.`)
    process.exit(2)
  }
  if (tb === null) console.warn('WARN: could not verify ST_Staging (no TINYBIRD_READ_TOKEN/HOST) — proceeding on the PostHog pre-check.')
  if (phc === null) console.warn('WARN: could not verify PostHog (queryHogQL failed) — proceeding on the ST_Staging pre-check.')
  console.log(`pre-check clear (ST_Staging=${tb ?? 'n/a'}, PostHog=${phc ?? 'n/a'}). Seeding...`)

  initTinybirdDualWrite() // wire the real Tinybird transport from env

  ph.capture({ distinctId: VISITOR, event: '$pageview', timestamp: new Date(PV_TS), properties: pvProps })
  dualWriteEvent({ distinctId: VISITOR, event: '$pageview', timestamp: PV_TS, properties: pvProps })
  ph.capture({ distinctId: VISITOR, event: '$conversion', timestamp: new Date(CONV_TS), properties: convProps })
  dualWriteEvent({ distinctId: VISITOR, event: '$conversion', timestamp: CONV_TS, properties: convProps })

  const b = __getDualWriteBatcher(); if (b) await b.flush()
  await ph.flush()
  console.log(`SEEDED ${SUB_ID} for ${VISITOR} @ ${CONV_TS} into ST_Staging + PostHog 469905. Inspect the 'google' bucket (delta 1.0).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
