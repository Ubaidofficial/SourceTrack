// Incident 2026-07-14 Task B: an accepted event that failed to POST was destroyed by dual-write.js's
// `.catch(()=>{})` (200 already returned, gone forever, no PostHog fallback), and a container recycle
// ate the buffer tail via the fire-and-forget shutdown flush. Both reproduced on the real batcher
// (scratchpad/repro-silent-drop.mjs, repro-taskB.mjs).
//
// FIX: the surrender point in deliver() now DEAD-LETTERS (durable capture + alert) instead of losing;
// retryable-exhausted (429/5xx) gets a BOUNDED re-queue first; permanent 4xx never re-queues; and a
// bounded AWAITED drain() delivers the tail on shutdown, dead-lettering anything not confirmed by the
// deadline. Invariant: every accepted event ends delivered OR dead-lettered — never silently lost.

import test from 'node:test'
import assert from 'node:assert'
import { createBatcher } from '../batch.js'

const ev = (id) => ({ site_id: 's1', event_id: id, event_type: '$conversion' })
function cap () {
  const c = { dl: [], obs: [] }
  c.deadLetter = (events, meta) => c.dl.push({ ids: events.map((e) => e.event_id), meta })
  c.observe = (stage, events, extra) => c.obs.push({ stage, ids: events.map((e) => e.event_id), reason: extra && extra.reason })
  c.dlIds = () => c.dl.flatMap((d) => d.ids)
  return c
}
const err = (msg, retryable) => { const e = new Error(msg); e.retryable = retryable; return e }

test('B1 permanent 4xx → dead-lettered immediately, NEVER re-queued', async () => {
  const c = cap()
  const b = createBatcher({ transport: async () => { throw err('Tinybird responded 400', false) }, flushAt: 1, flushInterval: 0, gzipPayload: false, deadLetter: c.deadLetter, observe: c.observe })
  await b.enqueue(ev('perm-1')).catch(() => {})
  assert.deepStrictEqual(c.dlIds(), ['perm-1'], 'the permanent-4xx event is dead-lettered')
  assert.strictEqual(c.dl[0].meta.disposition, 'permanent')
  assert.strictEqual(c.obs.filter((o) => o.stage === 'requeued').length, 0, 'a permanent 4xx is never re-queued')
})

test('B1 retryable 5xx → bounded re-queue (maxRequeue) then dead-lettered', async () => {
  const c = cap()
  const b = createBatcher({ transport: async () => { throw err('Tinybird 503', true) }, flushAt: 1, flushInterval: 0, gzipPayload: false, deadLetter: c.deadLetter, observe: c.observe, maxRequeue: 2 })
  await b.enqueue(ev('retry-1')).catch(() => {}) // attempt 0 → re-queue (1)
  assert.strictEqual(c.dlIds().length, 0, 'not dead-lettered yet — being re-queued')
  await b.flush().catch(() => {})                // attempt 1 → re-queue (2)
  assert.strictEqual(c.dlIds().length, 0)
  await b.flush().catch(() => {})                // attempt 2 → cap reached → dead-letter
  assert.deepStrictEqual(c.dlIds(), ['retry-1'])
  assert.strictEqual(c.dl[0].meta.disposition, 'requeue-exhausted')
  assert.strictEqual(c.obs.filter((o) => o.stage === 'requeued').length, 2, 'exactly maxRequeue re-queues')
})

test('B2 awaited drain delivers a partial batch (< flushAt) that the old fire-and-forget lost', async () => {
  const c = cap()
  const delivered = []
  const b = createBatcher({ transport: async (_p, m) => { delivered.push(m.count) }, flushAt: 20, flushInterval: 10000, gzipPayload: false, deadLetter: c.deadLetter, observe: c.observe })
  b.enqueue(ev('d1')); b.enqueue(ev('d2'))
  const res = await b.drain(2000)
  assert.deepStrictEqual(res, { drained: true, remaining: 0 })
  assert.deepStrictEqual(delivered, [2], 'the partial batch was delivered before "exit"')
  assert.strictEqual(c.dlIds().length, 0, 'nothing dead-lettered — it was delivered')
})

test('B2 drain deadline exceeded → in-flight/residual DEAD-LETTERED, never silently lost', async () => {
  const c = cap()
  const b = createBatcher({ transport: () => new Promise(() => {}), flushAt: 20, flushInterval: 10000, gzipPayload: false, deadLetter: c.deadLetter, observe: c.observe }) // hangs
  b.enqueue(ev('s1')); b.enqueue(ev('s2'))
  const res = await b.drain(40)
  assert.strictEqual(res.drained, false)
  assert.deepStrictEqual(c.dlIds().sort(), ['s1', 's2'], 'the in-flight batch is dead-lettered on timeout')
  assert.match(c.dl[0].meta.reason, /deadline=40ms/)
})

test('INVARIANT: across delivered + re-queued-recovered + failed, every accepted id is delivered OR dead-lettered', async () => {
  const c = cap()
  const delivered = []
  let calls = 0
  // First POST fails retryably, second (the re-queued flush) succeeds.
  const transport = async (_p, m) => { calls++; if (calls === 1) throw err('503', true); delivered.push(m.count) }
  const b = createBatcher({ transport, flushAt: 1, flushInterval: 0, gzipPayload: false, deadLetter: c.deadLetter, observe: c.observe, maxRequeue: 3 })
  await b.enqueue(ev('x')).catch(() => {}) // fail → re-queue
  await b.flush().catch(() => {})           // succeeds → delivered
  const accepted = new Set(c.obs.filter((o) => o.stage === 'accepted').flatMap((o) => o.ids))
  const delivered_ids = new Set(c.obs.filter((o) => o.stage === 'delivered').flatMap((o) => o.ids))
  const dead = new Set(c.dlIds())
  for (const id of accepted) assert.ok(delivered_ids.has(id) || dead.has(id), `accepted ${id} must be delivered or dead-lettered`)
  assert.ok(delivered_ids.has('x') && !dead.has('x'), 'the re-queued event recovered — delivered, not dead-lettered')
})
