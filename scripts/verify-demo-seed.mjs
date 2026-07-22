#!/usr/bin/env node
// scripts/verify-demo-seed.mjs — FOUNDER-RUN staging verifier for the DEMO screenshot dataset.
// Run AFTER `seed-attribution-fixture.mjs --demo --confirm --i-am-targeting-staging` AND after the
// nightly has run against staging (the nightly is what stitches touchpoints — without it every row
// looks defective).
//
// WHY THIS EXISTS SEPARATELY from verify-attribution-fixture.mjs: that verifier proves the V1–V4
// construction fixture against HAND-COMPUTED values. This one proves the DEMO dataset is
// SCREENSHOT-READY — a different question, and it is the exact defect check from the 2026-07-22
// finding: prod holds attributed_conversions rows with 0 touchpoints and NULL first_touch_source
// (orphan end-states with no journey). A demo tenant with that shape renders an EMPTY Lead Journey
// panel and defeats every screenshot.
//
// SCOPED BY conversion_event_id, NEVER by a bare site-wide select — V1–V4 live on the same staging
// site, and a site-wide count would silently fold them in and report a wrong total.
// Reports PER-distinct_id, never a bare count()/max(timestamp): a healthy aggregate can hide the fact
// that every underlying row is defective.
//
//   Needs (staging env): SUPABASE_URL + SUPABASE_SERVICE_KEY pointed at ST_Staging's Supabase project.
//   Run: node scripts/verify-demo-seed.mjs

import { getSupabase } from '../api/lib/supabase.js'
import { DEMO_SITE_ID, DEMO_VISITOR_PREFIX, buildDemoJourneys, demoConversionEventIds } from './lib/attribution-fixture.mjs'

const HERO1_VISITOR = `${DEMO_VISITOR_PREFIX}h1_hero`
const AI_SOURCES_EXPECTED = 4

async function main () {
  const supabase = getSupabase()
  const fails = []
  const planned = buildDemoJourneys()
  const markers = demoConversionEventIds()

  const { data: rows, error } = await supabase
    .from('attributed_conversions')
    .select('distinct_id, conversion_event_id, conversion_value, conversion_timestamp, touchpoint_count, first_touch_source, first_touch_channel, last_touch_channel, ai_influenced_source')
    .eq('site_id', DEMO_SITE_ID)
    .in('conversion_event_id', markers)
    .order('conversion_timestamp', { ascending: true })
  if (error) { console.error(`[verify-demo] query error: ${error.message}`); process.exit(2) }

  // PRECONDITION — absence must never read as success (the same vacuous-pass trap
  // verify-attribution-fixture.mjs guards against).
  if (!rows || rows.length === 0) {
    console.error(`[verify-demo] PRECONDITION FAILED: 0 attributed_conversions rows for the ${markers.length} demo markers. The demo set was not seeded, or the nightly has not run against staging. Refusing to report a pass on an empty dataset.`)
    process.exit(2)
  }

  // ── 1. Row count in range, and NO row carries the defective orphan shape.
  if (rows.length < 25 || rows.length > 35) fails.push(`row count ${rows.length} outside the spec range 25–35`)
  const defective = rows.filter((r) => !(Number(r.touchpoint_count) > 0) || (r.first_touch_source ?? null) === null)
  if (defective.length) {
    fails.push(`${defective.length} row(s) have the DEFECTIVE orphan shape (0 touchpoints or NULL first_touch_source):`)
    for (const r of defective) fails.push(`    ${r.distinct_id}  touchpoints=${r.touchpoint_count}  first_touch_source=${JSON.stringify(r.first_touch_source)}`)
  }

  // ── 2. HERO-1 — the money shot.
  const hero = rows.find((r) => r.distinct_id === HERO1_VISITOR)
  if (!hero) {
    fails.push(`HERO-1 (${HERO1_VISITOR}) has NO attributed_conversions row`)
  } else {
    if (!(Number(hero.touchpoint_count) >= 3)) fails.push(`HERO-1 touchpoint_count=${hero.touchpoint_count} (expected >= 3)`)
    if (hero.first_touch_source !== 'chatgpt.com') fails.push(`HERO-1 first_touch_source=${JSON.stringify(hero.first_touch_source)} (expected "chatgpt.com")`)
    if (Number(hero.conversion_value) !== 2000) fails.push(`HERO-1 conversion_value=${hero.conversion_value} (expected 2000)`)
  }

  // ── 3. AI-source variety (the AI Sources panel must render populated, not a single bar).
  const aiSources = [...new Set(rows.map((r) => r.ai_influenced_source).filter(Boolean))]
  const aiChannelRows = rows.filter((r) => r.first_touch_channel === 'AI Search')
  if (aiChannelRows.length === 0) fails.push('no conversion has first_touch_channel="AI Search" — the AI Sources panel will be empty')

  // ── 4. Time-series span.
  const ts = rows.map((r) => new Date(r.conversion_timestamp).getTime()).sort((a, b) => a - b)
  const spanDays = Math.round((ts[ts.length - 1] - ts[0]) / 86400000)
  if (spanDays < 20) fails.push(`conversion time-series spans only ${spanDays} days (expected ~30 — a single spike screenshots badly)`)

  // ── PER-ROW EVIDENCE (identifying rows, not aggregates).
  console.log(`\n── DEMO ROWS (${rows.length}), by distinct_id ──`)
  console.log('distinct_id                      tp  first_touch_source    first_touch_channel   ai_influenced      value  conversion_timestamp')
  for (const r of rows) {
    console.log(
      `${String(r.distinct_id).padEnd(32)} ${String(r.touchpoint_count).padStart(2)}  ` +
      `${String(r.first_touch_source ?? 'NULL').padEnd(21)} ${String(r.first_touch_channel ?? 'NULL').padEnd(21)} ` +
      `${String(r.ai_influenced_source ?? '-').padEnd(18)} ${String(r.conversion_value).padStart(6)}  ${r.conversion_timestamp}`
    )
  }

  const plannedConverting = planned.filter((j) => j.conversion).length
  console.log(`\n── SUMMARY ──`)
  console.log(`  planned converting journeys: ${plannedConverting}   stored rows: ${rows.length}   missing: ${plannedConverting - rows.length}`)
  console.log(`  rows with >0 touchpoints AND non-NULL first_touch_source: ${rows.length - defective.length}/${rows.length}`)
  console.log(`  distinct ai_influenced_source: ${aiSources.length} — ${aiSources.join(', ') || '(none)'}`)
  console.log(`  first_touch_channel="AI Search" rows: ${aiChannelRows.length}`)
  console.log(`  conversion time-series span: ${spanDays} days`)
  console.log(`  revenue total: $${rows.reduce((s, r) => s + Number(r.conversion_value || 0), 0)}`)
  console.log(`  NOTE: ai_influenced_source is only set when the LAST touch is Direct (dark-traffic stitching).`)
  console.log(`        AI-source VARIETY for the AI Sources panel reads from events, not this column — expect < ${AI_SOURCES_EXPECTED} here.`)

  if (fails.length === 0) {
    console.log('\n✅ PASS — demo dataset is screenshot-ready: every row has a stitched journey, HERO-1 is intact, and the series has shape.')
    process.exit(0)
  }
  console.error(`\n🔴 FAIL — ${fails.length} check(s):`)
  for (const f of fails) console.error(`  - ${f}`)
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
