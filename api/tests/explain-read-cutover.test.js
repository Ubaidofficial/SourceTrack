// W1-bc2 read-cutover — getAttributionExplanation dispatch. BOTH reads are now Tinybird-sole:
// the CONVERSION read (attribution_explain_conversion, D1c-1) and the JOURNEY read (D1c-2, which
// REUSES the deployed `journey` pipe). A null pipe on EITHER leg THROWS the loud tinybird-force-read
// invariant — no HogQL fallback (PostHog is dead). Returns a SINGLE object (or null); an empty
// ([], not null) conversion pipe = no conversion -> null, and the journey read is short-circuited.

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
// Journey pipe NAMED rows == the 8 journey.pipe columns the explain leg reads (the seam maps
// r.event_type/r.timestamp/… into the engine's positional consumer).
const JOURNEY = [
  { event_type: '$pageview', timestamp: '2026-07-01T10:00:00Z', page_url: '/a', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', ai_source: null, conversion_value: null },
  { event_type: '$conversion', timestamp: '2026-07-01T11:00:00Z', page_url: '/checkout', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', ai_source: null, conversion_value: 49 }
]

async function run (deps) {
  __setAttributionReadDeps(deps)
  try { return await getAttributionExplanation(SITE, MODEL, DID) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: conversion + journey both served from pipes -> explanation object, HogQL NOT called', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [conv] : pipe === 'journey' ? JOURNEY : null,
    queryHog: async () => { throw new Error('HogQL must not be called — both explain reads are Tinybird-sole post-D1c-2') }
  })
  assert.ok(pipeRes, 'the pipe legs produced an explanation')
  assert.strictEqual(pipeRes.conversion.value, 49, 'conversion value carried through the conversion pipe')
  assert.strictEqual(pipeRes.journey_summary.total_events, 2, 'both journey rows flowed from the journey pipe (input assertion, not verify-by-absence)')
})

test('DISPATCH: both reads served from pipes, HogQL untouched (zero fallback)', async () => {
  const pipes = []
  await run({
    queryTinybird: async (pipe) => { pipes.push(pipe); return pipe === 'attribution_explain_conversion' ? [conv] : pipe === 'journey' ? JOURNEY : null },
    queryHog: async () => { throw new Error('HogQL must not be called — explain is Tinybird-sole') }
  })
  assert.ok(pipes.includes('attribution_explain_conversion'), 'conversion served from its pipe')
  assert.ok(pipes.includes('journey'), 'journey served from the reused journey pipe')
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

test('FORCE-READ: journey pipe null (conversion served) throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  await assert.rejects(
    run({
      queryTinybird: async (pipe) => pipe === 'attribution_explain_conversion' ? [conv] : null, // conversion serves; journey pipe gated
      queryHog: async () => { throw new Error('HogQL must not be called after the journey pipe returns null') }
    }),
    /tinybird-force-read.*journey returned null/,
    'a null journey pipe must throw the loud force-read invariant, not fall back'
  )
})

test('no conversion for the visitor -> null (empty [] conversion pipe; journey never read)', async () => {
  const pipes = []
  const pipeNull = await run({
    queryTinybird: async (pipe) => { pipes.push(pipe); return pipe === 'attribution_explain_conversion' ? [] : null }, // empty (not null) = no conversion
    queryHog: async () => { throw new Error('HogQL must not be called') }
  })
  assert.strictEqual(pipeNull, null, 'empty conversion pipe -> null (no conversion); an empty array is a served answer, not a null-pipe throw')
  assert.ok(!pipes.includes('journey'), 'no conversion -> short-circuit before the journey read')
})
