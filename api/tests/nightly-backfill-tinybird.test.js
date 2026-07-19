// runBackfill (--backfill-site + --days=N) conversion read cut over to Tinybird —
// the ONLY path that can reach a conversion older than the 24h cron window (wave1
// $444.44, 2026-07-09). TOKEN-FREE, NO network on the served path.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.invalid.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const {
  fetchBackfillConversions, conversionPipeWindow, processConversion,
  mapConversionPipeRow, __setNightlyReadDeps, __resetNightlyReadDeps
} = await import('../jobs/nightly-attribution.js')

const SITE = { id: 'site-eb7f68c3', site_key: 'sk_test', attribution_window_days: 30 }

const wave1PipeRow = {
  uuid: 'wave1_454a720e', distinct_id: 'anon-buyer-9', timestamp: '2026-07-09T12:00:00Z',
  conversion_type: 'purchase', conversion_value: 444.44, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_1', occurred_at: '2026-07-09T12:00:00Z',
  stripe_event_type: 'checkout.session.completed', provider: 'stripe'
}
// row[0..13] → conversion object, exactly as the runBackfill loop does.
function rowToConv(row) {
  return {
    uuid: row[0], distinct_id: row[1], timestamp: row[2], conversion_type: row[3],
    conversion_value: row[4], external_event_id: row[5], webhook_customer_id: row[6],
    stripe_subscription_id: row[7], stripe_invoice_id: row[8], currency: row[9],
    provider_event_id: row[10], occurred_at: row[11], stripe_event_type: row[12], provider: row[13]
  }
}

// ── 🔴 backfill reads nightly_conversions_by_site (not PostHog) and attributes wave1

test('🔴 backfill READ → nightly_conversions_by_site serves wave1, which then attributes', async (t) => {
  t.after(__resetNightlyReadDeps)
  const calls = []
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => {
      calls.push({ pipe, params })
      if (pipe === 'nightly_conversions_by_site') return [wave1PipeRow]
      if (pipe === 'pageviews_by_visitors') return [] // wave1 is a synthetic canary — no journey
      return null
    }
  })
  const { rows, served, fellBack } = await fetchBackfillConversions({ site: SITE, days: 30, hogqlQuery: 'UNUSED' })
  assert.equal(served, true)
  assert.equal(fellBack, false)
  assert.ok(calls.some(c => c.pipe === 'nightly_conversions_by_site'), 'read the pipe, not PostHog')
  assert.equal(rows.length, 1)

  // …and the served row attributes end-to-end.
  const record = await processConversion(SITE, rowToConv(rows[0]))
  assert.equal(record.conversion_event_id, 'wave1_454a720e')
  assert.equal(record.conversion_value, 444.44)
})

// ── the --days=N window is honoured (NOT the 24h/90d cron lookback) ──────────

test('the backfill window is --days=N, not the cron lookback', async (t) => {
  t.after(__resetNightlyReadDeps)
  const cap = {}
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => { if (pipe === 'nightly_conversions_by_site') { cap.params = params } ; return [] }
  })
  await fetchBackfillConversions({ site: SITE, days: 45, hogqlQuery: 'UNUSED' })
  const fromMs = new Date(cap.params.date_from.replace(' ', 'T') + 'Z').getTime()
  const agoDays = (Date.now() - fromMs) / 86_400_000
  assert.ok(agoDays > 44.5 && agoDays < 45.5, `date_from ≈ 45 days ago, got ${agoDays.toFixed(2)}d (would be ~1 or ~90 if it used the cron lookback)`)
})

test('conversionPipeWindow honours the caller days (1d vs 90d spread)', () => {
  const one = new Date(conversionPipeWindow(1).from.replace(' ', 'T') + 'Z').getTime()
  const ninety = new Date(conversionPipeWindow(90).from.replace(' ', 'T') + 'Z').getTime()
  const spreadDays = (one - ninety) / 86_400_000
  assert.ok(spreadDays > 88 && spreadDays < 90, `90d window starts ~89d earlier than 1d, got ${spreadDays.toFixed(2)}d`)
})

// ── silent-fallback visibility ───────────────────────────────────────────────
// (The reprocess pipe-exclusion + B0 fail-closed path is covered in
// api/tests/nightly-reprocess-fail-closed.test.js. The parallel `_mv` suffix path was
// deleted in D2·B2 — hardcoded synthetic test site, no producer, zero rows — so its test
// went with it.)

test('backfill fell-back signal is set when the pipe returns null (silent dead-store fallback is VISIBLE)', async (t) => {
  t.after(__resetNightlyReadDeps)
  __setNightlyReadDeps({ tbReadEnabled: () => true, queryPipe: async () => null })
  // hogqlQuery is a harmless SELECT; the PostHog fallback hits the invalid host and throws —
  // proving fell-back is surfaced (and not silently reported as an empty backfill).
  await assert.rejects(fetchBackfillConversions({ site: SITE, days: 30, hogqlQuery: 'SELECT 1' }))
})
