// Phase 2c Batch 1 - dual-write gate + per-producer payload-shape wiring.
// Mock transport (no real POST, no token). The CRITICAL test is flag-OFF safety.

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import {
  dualWriteEvent, isDualWriteEnabled, setDualWriteTransport, __getDualWriteBatcher
} from '../dual-write.js'
import { deriveEventId } from '../normalize.js'
// The REAL resolveCapiEventId the producers use (conversion.js:238 / offline:178) —
// proves offline<->browser cross-dedup with the actual id derivation, not a literal.
import { resolveCapiEventId } from '../../../api/lib/capi-event-id.js'

function recorder () {
  const payloads = []
  const transport = async (payload, meta) => { payloads.push({ payload, meta }) }
  return {
    transport,
    lines: () => payloads.flatMap((p) => gunzipSync(p.payload).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)))
  }
}

function reset () {
  setDualWriteTransport(null)
  delete process.env.TINYBIRD_DUAL_WRITE
}

// flushAt high so enqueue never auto-flushes; we flush explicitly to deliver.
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 }

async function emitOn (raw) {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const ok = dualWriteEvent(raw)
  if (ok) await __getDualWriteBatcher().flush()
  return { ok, rec }
}

// ── Representative payloads, exactly as each wired producer passes them ──────────
const SITE = 'site-uuid-123'
// Distinct sentinel for conversion_event_id in every fixture: deriveEventId must
// pick the NATURAL id (order_id/invoice_id/sub_id), NOT conversion_event_id. With
// the sentinel != the natural id, the `event_id === <natural>` assertions genuinely
// exercise that exclusion (they'd fail if conversion_event_id were ever consumed).
const CEID_SENTINEL = 'SENTINEL_should_not_appear'
const proxyRaw = (order_id) => ({
  distinctId: 'anon-1', event: '$conversion', order_id,
  properties: {
    referrer: '', site_id: SITE, site_key: 'sk_live_SECRET',
    conversion_value: 49.0, conversion_type: 'purchase',
    conversion_event_id: CEID_SENTINEL, country: 'US', device_type: 'desktop',
    server_timestamp: '2026-06-30T10:00:00.000Z', proxy: true
  }
})
const pixelRaw = {
  distinctId: 'anon-2', event: 'email_open',
  properties: {
    site_id: SITE, anonymous_id: 'anon-2', user_id: null, tracking_method: 'pixel',
    page_url: null, utm_source: 'newsletter', device_type: 'mobile',
    browser: 'Safari', os: 'iOS', country: 'GB', city: 'London',
    server_timestamp: '2026-06-30T10:00:00.000Z', value: 0
  }
}
const serverEventsRaw = {
  distinctId: 'anon-3', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, anonymous_id: 'anon-3', user_id: null, stitching_method: 'none',
    conversion_value: 99.0, conversion_type: 'purchase', device_type: 'desktop',
    country: 'DE', server_timestamp: '2026-06-30T10:00:00.000Z', ingestion_method: 'server_sdk'
  }
}
// ── Batch 2 producers ───────────────────────────────────────────────────────────
// webhook-incoming: passes fields.orderId as raw order_id (NOT conversion_event_id),
// + sanitizedProps (email/name already [REDACTED]; site_key present; adapter drops all).
// raw_payload mirrors the real producer (webhook-incoming.js:171): a STRINGIFIED,
// truncated dump of the customer body. A customer-sent `site_key` is a bypassed key
// in redactPiiFromObject, so it survives INSIDE this string — the smuggling vector.
const SMUGGLED_SECRET = 'sk_live_SMUGGLED_IN_BODY'
const webhookIncomingRaw = (orderId) => ({
  distinctId: 'anon-4', event: '$conversion', order_id: orderId,
  properties: {
    site_id: SITE, site_key: 'sk_live_SECRET', conversion_value: 25.0, conversion_type: 'webhook',
    conversion_event_id: CEID_SENTINEL, email: '[REDACTED]', name: '[REDACTED]',
    utm_source: 'webhook', utm_medium: 'webhook',
    webhook_source: 'Mozilla/5.0 (raw-UA-via-webhook_source-9f3)', // raw UA relabeled -> drop
    raw_payload: `{"site_key":"${SMUGGLED_SECRET}","deal_id":"d1","note":"customer body"}`,
    server_timestamp: '2026-06-30T10:00:00.000Z', stitching_method: 'none',
    webhook_email_present: true, identity_resolution_status: 'unresolved'
  }
})
// track.js form promotion: no natural id -> uuid; site_key present (adapter drops).
const trackFormRaw = {
  distinctId: 'anon-5', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_SECRET2', anonymous_id: 'anon-5', is_conversion: true,
    conversion_type: 'form', form_name: 'demo', page_url: 'https://x.example.com/pricing',
    utm_source: 'google', ingestion_method: 'server_routed'
  }
}
// ── Batch 3: browser (conversion.js) + offline (conversion-offline.js) ───────────
// Both producers stamp props.external_event_id = resolveCapiEventId(body, site_id,
// type). For the SAME order_id + conversion_type that value is identical -> the
// shared event_id that proves offline<->browser cross-dedup.
const SHARED_BODY = { order_id: 'ord_777' }
const SHARED_TYPE = 'purchase'
const SHARED_EXT = resolveCapiEventId(SHARED_BODY, SITE, SHARED_TYPE) // `${SITE}:ord_777:purchase`
const browserConvRaw = {
  distinctId: 'browser-anon', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_BROWSER', anonymous_id: 'browser-anon', is_conversion: true,
    conversion_value: 120.0, conversion_type: SHARED_TYPE, order_id: SHARED_BODY.order_id,
    external_event_id: SHARED_EXT, ingestion_method: 'server_routed', utm_source: 'google',
    // fingerprinting/cookie keys the sweep ruled DROP (city pixel.js:112; fbp/fbc conversion.js:245-246)
    city: 'Berlin', fbp: 'fb.1.123.ABCxyz', fbc: 'fb.1.456.CLICKDEF',
    // browser_version/os_version are KEPT (read by events.js/journey.js) — must SURVIVE
    browser_version: '120.0.1', os_version: '17.2', os_name: 'iOS',
    custom_properties: { city: 'Munich', fbp: 'nested-fbp-GHI' } // nested -> must also drop
  }
}
const SECRET_UA = 'Mozilla/5.0 (fingerprint-UA-12345)'
const offlineConvRaw = {
  distinctId: 'offline-srv', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_OFFLINE', is_conversion: true, conversion_value: 120.0,
    user_agent: SECRET_UA, // conversion-offline.js:171 — raw UA; §6 fingerprinting-adjacent
    custom_properties: { user_agent: SECRET_UA }, // nested too — must drop at every depth
    conversion_type: SHARED_TYPE, order_id: SHARED_BODY.order_id, external_event_id: SHARED_EXT,
    ingestion_method: 'offline', provider: 'payments_api', currency: 'USD'
  }
}
// ── Batch 4: shopify-webhook.js ─────────────────────────────────────────────────
// Shopify has no external_event_id/client event_id -> deriveEventId resolves
// order_id (= String(payload.id), shopify-webhook.js:121) via branch 5.
const shopifyRaw = (orderId) => ({
  distinctId: 'shopify_unattributed:' + orderId, event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_SHOPIFY', conversion_value: 75.0, currency: 'USD',
    conversion_type: 'purchase', conversion_event_id: CEID_SENTINEL, order_id: orderId,
    order_name: '#1042', provider: 'shopify', provider_event_id: 'wh_evt_abc',
    occurred_at: '2026-06-30T10:00:00.000Z', ingestion_method: 'webhook_shopify',
    stitching_method: 'none', utm_source: 'shopify', utm_medium: 'webhook',
    first_touch_source: 'shopify', first_touch_medium: 'webhook'
  }
})

