// GET /onboarding/me — explicit site selection vs. resolveDashboardSite's completed-only guard.
//
// Started as a REPRODUCTION (assertions inverted once the fix landed). Drives the REAL route
// handler with a stubbed Supabase (same pattern as onboarding-complete-skip-marker.test.js)
// rather than a copy of the resolver, because resolveDashboardSite is module-private and the
// bug was in how the route uses it.
//
// The scenario is mainline, not exotic: App.jsx:142 reads the site switcher's persisted
// `sourcetrack_active_site_key` from localStorage and sends it as ?site_key= on EVERY
// protected-route evaluation. So "explicit selection" is just "the site the user picked".
//
// Two documented claims, separated here because only ONE of them was real:
//   - "explicit selection of an INCOMPLETE site is silently ignored" -> WAS REAL. The
//     completed-only guard discarded the match and returned a different site. Fixed; the
//     two tests below now assert the requested site comes back.
//   - "user is pushed back into onboarding they already finished" -> NEVER reproducible,
//     and still isn't. Pinned below so the refutation cannot silently rot.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert/strict'

const { onboardingRouter } = await import('../routes/onboarding.js')
const { getSupabase } = await import('../lib/supabase.js')

function handlerFor (router, path, method = 'get') {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  assert.ok(layer, `${method.toUpperCase()} ${path} must be registered`)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const meHandler = handlerFor(onboardingRouter, '/me')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const client = getSupabase()
const realFrom = client.from

// getUserSitesSorted (onboarding.js:37-53) builds from('sites').select(...).order(...), then
// conditionally .eq(...), then awaits the builder. So the stub must be thenable AND chainable.
function installSites (sites) {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    then: (resolve) => resolve({ data: sites, error: null })
  }
  client.from = (table) => {
    if (table !== 'sites') throw new Error(`unexpected table: ${table}`)
    return builder
  }
  return () => { client.from = realFrom }
}

const USER = { id: 'user-1', role: 'user', company_id: null }

const COMPLETED = {
  id: 'site-completed', site_key: 'key-completed', domain: 'done.example',
  name: 'Done', business_type: 'saas', onboarding_completed: true,
  onboarding_state: { current_step: 6 }, company_id: null, owner_id: 'user-1'
}
const INCOMPLETE = {
  id: 'site-incomplete', site_key: 'key-incomplete', domain: 'wip.example',
  name: 'WIP', business_type: null, onboarding_completed: false,
  onboarding_state: { current_step: 2 }, company_id: null, owner_id: 'user-1'
}

async function callMe (query) {
  const res = mockRes()
  await meHandler({ user: USER, query, headers: {} }, res)
  return res
}

// ── THE REAL BUG ─────────────────────────────────────────────────────────────

test('🔴 FIXED: selecting the INCOMPLETE site by site_key returns THAT site', async () => {
  const restore = installSites([COMPLETED, INCOMPLETE])
  try {
    const res = await callMe({ site_key: 'key-incomplete' })
    assert.equal(res.statusCode, 200)

    // FIXED: the explicitly requested site is what comes back.
    assert.equal(
      res.body.data.site_key, 'key-incomplete',
      'asked for key-incomplete — must get key-incomplete, never a substitute'
    )
    assert.equal(res.body.data.onboarding_completed, false, 'reported truthfully as unfinished')
    assert.equal(res.body.data.domain, 'wip.example')
    // The account still HAS somewhere finished to land — this is what stops the gate
    // force-redirecting the user into the wizard (App.jsx).
    assert.equal(res.body.data.has_completed_site, true)
  } finally { restore() }
})

test('🔴 FIXED: same, via site_id', async () => {
  const restore = installSites([COMPLETED, INCOMPLETE])
  try {
    const res = await callMe({ site_id: 'site-incomplete' })
    assert.equal(res.body.data.site_id, 'site-incomplete',
      'asked for site-incomplete by id — must get site-incomplete')
    assert.equal(res.body.data.has_completed_site, true)
  } finally { restore() }
})

test('control: selecting the COMPLETED site by site_key returns that same site', async () => {
  const restore = installSites([COMPLETED, INCOMPLETE])
  try {
    const res = await callMe({ site_key: 'key-completed' })
    assert.equal(res.body.data.site_key, 'key-completed',
      'a completed site IS honoured — proving the guard, not the lookup, is what fails')
  } finally { restore() }
})

test('control: with ONLY an incomplete site, selection is honoured (no completed site to substitute)', async () => {
  const restore = installSites([INCOMPLETE])
  try {
    const res = await callMe({ site_key: 'key-incomplete' })
    assert.equal(res.body.data.site_key, 'key-incomplete',
      'the fallthrough reaches the incomplete branch only when no completed site exists')
    assert.equal(res.body.data.onboarding_completed, false)
  } finally { restore() }
})

// ── THE CLAIM THAT IS *NOT* REPRODUCIBLE — pinned so the refutation cannot rot ──

test('NOT-A-BUG (pinned): the gate never reports incomplete for a user who has a completed site', async () => {
  const restore = installSites([COMPLETED, INCOMPLETE])
  try {
    // The "pushed back into onboarding you already finished" claim. Still refuted — but the
    // MECHANISM changed, so this pin is restated rather than deleted. It used to hold because
    // the resolver substituted a completed site (the very bug). Now the resolver answers
    // truthfully and the ACCOUNT-level has_completed_site is what keeps the gate satisfied.
    for (const query of [{}, { site_key: 'key-incomplete' }, { site_id: 'site-incomplete' }]) {
      const res = await callMe(query)
      assert.equal(res.body.data.has_completed_site, true,
        `query ${JSON.stringify(query)} must not gate the user back into onboarding`)
    }
  } finally { restore() }
})

// ── the onboarding-mode branch is unaffected — scoping the blast radius ──────

test('mode=onboarding is NOT affected: it uses resolveOnboardingSite and honours the incomplete pick', async () => {
  const restore = installSites([COMPLETED, INCOMPLETE])
  try {
    const res = await callMe({ mode: 'onboarding', site_key: 'key-incomplete' })
    assert.equal(res.body.data.site_key, 'key-incomplete',
      'the mirrored resolver already does the right thing for its own case')
    assert.equal(res.body.data.onboarding_completed, false)
  } finally { restore() }
})
