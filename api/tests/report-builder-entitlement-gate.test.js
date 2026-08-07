// #631 — ReportBuilderGate must actually consult `advanced_report_builder`.
//
// WHY A TEST AND NOT JUST THE DIFF: the bug being fixed was not a wrong value, it was a flag
// that existed in both matrices, carried a label for the upgrade UI, and was passed to
// hasFeature()/requireFeature() NOWHERE. Nothing failed while that was true — the matrices
// were internally consistent and the parity test compared them happily to each other. A
// declared-but-unenforced entitlement is invisible to every check the repo had, which is
// exactly why it survived. So the load-bearing half here is the reference assertion: if the
// gate is deleted or the flag stops being consulted, this goes red instead of quietly
// reverting to "any logged-in user gets the paid surface".
//
// Deliberately NOT a render test: the repo has no jsdom/testing-library, and the established
// convention for JSX (capi-config, trial-length-28-days, marketing-before-after) is to assert
// against source text. Adding a React runner for one component would be a bigger change than
// the fix.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { hasFeature } from '../../dashboard/src/lib/planFeatures.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const read = (p) => readFileSync(join(REPO, p), 'utf8')

const GATE = 'dashboard/src/ReportBuilderGate.jsx'

// ── 1. The entitlement decision itself, pinned ────────────────────────────────
// Enforce-as-written was a deliberate product call: free AND trial are both locked out,
// matching the starter+ band. If someone later wants trial to keep access, that is a pricing
// change and it should have to edit this assertion consciously.
test('advanced_report_builder is starter+ only, trial included in the lockout', () => {
  assert.equal(hasFeature('free', 'advanced_report_builder'), false)
  assert.equal(hasFeature('trial', 'advanced_report_builder'), false)
  assert.equal(hasFeature('starter', 'advanced_report_builder'), true)
  assert.equal(hasFeature('growth', 'advanced_report_builder'), true)
  assert.equal(hasFeature('scale', 'advanced_report_builder'), true)
})

// Aliases matter: a legacy `pro` row normalizes to growth, `agency`/`business` to scale.
// Getting this wrong would lock out existing paying customers whose row was never migrated.
test('legacy plan aliases resolve to entitled tiers', () => {
  assert.equal(hasFeature('pro', 'advanced_report_builder'), true)
  assert.equal(hasFeature('agency', 'advanced_report_builder'), true)
  assert.equal(hasFeature('business', 'advanced_report_builder'), true)
})

// An unknown/missing plan must NOT be treated as entitled — fail closed.
test('unknown or missing plan is not entitled', () => {
  assert.equal(hasFeature(undefined, 'advanced_report_builder'), false)
  assert.equal(hasFeature(null, 'advanced_report_builder'), false)
  assert.equal(hasFeature('not-a-plan', 'advanced_report_builder'), false)
})

// ── 2. The gate actually consults it ─────────────────────────────────────────
test('ReportBuilderGate imports hasFeature and gates on advanced_report_builder', () => {
  const src = read(GATE)
  assert.match(src, /from '\.\/lib\/planFeatures'/, 'must import from planFeatures')
  assert.match(src, /hasFeature\(/, 'must call hasFeature')
  assert.match(
    src,
    /hasFeature\(\s*site\?\.plan,\s*'advanced_report_builder'\s*\)/,
    'must gate on advanced_report_builder using the active site plan'
  )
})

// The regression this file exists to prevent: reverting to a login-only gate.
test('ReportBuilderGate does not render ReportBuilder on login alone', () => {
  const src = read(GATE)
  const entitledIdx = src.indexOf('const entitled')
  const renderIdx = src.indexOf('<Layout><ReportBuilder /></Layout>')
  assert.ok(entitledIdx > -1, 'entitlement check must exist')
  assert.ok(renderIdx > -1, 'must still render ReportBuilder for entitled users')
  assert.ok(
    entitledIdx < renderIdx,
    'the entitlement check must come BEFORE the ReportBuilder render'
  )
})

// ── 3. The two states that must NOT be gated ─────────────────────────────────
// Both were found by reading the code they depend on, not by guessing, and both would be
// silent breakages: an entitled customer sees a flash of "upgrade" on every load, or an
// admin loses support preview entirely.
test('entitlement is not judged while the site is still loading', () => {
  const src = read(GATE)
  assert.match(src, /siteLoading/, 'must read siteLoading from useActiveSite')
  const loadIdx = src.indexOf('if (siteLoading)')
  const entitledIdx = src.indexOf('const entitled')
  assert.ok(loadIdx > -1, 'must early-return while the site is loading')
  assert.ok(
    loadIdx < entitledIdx,
    'the loading guard must precede the entitlement check, or plan is undefined -> free'
  )
})

test('support preview is exempt — the preview site carries no plan', () => {
  const src = read(GATE)
  assert.match(
    src,
    /site\?\.support_preview === true/,
    'support preview must bypass the gate'
  )
  // Pin the reason too: if SiteContext ever starts sending a real plan through the preview
  // payload, this exemption should be revisited rather than inherited forever.
  const ctx = read('dashboard/src/contexts/SiteContext.jsx')
  const forced = ctx.slice(ctx.indexOf('const forcedSite'), ctx.indexOf('setSites([forcedSite])'))
  assert.ok(forced.length > 0, 'forcedSite block must still exist in SiteContext')
  assert.ok(
    !/\bplan\b/.test(forced),
    'preview site now carries a plan — revisit the support_preview exemption in ' + GATE
  )
})
