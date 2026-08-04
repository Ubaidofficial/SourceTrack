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
// Guards (scripts/lib/staging-seed-guard.mjs): refuses to write unless (1) --i-am-targeting-staging is
// passed, the SITE_ID is the de200000 fixture, and the append token's workspace is ST_Staging, AND
// (2) a live probe confirms the target Tinybird workspace already holds the de200000 fixture (prod
// SourceTrack has no such site — a prod token fails closed). Also aborts if sub_test_carrier_001 already
// exists (no double-seed). Requires --i-am-targeting-staging in addition to --confirm to actually write.

// D3: PostHog is decommissioned — the ph.capture write + the queryHogQL PostHog pre-check were
// removed. This seeder is now Tinybird-only and still functions END-TO-END: it writes via
// dualWriteEvent and pre-checks ST_Staging. The PostHog half of the pre-check is gone (not
// broken); with PostHog removed there is no second store to fall back to, so a missing
// TINYBIRD_READ_TOKEN now means "proceed without a pre-check" rather than "fall back to PostHog".
import { initTinybirdDualWrite } from '../tinybird/adapter/boot.js'
import { dualWriteEvent, __getDualWriteBatcher } from '../tinybird/adapter/dual-write.js'
import { esc } from '../api/lib/utils.js'
import { assertStagingSeedTarget, assertStagingWorkspaceLive, decodeTinybirdWorkspaceId } from './lib/staging-seed-guard.mjs'

const SITE_ID = 'de200000-babe-41d4-a716-446655441111'
const SUB_ID = 'sub_test_carrier_001'
const VISITOR = 'carrier_test_visitor_001'   // single-touch => delta 1.0
const PV_TS = '2026-07-03T10:00:00.000Z'      // in-window
const CONV_TS = '2026-07-03T11:00:00.000Z'    // in-window, after the pv
const CONFIRM = process.argv.includes('--confirm')
const TARGETING_STAGING = process.argv.includes('--i-am-targeting-staging')

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

async function main () {
  const host = process.env.TINYBIRD_HOST
  const workspaceId = decodeTinybirdWorkspaceId(process.env.TINYBIRD_APPEND_TOKEN)
  console.log(`[seed] write target — workspace=${workspaceId || '<undecodable>'}  SITE_ID=${SITE_ID}  (--i-am-targeting-staging=${TARGETING_STAGING})`)

  if (!CONFIRM) {
    console.log('DRY RUN (no --confirm) — nothing written. Would seed into ST_Staging:')
    console.log(`  $pageview   ${VISITOR} @ ${PV_TS}  ${JSON.stringify(pvProps)}`)
    console.log(`  $conversion ${VISITOR} @ ${CONV_TS}  ${JSON.stringify(convProps)}`)
    console.log('Bucket to inspect post-seed: google (touchpoint source). Re-run with --confirm to write.')
    return
  }

  // GATE 1 (pure): explicit staging opt-in + de200000 fixture + append token's workspace == ST_Staging.
  const gate = assertStagingSeedTarget({ appendToken: process.env.TINYBIRD_APPEND_TOKEN, siteId: SITE_ID, targetingStaging: TARGETING_STAGING })
  if (!gate.ok) { console.error(gate.reason); process.exit(3) }
  // GATE 2 (live): the target workspace must already hold the de200000 fixture — prod has no such site.
  const live = await assertStagingWorkspaceLive({ host, readToken: process.env.TINYBIRD_READ_TOKEN })
  if (!live.ok) { console.error(live.reason); process.exit(3) }
  console.log(`[seed] staging workspace CONFIRMED — de200000 fixture holds ${live.count} events (prod SourceTrack has none).`)

  // No double-seed: abort if the carrier already exists in ST_Staging.
  const tb = await tinybirdCarrierCount()
  if ((tb || 0) > 0) {
    console.error(`ABORT: carrier ${SUB_ID} already present (ST_Staging=${tb}). No double-seed.`)
    process.exit(2)
  }
  if (tb === null) console.warn('WARN: could not verify ST_Staging (no TINYBIRD_READ_TOKEN/HOST) — proceeding without a pre-check.')
  console.log(`pre-check clear (ST_Staging=${tb ?? 'n/a'}). Seeding...`)

  initTinybirdDualWrite() // wire the real Tinybird transport from env

  dualWriteEvent({ distinctId: VISITOR, event: '$pageview', timestamp: PV_TS, properties: pvProps })
  dualWriteEvent({ distinctId: VISITOR, event: '$conversion', timestamp: CONV_TS, properties: convProps })

  const b = __getDualWriteBatcher(); if (b) await b.flush()
  console.log(`SEEDED ${SUB_ID} for ${VISITOR} @ ${CONV_TS} into ST_Staging. Inspect the 'google' bucket (delta 1.0).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
