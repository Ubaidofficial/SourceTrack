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
// de200000 fixture site + the append token's decoded workspace == ST_Staging, AND a live probe holds the
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
import { assertStagingSeedTarget, assertStagingWorkspaceLive, decodeTinybirdWorkspaceId } from './lib/staging-seed-guard.mjs'
import { FIXTURE_SITE_ID, DEMO_SITE_ID, V1, V2, V3, V4, DEMO_ANCHOR_UTC, buildDemoJourneys, demoConversionEventIds, demoVolunteeredContacts } from './lib/attribution-fixture.mjs'
import { persistVolunteeredIdentity } from '../api/lib/volunteered-identity.js'

const CONFIRM = process.argv.includes('--confirm')
const TARGETING_STAGING = process.argv.includes('--i-am-targeting-staging')
// --demo seeds the SCREENSHOT dataset (docs/marketing/demo_seed_spec.md) instead of the V1–V4
// construction fixture. Same guard, same flags. Separate presence pre-check, so the two seeds are
// independently re-runnable: the V1–V4 markers being present must not block a demo seed (and vice
// versa). Without --demo this script behaves EXACTLY as before.
const DEMO = process.argv.includes('--demo')

// The site this run WRITES to. --demo goes to the clean site; V1–V4 stay on the original fixture site.
// Both start with de200000, so staging-seed-guard.mjs:52 accepts either — the guard is untouched.
const TARGET_SITE_ID = DEMO ? DEMO_SITE_ID : FIXTURE_SITE_ID

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
// V3 — single-touchpoint conversion.
const v3PvProps = {
  site_id: FIXTURE_SITE_ID, event_id: V3.touch.event_id,
  utm_source: V3.touch.utm_source, utm_medium: V3.touch.utm_medium, utm_campaign: V3.touch.utm_campaign,
  page_url: 'https://www.example.com/', server_timestamp: V3.touch.ts
}
const v3ConvProps = {
  site_id: FIXTURE_SITE_ID, event_id: V3.conversionEventId,
  conversion_value: V3.conversionValue, currency: 'USD', conversion_type: 'purchase',
  ingestion_method: 'server_routed', occurred_at: V3.conversionTs
}
// V4 — one touch, two duplicate conversions sharing external_event_id (dedup → 1 stored row).
const v4PvProps = {
  site_id: FIXTURE_SITE_ID, event_id: V4.touch.event_id,
  utm_source: V4.touch.utm_source, utm_medium: V4.touch.utm_medium, utm_campaign: V4.touch.utm_campaign,
  page_url: 'https://www.example.com/', server_timestamp: V4.touch.ts
}
const v4ConvProps = (c) => ({
  site_id: FIXTURE_SITE_ID, event_id: c.event_id, external_event_id: V4.externalEventId,
  conversion_value: V4.conversionValue, currency: 'USD', conversion_type: 'purchase',
  ingestion_method: 'server_routed', occurred_at: c.ts
})

// DEMO event property builders — same dualWriteEvent path as V1–V4, so the nightly stitches real
// touchpoints. `country`/`device_type`/`browser_name` are typed columns (tinybird/adapter/normalize.js)
// and are what the Leads table's Country column and the Browser/Device panels read.
const demoPvProps = (tp) => ({
  site_id: TARGET_SITE_ID, event_id: tp.event_id,
  utm_source: tp.utm_source, utm_medium: tp.utm_medium, utm_campaign: tp.utm_campaign,
  ai_source: tp.ai_source, referrer: tp.referrer,
  gclid: tp.gclid, fbclid: tp.fbclid, li_fat_id: tp.li_fat_id,
  country: tp.country, device_type: tp.device_type, browser_name: tp.browser_name,
  page_url: `https://www.example.com${tp.path}`, server_timestamp: tp.ts
})
// derived_source, mirroring nightly-attribution.js:799 exactly:
// utm_source || gclid || referrer hostname (www-stripped) || 'direct'. This is what makes HERO-1
// resolve to 'chatgpt.com' (no utm_source, no gclid → falls through to the referrer hostname).
const demoDerivedSource = (tp) =>
  tp.utm_source ||
  tp.gclid ||
  (tp.referrer ? (() => { try { return new URL(tp.referrer).hostname.replace('www.', '') } catch (_e) { return null } })() : null) ||
  'direct'