// ── Batch 5b: stripe-webhook.js (both paths) ────────────────────────────────────
// Checkout: order_id = session.id -> deriveEventId branch 5. NO stripe_invoice_id /
// stripe_subscription_id in checkout props, so it resolves order_id.
const stripeCheckoutRaw = {
  distinctId: 'stripe_unattributed:cs_test_123', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_STRIPECK', conversion_value: 49.0, currency: 'USD',
    conversion_type: 'purchase', conversion_event_id: CEID_SENTINEL, order_id: 'cs_test_123',
    payment_id: 'pi_test_777', provider: 'stripe', provider_event_id: 'evt_ck_1',
    stripe_event_type: 'checkout.session.completed', occurred_at: '2026-06-30T10:00:00.000Z',
    ingestion_method: 'webhook_stripe', stitching_method: 'none', utm_source: 'stripe',
    utm_medium: 'webhook', first_touch_source: 'stripe', webhook_customer_id: 'cus_test_1'
  }
}
// Subscription invoice.paid: stripe_invoice_id present -> deriveEventId branch 3.
const stripeSubInvoiceRaw = {
  distinctId: 'stripe_subscription_unattributed:sub_test_5', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_STRIPESUB', conversion_value: 79.0, currency: 'USD',
    conversion_type: 'subscription', conversion_event_id: CEID_SENTINEL, provider: 'stripe',
    provider_event_id: 'evt_inv_1', stripe_event_type: 'invoice.paid', stripe_billing_reason: 'subscription_create',
    occurred_at: '2026-06-30T10:00:00.000Z', ingestion_method: 'webhook_stripe', stitching_method: 'none',
    utm_source: 'stripe', webhook_customer_id: 'cus_test_2',
    stripe_subscription_id: 'sub_test_5', stripe_invoice_id: 'in_test_999'
  }
}
// Subscription lifecycle (no invoice, e.g. trial_start): branch 4 -> sub_id:conversion_type.
const stripeSubLifecycleRaw = {
  distinctId: 'stripe_subscription_unattributed:sub_test_5', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_STRIPESUB', conversion_value: 0, currency: 'USD',
    conversion_type: 'trial_start', conversion_event_id: CEID_SENTINEL, provider: 'stripe',
    provider_event_id: 'evt_subcreate_1', stripe_event_type: 'customer.subscription.created',
    occurred_at: '2026-06-30T10:00:00.000Z', ingestion_method: 'webhook_stripe', stitching_method: 'none',
    webhook_customer_id: 'cus_test_2', stripe_subscription_id: 'sub_test_5'
  }
}

