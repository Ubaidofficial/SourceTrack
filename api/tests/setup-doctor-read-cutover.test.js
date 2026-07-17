// Phase-1 read-cutover Wave-2 — setup-doctor.js dispatch/fallback tests.
// All 5 reads are now wired Tinybird-primary + HogQL fallback: the 2 pure
// health/count reads (doctor_pageviews_30d, doctor_token_verify) plus the 3
// money-rail reads (doctor_last_conversion, doctor_last_click_id,
// doctor_paid_params_count). The wiring is INERT until the pipes are
// allowlisted; the money-rail pipes additionally require staging parity before
// any prod allowlist flip. Proves: fallback (flag off / pipe null = HogQL,
// unchanged), dispatch (flag on = Tinybird, mapped to the consumer shape),
// fail-closed (FORCE_READ + null throws), and no-token skips token_verify.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../lib/setup-doctor.js')
const { getSetupDiagnostics, __setSetupDoctorReadDeps, __resetSetupDoctorReadDeps } = mod

const THIRTY_H_AGO = new Date(Date.now() - 30 * 3600 * 1000).toISOString()
const site = () => ({
  id: 'site-00',
  domain: 'ex.com',
  last_seen_at: THIRTY_H_AGO,
  onboarding_state: { last_event_domain: 'ex.com', last_event_name: '$pageview' }
})

// HogQL stub: positional rows per queryName. token=5 (matched) so dispatch can
// distinguish HogQL(5) from a Tinybird(0, not-matched) result.
function hogStub (calls, { pageviews = 100, token = 5 } = {}) {
  return async (_sql, name) => {
    calls.push(name)
    switch (name) {
      case 'doctor_pageviews_30d': return [[pageviews]]
      case 'doctor_token_verify': return [[token]]
      case 'doctor_last_conversion': return [['2026-07-01T00:00:00Z', 'purchase']]
      case 'doctor_last_click_id': return [['gcx', '', '', '', '', '', '', '', '', '', '', '', '', '']]
      case 'doctor_paid_params_count': return [[4]]
      default: return [[0]]
    }
  }
}
function tbStub (calls, rowsByPipe /* object | null */) {
  return async (pipe, params) => {
    calls.push({ pipe, params })
    if (rowsByPipe === null) return null
    return rowsByPipe[pipe] ?? null
  }
}

test('setup-doctor — D1b: pipe null (no FORCE_READ) -> each read degrades to not-detected, HogQL NOT called', async () => {
  // D1b deleted the HogQL fallback. A null pipe throws; each read's `.catch` (no FORCE_READ) degrades
  // to null WITHOUT reading dead-store HogQL, so the diagnostic fields show their not-detected defaults.
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({ queryTinybird: tbStub(tb, null), queryHog: async () => { hog.push('called'); throw new Error('HogQL called — D1b deleted the fallback') } })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' })
    assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
    assert.ok(tb.length >= 1, 'reads attempted Tinybird first')
    assert.strictEqual(r.conversion_setup.detected, false, 'null last_conversion degrades to not-detected')
    assert.strictEqual(r.paid_tracking.parameters_detected, false, 'null paid-params degrades to not-detected')
    assert.strictEqual(r.paid_tracking.click_id_seen, false, 'null click-id degrades to not-seen')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — DISPATCH: flag on -> Tinybird for all 5 reads (incl. money-rail), HogQL bypassed', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 100 }],
      doctor_token_verify: [{ token_verify_count: 0 }], // NOT matched via Tinybird
      // Money-rail pipes served from Tinybird — named rows mapped to the
      // consumer's positional/nested shapes.
      doctor_last_conversion: [{ timestamp: '2026-07-10T00:00:00Z', conversion_type: 'signup' }],
      doctor_last_click_id: [{ gclid: '', gbraid: '', wbraid: '', fbclid: 'fbx', msclkid: '', ttclid: '', twclid: '', li_fat_id: '', li_fatid: '', dclid: '', snapclid: '', pclid: '', sccid: '', ko_click_id: '' }],
      doctor_paid_params_count: [{ paid_params_count: 9 }]
    }),
    queryHog: hogStub(hog, { token: 5 }) // HogQL WOULD differ — must NOT be used
  })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' })
    assert.strictEqual(r.verification_token.token_matched, false, 'Tinybird token (0) used, not HogQL (5)')
    // No read hit HogQL: all 5 served from Tinybird.
    assert.strictEqual(hog.length, 0, 'HogQL fully bypassed when all pipes serve')
    // Money-rail mapped shapes surface from Tinybird, not HogQL.
    assert.strictEqual(r.conversion_setup.detected, true)
    assert.strictEqual(r.conversion_setup.last_conversion_at, '2026-07-10T00:00:00Z')
    assert.strictEqual(r.conversion_setup.last_conversion_type, 'signup')
    assert.strictEqual(r.paid_tracking.parameters_detected, true, 'paid_params_count=9 from Tinybird')
    assert.strictEqual(r.paid_tracking.click_id_seen, true)
    assert.strictEqual(r.paid_tracking.last_click_id_type, 'fbclid', 'click-id col order preserved (fbclid is index 3)')
    // Tenant isolation + param contract on every wired pipe.
    assert.ok(tb.every(c => c.params.site_id === 'site-00'), 'all pipes scoped to authenticated site_id')
    const tk = tb.find(c => c.pipe === 'doctor_token_verify')
    assert.deepStrictEqual(tk.params, { site_id: 'site-00', st_verify: 'verifyabc123' })
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — D1b MONEY-RAIL: money-rail pipes null -> degrade to not-detected, HogQL NOT called; health reads served', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 100 }],
      doctor_token_verify: [{ token_verify_count: 0 }]
      // money-rail pipes omitted -> null -> throws -> .catch degrades to null (no HogQL)
    }),
    queryHog: async () => { hog.push('called'); throw new Error('HogQL called — D1b deleted the fallback') }
  })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' })
    assert.strictEqual(hog.length, 0, 'HogQL was NOT called for the money-rail reads')
    // The 3 money-rail reads degrade to not-detected (no silent dead-store fallback); health reads served.
    assert.strictEqual(r.conversion_setup.detected, false, 'null money-rail conversion read degrades to not-detected')
    assert.strictEqual(r.paid_tracking.click_id_seen, false, 'null click-id read degrades to not-seen')
    assert.strictEqual(r.paid_tracking.parameters_detected, false, 'null paid-params read degrades to not-detected')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> rejects (no silent HogQL bypass)', async () => {
  const tb = []; const hog = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setSetupDoctorReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    await assert.rejects(
      () => getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' }),
      /tinybird-force-read/,
      'fails loudly instead of silently falling back'
    )
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetSetupDoctorReadDeps()
  }
})

