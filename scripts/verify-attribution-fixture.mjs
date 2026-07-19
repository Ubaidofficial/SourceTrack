#!/usr/bin/env node
// scripts/verify-attribution-fixture.mjs — FOUNDER-RUN staging verifier for the D2 B3 construction fixture.
// After seed-attribution-fixture.mjs has seeded ST_Staging AND the nightly has run against staging, this
// reads the STORED attributed_conversions rows and diffs them against the HAND-COMPUTED literals in
// scripts/lib/attribution-fixture.mjs — NEVER against a fresh calculateAttribution() (that would be the
// tautology KNOWN_ISSUES #19 warns about). Read-only Supabase. Prints PASS/FAIL with per-field diffs.
//
// Coverage: V1 multi-touch journey (4 models + AI + same-timestamp tie); V2 $0 carrier (must be ABSENT);
// V3 single-touch (all models degrade to 100%); V4 duplicate external_event_id (must dedupe to ONE row).
//
//   Needs (staging env): SUPABASE_URL + SUPABASE_SERVICE_KEY pointed at ST_Staging's Supabase project.
//   Run: node scripts/verify-attribution-fixture.mjs

import { getSupabase } from '../api/lib/supabase.js'
import { FIXTURE_SITE_ID, V1, V2, V3, V4, V1_EXPECTED, V3_EXPECTED, projectSplit } from './lib/attribution-fixture.mjs'

const instantEqual = (a, b) => {
  if ((a ?? null) === null || (b ?? null) === null) return (a ?? null) === (b ?? null)
  const ta = new Date(a).getTime(); const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return (a ?? null) === (b ?? null)
  return ta === tb
}
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Diff a stored attributed_conversions row against hand-computed expected literals. Pushes failures.
function checkRow (label, row, expected, fails) {
  if (!row) { fails.push(`${label}: NO attributed_conversions row — did the nightly run against staging after seeding?`); return }
  const scalars = [
    ['conversion_value', Number(row.conversion_value) === Number(expected.conversion_value)],
    ['first_touch_source', (row.first_touch_source ?? null) === expected.first_touch_source],
    ['first_touch_channel', (row.first_touch_channel ?? null) === expected.first_touch_channel],
    ['last_touch_source', (row.last_touch_source ?? null) === expected.last_touch_source],
    ['last_touch_channel', (row.last_touch_channel ?? null) === expected.last_touch_channel],
    ['ai_influenced_source', (row.ai_influenced_source ?? null) === expected.ai_influenced_source],
    ['ai_influenced_session_at', instantEqual(row.ai_influenced_session_at, expected.ai_influenced_session_at)]
  ]
  for (const [f, ok] of scalars) if (!ok) fails.push(`${label}.${f}: stored=${JSON.stringify(row[f])} expected=${JSON.stringify(expected[f])}`)
  for (const model of ['linear_attribution', 'u_shaped_attribution', 'time_decay_attribution', 'w_shaped_attribution']) {
    const got = projectSplit(row[model])
    if (!jsonEq(got, expected[model])) fails.push(`${label}.${model}:\n    stored=${JSON.stringify(got)}\n    expected=${JSON.stringify(expected[model])}`)
  }
}

async function main () {
  const supabase = getSupabase()
  const fails = []
  const sel = () => supabase.from('attributed_conversions').select('*').eq('site_id', FIXTURE_SITE_ID)

  // V1 — multi-touch journey; V3 — single-touch.
  const { data: v1, error: e1 } = await sel().eq('conversion_event_id', V1.conversionEventId).maybeSingle()
  if (e1) { console.error(`[verify] query error: ${e1.message}`); process.exit(2) }
  // POSITIVE PRECONDITION — the V1 anchor MUST exist. Without it the fixture was never seeded + attributed,
  // and the absence-based checks below (V2 carrier "no row", V4 "exactly 1 row") would pass VACUOUSLY on an
  // empty fixture, reporting false "ok"s (observed once when the seeder had refused). Fail fast so absence
  // can never be mistaken for success.
  if (!v1) {
    console.error('[verify] PRECONDITION FAILED: the V1 anchor conversion has NO attributed_conversions row — the fixture was not seeded + attributed on staging (did the seeder refuse, or the nightly not run?). Absence-based checks are meaningless on an empty fixture; refusing to report a pass.')
    process.exit(2)
  }
  checkRow('V1', v1, V1_EXPECTED, fails)

  const { data: v3 } = await sel().eq('conversion_event_id', V3.conversionEventId).maybeSingle()
  checkRow('V3', v3, V3_EXPECTED, fails)

  // V2 — the $0 carrier must be ABSENT (never written), not merely $0.
  const { count: v2count } = await supabase.from('attributed_conversions')
    .select('*', { count: 'exact', head: true }).eq('site_id', FIXTURE_SITE_ID).eq('conversion_event_id', V2.conversionEventId)
  if ((v2count || 0) !== 0) fails.push(`V2 carrier: ${v2count} attributed_conversions row(s) exist — the $0 subscription carrier must be ABSENT (never written)`)
  console.log(`[verify] V2 carrier rows=${v2count || 0} — ${(v2count || 0) === 0 ? 'ok (absent)' : 'FAIL'}`)

  // V4 — the duplicate external_event_id must collapse to exactly ONE stored row.
  const { count: v4count } = await supabase.from('attributed_conversions')
    .select('*', { count: 'exact', head: true }).eq('site_id', FIXTURE_SITE_ID).eq('external_event_id', V4.externalEventId)
  if ((v4count || 0) !== 1) fails.push(`V4 dedup: ${v4count} rows for external_event_id=${V4.externalEventId} (expected exactly 1 — the duplicate must dedupe)`)
  console.log(`[verify] V4 dedup rows=${v4count} — ${(v4count || 0) === 1 ? 'ok (deduped to 1)' : 'FAIL'}`)

  if (fails.length === 0) {
    console.log('✅ PASS — stored attributed_conversions match the hand-computed construction fixture (money fields + all 4 credit splits + tie + single-touch degradation; carrier excluded; duplicate deduped).')
    process.exit(0)
  }
  console.error(`🔴 FAIL — ${fails.length} check(s) diverged from the hand-computed truth:`)
  for (const f of fails) console.error(`  - ${f}`)
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
