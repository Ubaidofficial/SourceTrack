// The onboarding GATE decision matrix — including the redirect-loop case.
//
// The gate lives in dashboard/src/App.jsx (JSX, no DOM harness in this suite), so this file
// verifies it the only honest way available:
//   1. Drive the REAL GET /onboarding/me for each account shape, so the INPUTS the gate sees
//      are actual API payloads, not invented ones.
//   2. Apply the gate's two navigation rules to those payloads and assert the destination.
//   3. PIN the rule text in App.jsx by source match, so rules 1-2 cannot silently describe a
//      gate that no longer exists. Without this pin the matrix would be testing a copy.
//
// WHY THIS FILE EXISTS AT ALL: the last bug in this gate was a redirect LOOP
// (140Z-G3-C / ff23e44) where an errored /me was read as "incomplete" and the user was
// bounced to onboarding with no way out. This change alters the redirect condition, so the
// loop question has to be answered explicitly rather than assumed.

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { onboardingRouter } = await import('../routes/onboarding.js')
const { getSupabase } = await import('../lib/supabase.js')

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_JSX = readFileSync(join(__dirname, '../../dashboard/src/App.jsx'), 'utf8')
const LAYOUT_JSX = readFileSync(join(__dirname, '../../dashboard/src/components/Layout.jsx'), 'utf8')