// ── Gate logic ──────────────────────────────────────────────────────────────────
test('flag parsing: only "true"/"1" enable; everything else is OFF', () => {
  for (const v of ['true', '1']) { process.env.TINYBIRD_DUAL_WRITE = v; assert.strictEqual(isDualWriteEnabled(), true) }
  for (const v of ['false', '0', 'yes', '', 'TRUE', undefined]) {
    if (v === undefined) delete process.env.TINYBIRD_DUAL_WRITE; else process.env.TINYBIRD_DUAL_WRITE = v
    assert.strictEqual(isDualWriteEnabled(), false)
  }
  reset()
})

test('CRITICAL: flag OFF is a pure no-op — no transport, no batcher, input untouched', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS) // transport injected, but flag is OFF
  const raw = proxyRaw('ord_1')
  const before = JSON.stringify(raw)
  const ok = dualWriteEvent(raw)
  assert.strictEqual(ok, false, 'returns false when OFF')
  assert.strictEqual(rec.lines().length, 0, 'transport NEVER called')
  assert.strictEqual(__getDualWriteBatcher(), null, 'no batcher constructed when OFF')
  assert.strictEqual(JSON.stringify(raw), before, 'input object not mutated')
  reset()
})

test('flag ON but no transport wired (Phase-2c default) is a no-op', () => {
  reset()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  assert.strictEqual(dualWriteEvent(proxyRaw('ord_1')), false, 'no transport -> no-op')
  assert.strictEqual(__getDualWriteBatcher(), null)
  reset()
})

