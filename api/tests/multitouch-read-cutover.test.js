// W1-bb read-cutover — getMultiTouchAttributionLive dispatch + the $0-carrier COUNT
// exclusion. BOTH reads are wired pipe-first (multitouch_conversions_by_site +
// multitouch_pageviews_live); post-D1c-1 a null pipe throws the loud tinybird-force-read
// invariant (no HogQL fallback). The #1 risk: if the pipe mapRows drop any of the 5 carrier
// discriminator fields (provider, conversion_type, conversion_value, stripe_subscription_id,
// stripe_event_type), isSubscriptionCheckoutCarrier silently returns false and the $0
// subscription-checkout carrier re-inflates the conversion COUNT by +1. Tested explicitly.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getMultiTouchAttributionLive, __setAttributionReadDeps, __resetAttributionReadDeps } = await import('../lib/attribution-engine.js')
const { isSubscriptionCheckoutCarrier } = await import('../lib/stripe-subscription.js')

const CALL = { siteId: 'site-mt', model: 'linear', groupBy: 'source', dateFrom: '2026-07-01', dateTo: '2026-07-06' }

// A normal $49 conversion (v-normal) + a $0 subscription-checkout carrier (v-carrier).
// Named fields = the pipe's SELECT aliases (multitouch_conversions_by_site.pipe).
const normalConv = {
  uuid: 'c-normal', distinct_id: 'v-normal', timestamp: '2026-07-01T10:00:00Z',
  conversion_type: 'purchase', conversion_value: 49, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand',
  referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null,
  provider: 'browser', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'server_routed',
  stripe_subscription_id: null, stripe_event_type: null
}
const carrierConv = {
  uuid: 'c-carrier', distinct_id: 'v-carrier', timestamp: '2026-07-01T11:00:00Z',
  conversion_type: 'purchase', conversion_value: 0, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand',
  referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null,
  provider: 'stripe', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'offline',
  stripe_subscription_id: 'sub_123', stripe_event_type: 'checkout.session.completed'
}

// Each visitor gets one pageview before its conversion. NAMED pipe-row shape — the
// multitouch_pageviews_live SELECT aliases the engine remaps at attribution-engine.js:1688.
const pv = (did, ts) => ({ distinct_id: did, timestamp: ts, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' })
const PVS = [pv('v-normal', '2026-07-01T09:00:00Z'), pv('v-carrier', '2026-07-01T10:30:00Z')]

const totalConversions = (rows) => rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0)

test('carrier fixture is a real subscription-checkout carrier (sanity)', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier(carrierConv), true, 'carrier row matches the discriminator')
  assert.strictEqual(isSubscriptionCheckoutCarrier(normalConv), false, 'normal row is not a carrier')
})

// Serve BOTH pipes; HogQL must never be touched post-cutover.
const pipeDeps = (convs) => ({
  queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? convs : pipe === 'multitouch_pageviews_live' ? PVS : null,
  queryHog: async () => { throw new Error('HogQL must not be called on the pipe path') }
})

test('$0-carrier is EXCLUDED from the conversion COUNT on the PIPE path (all 5 discriminators carried)', async () => {
  __setAttributionReadDeps(pipeDeps([normalConv, carrierConv]))
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  // linear, one touchpoint per counted conv -> 1.0 credit; carrier excluded -> total = 1, not 2.
  assert.strictEqual(Math.round(totalConversions(res)), 1, 'pipe path: carrier excluded from COUNT (would be 2 if a discriminator were dropped)')
})

test('control: the SAME row minus the carrier discriminators COUNTS (proves the exclusion is field-dependent)', async () => {
  const notACarrier = { ...carrierConv, conversion_value: 89, stripe_subscription_id: null, stripe_event_type: null } // real $89 purchase
  __setAttributionReadDeps(pipeDeps([normalConv, notACarrier]))
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(Math.round(totalConversions(res)), 2, 'a non-carrier $89 purchase IS counted -> exclusion keys on the discriminators, not a blanket drop')
})

test('DISPATCH: named pipe rows map to source=google credit for the counted conversion', async () => {
  __setAttributionReadDeps(pipeDeps([normalConv]))
  let pipeRes
  try { pipeRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(Math.round(totalConversions(pipeRes)), 1, 'the single normal conversion is counted')
  const google = pipeRes.find((r) => r.dim_value === 'google')
  assert.ok(google, 'named-row remap attributed the pageview to source=google (a dropped alias would render garbage)')
})

test('FORCE-READ: conversions pipe null throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  __setAttributionReadDeps({
    queryTinybird: async () => null, // conv pipe gated → throw before pageviews run
    queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
  })
  try {
    await assert.rejects(
      getMultiTouchAttributionLive(CALL),
      /tinybird-force-read.*multitouch_conversions_by_site returned null/,
      'a null conversions pipe must throw the loud force-read invariant, not fall back'
    )
  } finally { __resetAttributionReadDeps() }
})

test('FORCE-READ: pageviews pipe null throws the tinybird-force-read invariant, HogQL NOT called', async () => {
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [normalConv] : null, // pageviews gated
    queryHog: async () => { throw new Error('HogQL must not be called after the pipe returns null') }
  })
  try {
    await assert.rejects(
      getMultiTouchAttributionLive(CALL),
      /tinybird-force-read.*multitouch_pageviews_live returned null/,
      'a null pageviews pipe must throw the loud force-read invariant, not fall back'
    )
  } finally { __resetAttributionReadDeps() }
})
