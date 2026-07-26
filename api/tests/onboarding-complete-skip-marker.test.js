// Onboarding step 6 ("Verify Installation") has no in-UI way to emit a test event (a
// synthetic event would enter the attribution data this product sells — a §6 violation).
// A brand-new user's only forward path from a stuck "waiting for first event" state is
// "Verify Later (Skip for now)", which calls POST /onboarding/complete. That handler set
// onboarding_completed=true identically whether the user genuinely verified OR skipped —
// the funnel leak (how many completions were never actually verified) was invisible.
//
// This adds a `skipped` flag: when true, the handler stamps
// onboarding_state.verification_skipped_at (ISO string) so the skip is queryable. Whether
// onboarding_completed should still flip to true on a skip is a PRODUCT decision (reported
// separately, not decided here) — this test asserts only the CURRENT (unchanged) behaviour
// plus the new marker.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { onboardingRouter } = await import('../routes/onboarding.js')
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (router, path, method = 'post') => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const completeHandler = handlerFor(onboardingRouter, '/complete')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const client = getSupabase()
const realFrom = client.from

// Site at step 6, ready to complete: business_type + install_method already set.
function installSupabase (site) {
  let updatePayload = null
  client.from = (table) => {
    if (table !== 'sites') throw new Error(`unexpected table: ${table}`)
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: site, error: null }) }) }),
      update: (payload) => { updatePayload = payload; return { eq: async () => ({ error: null }) } }
    }
  }
  return { getUpdatePayload: () => updatePayload, restore: () => { client.from = realFrom } }
}

const baseSite = () => ({
  id: 'site-1', site_key: 'sk_test', company_id: 'company-1', owner_id: 'owner-1',
  onboarding_completed: false,
  onboarding_state: { current_step: 6, business_type: 'saas', install_method: 'standard' }
})
const req = (body) => ({ body, user: { id: 'owner-1', company_id: 'company-1', role: 'member' } })

test('🔴 /onboarding/complete with skipped:true stamps onboarding_state.verification_skipped_at', async () => {
  const { getUpdatePayload, restore } = installSupabase(baseSite())
  try {
    const res = mockRes()
    await completeHandler(req({ site_id: 'site-1', skipped: true }), res)
    assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.data.completed, true)

    const payload = getUpdatePayload()
    assert.ok(payload, 'update() must have been called')
    assert.ok(payload.onboarding_state?.verification_skipped_at,
      'skipping verification must stamp onboarding_state.verification_skipped_at so the funnel leak is queryable')
    assert.ok(!Number.isNaN(new Date(payload.onboarding_state.verification_skipped_at).getTime()),
      'verification_skipped_at must be a valid ISO timestamp')
  } finally {
    restore()
  }
})

test('🔴 /onboarding/complete WITHOUT skipped (genuine verification) must NOT stamp verification_skipped_at', async () => {
  const { getUpdatePayload, restore } = installSupabase(baseSite())
  try {
    const res = mockRes()
    await completeHandler(req({ site_id: 'site-1' }), res)
    assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.data.completed, true)

    const payload = getUpdatePayload()
    assert.ok(payload, 'update() must have been called')
    assert.equal(payload.onboarding_state?.verification_skipped_at, undefined,
      'a genuinely verified completion must never carry a skip marker — that would misreport a real verification as skipped')
  } finally {
    restore()
  }
})