test('flag ON + malformed event (missing site_id) never throws — returns false', () => {
  reset()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  assert.strictEqual(dualWriteEvent({ event: '$conversion', properties: {} }), false)
  reset()
})

// ── Per-producer ON-path wiring (normalizeEvent + deriveEventId invoked) ─────────
test('proxy: ON -> emits with site_id=site.id, event_id=order_id, site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(proxyRaw('ord_123'))
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, 'ord_123', 'deriveEventId keys on order_id')
  assert.strictEqual(ev.event_type, '$conversion')
  assert.ok(!('site_key' in ev), 'site_key dropped by the adapter')
  assert.ok(!JSON.stringify(ev).includes('sk_live_SECRET'), 'secret never reaches Tinybird')
  reset()
})

test('proxy: ON with no order_id -> event_id falls to a uuid', async () => {
  const { rec } = await emitOn(proxyRaw(undefined))
  assert.match(rec.lines()[0].event_id, /^[0-9a-f-]{36}$/)
  reset()
})

test('pixel: ON -> uuid event_id; value->conversion_value, browser->browser_name', async () => {
  const { ok, rec } = await emitOn(pixelRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.match(ev.event_id, /^[0-9a-f-]{36}$/, 'no natural id -> uuid')
  assert.strictEqual(ev.event_type, 'email_open')
  assert.strictEqual(ev.conversion_value, 0, 'value renamed to conversion_value')
  assert.strictEqual(ev.browser_name, 'Safari')
  assert.ok(!('value' in ev) && !('browser' in ev))
  reset()
})

test('server-events: ON -> uuid event_id, correct site_id, event_type from event', async () => {
  const { ok, rec } = await emitOn(serverEventsRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.match(ev.event_id, /^[0-9a-f-]{36}$/)
  assert.strictEqual(ev.event_type, '$conversion')
  assert.strictEqual(ev.ingestion_method, 'server_sdk')
  assert.strictEqual(ev.timestamp, '2026-06-30T10:00:00.000Z', 'timestamp preserved')
  reset()
})

test('all three producers: flag OFF -> none emit (the safety guarantee, per producer)', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  for (const raw of [proxyRaw('ord_1'), pixelRaw, serverEventsRaw]) {
    assert.strictEqual(dualWriteEvent(raw), false)
  }
  assert.strictEqual(rec.lines().length, 0, 'zero emits across all three when OFF')
  reset()
})

// ── Batch 2 ─────────────────────────────────────────────────────────────────────
test('webhook-incoming: ON -> event_id=fields.orderId; site_key/email/name DROPPED', async () => {
  const { ok, rec } = await emitOn(webhookIncomingRaw('wh_order_9'))
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, 'wh_order_9', 'deriveEventId resolves the raw order_id, not conversion_event_id')
  assert.strictEqual(ev.event_type, '$conversion')
  assert.ok(!('site_key' in ev) && !('email' in ev) && !('name' in ev), 'secret + PII dropped')
  assert.ok(!JSON.stringify(ev).includes('sk_live_SECRET'))
  // NON-VACUOUS webhook_source check: raw UA relabeled under webhook_source is
  // dropped (FAILS without webhook_source in FORBIDDEN_KEYS).
  assert.ok(!('webhook_source' in ev), 'webhook_source (raw UA) dropped')
  assert.ok(!JSON.stringify(ev).includes('raw-UA-via-webhook_source-9f3'), 'raw UA bytes never reach the transport under any key')
  // NON-VACUOUS raw_payload check: the whole raw_payload field is dropped, so a
  // secret SMUGGLED inside its stringified JSON cannot ride into the NDJSON. This
  // assertion FAILS if raw_payload is removed from FORBIDDEN_KEYS (verified).
  assert.ok(!('raw_payload' in ev), 'raw_payload field dropped entirely')
  assert.ok(!JSON.stringify(ev).includes(SMUGGLED_SECRET), 'secret inside raw_payload string never reaches the transport')
  reset()
})

