import test from 'node:test'
import assert from 'node:assert'
import { buildGdprExport } from '../routes/gdpr.js'

// In-memory Supabase double that honors BOTH column projection (select) and the
// eq() filter — so this test genuinely exercises secret-column exclusion AND
// in-code tenant scoping (cross-tenant rows must be filtered out).
function makeDb(seed) {
  return {
    from(name) {
      let projection = '*'
      const filters = []
      const b = {
        select(cols) { projection = cols; return b },
        eq(col, val) { filters.push([col, val]); return b },
        then(resolve) {
          let rows = (seed[name] || []).slice()
          for (const [c, v] of filters) rows = rows.filter(r => r[c] === v)
          if (projection && projection.trim() !== '*') {
            const fields = projection.split(',').map(s => s.trim())
            rows = rows.map(r => Object.fromEntries(fields.map(f => [f, r[f]])))
          }
          resolve({ data: rows, error: null })
        }
      }
      return b
    }
  }
}

const SITE = { id: 'A', site_key: 'kA', company_id: 'coA' }

function seed() {
  return {
    attributed_conversions: [
      { id: 'c1', site_id: 'A', conversion_value: 100, distinct_id: 'd1' },
      { id: 'c2', site_id: 'B', conversion_value: 999, distinct_id: 'dX' } // other tenant
    ],
    lead_qualifications: [
      { id: 'l1', site_id: 'A', status: 'qualified', qualified_by: 'u1', qualified_at: '2026-06-01', notes: 'x' },
      { id: 'l2', site_id: 'B', status: 'mql', qualified_by: 'uX', qualified_at: '2026-06-02', notes: 'y' }
    ],
    site_identity_links: [
      { id: 's1', site_id: 'A', anonymous_id: 'an1', user_id: 'us1', created_at: '2026-06-01', source: 'x' },
      { id: 's2', site_id: 'B', anonymous_id: 'anX', user_id: 'usX', created_at: '2026-06-02', source: 'y' }
    ],
    gsc_performance_daily: [
      { site_key: 'kA', query: 'q', page_path: '/p', clicks: 1, impressions: 2, ctr: 0.5, position: 1, date: '2026-06-01' },
      { site_key: 'kB', query: 'other', page_path: '/o', clicks: 9, impressions: 9, ctr: 1, position: 1, date: '2026-06-01' }
    ],
    gsc_connections: [
      // includes the secret token — must be projected OUT of the export
      { site_key: 'kA', property_url: 'https://a', google_account_email: 'a@x.com', status: 'connected', last_synced_at: '2026-06-01', created_at: '2026-05-01', encrypted_refresh_token: 'SECRET_REFRESH_TOKEN_AAA' }
    ],
    capi_deliveries: [
      { site_id: 'A', platform: 'meta', event_ref: 'evt1', status: 'success', http_status: 200, error_message: null, attempt: 1, created_at: '2026-06-01' },
      { site_id: 'B', platform: 'meta', event_ref: 'evtX', status: 'success', http_status: 200, error_message: null, attempt: 1, created_at: '2026-06-01' } // other tenant
    ],
    webhook_destinations: [
      // Fixture only — deliberately NOT a real secret prefix, to keep the repo
      // secret-scanner happy while still exercising the masking logic.
      { site_key: 'kA', url: 'https://hook', active: true, created_at: '2026-06-01', secret: 'FIXTURESECRET_AAAAAA_MIDDLEPART_ZZZZ' }
    ],
    sites: [
      // includes secret columns — must be projected OUT
      { id: 'A', site_key: 'kA', name: 'A', domain: 'a.com', plan: 'growth', created_at: '2026-05-01', onboarding_completed: true, business_type: 'saas', timezone: 'UTC', data_retention_days: 90,
        api_key: 'API_KEY_SECRET', api_key_hash: 'HASH', encrypted_stripe_webhook_secret: 'STRIPE_SECRET', meta_capi_token: 'META_SECRET', public_share_token: 'SHARE_SECRET' },
      { id: 'B', site_key: 'kB', name: 'B', domain: 'b.com', plan: 'free', created_at: '2026-05-01' }
    ],
    companies: [
      { id: 'coA', name: 'Co A', created_at: '2026-05-01' },
      { id: 'coB', name: 'Co B', created_at: '2026-05-01' }
    ],
    company_members: [
      { id: 'm1', company_id: 'coA', user_id: 'u1', role: 'admin', created_at: '2026-05-01' },
      { id: 'm2', company_id: 'coB', user_id: 'uX', role: 'admin', created_at: '2026-05-01' }
    ]
  }
}

