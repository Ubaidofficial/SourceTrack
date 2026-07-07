// Phase 2a — createBatcher() tests. Mock transport (no real POST, no token).

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import { createBatcher } from '../batch.js'

const linesOf = (gz) => gunzipSync(gz).toString('utf8').trim().split('\n')

test('flushes at N events', async () => {
  const calls = []
  const transport = async (payload, meta) => { calls.push({ payload, meta }) }
  const b = createBatcher({ transport, flushAt: 3, flushInterval: 0 })

  await b.enqueue({ event_id: 'a' })
  await b.enqueue({ event_id: 'b' })
  assert.strictEqual(calls.length, 0, 'no flush before N')
  await b.enqueue({ event_id: 'c' }) // hits N=3 -> flush
  assert.strictEqual(calls.length, 1, 'flushed at N')
  assert.strictEqual(calls[0].meta.count, 3)
  assert.deepStrictEqual(linesOf(calls[0].payload).map((l) => JSON.parse(l).event_id), ['a', 'b', 'c'])
  await b.stop()
})

test('flushes at T ms (timer) when below N', async () => {
  const calls = []
  const transport = async (payload, meta) => { calls.push(meta) }
  const b = createBatcher({ transport, flushAt: 1000, flushInterval: 25 })

  await b.enqueue({ event_id: 'x' })
  assert.strictEqual(calls.length, 0, 'not flushed immediately (1 < 1000)')
  await new Promise((r) => setTimeout(r, 70))
  assert.strictEqual(calls.length, 1, 'flushed by timer')
  assert.strictEqual(calls[0].count, 1)
  await b.stop()
})

test('flush() on empty buffer is a no-op', async () => {
  let n = 0
  const b = createBatcher({ transport: async () => { n++ }, flushAt: 10, flushInterval: 0 })
  await b.flush()
  assert.strictEqual(n, 0)
  await b.stop()
})

test('stop() flushes the remaining partial batch', async () => {
  const calls = []
  const b = createBatcher({ transport: async (p, m) => calls.push(m), flushAt: 100, flushInterval: 0 })
  await b.enqueue({ event_id: '1' })
  await b.enqueue({ event_id: '2' })
  assert.strictEqual(calls.length, 0)
  await b.stop()
  assert.strictEqual(calls.length, 1, 'stop drains buffer')
  assert.strictEqual(calls[0].count, 2)
})

test('transport throwing: flush rejects and onError fires (no silent re-queue)', async () => {
  const errs = []
  const transport = async () => { throw new Error('boom-429') }
  const b = createBatcher({ transport, flushAt: 1, flushInterval: 0, onError: (e, batch) => errs.push({ e, batch }) })
  await assert.rejects(() => b.enqueue({ event_id: 'z' }), /boom-429/)
  assert.strictEqual(errs.length, 1)
  assert.strictEqual(errs[0].batch.length, 1)
  assert.strictEqual(b.size(), 0, 'batch was not re-queued')
  await b.stop().catch(() => {})
})

test('one failed batch does NOT poison the chain — later batches still flush', async () => {
  let n = 0
  const sent = []
  const errs = []
  const transport = async (payload, meta) => {
    n++
    if (n === 1) throw new Error('boom-transient') // first batch fails
    sent.push(meta.count)
  }
  const b = createBatcher({ transport, flushAt: 1, flushInterval: 0, onError: (e) => errs.push(e) })

  await assert.rejects(() => b.enqueue({ event_id: 'a' }), /boom-transient/) // batch 1 fails
  // subsequent batches must still be delivered (chain recovered)
  await b.enqueue({ event_id: 'b' })
  await b.enqueue({ event_id: 'c' })
  assert.strictEqual(n, 3, 'transport called for all three batches')
  assert.deepStrictEqual(sent, [1, 1], 'batches 2 and 3 delivered after the failure')
  assert.strictEqual(errs.length, 1, 'onError fired once, for the failed batch only')
  await b.stop()
})

test('gzip integrity: payload round-trips to the enqueued NDJSON', async () => {
  let captured
  const b = createBatcher({ transport: async (p) => { captured = p }, flushAt: 2, flushInterval: 0 })
  await b.enqueue({ event_id: 'p', conversion_value: 1 })
  await b.enqueue({ event_id: 'q', conversion_value: -1 })
  const lines = linesOf(captured)
  assert.strictEqual(lines.length, 2)
  assert.strictEqual(JSON.parse(lines[1]).conversion_value, -1)
  await b.stop()
})

test('config mirrors injected thresholds', () => {
  const b = createBatcher({ transport: async () => {}, flushAt: 7, flushInterval: 1234 })
  assert.deepStrictEqual(b.config, { flushAt: 7, flushInterval: 1234, gzip: true })
  b.stop()
})