test('webhook-incoming: ON with no orderId -> uuid (NOT the conversion_event_id uuid)', async () => {
  const { rec } = await emitOn(webhookIncomingRaw(null))
  assert.match(rec.lines()[0].event_id, /^[0-9a-f-]{36}$/)
  reset()
})

test('track.js form: ON -> uuid event_id, correct site_id, site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(trackFormRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.match(ev.event_id, /^[0-9a-f-]{36}$/, 'form path has no natural id -> uuid')
  assert.strictEqual(ev.conversion_type, 'form')
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_SECRET2'))
  reset()
})

test('Batch 2 producers: flag OFF -> none emit (safety guarantee)', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  for (const raw of [webhookIncomingRaw('wh_1'), trackFormRaw]) {
    assert.strictEqual(dualWriteEvent(raw), false)
  }
  assert.strictEqual(rec.lines().length, 0, 'zero emits across both Batch-2 producers when OFF')
  reset()
})

// Lens (b) at the logic level: dualWriteEvent only runs in the !isDup + limitAllowed
// branch (mirrors track.js control flow). A deduped or limit-blocked form never
// dual-writes — proving placement AFTER the in-memory guard.
test('track.js gating: a deduped/limit-blocked form does NOT dual-write', async () => {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const simulateForm = (isDup, limitAllowed) => {
    if (!isDup) {                 // checkIsDuplicate short-circuit (track.js:404)
      if (limitAllowed) {         // claimConversionUsage gate (track.js:416)
        // ph.capture(...) then:
        dualWriteEvent(trackFormRaw)
      }
    }
  }
  simulateForm(true, true)        // duplicate -> skipped entirely
  simulateForm(false, false)      // limit reached -> skipped
  assert.strictEqual(rec.lines().length, 0, 'no dual-write when deduped or limited')
  simulateForm(false, true)       // real, allowed -> dual-writes
  await __getDualWriteBatcher().flush()
  assert.strictEqual(rec.lines().length, 1, 'exactly one dual-write on the allowed path')
  reset()
})

// ── Batch 3 ─────────────────────────────────────────────────────────────────────
test('browser (conversion.js): ON -> event_id = external_event_id; site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(browserConvRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, SHARED_EXT, 'deriveEventId branch-2 resolves external_event_id')
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_BROWSER'))
  reset()
})

// Sweep ruling: city/fbp/fbc dropped at every depth; browser_version/os_version/os_name
// KEPT (live read dependency). NON-VACUOUS — fails without the 3 in FORBIDDEN_KEYS.
test('fingerprinting drop: city/fbp/fbc gone (nested too); *_version KEPT', async () => {
  const { ok, rec } = await emitOn(browserConvRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  for (const k of ['city', 'fbp', 'fbc']) {
    assert.ok(!(k in ev), `${k} dropped top-level`)
    assert.ok(!(k in (ev.custom_properties || {})), `${k} dropped nested`)
  }
  for (const v of ['Berlin', 'Munich', 'fb.1.123.ABCxyz', 'nested-fbp-GHI', 'fb.1.456.CLICKDEF']) {
    assert.ok(!JSON.stringify(ev).includes(v), `${v} never reaches transport at any depth`)
  }
  // KEPT (read by events.js/journey.js) — must survive
  assert.strictEqual(ev.browser_version, '120.0.1', 'browser_version KEPT (live read)')
  assert.strictEqual(ev.os_version, '17.2', 'os_version KEPT (live read)')
  assert.strictEqual(ev.os_name, 'iOS', 'os_name KEPT')
  reset()
})

test('offline (conversion-offline.js): ON -> event_id = external_event_id; site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(offlineConvRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, SHARED_EXT)
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_OFFLINE'))
  reset()
})

