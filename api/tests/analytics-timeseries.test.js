import test from 'node:test'
import assert from 'node:assert'
import { bucketUniqueVisitors } from '../lib/utils.js'

// Regression guard for the /summary "visitors over time" series. Must count
// DISTINCT visitors active per bucket — a returning visitor appears in EACH
// bucket they were active in (not only their first, which was the bug).

const dayOf = (ts) => ts.slice(0, 10) // date portion of an ISO timestamp

test('counts a multi-day visitor in every bucket they were active in', () => {
  const rows = [
    { anonymous_id: 'v1', timestamp: '2026-06-19T10:00:00Z' },
    { anonymous_id: 'v1', timestamp: '2026-06-20T09:00:00Z' },
    { anonymous_id: 'v2', timestamp: '2026-06-20T11:00:00Z' },
  ]
  assert.deepStrictEqual(bucketUniqueVisitors(rows, dayOf), {
    '2026-06-19': 1,
    '2026-06-20': 2,
  })
})

test('dedups the same visitor within a bucket', () => {
  const rows = [
    { anonymous_id: 'v1', timestamp: '2026-06-19T08:00:00Z' },
    { anonymous_id: 'v1', timestamp: '2026-06-19T18:00:00Z' },
  ]
  assert.deepStrictEqual(bucketUniqueVisitors(rows, dayOf), { '2026-06-19': 1 })
})

test('skips rows with missing/empty anonymous_id', () => {
  const rows = [
    { anonymous_id: 'v1', timestamp: '2026-06-19T08:00:00Z' },
    { anonymous_id: null, timestamp: '2026-06-19T09:00:00Z' },
    { anonymous_id: '', timestamp: '2026-06-19T10:00:00Z' },
    { timestamp: '2026-06-19T11:00:00Z' },
  ]
  assert.deepStrictEqual(bucketUniqueVisitors(rows, dayOf), { '2026-06-19': 1 })
})

test('empty input yields an empty bucket map (no crash)', () => {
  assert.deepStrictEqual(bucketUniqueVisitors([], dayOf), {})
})
