// Demo Ecommerce staging fixture — determinism + shape.
//
// WHY THIS EXISTS: the generated NDJSON is deliberately NOT committed (~1 MB of synthetic rows),
// so the ONLY thing standing between a reviewed fixture and a silently different one is that the
// generator is reproducible. "Deterministic" was asserted in a comment before it was ever checked;
// this checks it. A stray Date.now()/Math.random(), a reordered rnd() call, or a tweaked constant
// all change the dataset while every summary number can still look plausible — which is exactly
// the failure this repo keeps hitting in other forms.
//
// The shape assertions below are not decoration: each one pins a property that was got WRONG at
// least once while building this fixture, or that silently breaks what the fixture demonstrates.

import test from 'node:test'
import assert from 'node:assert/strict'

const { buildDemoEcomFixture, summarize, DEMO_ECOM_SITE_ID, DEFAULT_SEED, DEFAULT_END } =
  await import('../../tinybird/tools/generate_demo_ecom_fixture.mjs')

const serialize = (rows) => rows.map((r) => JSON.stringify(r)).join('\n')

// ── determinism ───────────────────────────────────────────────────────────────────────────────
test('same seed + end produces byte-identical output', () => {
  const a = serialize(buildDemoEcomFixture({ seed: DEFAULT_SEED, end: DEFAULT_END }))
  const b = serialize(buildDemoEcomFixture({ seed: DEFAULT_SEED, end: DEFAULT_END }))
  assert.equal(a, b, 'generator is not deterministic — the committed fixture cannot be reproduced')
})

test('a different seed produces different output (the seed is actually load-bearing)', () => {
  const a = serialize(buildDemoEcomFixture({ seed: 's1', end: DEFAULT_END }))
  const b = serialize(buildDemoEcomFixture({ seed: 's2', end: DEFAULT_END }))
  assert.notEqual(a, b, 'seed has no effect — determinism would be vacuous')
})

test('the generator reads no wall clock — repeated builds cannot drift', () => {
  // Date.now() and Math.random() are the two ways this silently becomes irreproducible. If either
  // creeps into the data path, these two builds diverge.
  const a = summarize(buildDemoEcomFixture({}))
  const b = summarize(buildDemoEcomFixture({}))
  assert.deepEqual(a, b)
})

// ── the reviewed dataset, pinned ───────────────────────────────────────────────────────────────
// These are the exact numbers reported and approved for the staging write. If a future edit
// changes them, that is a NEW dataset and needs re-review, not a silent substitution.
test('default seed reproduces the reviewed dataset exactly', () => {
  const s = summarize(buildDemoEcomFixture({}))
  assert.equal(s.rows, 1639)
  assert.equal(s.conversions, 23)
  assert.equal(s.pageviews, 1616)
  assert.equal(s.visitors, 803)
  assert.equal(s.revenue, 2376.45)
  assert.equal(s.firstDay, '2026-07-06')
  assert.equal(s.lastDay, '2026-08-04')
  assert.equal(s.activeDays, 28)
})

// ── shape properties that would break what the fixture demonstrates ────────────────────────────
test('nothing is dated after the reference date, and the window is 30 days not 31', () => {
  // This was a REAL defect on the first build: late sessions tipped past midnight, so the file ran
  // to END+1 with rows dated in the future. The dashboard's traffic/cost gates read a 30-day
  // window, so an overflowing fixture quietly demonstrates something other than what was reviewed.
  const rows = buildDemoEcomFixture({})
  for (const r of rows) {
    assert.ok(r.timestamp <= DEFAULT_END + ' 23:59:59.999', `row dated after ${DEFAULT_END}: ${r.timestamp}`)
  }
  const days = new Set(rows.map((r) => r.timestamp.slice(0, 10)))
  assert.equal(days.size, 28, '30-day window minus the 2 deliberate zero-traffic days')
})