test('CROSS-DEDUP PROOF: browser + offline, same order_id+type -> SAME event_id', async () => {
  // direct (deriveEventId) and end-to-end (through the wired dual-write path)
  assert.strictEqual(deriveEventId(browserConvRaw.properties), deriveEventId(offlineConvRaw.properties))
  const browser = await emitOn(browserConvRaw)
  const browserId = browser.rec.lines()[0].event_id
  reset()
  const offline = await emitOn(offlineConvRaw)
  const offlineId = offline.rec.lines()[0].event_id
  assert.strictEqual(browserId, offlineId, 'browser and offline derive the SAME event_id')
  assert.strictEqual(browserId, SHARED_EXT)
  reset()
})

// Lens (b) — the load-bearing one: dualWriteEvent fires ONLY after the persistent
// claim SUCCEEDS. A duplicate (claim.duplicate) returns before ph.capture, so it
// must NOT dual-write. Mirrors conversion.js / conversion-offline.js control flow.
test('persistent-claim gating: a duplicate the claim SKIPS does NOT dual-write', async () => {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const simulateClaimed = (claim, limitAllowed) => {
    if (claim.duplicate) return // conversion.js:321 / offline:95 — skip-on-duplicate
    if (!limitAllowed) return   // plan-limit block
    // ph.capture(...) then:
    dualWriteEvent(browserConvRaw)
  }
  simulateClaimed({ duplicate: true }, true)        // duplicate -> claim skips -> NO emit
  simulateClaimed({ duplicate: false }, false)      // limit blocked -> NO emit
  assert.strictEqual(rec.lines().length, 0, 'a claim-skipped duplicate / limited conversion never dual-writes')
  simulateClaimed({ duplicate: false }, true)        // claim success + allowed -> emit
  await __getDualWriteBatcher().flush()
  assert.strictEqual(rec.lines().length, 1, 'exactly one dual-write on claim-success path')
  reset()
})

test('Batch 3 producers: flag OFF -> none emit (safety guarantee)', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  for (const raw of [browserConvRaw, offlineConvRaw]) {
    assert.strictEqual(dualWriteEvent(raw), false)
  }
  assert.strictEqual(rec.lines().length, 0)
  reset()
})

// ── Batch 4: shopify-webhook.js ─────────────────────────────────────────────────
test('shopify: ON -> event_id = order_id (branch 5); site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(shopifyRaw('5500000123'))
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, '5500000123', 'deriveEventId resolves order_id, not conversion_event_id')
  assert.strictEqual(ev.event_type, '$conversion')
  assert.strictEqual(ev.provider, 'shopify')
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_SHOPIFY'))
  reset()
})

test('shopify: flag OFF -> no emit (HMAC + persistent claim path unaffected)', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  assert.strictEqual(dualWriteEvent(shopifyRaw('5500000123')), false)
  assert.strictEqual(rec.lines().length, 0)
  reset()
})

// Lens (b): dualWriteEvent fires ONLY after HMAC + the persistent claim succeeds.
// A duplicate the claim skips (shopify-webhook.js:138 -> return :147) must NOT
// dual-write. Mirrors the shopify control flow.
test('shopify claim-gating: HMAC-fail / claim-skipped duplicate / limit -> NO dual-write', async () => {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const simulateShopify = (hmacOk, claim, limitAllowed) => {
    if (!hmacOk) return                 // :72 invalid HMAC -> 400
    if (claim.duplicate) return         // :138 -> return :147
    if (!limitAllowed) return           // :249 limit block
    // ph.capture(...) then:
    dualWriteEvent(shopifyRaw('5500000123'))
  }
  simulateShopify(false, { duplicate: false }, true)   // bad HMAC -> NO emit
  simulateShopify(true, { duplicate: true }, true)      // claim skip -> NO emit
  simulateShopify(true, { duplicate: false }, false)    // limit -> NO emit
  assert.strictEqual(rec.lines().length, 0, 'suppressed conversions never dual-write')
  simulateShopify(true, { duplicate: false }, true)     // verified + claimed + allowed -> emit
  await __getDualWriteBatcher().flush()
  assert.strictEqual(rec.lines().length, 1, 'exactly one dual-write on the success path')
  reset()
})

