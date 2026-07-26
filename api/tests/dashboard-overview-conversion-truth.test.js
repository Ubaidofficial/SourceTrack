// /dashboard/overview conversion truth — three defects, one visible symptom.
//
// SYMPTOM (prod, site eb7f68c3 / www.techrupt.pk, 2026-07-26): the Dashboard and the
// Attribution page both showed "No conversions in this date range" while
// attributed_conversions held 5 real rows summing to $1,777.76 (which Analytics displayed
// correctly). /dashboard/overview returned 200 in ~199ms with healthy pipe data.
//
// ROOT CAUSE (1): dashboard.js's attributed_conversions .select() listed
// `attribution_status`, which DOES NOT EXIST on that table. Verified read-only on prod:
// information_schema.columns says the column lives ONLY on `subscription_identity` and
// `subscription_revenue`. PostgREST rejects the WHOLE select for one phantom column, so
// `acRows` came back undefined, the row loop ran zero times, and `sources` was []. The call
// site destructures `{ data: acRows }` with NO error binding, so the rejection was invisible.
// This is KNOWN_ISSUES #15 (#278) recurring verbatim, and #16 is why no test caught it: the
// installSupabase mocks return fixtures regardless of the select string, so only a static
// column guard can catch it. That is what the first test below is.
//
// ROOT CAUSE (2): hasConversions was `activeResults.length > 0` — the ATTRIBUTION BREAKDOWN's
// length. A site with real conversions but no attributable touches was told to go configure
// conversions. Conversion existence must derive from the conversion COUNT.
//
// ROOT CAUSE (3): the outer catch sets `analytics_unavailable: true` and zeroes every kpi,
// and NOTHING in dashboard/src read that flag (0 matches). A genuine read failure rendered
// as "no conversions" — the #413 fake-success shape on the most-seen surface in the product.
//
// Assertions strip `//` comments before matching: per #422, an assertion a comment can
// satisfy proves nothing.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
// Strip line + block comments so no assertion below can be satisfied by prose.
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Verified read-only against prod (zxjjjsipafojhzkkumvh) 2026-07-26.
// `attribution_status` is deliberately ABSENT: it exists only on subscription_identity /
// subscription_revenue. Adding it here without a migration re-breaks the whole endpoint.
const REAL_ATTRIBUTED_CONVERSIONS_COLUMNS = new Set([
  'id', 'site_id', 'distinct_id', 'anonymous_id',
  'conversion_date', 'conversion_timestamp', 'conversion_type', 'conversion_value',
  'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'first_touch_channel',
  'last_touch_source', 'last_touch_medium', 'last_touch_campaign', 'last_touch_channel',
  'channel', 'ai_influenced_source', 'status', 'touchpoint_count',
  'provider', 'stitching_method', 'original_conversion_event_id', 'external_event_id',
  'created_at', 'updated_at',
  // Verified real jsonb column: baseline_schema.sql:443 + migration 20260519000005.
  // nightly-attribution.js:1025-1041 writes refund_attribution ('unresolved'|'inherited')
  // into this column — the real unresolved-refund marker (see unresolved-refund-not-direct.test.js).
  'custom_properties'
])
const PHANTOM = 'attribution_status'

// Every .select('...') in the file that is applied to attributed_conversions.
function attributedConversionSelects (src) {
  const out = []
  const re = /\.from\('attributed_conversions'\)([\s\S]{0,400}?)\.select\('([^']+)'\)/g
  let m
  while ((m = re.exec(src)) !== null) out.push(m[2])
  return out
}

test('dashboard.js selects NO phantom column from attributed_conversions', () => {
  const src = code('api/routes/dashboard.js')
  const selects = attributedConversionSelects(src)
  assert.ok(selects.length >= 2, `expected the overview current+prior selects, found ${selects.length}`)

  for (const sel of selects) {
    const cols = sel.split(',').map(s => s.trim()).filter(Boolean)
    assert.ok(!cols.includes(PHANTOM),
      `phantom column "${PHANTOM}" in an attributed_conversions select — PostgREST rejects the ENTIRE ` +
      'query for one bad column, so every row vanishes and the UI renders "No conversions". ' +
      'It exists only on subscription_identity / subscription_revenue.')
    for (const c of cols) {
      assert.ok(REAL_ATTRIBUTED_CONVERSIONS_COLUMNS.has(c),
        `unknown column "${c}" selected from attributed_conversions — verify against prod before adding`)
    }
  }
})

test('the overview conversion read does not discard its PostgREST error', () => {
  const src = code('api/routes/dashboard.js')
  // `{ data: acRows }` with no error binding is how a rejected select became invisible.
  assert.ok(!/\{\s*data:\s*acRows\s*\}/.test(src),
    'the attributed_conversions read must bind its error (e.g. `{ data: acRows, error: acErr }`) — ' +
    'discarding it is what made a rejected select look like "no conversions"')
  assert.ok(/acRowsError|acErr|acRowsErr/.test(src),
    'the bound error must exist so a future phantom column surfaces instead of emptying the dashboard')
})

test('hasConversions derives from the conversion COUNT, not the attribution breakdown', () => {
  const src = code('dashboard/src/hooks/useDashboardData.js')
  const m = src.match(/const hasConversions\s*=\s*([^\n]+)/)
  assert.ok(m, 'hasConversions must exist in useDashboardData')
  const expr = m[1]

  assert.ok(!/^\s*activeResults\.length\s*>\s*0\s*$/.test(expr),
    'hasConversions must not be the attribution breakdown length — a site with real conversions but ' +
    'no attributable touches would be told to go configure conversions')
  assert.ok(/totalConversions|kpis\??\.?conversions/.test(expr),
    `hasConversions must read the conversion count; got: ${expr.trim()}`)
})

test('analytics_unavailable is actually READ by the frontend', () => {
  const backend = code('api/routes/dashboard.js')
  assert.ok(backend.includes('analytics_unavailable'),
    'the backend still signals analytics_unavailable on a read failure')

  // It was set at dashboard.js:479 and read NOWHERE — a genuine failure rendered as zeros.
  const hook = code('dashboard/src/hooks/useDashboardData.js')
  assert.ok(hook.includes('analytics_unavailable'),
    'useDashboardData must read analytics_unavailable so a read failure renders as unavailable, not as zero')
  assert.ok(/analyticsUnavailable/.test(hook),
    'the flag must be surfaced under a named export the pages can render')
})