// A real $conversion carries BOTH the current page's utm_* (tracker.cookieless.js:115-127
// utmFields) and a first-touch block (:95-110 deriveFirstTouch). The demo conversion events
// carried neither, which bucketed every campaign to 'unknown' and — once the flexible_report
// pipes deploy — would bucket ALL demo revenue to 'direct' on the source dim
// (flexible_report_main_by_site.pipe:48 COALESCE(NULLIF(first_touch_source,''),'direct')).
//   utm_campaign        <- LAST touch  (model=last_touch, the dim the Campaigns page sends)
//   first_touch_campaign <- FIRST touch (model=first_touch)
// Both stay null when that touch carried no campaign — a direct/organic last touch genuinely has
// no campaign, and 'unknown' is the honest bucket for it. Never a filled-in default.
const demoConvProps = (j) => ({
  site_id: TARGET_SITE_ID, event_id: j.conversion.event_id,
  conversion_value: j.conversion.value, currency: 'USD', conversion_type: 'purchase',
  country: j.touchpoints[0].country,
  utm_campaign: j.touchpoints[j.touchpoints.length - 1].utm_campaign,
  first_touch_source: demoDerivedSource(j.touchpoints[0]),
  first_touch_campaign: j.touchpoints[0].utm_campaign,
  ingestion_method: 'server_routed', occurred_at: j.conversion.ts
})

