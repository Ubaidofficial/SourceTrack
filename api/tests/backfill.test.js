import test from 'node:test'
import assert from 'node:assert'
import { clampDays, classifyJourney, applyBackfill } from '../lib/backfill.js'

// In-memory store that simulates BOTH unique indexes on attributed_conversions:
//   (site_id, conversion_event_id)            → existing row UPDATEs ('upserted')
//   partial (site_id, external_event_id)      → conflict for a DIFFERENT
//     conversion_event_id returns 'skipped_duplicate' (mirrors the real adapter
//     catching Postgres 23505), never throws.
function makeStore() {
  const byPk = new Map()   // site_id|conversion_event_id -> record
  const byExt = new Map()  // site_id|external_event_id   -> pk
  return {
    get size() { return byPk.size },
    async upsert(r) {
      const pk = `${r.site_id}|${r.conversion_event_id}`
      if (byPk.has(pk)) { byPk.set(pk, r); return 'upserted' }          // UPDATE
      if (r.external_event_id != null) {
        const ek = `${r.site_id}|${r.external_event_id}`
        if (byExt.has(ek) && byExt.get(ek) !== pk) return 'skipped_duplicate' // 23505
        byExt.set(ek, pk)
      }
      byPk.set(pk, r); return 'upserted'                               // INSERT
    }
  }
}

const SITE = 'site-eb7f68c3'
const recs = (n) => Array.from({ length: n }, (_, i) => ({
  site_id: SITE, conversion_event_id: `uuid-${i}`, external_event_id: null,
  first_touch_timestamp: '2026-06-20T00:00:00Z'
}))

test('writes N conversions on first run', async () => {
  const store = makeStore()
  const r = await applyBackfill(recs(5), { dryRun: false, store })
  assert.strictEqual(r.upserted, 5)
  assert.strictEqual(store.size, 5)
})

test('IDEMPOTENCY: running twice leaves the row count unchanged', async () => {
  const store = makeStore()
  const records = recs(5)
  await applyBackfill(records, { dryRun: false, store })
  const sizeAfterFirst = store.size
  const second = await applyBackfill(records, { dryRun: false, store })
  assert.strictEqual(sizeAfterFirst, 5)
  assert.strictEqual(store.size, 5, 'second run must not add rows')        // key proof
  assert.strictEqual(second.upserted, 5)                                   // all UPDATEs, no inserts
})

test('dry-run writes nothing', async () => {
  const store = makeStore()
  const r = await applyBackfill(recs(5), { dryRun: true, store })
  assert.strictEqual(r.wouldWrite, 5)
  assert.strictEqual(r.upserted, 0)
  assert.strictEqual(store.size, 0)
})

test('dedup: same external_event_id, different conversion_event_id → skipped, not duplicated', async () => {
  const store = makeStore()
  const a = { site_id: SITE, conversion_event_id: 'u1', external_event_id: 'X', first_touch_timestamp: '2026-06-20T00:00:00Z' }
  const b = { site_id: SITE, conversion_event_id: 'u2', external_event_id: 'X', first_touch_timestamp: '2026-06-20T00:00:00Z' }
  const r = await applyBackfill([a, b], { dryRun: false, store })
  assert.strictEqual(r.upserted, 1)
  assert.strictEqual(r.skippedDuplicate, 1)
  assert.strictEqual(store.size, 1)
  // re-run is still idempotent + still dedups
  const r2 = await applyBackfill([a, b], { dryRun: false, store })
  assert.strictEqual(store.size, 1)
  assert.strictEqual(r2.skippedDuplicate, 1)
})

test('classifyJourney: complete / possibly_truncated / no_journey', () => {
  const conv = '2026-06-25T00:00:00Z'  // boundary at 2026-05-26 for a 30d window
  assert.strictEqual(classifyJourney({ first_touch_timestamp: '2026-06-20T00:00:00Z' }, conv, 30), 'complete')
  assert.strictEqual(classifyJourney({ first_touch_timestamp: '2026-05-26T00:00:00Z' }, conv, 30), 'possibly_truncated')
  assert.strictEqual(classifyJourney({ first_touch_timestamp: '2026-05-10T00:00:00Z' }, conv, 30), 'possibly_truncated')
  assert.strictEqual(classifyJourney({ first_touch_timestamp: null }, conv, 30), 'no_journey')
  assert.strictEqual(classifyJourney({}, conv, 30), 'no_journey')
})

test('clampDays: default 90, clamp to [1,90]', () => {
  assert.strictEqual(clampDays(undefined), 90)
  assert.strictEqual(clampDays('abc'), 90)
  assert.strictEqual(clampDays('200'), 90)
  assert.strictEqual(clampDays('0'), 1)
  assert.strictEqual(clampDays('45'), 45)
})