test('buildGdprExport — bundle shape matches the locked table list', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE, { now: () => new Date('2026-06-28T00:00:00Z') })
  assert.strictEqual(out.site_key, 'kA')
  assert.ok(out.generated_at)
  assert.deepStrictEqual(Object.keys(out.tables).sort(), [
    'attributed_conversions', 'capi_deliveries', 'companies', 'company_members', 'events',
    'gsc_connections', 'gsc_performance_daily', 'lead_qualifications',
    'site_identity_links', 'sites', 'webhook_destinations'
  ])
  // The dead-store PostHog key is gone; the events field is structured + honest.
  assert.ok(!('posthog_events' in out.tables), 'no dead-store posthog_events key')
  assert.strictEqual(out.tables.events.included, false)
  assert.strictEqual(out.tables.events.store, 'tinybird')
})

test('buildGdprExport — no field names a dead store or claims event data is retrievable', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE)
  const json = JSON.stringify(out)
  // No reference to PostHog (a dead store holding no events) anywhere in the bundle.
  assert.ok(!/posthog/i.test(json), 'no reference to the dead PostHog store')
  // No promise of retrieval when no retrieval path exists.
  assert.ok(!/available on request/i.test(json), 'must not promise retrieval that has no path')
  // The only event-data field must explicitly mark it NOT included.
  assert.strictEqual(out.tables.events.included, false, 'event data must not be marked included')
})

test('buildGdprExport — capi_deliveries included, scoped to the caller site only', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE)
  assert.strictEqual(out.tables.capi_deliveries.length, 1)
  assert.strictEqual(out.tables.capi_deliveries[0].event_ref, 'evt1')
})

test('buildGdprExport — cross-tenant rows are excluded (filtered by site in code)', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE)
  assert.deepStrictEqual(out.tables.attributed_conversions.map(r => r.id), ['c1'])
  assert.ok(out.tables.lead_qualifications.every(r => r.status === 'qualified')) // only A's row
  assert.ok(out.tables.site_identity_links.every(r => r.anonymous_id === 'an1'))
  assert.ok(out.tables.gsc_performance_daily.every(r => r.query === 'q'))
  assert.deepStrictEqual(out.tables.sites.map(r => r.id), ['A'])
  assert.deepStrictEqual(out.tables.companies.map(r => r.id), ['coA'])
  assert.deepStrictEqual(out.tables.company_members.map(r => r.user_id), ['u1'])
})

test('buildGdprExport — NO secret is ever serialized', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE)
  const json = JSON.stringify(out)
  for (const secret of [
    'SECRET_REFRESH_TOKEN_AAA', 'API_KEY_SECRET', 'HASH', 'STRIPE_SECRET',
    'META_SECRET', 'SHARE_SECRET',
    'FIXTURESECRET_AAAAAA_MIDDLEPART_ZZZZ'
  ]) {
    assert.ok(!json.includes(secret), `secret leaked into export: ${secret}`)
  }
  // gsc_connections must not even carry the token key
  assert.ok(!('encrypted_refresh_token' in out.tables.gsc_connections[0]))
  // sites must not carry api_key / encrypted_* / share token
  const siteRow = out.tables.sites[0]
  for (const k of ['api_key', 'api_key_hash', 'encrypted_stripe_webhook_secret', 'meta_capi_token', 'public_share_token']) {
    assert.ok(!(k in siteRow), `sites export leaked column: ${k}`)
  }
})

test('buildGdprExport — webhook secret is present but masked', async () => {
  const out = await buildGdprExport(makeDb(seed()), SITE)
  const dest = out.tables.webhook_destinations[0]
  assert.strictEqual(dest.url, 'https://hook')
  assert.ok(dest.secret.includes('••••••••'))
  assert.ok(!dest.secret.includes('MIDDLEPART')) // middle of the raw secret absent
})

test('buildGdprExport — no company → empty company tables', async () => {
  const out = await buildGdprExport(makeDb(seed()), { id: 'A', site_key: 'kA', company_id: null })
  assert.deepStrictEqual(out.tables.companies, [])
  assert.deepStrictEqual(out.tables.company_members, [])
})
