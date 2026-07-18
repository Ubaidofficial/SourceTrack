#!/usr/bin/env node
// scripts/seed-attribution-fixture.mjs — STAGING-ONLY seed for the D2 B3 adversarial construction fixture.
// Writes the KNOWN journey from scripts/lib/attribution-fixture.mjs into ST_Staging (Tinybird), so the
// nightly can attribute it and verify-attribution-fixture.mjs can diff the stored row against HAND-COMPUTED
// values (never a recompute). See KNOWN_ISSUES #19 for why construction-truth replaces pipe-vs-HogQL parity.
//
// Writes (all via dualWriteEvent → the guarded staging Tinybird target):
//   V1: 4 $pageview touchpoints (incl. a same-timestamp tie + an AI-Search touch + a Direct converting
//       touch) then a $100 purchase $conversion.
//   V2: 1 google $pageview then a $0 subscription-checkout carrier $conversion (revenue-exclusion proof).
// The pageview event_id is set explicitly so the pipe's (timestamp, event_id) tie-break is deterministic.
//
// GUARD (scripts/lib/staging-seed-guard.mjs): refuses to write unless --i-am-targeting-staging + the
// de200000 fixture site + a staging host, AND a live probe confirms the target workspace holds the
// de200000 fixture (prod SourceTrack has none → fails closed). Requires --i-am-targeting-staging AND
// --confirm to write. Dry-run (default) prints the plan and touches nothing.
//
//   Dry-run:  node scripts/seed-attribution-fixture.mjs
//   Write:    node scripts/seed-attribution-fixture.mjs --confirm --i-am-targeting-staging
//   Needs (staging env): TINYBIRD_HOST, TINYBIRD_APPEND_TOKEN, TINYBIRD_DUAL_WRITE=true (write),
//   TINYBIRD_READ_TOKEN (guard probe + double-seed pre-check).

import { initTinybirdDualWrite } from '../tinybird/adapter/boot.js'
import { dualWriteEvent, __getDualWriteBatcher } from '../tinybird/adapter/dual-write.js'
import { esc } from '../api/lib/utils.js'
import { assertStagingSeedTarget, assertStagingWorkspaceLive } from './lib/staging-seed-guard.mjs'
import { FIXTURE_SITE_ID, V1, V2 } from './lib/attribution-fixture.mjs'

const CONFIRM = process.argv.includes('--confirm')
const TARGETING_STAGING = process.argv.includes('--i-am-targeting-staging')

const pvProps = (tp) => ({
  site_id: FIXTURE_SITE_ID, event_id: tp.event_id,
  utm_source: tp.utm_source, utm_medium: tp.utm_medium, utm_campaign: tp.utm_campaign,
  ai_source: tp.ai_source || null, referrer: tp.referrer || null,
  page_url: 'https://www.example.com/', server_timestamp: tp.ts
})
const v1ConvProps = {
  site_id: FIXTURE_SITE_ID, event_id: V1.conversionEventId,
  conversion_value: V1.conversionValue, currency: 'USD', conversion_type: 'purchase',
  ingestion_method: 'server_routed', occurred_at: V1.conversionTs
}
const v2PvProps = {
  site_id: FIXTURE_SITE_ID, event_id: 'fixt_v2_tp_google',
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand',
  page_url: 'https://www.example.com/pricing', server_timestamp: V2.touchTs
}
const v2CarrierProps = {
  site_id: FIXTURE_SITE_ID, event_id: V2.conversionEventId,
  conversion_value: 0, currency: 'USD', conversion_type: 'purchase', provider: 'stripe',
  stripe_event_type: 'checkout.session.completed', stripe_subscription_id: V2.subscriptionId,
  ingestion_method: 'webhook_stripe', occurred_at: V2.conversionTs
}

// Fixture already present? (idempotent — abort rather than double-seed.)
async function fixturePresent () {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_READ_TOKEN
  if (!host || !token) return null
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(FIXTURE_SITE_ID)}' AND event_id IN ('${esc(V1.conversionEventId)}','${esc(V2.conversionEventId)}') FORMAT JSON`
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
  console.log(`[seed] write target — TINYBIRD_HOST=${host || '<unset>'}  SITE_ID=${FIXTURE_SITE_ID}  (--i-am-targeting-staging=${TARGETING_STAGING})`)

  if (!CONFIRM) {
    console.log('DRY RUN (no --confirm) — nothing written. Would seed into ST_Staging:')
    V1.touchpoints.forEach((tp) => console.log(`  V1 $pageview   ${V1.visitor} @ ${tp.ts}  ${JSON.stringify(pvProps(tp))}`))
    console.log(`  V1 $conversion ${V1.visitor} @ ${V1.conversionTs}  ${JSON.stringify(v1ConvProps)}`)
    console.log(`  V2 $pageview   ${V2.visitor} @ ${V2.touchTs}  ${JSON.stringify(v2PvProps)}`)
    console.log(`  V2 $conversion ${V2.visitor} @ ${V2.conversionTs}  ${JSON.stringify(v2CarrierProps)} (carrier $0)`)
    console.log('After seeding: run the nightly against staging, then node scripts/verify-attribution-fixture.mjs')
    return
  }

  // GATE 1 (pure) + GATE 2 (live): confirm the write target is the staging workspace.
  const gate = assertStagingSeedTarget({ host, siteId: FIXTURE_SITE_ID, targetingStaging: TARGETING_STAGING })
  if (!gate.ok) { console.error(gate.reason); process.exit(3) }
  const live = await assertStagingWorkspaceLive({ host, readToken: process.env.TINYBIRD_READ_TOKEN, siteId: FIXTURE_SITE_ID })
  if (!live.ok) { console.error(live.reason); process.exit(3) }
  console.log(`[seed] staging workspace CONFIRMED — de200000 fixture holds ${live.count} events.`)

  const present = await fixturePresent()
  if (present === null) { console.error('ABORT (fail-closed): could not verify ST_Staging — refusing to seed without a clean pre-check.'); process.exit(2) }
  if (present > 0) { console.error(`ABORT: fixture already present (${present} of the 2 marker conversions exist). No double-seed.`); process.exit(2) }
  console.log('pre-check clear. Seeding the construction fixture...')

  initTinybirdDualWrite()
  for (const tp of V1.touchpoints) dualWriteEvent({ distinctId: V1.visitor, event: '$pageview', timestamp: tp.ts, properties: pvProps(tp) })
  dualWriteEvent({ distinctId: V1.visitor, event: '$conversion', timestamp: V1.conversionTs, properties: v1ConvProps })
  dualWriteEvent({ distinctId: V2.visitor, event: '$pageview', timestamp: V2.touchTs, properties: v2PvProps })
  dualWriteEvent({ distinctId: V2.visitor, event: '$conversion', timestamp: V2.conversionTs, properties: v2CarrierProps })

  const b = __getDualWriteBatcher(); if (b) await b.flush()
  console.log('SEEDED V1 (4-touch journey + $100 purchase) and V2 ($0 carrier). Run the nightly, then verify-attribution-fixture.mjs.')
}

main().catch((e) => { console.error(e); process.exit(1) })