const meHandler = (() => {
  const layer = onboardingRouter.stack.find(l => l.route?.path === '/me' && l.route?.methods?.get)
  assert.ok(layer, 'GET /me must be registered')
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

const client = getSupabase()
const realFrom = client.from
function installSites (sites) {
  const builder = {
    select: () => builder, order: () => builder, eq: () => builder,
    then: (resolve) => resolve({ data: sites, error: null })
  }
  client.from = (t) => { if (t !== 'sites') throw new Error(`unexpected table: ${t}`); return builder }
  return () => { client.from = realFrom }
}

const USER = { id: 'user-1', role: 'user', company_id: null }
const site = (id, done) => ({
  id: `site-${id}`, site_key: `key-${id}`, domain: `${id}.example`, name: id,
  business_type: done ? 'saas' : null, onboarding_completed: done,
  onboarding_state: { current_step: done ? 6 : 2 }, company_id: null, owner_id: 'user-1'
})
const DONE_A = site('a', true)
const DONE_B = site('b', true)
const WIP_X = site('x', false)
const WIP_Y = site('y', false)

async function me (sites, query = {}) {
  const restore = installSites(sites)
  try {
    const res = { statusCode: 200, body: null, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this } }
    await meHandler({ user: USER, query, headers: {} }, res)
    return res.body.data
  } finally { restore() }
}

// ── the gate's two rules, applied to a REAL /me payload ──────────────────────
// Mirrors App.jsx Phase 4. Pinned against the source below so it cannot drift.
function destination (pathname, data, { explicitOnboardingIntent = false } = {}) {
  if (pathname !== '/onboarding' && !data.has_completed_site) return '/onboarding'
  if (pathname === '/onboarding' && data.onboarding_completed && !explicitOnboardingIntent) return '/dashboard'
  return pathname // stay
}

// ── ANTI-DRIFT: the rules above must be the rules in App.jsx ─────────────────

test('🔴 PIN: App.jsx force-redirect keys off hasCompletedSite, NOT the active site', () => {
  assert.match(APP_JSX, /pathname !== '\/onboarding' && !onboarding\.hasCompletedSite/,
    'the force-redirect must test the ACCOUNT-level flag; keying it off onboarding.completed is the bug this fixed')
  assert.doesNotMatch(APP_JSX, /pathname !== '\/onboarding' && !onboarding\.completed/,
    'the old active-site-based condition must be gone, not merely supplemented')
  assert.match(APP_JSX, /hasCompletedSite: !!data\?\.has_completed_site/,
    'the flag must be populated from the API response')
})

test('🔴 PIN: Layout still renders Resume setup for an incomplete ACTIVE site', () => {
  assert.match(LAYOUT_JSX, /activeSite\.onboarding_completed === false/,
    'the affordance that replaces the forced redirect must still exist')
  assert.match(LAYOUT_JSX, /Resume setup/)
})

// ── the matrix ───────────────────────────────────────────────────────────────

test('1. genuine first run (no sites at all) STILL hard-redirects', async () => {
  const data = await me([])
  assert.equal(data.has_site, false)
  assert.equal(data.has_completed_site, false)
  assert.equal(destination('/dashboard', data), '/onboarding', 'first run must be forced into onboarding')
  assert.equal(destination('/onboarding', data), '/onboarding', 'and must then STAY there')
})

test('2. single COMPLETED site only — dashboard renders, /onboarding bounces back', async () => {
  const data = await me([DONE_A])
  assert.equal(data.has_completed_site, true)
  assert.equal(destination('/dashboard', data), '/dashboard')
  assert.equal(destination('/onboarding', data), '/dashboard', 'a finished user does not sit in the wizard')
})

test('3. single INCOMPLETE site only — still hard-redirects (nowhere finished to land)', async () => {
  const data = await me([WIP_X])
  assert.equal(data.has_completed_site, false)
  assert.equal(destination('/dashboard', data), '/onboarding')
  assert.equal(destination('/onboarding', data), '/onboarding', 'stays — no bounce back out')
})

test('4. 🔴 THE BUG SCENARIO: active=INCOMPLETE, another site COMPLETED — must NOT redirect', async () => {
  const data = await me([DONE_A, WIP_X], { site_key: 'key-x' })
  // the requested site is what came back (the resolver fix)
  assert.equal(data.site_key, 'key-x')
  assert.equal(data.onboarding_completed, false, 'active site truthfully unfinished')
  // ...and the account-level flag is what keeps the user on the dashboard (the gate fix)
  assert.equal(data.has_completed_site, true)
  assert.equal(destination('/dashboard', data), '/dashboard',
    'the user must NOT be force-marched into the wizard for a site they merely selected')
  // Layout's affordance is the mechanism instead — its condition is exactly this field.
  assert.equal(data.onboarding_completed, false, 'which is what makes Resume setup render')
})

test('5. multi-site, active=COMPLETED — unchanged', async () => {
  const data = await me([DONE_A, WIP_X], { site_key: 'key-a' })
  assert.equal(data.site_key, 'key-a')
  assert.equal(data.onboarding_completed, true)
  assert.equal(destination('/dashboard', data), '/dashboard')
})

// ── loop / trap tests ────────────────────────────────────────────────────────

test('6a. LOOP: switching between TWO incomplete sites does not cycle', async () => {
  for (const key of ['key-x', 'key-y']) {
    const data = await me([WIP_X, WIP_Y], { site_key: key })
    assert.equal(data.site_key, key, 'each selection is honoured')
    // Both land on /onboarding and STAY there — a stable destination, not an A->B->A cycle.
    assert.equal(destination('/dashboard', data), '/onboarding')
    assert.equal(destination('/onboarding', data), '/onboarding',
      `${key}: must not bounce back out of onboarding — that is the loop`)
  }
})

test('6b. LOOP: /onboarding directly while a COMPLETED site exists elsewhere does not trap', async () => {
  // Active site incomplete, another finished. Navigating straight to /onboarding.
  const data = await me([DONE_A, WIP_X], { site_key: 'key-x' })
  // Without explicit intent the user is NOT ejected (active site is unfinished, so there is
  // real work to do here) and NOT trapped (they can reach the dashboard, rule 1 does not fire).
  assert.equal(destination('/onboarding', data), '/onboarding', 'stays to finish setup')
  assert.equal(destination('/dashboard', data), '/dashboard', 'and can leave whenever — no trap')
})

test('6c. LOOP: the Resume setup deep link (explicit intent) is never ejected', async () => {
  // Layout navigates to /onboarding?site_id=<incomplete>&mode=onboarding.
  const data = await me([DONE_A, WIP_X], { mode: 'onboarding', site_id: 'site-x' })
  assert.equal(data.site_key, 'key-x', 'mode=onboarding resolves the hinted incomplete site')
  assert.equal(destination('/onboarding', data, { explicitOnboardingIntent: true }), '/onboarding')
  // Even if the hinted site were already complete, explicit intent still wins.
  const doneData = await me([DONE_A, WIP_X], { mode: 'onboarding', site_id: 'site-a' })
  assert.equal(destination('/onboarding', doneData, { explicitOnboardingIntent: true }), '/onboarding',
    'explicit intent must not be bounced to /dashboard')
})

test('6d. 🔴 LOOP IS STRUCTURALLY IMPOSSIBLE: the two rules can never both fire', async () => {
  // Leaving /dashboard needs !has_completed_site; leaving /onboarding needs onboarding_completed.
  // If the ACTIVE site is completed then the ACCOUNT has a completed site, so the second implies
  // the negation of the first — and both are read from the SAME /me response, so they cannot
  // disagree. Asserted across every shape rather than argued.
  const shapes = [
    [], [DONE_A], [WIP_X], [DONE_A, WIP_X], [WIP_X, WIP_Y], [DONE_A, DONE_B]
  ]
  const queries = [{}, { site_key: 'key-a' }, { site_key: 'key-x' }, { site_id: 'site-x' }]
  for (const sites of shapes) {
    for (const q of queries) {
      const data = await me(sites, q)
      const bothFire = !data.has_completed_site && data.onboarding_completed
      assert.equal(bothFire, false,
        `sites=${JSON.stringify(sites.map(s => s.site_key))} query=${JSON.stringify(q)}: ` +
        'onboarding_completed=true with has_completed_site=false would be a redirect cycle')
    }
  }
})
