// Incident 2026-07-14: /api/track returned HTTP 200 and persisted NOTHING, with ZERO write-path log
// lines — a silent drop was INVISIBLE. Two surfaces were reproduced against the real batcher
// (scratchpad/repro-silent-drop.mjs): a transport POST failure swallowed by the producer's
// `.catch(()=>{})`, and a partial batch (< flushAt) lost when the container recycles before the
// unref'd timer / fire-and-forget shutdown flush drains. Both produced no log.
//
// STEP 1 (observability, ships first): the batcher now traces every event through its lifecycle —
// accepted (buffered) → delivered (POST ok) | dropped (POST failed) | draining (flushed on shutdown).
// These tests assert the trail is COMPLETE and the once-silent drops now emit a line. They inject a
// capturing `observe` (no console scraping) so the assertion is on the structured signal itself.

import test from 'node:test'
import assert from 'node:assert'
import { createBatcher } from '../batch.js'

const mkEv = (id) => ({ site_id: 's1', event_id: id, event_type: '$pageview' })
function capturing () {
  const calls = []
  const observe = (stage, events, extra) => calls.push({ stage, ids: events.map((e) => e.event_id), reason: extra && extra.reason })
  return { observe, calls }
}

test('every enqueued event emits an accepted line; a successful flush emits delivered covering them', async () => {
  const { observe, calls } = capturing()
  const got = []
  const transport = async (_p, meta) => { got.push(meta.count) }
  const b = createBatcher({ transport, flushAt: 3, flushInterval: 0, gzipPayload: false, observe })
  b.enqueue(mkEv('a')); b.enqueue(mkEv('b')); await b.enqueue(mkEv('c')) // hits 3 → flush
  assert.deepStrictEqual(calls.filter((c) => c.stage === 'accepted').flatMap((c) => c.ids), ['a', 'b', 'c'])
  assert.deepStrictEqual(calls.filter((c) => c.stage === 'delivered').flatMap((c) => c.ids).sort(), ['a', 'b', 'c'])
  assert.deepStrictEqual(got, [3], 'the transport received all 3')
})

test('a transport failure emits a dropped line with the event_ids + reason (the silent drop, now visible)', async () => {
  const { observe, calls } = capturing()
  const transport = async () => { throw new Error('Tinybird 503 Service Unavailable') }
  const b = createBatcher({ transport, flushAt: 2, flushInterval: 0, gzipPayload: false, observe })
  b.enqueue(mkEv('x'))
  await assert.rejects(() => b.enqueue(mkEv('y')), /503/, 'the flush rejects to the caller')
  const dropped = calls.filter((c) => c.stage === 'dropped')
  assert.strictEqual(dropped.length, 1)
  assert.deepStrictEqual(dropped[0].ids.sort(), ['x', 'y'])
  assert.match(dropped[0].reason, /503/)
  assert.strictEqual(calls.filter((c) => c.stage === 'delivered').length, 0, 'a failed batch is NOT reported delivered')
})

test('a partial batch (< flushAt) emits a draining line at shutdown so tail loss is diagnosable', async () => {
  const { observe, calls } = capturing()
  let release
  const transport = () => new Promise((r) => { release = r }) // hangs — simulates a recycle mid-POST
  const b = createBatcher({ transport, flushAt: 20, flushInterval: 10000, gzipPayload: false, observe })
  b.enqueue(mkEv('t1')); b.enqueue(mkEv('t2'))
  b.stop() // partial batch of 2 → draining, then flush (transport hangs)
  const draining = calls.filter((c) => c.stage === 'draining')
  assert.strictEqual(draining.length, 1)
  assert.deepStrictEqual(draining[0].ids, ['t1', 't2'])
  assert.strictEqual(draining[0].reason, 'shutdown')
  // Nothing delivered yet: if the container is SIGKILLed now, t1/t2 are lost — but the draining line
  // (no matching delivered) makes that diagnosable instead of invisible. (STEP 2 fixes the loss.)
  assert.strictEqual(calls.filter((c) => c.stage === 'delivered').length, 0)
  if (release) release()
})

test('INVARIANT: every accepted event_id is accounted for by delivered | dropped | draining', async () => {
  const { observe, calls } = capturing()
  const transport = async () => {} // success
  const b = createBatcher({ transport, flushAt: 2, flushInterval: 0, gzipPayload: false, observe })
  b.enqueue(mkEv('p')); await b.enqueue(mkEv('q')) // threshold flush → delivered
  b.enqueue(mkEv('r')); await b.stop()             // r drained on shutdown → delivered
  const accepted = new Set(calls.filter((c) => c.stage === 'accepted').flatMap((c) => c.ids))
  const accounted = new Set(calls.filter((c) => ['delivered', 'dropped', 'draining'].includes(c.stage)).flatMap((c) => c.ids))
  assert.ok(accepted.size > 0)
  for (const id of accepted) assert.ok(accounted.has(id), `accepted event ${id} has a lifecycle-terminal line (no silent loss)`)
})

test('the default observer never throws the batcher (malformed events, missing ids)', async () => {
  // defaultObserve logs to console; here we only assert it does not blow up the ingest path.
  const transport = async () => {}
  const b = createBatcher({ transport, flushAt: 1, flushInterval: 0, gzipPayload: false }) // default observe
  await assert.doesNotReject(() => b.enqueue({ event_type: '$pageview' })) // no event_id / site_id
})
