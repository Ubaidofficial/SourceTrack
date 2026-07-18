#!/usr/bin/env node
// scripts/verify-attribution-fixture.mjs — FOUNDER-RUN staging verifier for the D2 B3 construction fixture.
// After seed-attribution-fixture.mjs has seeded ST_Staging AND the nightly has run against staging, this
// reads the STORED attributed_conversions rows and diffs them against the HAND-COMPUTED literals in
// scripts/lib/attribution-fixture.mjs — NEVER against a fresh calculateAttribution() (that would be the
// tautology KNOWN_ISSUES #19 warns about). Read-only Supabase. Prints PASS/FAIL with per-field diffs.
//
//   Needs (staging env): SUPABASE_URL + SUPABASE_SERVICE_KEY pointed at ST_Staging's Supabase project.
//   Run: node scripts/verify-attribution-fixture.mjs

import { getSupabase } from '../api/lib/supabase.js'
import { FIXTURE_SITE_ID, V1, V2, V1_EXPECTED, projectSplit } from './lib/attribution-fixture.mjs'

const instantEqual = (a, b) => {
  if ((a ?? null) === null || (b ?? null) === null) return (a ?? null) === (b ?? null)
  const ta = new Date(a).getTime(); const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return (a ?? null) === (b ?? null)
  return ta === tb
}
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function main () {
  const supabase = getSupabase()
  const fails = []

  // V1 — the multi-touch journey.
  const { data: v1, error: e1 } = await supabase
    .from('attributed_conversions').select('*')
    .eq('site_id', FIXTURE_SITE_ID).eq('conversion_event_id', V1.conversionEventId).maybeSingle()
  if (e1) { console.error(`[verify] query error: ${e1.message}`); process.exit(2) }
  if (!v1) {
    console.error(`[verify] NO attributed_conversions row for V1 (${V1.conversionEventId}). Did the nightly run against staging after seeding?`)
    process.exit(2)
  }

  const scalarChecks = [
    ['conversion_value', Number(v1.conversion_value) === Number(V1_EXPECTED.conversion_value)],
    ['first_touch_source', (v1.first_touch_source ?? null) === V1_EXPECTED.first_touch_source],
    ['first_touch_channel', (v1.first_touch_channel ?? null) === V1_EXPECTED.first_touch_channel],
    ['last_touch_source', (v1.last_touch_source ?? null) === V1_EXPECTED.last_touch_source],
    ['last_touch_channel', (v1.last_touch_channel ?? null) === V1_EXPECTED.last_touch_channel],
    ['ai_influenced_source', (v1.ai_influenced_source ?? null) === V1_EXPECTED.ai_influenced_source],
    ['ai_influenced_session_at', instantEqual(v1.ai_influenced_session_at, V1_EXPECTED.ai_influenced_session_at)]
  ]
  for (const [f, ok] of scalarChecks) {
    if (!ok) fails.push(`V1.${f}: stored=${JSON.stringify(v1[f])} expected=${JSON.stringify(V1_EXPECTED[f])}`)
  }
  for (const model of ['linear_attribution', 'u_shaped_attribution', 'time_decay_attribution', 'w_shaped_attribution']) {
    const got = projectSplit(v1[model])
    if (!jsonEq(got, V1_EXPECTED[model])) {
      fails.push(`V1.${model}:\n    stored=${JSON.stringify(got)}\n    expected=${JSON.stringify(V1_EXPECTED[model])}`)
    }
  }

  // V2 — the $0 carrier must NOT contribute revenue. Either excluded (no row) or conversion_value 0.
  const { data: v2 } = await supabase
    .from('attributed_conversions').select('conversion_value')
    .eq('site_id', FIXTURE_SITE_ID).eq('conversion_event_id', V2.conversionEventId).maybeSingle()
  if (v2 && Number(v2.conversion_value) !== 0) {
    fails.push(`V2 carrier: conversion_value=${v2.conversion_value} (expected 0 — the $0 subscription carrier must never carry revenue)`)
  }
  console.log(`[verify] V2 carrier: ${v2 ? `present, conversion_value=${v2.conversion_value}` : 'excluded (no attributed_conversions row)'} — ${v2 && Number(v2.conversion_value) !== 0 ? 'FAIL' : 'ok'}`)

  if (fails.length === 0) {
    console.log('✅ PASS — stored attributed_conversions match the hand-computed construction fixture byte-for-byte (money fields + all 4 credit splits + the same-timestamp tie resolution).')
    process.exit(0)
  }
  console.error(`🔴 FAIL — ${fails.length} field(s) diverged from the hand-computed truth:`)
  for (const f of fails) console.error(`  - ${f}`)
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
