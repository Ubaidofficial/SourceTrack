import test from 'node:test'
import assert from 'node:assert'
import { resolveCapiEventId } from '../lib/capi-event-id.js'

test('client-supplied event_id wins (browser↔server dedup) and is sanitized', () => {
  assert.strictEqual(resolveCapiEventId({ event_id: 'evt-123' }, 'site1', 'purchase'), 'evt-123')
  // order_id present but client event_id still takes priority
  assert.strictEqual(resolveCapiEventId({ event_id: 'shared', order_id: 'o1' }, 'site1', 'purchase'), 'shared')
  // sanitization strips disallowed chars
  assert.strictEqual(resolveCapiEventId({ event_id: 'a b/c<>:1' }, 'site1', 'purchase'), 'abc:1')
})

test('falls back to a deterministic order-based id (stable across retries)', () => {
  const a = resolveCapiEventId({ order_id: 'o9' }, 'site1', 'purchase')
  const b = resolveCapiEventId({ orderId: 'o9' }, 'site1', 'purchase')
  assert.strictEqual(a, 'site1:o9:purchase')
  assert.strictEqual(b, 'site1:o9:purchase')   // same conversion → same id
  assert.strictEqual(resolveCapiEventId({ order_id: 'o9' }, 'site1', undefined), 'site1:o9:conversion')
})

test('returns null for anonymous conversions (no shared key) — status quo, no forced dedup', () => {
  assert.strictEqual(resolveCapiEventId({}, 'site1', 'form'), null)
  assert.strictEqual(resolveCapiEventId({ event_id: '   ' }, 'site1', 'form'), null)
})
