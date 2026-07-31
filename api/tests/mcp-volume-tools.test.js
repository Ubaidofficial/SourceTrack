// MCP volume tools (get_leads_volume, get_campaign_volume) — volume-only enforcement.
//
// These tools were approved on exactly one condition: they report COUNTS and nothing
// else. No revenue, no cost-derived metric, no attribution-model parameter, no causal
// claim. That condition is not self-enforcing, because one of the reads they wrap
// (`first_touch_by_site`) genuinely returns a `revenue` column — so "we just don't
// select it" is a convention, and a convention is what these tests replace with a
// mechanism.
//
// NON-VACUITY, measured rather than assumed. A test asserting "no revenue in the output"
// passes trivially if the fixture never had revenue, so every fixture below deliberately
// CARRIES revenue in the shape the real pipe returns it.
//
// That still leaves an honest caveat, verified by actually trying it: removing the
// volumeOnly() guard from the routes does NOT fail the route tests, because the handlers
// project named fields and revenue never enters the payload in the first place. The
// route tests therefore prove the OUTPUT is clean; they do not prove the guard works.
// What proves the guard works is the pair of 'guard:' tests below, which feed it the
// actual regression it exists to catch — a handler spreading a raw pipe row.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
// Literal all-zeros, matching mcp-diagnostics-scope.test.js: that exact form is on the
// secret scanner's mock-key allowlist, whereas a computed '0'.repeat(64) is not.
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_READ_ENABLED = 'true'

import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:net'
import { createHash } from 'crypto'
import { stripFinancialFields, findFinancialFields, volumeOnly, FORBIDDEN_FIELDS } from '../lib/volume-only-guard.js'

// ── fixtures shaped like the REAL pipe responses, revenue included ───────────────────
// first_touch_by_site really does select `SUM(...) AS revenue` next to its conversion
// count. If this fixture ever loses that field, these tests stop proving anything.
const FIRST_TOUCH_ROWS = [
  { source: 'google', medium: 'organic', campaign: 'spring', conversions: 12, revenue: 4200.5 },
  { source: 'google', medium: 'cpc', campaign: '', conversions: 5, revenue: 1900 },
  { source: 'direct', medium: 'none', campaign: '', conversions: 8, revenue: 0 }
]
const LEADS_COUNT_ROWS = [{ leads_count: 19 }]
const CAMPAIGN_SESSION_ROWS = [
  { dim_value: 'spring', metric_value: 300 },
  { dim_value: null, metric_value: 900 }   // untagged — must survive as its own bucket
]
const CAMPAIGN_LEAD_ROWS = [
  { dim_value: 'spring', metric_value: 12 },
  { dim_value: null, metric_value: 7 }
]

test('fixtures are non-vacuous: the wrapped pipe shape really does carry revenue', () => {
  assert.ok(
    FIRST_TOUCH_ROWS.some(r => 'revenue' in r),
    'first_touch_by_site fixture must contain revenue, or every strip assertion below is vacuous'
  )
})

// ── the guard itself ─────────────────────────────────────────────────────────────────

test('stripFinancialFields removes every forbidden field, at any depth', () => {
  const dirty = {
    has_data: true,
    revenue: 100,
    breakdown: { rows: [{ dimension_value: 'google', conversions: 3, revenue: 50, roas: 2.1 }] },
    nested: { deep: { conversion_value: 9, cost: 4, attribution_model: 'last_touch' } }
  }
  const clean = stripFinancialFields(dirty)
  assert.deepEqual(findFinancialFields(clean), [], 'no forbidden field may survive')
  // …and the legitimate counts are untouched.
  assert.equal(clean.has_data, true)
  assert.equal(clean.breakdown.rows[0].conversions, 3)
  assert.equal(clean.breakdown.rows[0].dimension_value, 'google')
})

test('stripFinancialFields does not mutate its input', () => {
  const input = { revenue: 5, conversions: 1 }
  stripFinancialFields(input)
  assert.equal(input.revenue, 5, 'caller may still hold the raw pipe row')
})

