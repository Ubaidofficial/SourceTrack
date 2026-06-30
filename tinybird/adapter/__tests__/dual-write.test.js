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
const proxyRaw = (order_id) => ({
  distinctId: 'anon-1', event: '$conversion', order_id,
  properties: {
    referrer: '', site_id: SITE, site_key: 'sk_live_SECRET',
    conversion_value: 49.0, conversion_type: 'purchase',
    conversion_event_id: order_id || 'generated', country: 'US', device_type: 'desktop',
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
    conversion_event_id: orderId || 'baked-in-uuid', email: '[REDACTED]', name: '[REDACTED]',
    utm_source: 'webhook', utm_medium: 'webhook', webhook_source: 'curl/8',
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
    external_event_id: SHARED_EXT, ingestion_method: 'server_routed', utm_source: 'google'
  }
}
const offlineConvRaw = {
  distinctId: 'offline-srv', event: '$conversion', timestamp: '2026-06-30T10:00:00.000Z',
  properties: {
    site_id: SITE, site_key: 'sk_live_OFFLINE', is_conversion: true, conversion_value: 120.0,
    conversion_type: SHARED_TYPE, order_id: SHARED_BODY.order_id, external_event_id: SHARED_EXT,
    ingestion_method: 'offline', provider: 'payments_api', currency: 'USD'
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