// Fixture already present? (idempotent — abort rather than double-seed.)
// `markers` switches with --demo so the two seeds never block each other.
async function fixturePresent () {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_READ_TOKEN
  if (!host || !token) return null
  const markers = DEMO
    ? demoConversionEventIds()
    : [V1.conversionEventId, V2.conversionEventId, V3.conversionEventId, ...V4.conversions.map((c) => c.event_id)]
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(TARGET_SITE_ID)}' AND event_id IN (${markers.map((m) => `'${esc(m)}'`).join(',')}) FORMAT JSON`
  try {
    const res = await fetch(`${host.replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = await res.json()
    const c = body?.data?.[0]?.c
    return c == null ? null : Number(c)
  } catch { return null }
}

// DRY RUN for --demo: prints every event that would be written, plus the shape summary the spec's
// acceptance criteria are stated in. Touches nothing.
function dryRunDemo () {
  const journeys = buildDemoJourneys()
  console.log(`DRY RUN --demo (no --confirm) — nothing written. Demo window anchor = ${DEMO_ANCHOR_UTC} (day 0).`)
  console.log('Would seed into ST_Staging:')
  let pv = 0; let conv = 0
  for (const j of journeys) {
    for (const tp of j.touchpoints) { console.log(`  $pageview   ${j.visitor} @ ${tp.ts}  ${JSON.stringify(demoPvProps(tp))}`); pv++ }
    if (j.conversion) { console.log(`  $conversion ${j.visitor} @ ${j.conversion.ts}  ${JSON.stringify(demoConvProps(j))}`); conv++ }
  }

  // Shape summary — the spec's acceptance criteria, computed from the plan (not asserted by hand).
  const converting = journeys.filter((j) => j.conversion)
  const withAi = journeys.filter((j) => j.touchpoints.some((t) => t.ai_source))
  const aiSources = [...new Set(journeys.flatMap((j) => j.touchpoints.map((t) => t.ai_source).filter(Boolean)))]
  const firstPreset = (j) => j.touchpoints[0].preset
  const BUCKETS = {
    ai_chatgpt: 'AI', ai_perplexity: 'AI', ai_claude: 'AI', ai_gemini: 'AI',
    paid_search: 'Paid Search', paid_brand: 'Paid Search',
    paid_social: 'Paid Social', paid_li: 'Paid Social',
    organic: 'Organic', organic_bing: 'Organic',
    direct: 'Direct', referral: 'Referral/Email', email: 'Referral/Email'
  }
  const bucket = (p) => BUCKETS[p] || `?${p}`
  const mix = {}
  for (const j of journeys) { const b = bucket(firstPreset(j)); mix[b] = (mix[b] || 0) + 1 }
  const revenue = converting.reduce((s, j) => s + j.conversion.value, 0)
  const allTs = journeys.flatMap((j) => j.touchpoints.map((t) => t.ts)).sort()
  const hero1 = journeys.find((j) => j.visitor.endsWith('h1_hero'))

  console.log('\n── SHAPE (computed from the plan) ──')
  console.log(`  visitors=${journeys.length}  converting=${converting.length}  non-converting=${journeys.length - converting.length}`)
  console.log(`  events: ${pv} $pageview + ${conv} $conversion = ${pv + conv}`)
  console.log(`  first-touch channel mix: ${Object.entries(mix).map(([k, v]) => `${k} ${v} (${Math.round(v / journeys.length * 100)}%)`).join(' · ')}`)
  console.log(`  journeys with an AI touch: ${withAi.length}/${journeys.length} (${Math.round(withAi.length / journeys.length * 100)}%, spec floor 30%)`)
  console.log(`  distinct AI sources: ${aiSources.length} — ${aiSources.join(', ')}`)
  const depths = (arr) => `${Math.min(...arr.map((j) => j.touchpoints.length))}–${Math.max(...arr.map((j) => j.touchpoints.length))}`
  console.log(`  touchpoint depth: converting ${depths(converting)} · non-converting ${depths(journeys.filter((j) => !j.conversion))} (single-touch = bounces, all non-converting by design)`)
  console.log(`  revenue total=$${revenue}  values=${[...new Set(converting.map((j) => j.conversion.value))].sort((a, b) => a - b).join(', ')}`)
  console.log(`  window: ${allTs[0]} → ${allTs[allTs.length - 1]} (${Math.round((new Date(allTs[allTs.length - 1]) - new Date(allTs[0])) / 86400000)} days)`)
  console.log(`  HERO-1: ${hero1.visitor} — ${hero1.touchpoints.length} touches, first=${hero1.touchpoints[0].ai_source}, $${hero1.conversion.value}`)
  console.log('\nWrite with: node scripts/seed-attribution-fixture.mjs --demo --confirm --i-am-targeting-staging')
  console.log('Then run the nightly against staging so touchpoints stitch.')
}

async function main () {
  const host = process.env.TINYBIRD_HOST
  const workspaceId = decodeTinybirdWorkspaceId(process.env.TINYBIRD_APPEND_TOKEN)
  console.log(`[seed] write target — workspace=${workspaceId || '<undecodable>'}  SITE_ID=${TARGET_SITE_ID}  (--i-am-targeting-staging=${TARGETING_STAGING})`)

  if (!CONFIRM) {
    if (DEMO) return dryRunDemo()
    console.log('DRY RUN (no --confirm) — nothing written. Would seed into ST_Staging:')
    V1.touchpoints.forEach((tp) => console.log(`  V1 $pageview   ${V1.visitor} @ ${tp.ts}  ${JSON.stringify(pvProps(tp))}`))
    console.log(`  V1 $conversion ${V1.visitor} @ ${V1.conversionTs}  ${JSON.stringify(v1ConvProps)}`)
    console.log(`  V2 $pageview   ${V2.visitor} @ ${V2.touchTs}  ${JSON.stringify(v2PvProps)}`)
    console.log(`  V2 $conversion ${V2.visitor} @ ${V2.conversionTs}  ${JSON.stringify(v2CarrierProps)} (carrier $0 → excluded)`)
    console.log(`  V3 $pageview   ${V3.visitor} @ ${V3.touch.ts}  ${JSON.stringify(v3PvProps)}`)
    console.log(`  V3 $conversion ${V3.visitor} @ ${V3.conversionTs}  ${JSON.stringify(v3ConvProps)} (single-touch $${V3.conversionValue})`)
    console.log(`  V4 $pageview   ${V4.visitor} @ ${V4.touch.ts}  ${JSON.stringify(v4PvProps)}`)
    V4.conversions.forEach((c) => console.log(`  V4 $conversion ${V4.visitor} @ ${c.ts}  ${JSON.stringify(v4ConvProps(c))} (dup external_event_id → dedupe to 1)`))
    console.log('After seeding: run the nightly against staging, then node scripts/verify-attribution-fixture.mjs')
    return
  }

  // GATE 1 (pure) + GATE 2 (live): confirm the write target is the staging workspace.
  const gate = assertStagingSeedTarget({ appendToken: process.env.TINYBIRD_APPEND_TOKEN, siteId: TARGET_SITE_ID, targetingStaging: TARGETING_STAGING })
  if (!gate.ok) { console.error(gate.reason); process.exit(3) }
  // GATE 2 deliberately probes FIXTURE_SITE_ID, not TARGET_SITE_ID. Its job is to prove the WORKSPACE
  // is ST_Staging by confirming it holds the original de200000 fixture (prod holds 0) — a workspace
  // discriminator, not a write-target check. Pointed at a freshly created site it would find 0 events
  // and fail closed forever. GATE 1 above is what gates the actual write target. Do not "align" these.
  const live = await assertStagingWorkspaceLive({ host, readToken: process.env.TINYBIRD_READ_TOKEN, siteId: FIXTURE_SITE_ID })
  if (!live.ok) { console.error(live.reason); process.exit(3) }
  console.log(`[seed] staging workspace CONFIRMED — de200000 fixture holds ${live.count} events.`)

  const present = await fixturePresent()
  if (present === null) { console.error('ABORT (fail-closed): could not verify ST_Staging — refusing to seed without a clean pre-check.'); process.exit(2) }
  if (present > 0) { console.error(`ABORT: ${DEMO ? 'demo dataset' : 'fixture'} already present (${present} marker conversion(s) exist). No double-seed.`); process.exit(2) }

  if (DEMO) {
    const journeys = buildDemoJourneys()
    console.log(`pre-check clear. Seeding the DEMO dataset (${journeys.length} visitors, anchor ${DEMO_ANCHOR_UTC})...`)
    initTinybirdDualWrite()
    let pv = 0; let conv = 0
    for (const j of journeys) {
      // Touchpoints FIRST, then the conversion — replay order matters: the nightly stitches the chain
      // that precedes the conversion. Never an attributed_conversions INSERT.
      for (const tp of j.touchpoints) { dualWriteEvent({ distinctId: j.visitor, event: '$pageview', timestamp: tp.ts, properties: demoPvProps(tp) }); pv++ }
      if (j.conversion) { dualWriteEvent({ distinctId: j.visitor, event: '$conversion', timestamp: j.conversion.ts, properties: demoConvProps(j) }); conv++ }
    }
    const db = __getDualWriteBatcher(); if (db) await db.flush()

    // Volunteered identity (V1 Named Contacts) for the converters. Uses the SAME
    // persistVolunteeredIdentity() the live identify() route calls — so the seed
    // exercises the real capture code, not a hand-rolled insert. Keyed by
    // distinct_id = j.visitor, which matches attributed_conversions.distinct_id the
    // nightly builds. Non-converting demo visitors get NOTHING → they stay "—".
    // Writes to the Supabase project the current env points at (founder runs with
    // staging env, same assumption as the Tinybird target guarded above).
    const contacts = demoVolunteeredContacts()
    let identityWritten = 0
    for (const c of contacts) {
      const r = await persistVolunteeredIdentity({
        siteId: DEMO_SITE_ID, distinctId: c.visitor, email: c.email, name: c.name, source: 'identify'
      })
      if (r.written) identityWritten++
    }
    console.log(`SEEDED DEMO — ${journeys.length} visitors, ${pv} pageviews, ${conv} conversions, ${identityWritten}/${contacts.length} volunteered contacts. Run the nightly against staging so touchpoints stitch, then verify by distinct_id.`)
    return
  }

  console.log('pre-check clear. Seeding the construction fixture...')

  initTinybirdDualWrite()
  for (const tp of V1.touchpoints) dualWriteEvent({ distinctId: V1.visitor, event: '$pageview', timestamp: tp.ts, properties: pvProps(tp) })
  dualWriteEvent({ distinctId: V1.visitor, event: '$conversion', timestamp: V1.conversionTs, properties: v1ConvProps })
  dualWriteEvent({ distinctId: V2.visitor, event: '$pageview', timestamp: V2.touchTs, properties: v2PvProps })
  dualWriteEvent({ distinctId: V2.visitor, event: '$conversion', timestamp: V2.conversionTs, properties: v2CarrierProps })
  dualWriteEvent({ distinctId: V3.visitor, event: '$pageview', timestamp: V3.touch.ts, properties: v3PvProps })
  dualWriteEvent({ distinctId: V3.visitor, event: '$conversion', timestamp: V3.conversionTs, properties: v3ConvProps })
  dualWriteEvent({ distinctId: V4.visitor, event: '$pageview', timestamp: V4.touch.ts, properties: v4PvProps })
  for (const c of V4.conversions) dualWriteEvent({ distinctId: V4.visitor, event: '$conversion', timestamp: c.ts, properties: v4ConvProps(c) })

  const b = __getDualWriteBatcher(); if (b) await b.flush()
  console.log('SEEDED V1 (4-touch journey + $100), V2 ($0 carrier), V3 (single-touch $50), V4 (dup external_event_id). Run the nightly, then verify-attribution-fixture.mjs.')
}

main().catch((e) => { console.error(e); process.exit(1) })
