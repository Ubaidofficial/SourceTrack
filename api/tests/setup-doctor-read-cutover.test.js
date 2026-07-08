// Phase-1 read-cutover Wave-2 — setup-doctor.js dispatch/fallback tests.
// Wires only the 2 pure health/count reads (doctor_pageviews_30d,
// doctor_token_verify); the 3 conversion/attribution-coupled reads stay on
// HogQL (money-rail hold). Proves: fallback (flag off = HogQL), dispatch
// (flag on = Tinybird for the wired reads, HogQL for the held ones),
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

test('setup-doctor — FALLBACK: flag off (pipe null) -> HogQL for wired + held reads', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog, { token: 5 }) })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' })
    assert.strictEqual(r.verification_token.token_matched, true, 'HogQL token count (5) surfaces')
    // Both wired reads attempted Tinybird first, then fell back to HogQL.
    assert.deepStrictEqual(tb.map(c => c.pipe).sort(), ['doctor_pageviews_30d', 'doctor_token_verify'])
    assert.ok(hog.includes('doctor_pageviews_30d') && hog.includes('doctor_token_verify'), 'wired reads fell back to HogQL')
    assert.ok(hog.includes('doctor_last_conversion') && hog.includes('doctor_last_click_id') && hog.includes('doctor_paid_params_count'), 'held reads on HogQL')
  } finally { __resetSetupDoctorReadDeps() }
})

test('setup-doctor — DISPATCH: flag on -> Tinybird for wired reads, HogQL only for held (money-rail) reads', async () => {
  const tb = []; const hog = []
  __setSetupDoctorReadDeps({
    queryTinybird: tbStub(tb, {
      doctor_pageviews_30d: [{ pageviews_30d: 100 }],
      doctor_token_verify: [{ token_verify_count: 0 }] // NOT matched via Tinybird
    }),
    queryHog: hogStub(hog, { token: 5 }) // HogQL WOULD say matched — must NOT be used
  })
  try {
    const r = await getSetupDiagnostics({ site: site(), verificationToken: 'verifyabc123' })
    assert.strictEqual(r.verification_token.token_matched, false, 'Tinybird token (0) used, not HogQL (5)')
    // Wired reads bypassed HogQL; held (money-rail) reads used HogQL.
    assert.ok(!hog.includes('doctor_pageviews_30d'), 'pageviews read did NOT hit HogQL')
    assert.ok(!hog.includes('doctor_token_verify'), 'token read did NOT hit HogQL')
    assert.deepStrictEqual(hog.sort(), ['doctor_last_click_id', 'doctor_last_conversion', 'doctor_paid_params_count'])
    // Tenant isolation + param contract on the wired pipes.
    const pv = tb.find(c => c.pipe === 'doctor_pageviews_30d')
    const tk = tb.find(c => c.pipe === 'doctor_token_verify')
    assert.deepStrictEqual(pv.params, { site_id: 'site-00' })
    assert.deepStrictEqual(tk.params, { site_id: 'site-00', st_verify: 'verifyabc123' })
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