test('findFinancialFields reports paths and is itself non-vacuous', () => {
  const hits = findFinancialFields({ a: { b: [{ revenue: 1 }] } })
  assert.deepEqual(hits, ['a.b[0].revenue'])
  assert.deepEqual(findFinancialFields({ conversions: 3, value_count: 2 }), [], 'no false positives')
})

test('the forbidden list covers revenue, every cost-derived metric, and the model knob', () => {
  for (const f of ['revenue', 'conversion_value', 'cost', 'spend', 'roas', 'cac', 'cpl', 'net_profit', 'attribution_model']) {
    assert.ok(FORBIDDEN_FIELDS.includes(f), `${f} must be forbidden`)
  }
})

// ── the guard fires on the REGRESSION IT EXISTS FOR ──────────────────────────────────
// Measured fact, stated plainly: removing the guard from the routes does NOT fail the
// route tests below, because the handlers project named fields and revenue never enters
// the payload. So the guard is a regression DETECTOR, not a filter doing daily work, and
// the honest way to test it is against the regression itself — a handler that stopped
// projecting and started spreading a raw pipe row. These two tests are the non-vacuous
// ones for the guard; comment out volumeOnly's body and they fail.

test('guard: a handler that SPREADS a raw first_touch_by_site row is caught and cleaned', () => {
  const errors = []
  const realError = console.error
  console.error = (...a) => errors.push(a.join(' '))
  try {
    // Exactly the careless edit this guards: `...row` instead of naming the fields.
    const regressed = volumeOnly({ has_data: true, rows: [{ ...FIRST_TOUCH_ROWS[0] }] }, 'leads-volume')
    assert.deepEqual(findFinancialFields(regressed), [], 'revenue must not reach the caller')
    assert.equal(regressed.rows[0].conversions, 12, 'the legitimate count survives')
    assert.equal(regressed.rows[0].source, 'google')
  } finally {
    console.error = realError
  }
  assert.equal(errors.length, 1, 'a leak must be logged, not silently cleaned')
  assert.match(errors[0], /BUG/, 'the log must name it as a bug, so the regression is visible')
  assert.match(errors[0], /revenue/, 'the log must name the offending field')
  assert.match(errors[0], /leads-volume/, 'the log must name the handler')
})

test('guard: a clean payload passes through untouched and logs nothing', () => {
  const errors = []
  const realError = console.error
  console.error = (...a) => errors.push(a.join(' '))
  const clean = { has_data: true, distinct_leads: 3, breakdown: { rows: [{ dimension_value: 'x', conversions: 1 }] } }
  let out
  try { out = volumeOnly(clean, 'leads-volume') } finally { console.error = realError }
  assert.equal(out, clean, 'a clean payload is returned as-is, not rebuilt')
  assert.equal(errors.length, 0, 'no noise on the normal path')
})

// ── the routes, end to end, with the read store stubbed ──────────────────────────────

const RAW_KEY = 'st_live_' + 'b'.repeat(64)
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')
const SITE = { id: 'site-vol-1', plan: 'growth', domain: 'example.com', name: 'Example' }

const { getSupabase } = await import('../lib/supabase.js')
const _client = getSupabase()
_client.from = (table) => {
  const chain = {
    select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
    range: async () => ({ data: [], error: null }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
    maybeSingle: async () => {
      // read:volume, NOT read:diagnostics: these two routes moved to the narrower scope
      // when read:analytics was split (docs/mcp_tool_policy.md §5). The cross-scope 403s
      // are asserted in api/tests/mcp-diagnostics-scope.test.js §2b; here the fixture just
      // has to hold the scope these routes actually require, or every assertion below
      // measures a 403 body instead of a payload.
      if (table === 'api_keys') return { data: { id: 'k1', site_id: SITE.id, scopes: ['read:volume'] }, error: null }
      if (table === 'sites') return { data: SITE, error: null }
      return { data: null, error: null }
    }
  }
  return chain
}

const { default: diagnosticsRouter } = await import('../routes/diagnostics.js')

function freePort () {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)) })
  })
}

