// Phase-9 app-path injector — contract tests.
// Proves: (a) the default UA clears the bot filter, (b) the reshaped payloads
// carry exactly the fields track.js / conversion.js parse, (c) DRY-RUN (default)
// sends NOTHING, and the --confirm path is gated + actually POSTs when allowed.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'

const { DEFAULT_UA, TRACK_PATH, CONVERSION_PATH, toPageview, toConversion, reshape, maskKey, run } =
  await import('../../tinybird/tools/phase9_app_path_injector.mjs')
const { isBotUserAgent } = await import('../lib/bot-filter.js')

const PV = {
  event_type: '$pageview', distinct_id: 'v-1', timestamp: '2026-06-27T21:14:00.000Z',
  page_url: 'https://ex.com/pricing', referrer: 'https://reddit.com/',
  utm_source: 'reddit', utm_medium: 'social', utm_campaign: 'launch',
  first_touch_source: 'facebook', first_touch_medium: 'paid_social', first_touch_campaign: null,
  first_touch_timestamp: '2026-06-27T21:00:00.000Z', site_id: 'site-01'
}
const CONV = {
  event_type: '$conversion', distinct_id: 'v-1', timestamp: '2026-06-27T21:29:00.000Z',
  conversion_value: 429.43, conversion_type: 'purchase', order_id: 'ord_abc',
  page_url: 'https://ex.com/checkout', referrer: null,
  utm_source: 'reddit', utm_medium: 'social', utm_campaign: 'launch',
  first_touch_source: 'facebook', first_touch_medium: 'paid_social', first_touch_campaign: null,
  first_touch_timestamp: '2026-06-27T21:00:00.000Z', site_id: 'site-01'
}

test('(a) default UA clears the bot filter (would NOT be dropped by track/conversion routes)', () => {
  assert.strictEqual(isBotUserAgent(DEFAULT_UA), false)
  // sanity: an obviously-bot UA IS dropped (proves the check is live)
  assert.strictEqual(isBotUserAgent('curl/8.4.0'), true)
})

test('(b) pageview payload carries the fields track.js parses, routed to /api/track', () => {
  const { path, body } = reshape(PV, 'sk_test_123')
  assert.strictEqual(path, TRACK_PATH)
  for (const k of ['site_key', 'event', 'anonymous_id', 'page_url', 'referrer',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'first_touch_timestamp',
    'timestamp', 'properties']) {
    assert.ok(k in body, `pageview body missing ${k}`)
  }
  assert.strictEqual(body.event, '$pageview')
  assert.strictEqual(body.anonymous_id, 'v-1')            // track.js uses req.body.anonymous_id
  assert.strictEqual(body.site_key, 'sk_test_123')        // validateSiteKey reads req.body.site_key
  assert.strictEqual(body.first_touch_source, 'facebook') // first-touch carried through verbatim
  assert.strictEqual(body.timestamp, PV.timestamp)
})

test('(b) conversion payload carries the fields conversion.js parses, routed to /api/conversion', () => {
  const { path, body } = reshape(CONV, 'sk_test_123')
  assert.strictEqual(path, CONVERSION_PATH)
  for (const k of ['site_key', 'anonymous_id', 'conversion_value', 'conversion_type', 'order_id',
    'page_url', 'utm_source', 'first_touch_source', 'timestamp']) {
    assert.ok(k in body, `conversion body missing ${k}`)
  }
  assert.strictEqual(body.conversion_value, 429.43)
  assert.strictEqual(body.conversion_type, 'purchase')
  assert.strictEqual(body.order_id, 'ord_abc')
  assert.strictEqual(body.site_key, 'sk_test_123')
})

test('(c) DRY-RUN (default) sends NOTHING — fetch is never called', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return { ok: true, status: 200 } }
  const logs = []
  const res = await run({
    events: [PV, CONV], siteKey: 'sk_secret_value', baseUrl: 'https://api.example',
    confirm: false, fetchImpl, log: (m) => logs.push(m)
  })
  assert.strictEqual(calls, 0, 'DRY-RUN must not call fetch')
  assert.deepStrictEqual(res, { sent: 0, wouldSend: 2, byPath: { [TRACK_PATH]: 1, [CONVERSION_PATH]: 1 } })
  // never leaks the full site_key
  assert.ok(!logs.join('\n').includes('sk_secret_value'), 'site_key must be masked in output')
})

test('--confirm actually POSTs each event to the right endpoint with the browser UA', async () => {
  const posted = []
  const fetchImpl = async (url, opts) => { posted.push({ url, ua: opts.headers['User-Agent'], body: JSON.parse(opts.body) }); return { ok: true, status: 200 } }
  const res = await run({
    events: [PV, CONV], siteKey: 'sk_test_123', baseUrl: 'https://api.example/', confirm: true, fetchImpl, log: () => {}
  })
  assert.strictEqual(res.sent, 2)
  assert.deepStrictEqual(posted.map(p => p.url), ['https://api.example/api/track', 'https://api.example/api/conversion'])
  assert.ok(posted.every(p => p.ua === DEFAULT_UA), 'browser UA sent on every request')
  assert.ok(posted.every(p => p.body.site_key === 'sk_test_123'), 'site_key in body for validateSiteKey')
})

test('--confirm refuses when base URL / site_key are missing (no accidental unauthenticated send)', async () => {
  let calls = 0
  await assert.rejects(
    () => run({ events: [PV], siteKey: undefined, baseUrl: undefined, confirm: true, fetchImpl: async () => { calls++ }, log: () => {} }),
    /refusing to send/
  )
  assert.strictEqual(calls, 0)
})

test('run() refuses a bot UA (fail-closed — would otherwise be silently dropped)', async () => {
  await assert.rejects(
    () => run({ events: [PV], siteKey: 'k', baseUrl: 'https://x', confirm: false, ua: 'python-requests/2.31', log: () => {} }),
    /bot filter/
  )
})

test('maskKey never returns the raw key', () => {
  assert.ok(!maskKey('sk_live_supersecret').includes('supersecret'))
  assert.strictEqual(maskKey(''), '(unset)')
})
