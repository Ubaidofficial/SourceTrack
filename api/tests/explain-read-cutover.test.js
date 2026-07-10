// W1-bc2 read-cutover — getAttributionExplanation dispatch parity. The CONVERSION read is
// wired pipe-first (attribution_explain_conversion); the journey read stays HogQL. Returns
// a SINGLE object (or null). Proves the pipe named-row remap == the HogQL positional shape,
// and that null (no conversion) short-circuits identically on both legs.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getAttributionExplanation, __setAttributionReadDeps, __resetAttributionReadDeps } = await import('../lib/attribution-engine.js')

const SITE = 'site-explain'
const DID = 'v1'
const MODEL = 'last_touch'

// Conversion pipe named row == attribution_explain_conversion.pipe SELECT aliases.
const conv = {
  timestamp: '2026-07-01T11:00:00Z', conversion_value: 49,
  utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand',
  first_touch_source: 'google', first_touch_medium: 'cpc', first_touch_campaign: 'brand',
  ai_source: null, page_url: '/checkout', user_id: null, anonymous_id: 'v1', ingestion_method: 'server_routed'
}
const CONV_KEYS = ['timestamp', 'conversion_value', 'utm_source', 'utm_medium', 'utm_campaign', 'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'ai_source', 'page_url', 'user_id', 'anonymous_id', 'ingestion_method']
const convPos = (o) => CONV_KEYS.map((k) => o[k])
// Journey positional: [event, timestamp, page_url, utm_source, utm_medium, utm_campaign, ai_source, conversion_value]
const JOURNEY = [
  ['$pageview', '2026-07-01T10:00:00Z', '/a', 'google', 'cpc', 'brand', null, null],
  ['$conversion', '2026-07-01T11:00:00Z', '/checkout', 'google', 'cpc', 'brand', null, 49]
]

async function run (deps) {
  __setAttributionReadDeps(deps)
  try { return await getAttributionExplanation(SITE, MODEL, DID) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: named pipe conversion row vs positional HogQL -> identical explanation object', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [conv] : null,
    queryHog: async (_sql, name) => name === 'attribution_explain_journey' ? JOURNEY : (() => { throw new Error('conversion must come from the pipe, not HogQL') })()
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'attribution_explain_conversion' ? [convPos(conv)] : name === 'attribution_explain_journey' ? JOURNEY : []
  })
  assert.ok(pipeRes && hogRes, 'both legs produced an explanation')
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe named-row remap == HogQL positional -> byte-identical explanation')
  assert.strictEqual(pipeRes.conversion.value, 49, 'conversion value carried through the pipe')
})

test('DISPATCH: pipe conversion serves WITHOUT touching HogQL for the conversion read', async () => {
  const hogNames = []
  await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [conv] : null,
    queryHog: async (_sql, name) => { hogNames.push(name); return name === 'attribution_explain_journey' ? JOURNEY : [] }
  })
  assert.ok(!hogNames.includes('attribution_explain_conversion'), 'conversion served from the pipe')
  assert.ok(hogNames.includes('attribution_explain_journey'), 'journey stays on HogQL (un-wired leg)')
})

test('no conversion for the visitor -> null on BOTH legs (pipe [] and HogQL [])', async () => {
  const pipeNull = await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [] : null, // empty (not null) = no conversion
    queryHog: async () => []
  })
  const hogNull = await run({
    queryTinybird: async () => null,
    queryHog: async () => []
  })
  assert.strictEqual(pipeNull, null, 'empty pipe result -> null (no conversion)')
  assert.strictEqual(hogNull, null, 'empty HogQL result -> null')
})
