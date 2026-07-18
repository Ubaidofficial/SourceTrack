// W1-bc2 read-cutover — getAttributionExplanation dispatch. The CONVERSION read is wired
// pipe-first (attribution_explain_conversion) and, post-D1c-1, THROWS the loud
// tinybird-force-read invariant on a null pipe (no HogQL fallback). The JOURNEY read
// intentionally STAYS on HogQL — it is the one remaining functional _queryHogQL caller,
// retired separately in D1c-2 (build attribution_explain_journey pipe). Returns a SINGLE
// object (or null); an empty ([], not null) conversion pipe = no conversion -> null.

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
// Journey positional: [event, timestamp, page_url, utm_source, utm_medium, utm_campaign, ai_source, conversion_value]
const JOURNEY = [
  ['$pageview', '2026-07-01T10:00:00Z', '/a', 'google', 'cpc', 'brand', null, null],
  ['$conversion', '2026-07-01T11:00:00Z', '/checkout', 'google', 'cpc', 'brand', null, 49]
]

async function run (deps) {
  __setAttributionReadDeps(deps)
  try { return await getAttributionExplanation(SITE, MODEL, DID) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: named pipe conversion row -> explanation object, journey from HogQL', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [conv] : null,
    queryHog: async (_sql, name) => name === 'attribution_explain_journey' ? JOURNEY : (() => { throw new Error('conversion must come from the pipe, not HogQL') })()
  })
  assert.ok(pipeRes, 'the pipe conversion leg produced an explanation')
  assert.strictEqual(pipeRes.conversion.value, 49, 'conversion value carried through the pipe')
})

test('FORCE-READ: conversion pipe null throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  await assert.rejects(
    run({
      queryTinybird: async () => null, // conversion pipe gated → throw before the journey read
      queryHog: async () => { throw new Error('HogQL must not be called after the conversion pipe returns null') }
    }),
    /tinybird-force-read.*attribution_explain_conversion returned null/,
    'a null conversion pipe must throw the loud force-read invariant, not fall back'
  )
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

test('no conversion for the visitor -> null (empty [] pipe result, NOT a throw)', async () => {
  const pipeNull = await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [] : null, // empty (not null) = no conversion
    queryHog: async () => []
  })
  assert.strictEqual(pipeNull, null, 'empty pipe result -> null (no conversion); an empty array is a served answer, not a null-pipe throw')
})
