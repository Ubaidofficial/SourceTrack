import test from 'node:test'
import assert from 'node:assert'
import { purgeSiteRetention } from '../lib/retention-purge.js'

// In-memory Supabase-like client. Supports the exact chain the helper uses:
//   db.from(t).delete({count:'exact'}).eq(col,val).lt(col,val)  → { count, error }
// Filters are AND-ed; matching rows are removed; non-matching rows are kept.
function makeDb(tables, { failTable } = {}) {
  return {
    from(name) {
      return {
        delete() {
          const filters = []
          const builder = {
            eq(col, val) { filters.push(r => r[col] === val); return builder },
            lt(col, val) { filters.push(r => r[col] < val); return builder },
            then(resolve) {
              if (failTable === name) {
                resolve({ count: null, error: { message: 'boom' } })
                return
              }
              const arr = tables[name] || []
              const keep = []
              let count = 0
              for (const r of arr) {
                if (filters.every(f => f(r))) count++
                else keep.push(r)
              }
              tables[name] = keep
              resolve({ count, error: null })
            }
          }
          return builder
        }
      }
    }
  }
}

function seed() {
  return {
    attributed_conversions: [
      { site_id: 'idA', conversion_date: '2026-05-01' }, // A, old → purge
      { site_id: 'idA', conversion_date: '2026-06-15' }, // A, new → keep
      { site_id: 'idB', conversion_date: '2026-05-01' }  // B, old → keep (other tenant)
    ],
    gsc_performance_daily: [
      { site_key: 'keyA', date: '2026-05-15' },          // A, old → purge
      { site_key: 'keyA', date: '2026-06-10' },          // A, new → keep
      { site_key: 'keyB', date: '2026-05-15' }           // B, old → keep (other tenant)
    ],
    gsc_sync_runs: [
      { site_key: 'keyA', sync_start: '2026-05-20T00:00:00Z' }, // A, old → purge
      { site_key: 'keyA', sync_start: '2026-06-20T00:00:00Z' }, // A, new → keep
      { site_key: 'keyB', sync_start: '2026-05-20T00:00:00Z' }  // B, old → keep
    ],
    capi_deliveries: [
      { site_id: 'idA', created_at: '2026-05-10T00:00:00Z' },   // A, old → purge
      { site_id: 'idA', created_at: '2026-06-20T00:00:00Z' },   // A, new → keep
      { site_id: 'idB', created_at: '2026-05-10T00:00:00Z' }    // B, old → keep (other tenant)
    ],
    custom_events: [
      { site_id: 'idA', timestamp: '2026-05-12T00:00:00Z' },    // A, old → purge
      { site_id: 'idA', timestamp: '2026-06-18T00:00:00Z' },    // A, new → keep
      { site_id: 'idB', timestamp: '2026-05-12T00:00:00Z' }     // B, old → keep (other tenant)
    ]
  }
}

const SITE_A = { id: 'idA', site_key: 'keyA' }

test('purgeSiteRetention — purges conversions AND GSC rows older than cutoff', async () => {
  const tables = seed()
  const counts = await purgeSiteRetention(makeDb(tables), SITE_A, '2026-06-01')
  assert.deepStrictEqual(counts, {
    attributed_conversions: 1,
    gsc_performance_daily: 1,
    gsc_sync_runs: 1,
    capi_deliveries: 1,
    custom_events: 1
  })
})

test('purgeSiteRetention — keeps in-window rows and never touches other tenants', async () => {
  const tables = seed()
  await purgeSiteRetention(makeDb(tables), SITE_A, '2026-06-01')

  // A's fresh rows survive
  assert.ok(tables.attributed_conversions.some(r => r.site_id === 'idA' && r.conversion_date === '2026-06-15'))
  assert.ok(tables.gsc_performance_daily.some(r => r.site_key === 'keyA' && r.date === '2026-06-10'))
  assert.ok(tables.gsc_sync_runs.some(r => r.site_key === 'keyA' && r.sync_start === '2026-06-20T00:00:00Z'))

  assert.ok(tables.capi_deliveries.some(r => r.site_id === 'idA' && r.created_at === '2026-06-20T00:00:00Z'))
  assert.ok(tables.custom_events.some(r => r.site_id === 'idA' && r.timestamp === '2026-06-18T00:00:00Z'))

  // Tenant B is entirely untouched (no cross-tenant delete)
  assert.strictEqual(tables.attributed_conversions.filter(r => r.site_id === 'idB').length, 1)
  assert.strictEqual(tables.gsc_performance_daily.filter(r => r.site_key === 'keyB').length, 1)
  assert.strictEqual(tables.gsc_sync_runs.filter(r => r.site_key === 'keyB').length, 1)
  assert.strictEqual(tables.capi_deliveries.filter(r => r.site_id === 'idB').length, 1)
  assert.strictEqual(tables.custom_events.filter(r => r.site_id === 'idB').length, 1)
})

test('purgeSiteRetention — throws (named table) on a delete error', async () => {
  const tables = seed()
  await assert.rejects(
    () => purgeSiteRetention(makeDb(tables, { failTable: 'gsc_performance_daily' }), SITE_A, '2026-06-01'),
    /gsc_performance_daily: boom/
  )
})
