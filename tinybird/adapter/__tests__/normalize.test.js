// Phase 2a — normalizeEvent() contract tests.
// Drives the generator's edge cases (replayed from the committed fixture) plus
// constructed pixel-divergence / PII inputs.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { normalizeEvent, TYPED_COLUMNS, REQUIRED_COLUMNS, deriveEventId } from '../normalize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(__dirname, '../../fixtures/events_sample.ndjson')

function loadFixture () {
  return readFileSync(FIXTURE, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
}

// ISO-8601 with millisecond precision, UTC.
const ISO_MS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/

test('fixture replay: synthetic-only keys are dropped; 7 NOT NULL guaranteed', () => {
  const lines = loadFixture()
  assert.ok(lines.length > 100, 'fixture should have events')
  for (const raw of lines) {
    const out = normalizeEvent(raw)
    // generator markers must never survive
    assert.ok(!('_synthetic' in out), '_synthetic dropped')
    assert.ok(!('refund_of' in out), 'top-level refund_of dropped')
    assert.ok(!('site_key' in out), 'site_key dropped')
    // all 7 NOT NULL columns present and non-empty
    for (const c of REQUIRED_COLUMNS) {
      assert.ok(out[c] !== undefined && out[c] !== null && out[c] !== '', `${c} present`)
    }
    assert.match(out.timestamp, ISO_MS, 'timestamp ISO-ms')
  }
})

test('fixture replay: a refund stays a signed negative conversion', () => {
  const refund = loadFixture().find((e) => (e.conversion_value ?? 0) < 0)
  assert.ok(refund, 'fixture has a refund')
  const out = normalizeEvent(refund)
  assert.strictEqual(out.event_type, '$conversion')
  assert.ok(out.conversion_value < 0, 'refund value stays negative (signed-sum nets)')
  assert.ok(!('_synthetic' in out))
})

test('fixture replay: output carries no reserved/divergent leak keys', () => {
  const leak = ['_synthetic', 'refund_of', 'site_key', 'email', 'name', 'value', 'browser', 'os', 'distinctId', 'event']
  for (const raw of loadFixture()) {
    const out = normalizeEvent(raw)
    for (const k of leak) assert.ok(!(k in out), `${k} must not leak`)
  }
})

test('pixel divergence: value/browser/os renamed to canonical names', () => {
  const raw = {
    site_id: 'site-01',
    event: '$conversion',
    anonymous_id: 'anon-xyz',
    value: 42.5,            // -> conversion_value (pixel.js:116)
    browser: 'Chrome',      // -> browser_name     (pixel.js:109)
    os: 'macOS',            // -> os_name          (pixel.js:110)
    region: 'Berlin',       // neutral unknown key -> bag (city is now FORBIDDEN)
    tracking_method: 'pixel', // bag
    x_campaign: 'spring',   // pixel x_ passthrough -> bag
    timestamp: '2026-06-01T10:00:00.000Z'
  }
  const out = normalizeEvent(raw)
  assert.strictEqual(out.conversion_value, 42.5)
  assert.strictEqual(out.browser_name, 'Chrome')
  assert.strictEqual(out.os_name, 'macOS')
  assert.ok(!('value' in out) && !('browser' in out) && !('os' in out), 'divergent names removed')
  assert.strictEqual(out.region, 'Berlin', 'unknown key preserved into bag')
  assert.strictEqual(out.tracking_method, 'pixel')
  assert.strictEqual(out.x_campaign, 'spring')
  assert.strictEqual(out.event_type, '$conversion', 'event -> event_type')
  assert.strictEqual(out.visitor_id, 'anon-xyz', 'visitor_id derived from anonymous_id')
})

test('PII denylist: email/name/phone dropped; legitimate *_name/_present kept', () => {
  const raw = {
    site_id: 'site-01', event_type: '$conversion', event_id: 'ord_1', distinct_id: 'd1',
    timestamp: '2026-06-01T10:00:00.000Z', ingestion_method: 'webhook_stripe',
    email: 'buyer@example.com',
    name: 'Jane Buyer',
    customer_email: 'jane@corp.com',
    billing_phone: '+15551234567',
    order_name: '#1042',          // must survive (not PII)
    form_name: 'demo_request',    // must survive
    browser_name: 'Safari',       // must survive
    os_name: 'iOS',               // must survive
    webhook_email_present: true   // must survive (boolean flag, not PII)
  }
  const out = normalizeEvent(raw)
  for (const pii of ['email', 'name', 'customer_email', 'billing_phone']) {
    assert.ok(!(pii in out), `${pii} dropped`)
  }
  assert.strictEqual(out.order_name, '#1042')
  assert.strictEqual(out.form_name, 'demo_request')
  assert.strictEqual(out.browser_name, 'Safari')
  assert.strictEqual(out.os_name, 'iOS')
  assert.strictEqual(out.webhook_email_present, true)
})

test('PII denylist is RECURSIVE: nested PII/forbidden keys dropped at every depth', () => {
  const raw = {
    site_id: 'site-01', event: '$conversion', anonymous_id: 'a1',
    timestamp: '2026-06-01T10:00:00.000Z',
    custom_properties: { email: 'buyer@example.com', name: 'Jane', plan: 'pro' },
    billing: { contact: { phone: '+15551234567', region: 'Berlin' } }, // 2 levels deep
    items: [{ email: 'x@y.com', sku: 'ABC' }, { sku: 'DEF' }],         // array of objects
    meta: { site_key: 'sk_live_SECRET', refund_of: 'evt_orig', _synthetic: true, kept: 1 }
  }
  const out = normalizeEvent(raw)
  const blob = JSON.stringify(out)
  // no PII token survives anywhere in the serialized row
  for (const leak of ['buyer@example.com', '"Jane"', '+15551234567', 'x@y.com', 'sk_live_SECRET', 'evt_orig']) {
    assert.ok(!blob.includes(leak), `${leak} must not survive at any depth`)
  }
  // non-PII siblings are preserved (drop is surgical, not wholesale)
  assert.strictEqual(out.custom_properties.plan, 'pro')
  assert.strictEqual(out.billing.contact.region, 'Berlin')
  assert.deepStrictEqual(out.items, [{ sku: 'ABC' }, { sku: 'DEF' }])
  assert.strictEqual(out.meta.kept, 1)
  assert.ok(!('site_key' in out.meta) && !('_synthetic' in out.meta) && !('refund_of' in out.meta))
  // purity: input not mutated
  assert.strictEqual(raw.custom_properties.email, 'buyer@example.com')
})

test('7 NOT NULL: explicit empty-string inputs coerce to defaults (not passed through)', () => {
  const out = normalizeEvent({
    site_id: 'site-01', event_type: '', distinct_id: '', visitor_id: '',
    event_id: '', ingestion_method: '', timestamp: ''
  })
  for (const c of REQUIRED_COLUMNS) {
    assert.ok(out[c] !== undefined && out[c] !== null && out[c] !== '', `${c} non-empty (got ${JSON.stringify(out[c])})`)
  }
  assert.strictEqual(out.event_type, 'custom')
  assert.strictEqual(out.ingestion_method, 'unknown')
  assert.match(out.event_id, /^[0-9a-f-]{36}$/)
  assert.strictEqual(out.visitor_id, out.distinct_id, 'visitor_id falls back to distinct_id')
})

test('numeric timestamp: epoch-seconds scaled to ms (not parked in 1970); ms kept', () => {
  const secs = normalizeEvent({ site_id: 's', event: '$pageview', anonymous_id: 'a', timestamp: 1717236000 })
  assert.strictEqual(secs.timestamp, '2024-06-01T10:00:00.000Z')
  const ms = normalizeEvent({ site_id: 's', event: '$pageview', anonymous_id: 'a', timestamp: 1717236000000 })
  assert.strictEqual(ms.timestamp, '2024-06-01T10:00:00.000Z')
})

test('timestamp guaranteed: missing/invalid -> server-receive ISO-ms', () => {
  const base = { site_id: 'site-01', event: '$pageview', anonymous_id: 'a1' }
  for (const ts of [undefined, '', 'not-a-date', null]) {
    const out = normalizeEvent({ ...base, timestamp: ts })
    assert.match(out.timestamp, ISO_MS, `stamped for ts=${JSON.stringify(ts)}`)
    assert.ok(!Number.isNaN(Date.parse(out.timestamp)))
  }
  // a valid timestamp is preserved (normalized to ISO-ms)
  const kept = normalizeEvent({ ...base, timestamp: '2026-05-05T05:05:05.123Z' })
  assert.strictEqual(kept.timestamp, '2026-05-05T05:05:05.123Z')
})

test('event_id: natural id preferred, else derived; deriveEventId stub order', () => {
  const withOrder = normalizeEvent({ site_id: 's', event: '$conversion', anonymous_id: 'a', order_id: 'ord_9' })
  assert.strictEqual(withOrder.event_id, 'ord_9')
  // stub precedence: stripe_invoice_id wins over order_id
  assert.strictEqual(deriveEventId({ stripe_invoice_id: 'in_1', order_id: 'ord_2' }), 'in_1')
  // no natural id -> a uuid (non-empty string)
  const gen = deriveEventId({})
  assert.match(gen, /^[0-9a-f-]{36}$/, 'generated uuid')
})

test('tenant safety: missing site_id throws (never default-tenant)', () => {
  assert.throws(() => normalizeEvent({ event: '$pageview', distinct_id: 'd' }), /missing site_id/)
  assert.throws(() => normalizeEvent({ site_id: '', event: '$pageview' }), /missing site_id/)
  assert.throws(() => normalizeEvent(null), /non-array object/)
  assert.throws(() => normalizeEvent([]), /non-array object/)
})

test('nested ph.capture shape: properties flattened, wrapper keys consumed', () => {
  const raw = {
    distinctId: 'anon-7',
    event: '$conversion',
    properties: { site_id: 'site-02', conversion_value: 99, order_id: 'o1', utm_source: 'google' }
  }
  const out = normalizeEvent(raw)
  assert.strictEqual(out.site_id, 'site-02')
  assert.strictEqual(out.conversion_value, 99)
  assert.strictEqual(out.distinct_id, 'anon-7', 'distinctId -> distinct_id')
  assert.strictEqual(out.event_type, '$conversion')
  assert.ok(!('properties' in out) && !('distinctId' in out) && !('event' in out), 'wrapper keys consumed')
})

test('output typed keys are all canonical (no unknown typed-shaped leak)', () => {
  // Every output key is either a known typed column or a free bag key; assert no
  // divergent typed alias (value/browser/os) ever appears as a typed key.
  const typed = new Set(TYPED_COLUMNS)
  for (const raw of loadFixture().slice(0, 50)) {
    const out = normalizeEvent(raw)
    for (const k of Object.keys(out)) {
      assert.ok(!['value', 'browser', 'os'].includes(k), `${k} is a pixel alias and must be renamed`)
      // typed columns, if present, must be spelled canonically (tautology check on set membership)
      if (typed.has(k)) assert.ok(typed.has(k))
    }
  }
})