// The read store is stubbed at the HTTP boundary, NOT by reassigning the module export —
// an ESM namespace is immutable, and more importantly this way the routes exercise the
// REAL queryTinybirdPipe: its allowlist, its {data:[...]} parsing, and its null contract.
// A 400 is the cheap way to get a genuine null (non-429 4xx is deterministic, so the
// reader returns null immediately instead of burning its three retries).
let pipeResponses = {}
const tbStub = express()
tbStub.get('/v0/pipes/:pipe.json', (req, res) => {
  const pipe = req.params.pipe
  const rows = pipe in pipeResponses ? pipeResponses[pipe] : []
  if (rows === null) return res.status(400).json({ error: 'stubbed read failure' })
  return res.json({ data: rows })
})
const tbPort = await freePort()
const tbServer = tbStub.listen(tbPort, '127.0.0.1')
await new Promise(r => tbServer.once('listening', r))
process.env.TINYBIRD_HOST = `http://127.0.0.1:${tbPort}`
process.env.TINYBIRD_READ_TOKEN = 'stub-token-not-a-credential'
test.after(() => new Promise(r => tbServer.close(r)))

async function callRoute (path) {
  const app = express()
  app.use('/api/diagnostics', diagnosticsRouter)
  const port = await freePort()
  const server = app.listen(port, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/diagnostics${path}`, {
      headers: { Authorization: `Bearer ${RAW_KEY}` }
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  } finally {
    await new Promise(r => server.close(r))
  }
}

function withPipes (map, fn) {
  pipeResponses = map
  return fn().finally(() => { pipeResponses = {} })
}

// ── leads-volume ─────────────────────────────────────────────────────────────────────

test('leads-volume: returns counts and NO revenue, from a fixture that has revenue', async () => {
  await withPipes({ leads_count: LEADS_COUNT_ROWS, first_touch_by_site: FIRST_TOUCH_ROWS }, async () => {
    const { status, body } = await callRoute('/leads-volume?days=30&dimension=source')
    assert.equal(status, 200)
    const leaked = findFinancialFields(body)
    assert.deepEqual(leaked, [], `forbidden fields leaked into the response: ${leaked.join(', ')}`)
    assert.ok(!JSON.stringify(body).includes('4200.5'), 'a revenue VALUE must not survive under any key name')

    const d = body.data
    assert.equal(d.has_data, true)
    assert.equal(d.distinct_leads, 19)
    assert.equal(d.breakdown.dimension, 'source')
    // google 12 + 5, direct 8
    const google = d.breakdown.rows.find(r => r.dimension_value === 'google')
    assert.equal(google.conversions, 17, 'rows aggregate across the pipe grouping')
    assert.equal(d.breakdown.total, 25)
    assert.equal(d.breakdown.rows.reduce((s, r) => s + r.conversions, 0), d.breakdown.total,
      'rows must sum to the stated total — a partition that does not add up implies a missing bucket')
  })
})

test('leads-volume: every row is labelled with the fixed touch convention', async () => {
  await withPipes({ leads_count: LEADS_COUNT_ROWS, first_touch_by_site: FIRST_TOUCH_ROWS }, async () => {
    const { body } = await callRoute('/leads-volume')
    assert.equal(body.data.touch, 'first')
    for (const r of body.data.breakdown.rows) {
      assert.equal(r.touch, 'first', 'the touch convention must be stated on every row, not just the envelope')
    }
  })
})

test('leads-volume: an empty campaign becomes an explicit (untagged) bucket, never a dropped row', async () => {
  await withPipes({ leads_count: LEADS_COUNT_ROWS, first_touch_by_site: FIRST_TOUCH_ROWS }, async () => {
    const { body } = await callRoute('/leads-volume?dimension=campaign')
    const untagged = body.data.breakdown.rows.find(r => r.dimension_value === '(untagged)')
    assert.ok(untagged, 'untagged traffic must be a named bucket')
    assert.equal(untagged.conversions, 13, '5 + 8 untagged conversions')
    assert.equal(body.data.breakdown.total, 25, 'the total still covers every conversion')
  })
})

test('leads-volume: an attribution_model query param is ignored, not honoured', async () => {
  await withPipes({ leads_count: LEADS_COUNT_ROWS, first_touch_by_site: FIRST_TOUCH_ROWS }, async () => {
    const { body } = await callRoute('/leads-volume?attribution_model=last_touch&dimension=source')
    assert.equal(body.data.touch, 'first', 'the convention is fixed server-side and not caller-selectable')
    assert.deepEqual(findFinancialFields(body), [])
  })
})

test('leads-volume: an unknown dimension falls back to source rather than erroring or leaking', async () => {
  await withPipes({ leads_count: LEADS_COUNT_ROWS, first_touch_by_site: FIRST_TOUCH_ROWS }, async () => {
    const { body } = await callRoute('/leads-volume?dimension=revenue')
    assert.equal(body.data.breakdown.dimension, 'source')
  })
})

// ── campaign-volume ──────────────────────────────────────────────────────────────────

test('campaign-volume: visitors + leads per campaign, no revenue column anywhere', async () => {
  await withPipes({
    flexible_report_campaign_sessions_by_site: CAMPAIGN_SESSION_ROWS,
    flexible_report_campaign_leads_by_site: CAMPAIGN_LEAD_ROWS
  }, async () => {
    const { status, body } = await callRoute('/campaign-volume?days=14')
    assert.equal(status, 200)
    assert.deepEqual(findFinancialFields(body), [])

    const spring = body.data.campaigns.find(c => c.campaign === 'spring')
    assert.equal(spring.visitors, 300)
    assert.equal(spring.leads, 12)
    assert.equal(spring.touch, 'first')
    assert.ok(!('revenue' in spring) && !('roas' in spring) && !('cost' in spring))
  })
})

test('campaign-volume: a NULL campaign is reported as (untagged), never filtered out', async () => {
  await withPipes({
    flexible_report_campaign_sessions_by_site: CAMPAIGN_SESSION_ROWS,
    flexible_report_campaign_leads_by_site: CAMPAIGN_LEAD_ROWS
  }, async () => {
    const { body } = await callRoute('/campaign-volume')
    const untagged = body.data.campaigns.find(c => c.campaign === '(untagged)')
    assert.ok(untagged, 'the untagged bucket is usually the biggest — dropping it inflates every named campaign')
    assert.equal(untagged.visitors, 900)
    assert.equal(untagged.leads, 7)
    assert.equal(body.data.totals.visitors, 1200, 'totals include the untagged bucket')
    assert.equal(body.data.totals.leads, 19)
  })
})

// ── fail closed ──────────────────────────────────────────────────────────────────────

test('both volume tools fail CLOSED on a null read — never "no leads"', async () => {
  for (const [path, pipes] of [
    ['/leads-volume', { leads_count: null, first_touch_by_site: FIRST_TOUCH_ROWS }],
    ['/leads-volume', { leads_count: LEADS_COUNT_ROWS, first_touch_by_site: null }],
    ['/campaign-volume', { flexible_report_campaign_sessions_by_site: null, flexible_report_campaign_leads_by_site: CAMPAIGN_LEAD_ROWS }],
    ['/campaign-volume', { flexible_report_campaign_sessions_by_site: CAMPAIGN_SESSION_ROWS, flexible_report_campaign_leads_by_site: null }]
  ]) {
    await withPipes(pipes, async () => {
      const { status, body } = await callRoute(path)
      assert.equal(status, 503, `${path} must 503 on a null read, not report zero`)
      assert.equal(body.success, false)
      assert.match(body.error, /read store/i, 'the reason must name the read store as the failure')
      assert.match(body.error, /says nothing about your actual volumes/i,
        'must state that this is a SourceTrack-side failure, not a customer-data fact')
      assert.ok(!/\b0\b/.test(JSON.stringify(body.data)), 'must not emit a zero-shaped payload')
    })
  }
})

test('a served-empty read is has_data:false with a reason — distinct from the 503', async () => {
  await withPipes({ leads_count: [], first_touch_by_site: [] }, async () => {
    const { status, body } = await callRoute('/leads-volume')
    assert.equal(status, 200, 'an empty answer is a real answer, not an error')
    assert.equal(body.data.has_data, false)
    assert.ok(body.data.reason, 'must say why there is no data')
    assert.equal(body.data.distinct_leads, undefined, 'no fake zero stands in for "no data"')
  })
})