test('setup-doctor — no verification token -> token_verify pipe not attempted', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({ queryTinybird: tbStub(tb, { doctor_pageviews_30d: [{ pageviews_30d: 100 }] }), queryHog: hogStub(hog) })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: null })
    assert.strictEqual(r.verification_token.token_supplied, false)
    assert.ok(!tb.some(c => c.pipe === 'doctor_token_verify'), 'token pipe skipped when no token supplied')
    assert.ok(tb.some(c => c.pipe === 'doctor_pageviews_30d'), 'pageviews pipe still attempted')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — privacy suppression: pipe unwired/returns null -> checks list and status unaffected', async () => {
  const tb = []; const hog = []
  const freshSite = { ...site(), last_seen_at: new Date(Date.now() - 60000).toISOString() }
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 100 }]
    }),
    queryHog: hogStub(hog)
  })
  try {
    const r = await getSetupDiagnostics({ site: freshSite, verificationToken: null })
    assert.strictEqual(r.privacy_suppression, null, 'privacy_suppression is null when unwired')
    assert.ok(!r.checks.some(c => c.label.includes('Privacy')), 'no privacy check pushed')
    assert.strictEqual(r.status, 'healthy')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — privacy suppression: partial -> warning check, status healthy', async () => {
  const tb = []; const hog = []
  const freshSite = { ...site(), last_seen_at: new Date(Date.now() - 60000).toISOString() }
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 100 }],
      doctor_privacy_signals_30d: [{ privacy_signals_30d: 5 }]
    }),
    queryHog: hogStub(hog)
  })
  try {
    const r = await getSetupDiagnostics({ site: freshSite, verificationToken: null })
    assert.deepStrictEqual(r.privacy_suppression, { suppressed_count: 5 })
    const check = r.checks.find(c => c.label === 'Privacy signals (GPC/DNT)')
    assert.ok(check, 'privacy check pushed')
    assert.strictEqual(check.status, 'warning')
    assert.ok(check.detail.includes('At least 5 browsers'))
    assert.strictEqual(r.status, 'healthy')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — privacy suppression: 100% (zero pageviews) -> failed check, overall status warning', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 0 }],
      doctor_privacy_signals_30d: [{ privacy_signals_30d: 12 }]
    }),
    queryHog: hogStub(hog)
  })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: null })
    assert.deepStrictEqual(r.privacy_suppression, { suppressed_count: 12 })
    const check = r.checks.find(c => c.label === 'Privacy signals (GPC/DNT)')
    assert.ok(check, 'privacy check pushed')
    assert.strictEqual(check.status, 'failed')
    assert.strictEqual(r.status, 'warning')
    assert.strictEqual(r.severity, 'warning')
    assert.ok(r.message.includes('At least 12 browsers sent a privacy signal'))
  } finally { __resetSetupDoctorReadDeps() }
})