test('every row targets the allowlisted staging site — and site_key never appears', () => {
  const rows = buildDemoEcomFixture({})
  for (const r of rows) assert.equal(r.site_id, DEMO_ECOM_SITE_ID)
  // Tinybird's events datasource drops site_key by design (§6.5 — customer-facing secret). A row
  // carrying one would both be wrong and put a secret in a file.
  assert.equal(rows.some((r) => 'site_key' in r), false, 'site_key must never appear in fixture rows')
})

test('every conversion has backing pageviews from the same visitor, earlier in time', () => {
  const rows = buildDemoEcomFixture({})
  const pvByVisitor = new Map()
  for (const r of rows) {
    if (r.event_type === '$pageview') {
      if (!pvByVisitor.has(r.visitor_id)) pvByVisitor.set(r.visitor_id, [])
      pvByVisitor.get(r.visitor_id).push(r)
    }
  }
  for (const c of rows.filter((r) => r.event_type === '$conversion')) {
    const pvs = pvByVisitor.get(c.visitor_id) || []
    assert.ok(pvs.length > 0, `conversion ${c.event_id} has no backing pageview`)
    assert.ok(pvs.some((p) => p.timestamp < c.timestamp), 'conversion must follow a pageview in time')
    // Attribution fields must match the session that earned it, or the fixture would demonstrate
    // attribution that its own traffic does not support.
    const first = pvs[0]
    assert.equal(c.utm_source, first.utm_source)
    assert.equal(c.ai_source, first.ai_source)
    assert.equal(c.referrer, first.referrer)
  }
})

test('AI referrals use canonical ai_source values and carry real weight', () => {
  const rows = buildDemoEcomFixture({})
  const convs = rows.filter((r) => r.event_type === '$conversion')
  const ai = convs.filter((c) => c.ai_source)
  // Canonical display names only — channel-classifier.js REJECT-UNKNOWNs anything else, so a
  // lowercase 'chatgpt' here would read as unattributed rather than as an AI referral.
  for (const c of ai) assert.ok(['ChatGPT', 'Perplexity'].includes(c.ai_source), `non-canonical ai_source: ${c.ai_source}`)
  assert.equal(ai.length, 7)
  assert.ok(ai.length / convs.length > 0.25, 'AI is the differentiator — it must not be a rounding error')
})

test('order values stay inside $25-$250 and are not uniformly spread', () => {
  const vals = buildDemoEcomFixture({}).filter((r) => r.event_type === '$conversion').map((c) => c.conversion_value)
  for (const v of vals) assert.ok(v >= 25 && v <= 250, `order value out of range: ${v}`)
  // Right-skewed by design: more orders below the midpoint than above. A uniform sweep of the
  // range is the tell-tale of generated data.
  const mid = 137.5
  assert.ok(vals.filter((v) => v < mid).length > vals.filter((v) => v >= mid).length)
  assert.ok(new Set(vals).size >= vals.length - 1, 'order values should be near-unique, not repeated')
})

test('conversions carry the ecommerce purchase type and a currency', () => {
  for (const c of buildDemoEcomFixture({}).filter((r) => r.event_type === '$conversion')) {
    assert.equal(c.conversion_type, 'purchase')
    assert.equal(c.currency, 'USD')
    assert.ok(c.order_id.startsWith('SO-'))
  }
})

test('no cost/campaign data rides along — that was a deliberate exclusion', () => {
  // Report Builder's cost gate is not reachable via any UI path today, so cost rows would sit
  // unused. If this ever starts failing, someone widened the fixture beyond what was reviewed.
  const rows = buildDemoEcomFixture({})
  for (const key of ['spend', 'campaign_cost', 'cost', 'impressions', 'clicks']) {
    assert.equal(rows.some((r) => key in r), false, `fixture must not carry ${key}`)
  }
})

test('--no-nonconverting yields conversions plus their pageviews only', () => {
  const rows = buildDemoEcomFixture({ withNonConverting: false })
  const s = summarize(rows)
  assert.equal(s.conversions, 23)
  assert.equal(s.visitors, 23, 'every visitor converts in this mode')
  assert.ok(s.rows < 200, 'should be far smaller than the full fixture')
})