// ── Batch 5b: stripe (both paths) ───────────────────────────────────────────────
test('stripe checkout: ON -> event_id = order_id (session.id, branch 5); site_key DROPPED', async () => {
  const { ok, rec } = await emitOn(stripeCheckoutRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, 'cs_test_123', 'order_id (session.id) resolves, not conversion_event_id')
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_STRIPECK'))
  reset()
})

test('stripe subscription invoice.paid: ON -> event_id = stripe_invoice_id (branch 3)', async () => {
  const { ok, rec } = await emitOn(stripeSubInvoiceRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.strictEqual(ev.site_id, SITE)
  assert.strictEqual(ev.event_id, 'in_test_999', 'stripe_invoice_id wins (per-period key; renewals stay distinct)')
  assert.ok(!('site_key' in ev) && !JSON.stringify(ev).includes('sk_live_STRIPESUB'))
  reset()
})

test('stripe subscription lifecycle (no invoice): ON -> event_id = sub_id:conversion_type (branch 4)', async () => {
  const { ok, rec } = await emitOn(stripeSubLifecycleRaw)
  assert.strictEqual(ok, true)
  assert.strictEqual(rec.lines()[0].event_id, 'sub_test_5:trial_start', 'scoped by type so trial/churn never collide')
  reset()
})

test('stripe both paths: flag OFF -> none emit (persistent claim + routing unaffected)', () => {
  reset()
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  for (const raw of [stripeCheckoutRaw, stripeSubInvoiceRaw, stripeSubLifecycleRaw]) {
    assert.strictEqual(dualWriteEvent(raw), false)
  }
  assert.strictEqual(rec.lines().length, 0)
  reset()
})

// Lens (b) BOTH paths: dualWriteEvent fires only after sig-verify + persistent claim
// succeeds. A claim-skipped duplicate must NOT dual-write. Mirrors both Stripe paths.
test('stripe claim-gating (both paths): sig-fail / claim-skipped / limit -> NO dual-write', async () => {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const simulateStripe = (raw, sigOk, claim, limitAllowed) => {
    if (!sigOk) return                  // invalid HMAC signature -> 400
    if (claim.duplicate) return         // claim duplicate-skip (checkout :285 / subscription :72)
    if (!limitAllowed) return           // plan-limit block
    dualWriteEvent(raw)                  // after ph.capture
  }
  simulateStripe(stripeCheckoutRaw, false, { duplicate: false }, true)   // bad sig
  simulateStripe(stripeCheckoutRaw, true, { duplicate: true }, true)      // checkout claim skip
  simulateStripe(stripeSubInvoiceRaw, true, { duplicate: true }, true)    // subscription claim skip
  simulateStripe(stripeSubInvoiceRaw, true, { duplicate: false }, false)  // limit
  assert.strictEqual(rec.lines().length, 0, 'no dual-write on any suppressed path (either Stripe path)')
  simulateStripe(stripeCheckoutRaw, true, { duplicate: false }, true)     // success
  simulateStripe(stripeSubInvoiceRaw, true, { duplicate: false }, true)   // success
  await __getDualWriteBatcher().flush()
  assert.strictEqual(rec.lines().length, 2, 'one dual-write per successful path')
  reset()
})

// raw user_agent dropped (§6 fingerprinting-adjacent). NON-VACUOUS: FAILS without
// user_agent in FORBIDDEN_KEYS. The typed device_type/browser_name/os_name (derived
// upstream) are unaffected; raw UA has zero read value on the Tinybird plane.
test('user_agent dropped from the Tinybird plane at every depth (top-level + nested)', async () => {
  const { ok, rec } = await emitOn(offlineConvRaw)
  assert.strictEqual(ok, true)
  const ev = rec.lines()[0]
  assert.ok(!('user_agent' in ev), 'top-level user_agent dropped')
  assert.ok(!('user_agent' in (ev.custom_properties || {})), 'nested user_agent dropped')
  assert.ok(!JSON.stringify(ev).includes(SECRET_UA), 'raw UA string never reaches the transport at any depth')
  reset()
})
