// W1-bb read-cutover — getMultiTouchAttributionLive dispatch + the $0-carrier COUNT
// exclusion. The conversions read is wired pipe-first (multitouch_conversions_by_site);
// pageviews stay HogQL. The #1 risk: if the pipe mapRows drop any of the 5 carrier
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

// Named pipe row -> HogQL positional order (must match attribution-engine.js:1602 mapRows).
const CONV_KEYS = ['uuid', 'distinct_id', 'timestamp', 'conversion_type', 'conversion_value', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'ai_source', 'country', 'device_type', 'utm_term', 'provider', 'attribution_status', 'stitching_method', 'ingestion_method', 'stripe_subscription_id', 'stripe_event_type']
const toPositional = (o) => CONV_KEYS.map((k) => o[k])

// Each visitor gets one pageview before its conversion (positional pv shape, index 0/1/2 = distinct_id/timestamp/utm_source).
const pv = (did, ts) => { const r = new Array(23).fill(null); r[0] = did; r[1] = ts; r[2] = 'google'; r[3] = 'cpc'; r[4] = 'brand'; return r }
const PVS = [pv('v-normal', '2026-07-01T09:00:00Z'), pv('v-carrier', '2026-07-01T10:30:00Z')]

const totalConversions = (rows) => rows.reduce((s, r) => s + (Number(r.conversions) || 0), 0)

test('carrier fixture is a real subscription-checkout carrier (sanity)', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier(carrierConv), true, 'carrier row matches the discriminator')
  assert.strictEqual(isSubscriptionCheckoutCarrier(normalConv), false, 'normal row is not a carrier')
})

test('$0-carrier is EXCLUDED from the conversion COUNT on the PIPE path (all 5 discriminators carried)', async () => {
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [normalConv, carrierConv] : null,
    queryHog: async (_sql, name) => name === 'multitouch_pageviews_live' ? PVS : []
  })
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  // linear, one touchpoint per counted conv -> 1.0 credit; carrier excluded -> total = 1, not 2.
  assert.strictEqual(Math.round(totalConversions(res)), 1, 'pipe path: carrier excluded from COUNT (would be 2 if a discriminator were dropped)')
})

test('COUNT parity: PIPE path == HogQL path with the carrier present (both exclude it)', async () => {
  // ON/pipe leg
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [normalConv, carrierConv] : null,
    queryHog: async (_sql, name) => name === 'multitouch_pageviews_live' ? PVS : []
  })
  let pipeRes
  try { pipeRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }

  // OFF/HogQL leg — conversions positional via HogQL, pipe null
  __setAttributionReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'multitouch_conversions_live' ? [toPositional(normalConv), toPositional(carrierConv)] : name === 'multitouch_pageviews_live' ? PVS : []
  })
  let hogRes
  try { hogRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(Math.round(totalConversions(pipeRes)), Math.round(totalConversions(hogRes)), 'pipe vs HogQL conversion count parity')
  assert.strictEqual(Math.round(totalConversions(hogRes)), 1, 'HogQL path also excludes the carrier')
})

test('control: the SAME row minus the carrier discriminators COUNTS (proves the exclusion is field-dependent)', async () => {
  const notACarrier = { ...carrierConv, conversion_value: 89, stripe_subscription_id: null, stripe_event_type: null } // real $89 purchase
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [normalConv, notACarrier] : null,
    queryHog: async (_sql, name) => name === 'multitouch_pageviews_live' ? PVS : []
  })
  let res
  try { res = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(Math.round(totalConversions(res)), 2, 'a non-carrier $89 purchase IS counted -> exclusion keys on the discriminators, not a blanket drop')
})

test('DISPATCH: named pipe rows and positional HogQL rows produce the identical mapped result', async () => {
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'multitouch_conversions_by_site' ? [normalConv] : null,
    queryHog: async (_sql, name) => name === 'multitouch_pageviews_live' ? [pv('v-normal', '2026-07-01T09:00:00Z')] : []
  })
  let pipeRes
  try { pipeRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }

  __setAttributionReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'multitouch_conversions_live' ? [toPositional(normalConv)] : name === 'multitouch_pageviews_live' ? [pv('v-normal', '2026-07-01T09:00:00Z')] : []
  })
  let hogRes
  try { hogRes = await getMultiTouchAttributionLive(CALL) } finally { __resetAttributionReadDeps() }

  assert.deepStrictEqual(pipeRes, hogRes, 'pipe named-row remap == HogQL positional -> byte-identical output')
})
