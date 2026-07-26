// Cookieless mode: plan gate + write-path guard.
//
// Background (the bug this locks down): the Settings page used to flip
// cookieless_mode with a direct client-side `supabase.from('sites').update(...)`.
// On prod, `sites` has RLS enabled with exactly ONE policy — SELECT for
// `authenticated` — and no UPDATE policy. `authenticated` DOES hold the UPDATE
// grant, so the statement was not a permission error: RLS simply filtered the
// row out, PostgREST returned 0 rows, supabase-js returned `error: null`, and the
// UI reported "Cookieless mode enabled." while nothing persisted. A false
// success, in the same family as the erasure-that-deletes-nothing class.
//
// The fix routes the write through PATCH /api/integrations/settings (service
// role, behind requireUserAuth + validateSiteKey + requireSiteMembership).
// That bypasses RLS, which is exactly why the plan gate below must exist and
// stay: cookieless_mode is a paid feature (free is excluded; starter and every
// other paid tier are allowed — see plan-features.js's repackage: tiers now
// differentiate on volume, not features), and before the cutover RLS was
// accidentally the only thing stopping the write.

import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// plan-features.js has no side-effectful imports — safe to import directly.
const { requireFeature, hasFeature, normalizePlan } = await import('../lib/plan-features.js')

test('cookieless_mode feature matrix', async (t) => {
  await t.test('free is blocked', () => {
    assert.strictEqual(hasFeature('free', 'cookieless_mode'), false)
  })

  // Repackage (plan-features.js): starter now matches growth on every
  // FEATURE_MATRIX row, including cookieless_mode. Was blocked; now allowed.
  await t.test('starter is allowed', () => {
    assert.strictEqual(hasFeature('starter', 'cookieless_mode'), true)
  })

  await t.test('trial is allowed', () => {
    assert.strictEqual(hasFeature('trial', 'cookieless_mode'), true)
  })

  await t.test('growth is allowed', () => {
    assert.strictEqual(hasFeature('growth', 'cookieless_mode'), true)
  })

  await t.test('scale is allowed', () => {
    assert.strictEqual(hasFeature('scale', 'cookieless_mode'), true)
  })

  await t.test('inactive and archived are blocked', () => {
    assert.strictEqual(hasFeature('inactive', 'cookieless_mode'), false)
    assert.strictEqual(hasFeature('archived', 'cookieless_mode'), false)
  })

  await t.test('legacy aliases resolve through normalizePlan', () => {
    assert.strictEqual(normalizePlan('pro'), 'growth')
    assert.strictEqual(hasFeature('pro', 'cookieless_mode'), true)
    assert.strictEqual(normalizePlan('agency'), 'scale')
    assert.strictEqual(hasFeature('agency', 'cookieless_mode'), true)
  })

  // Repackage: starter is now allowed (matches growth), so 'free' is the
  // blocked-plan example here instead — the 402-payload shape is unaffected.
  await t.test('requireFeature returns a 402 payload naming the plan', () => {
    const block = requireFeature('free', 'cookieless_mode', 'Cookieless tracking')
    assert.ok(block, 'free should be blocked')
    assert.strictEqual(block.success, false)
    assert.strictEqual(block.upgrade.current_plan, 'free')
    assert.strictEqual(block.upgrade.required_feature, 'cookieless_mode')
    assert.strictEqual(requireFeature('starter', 'cookieless_mode', 'Cookieless tracking'), null)
    assert.strictEqual(requireFeature('growth', 'cookieless_mode', 'Cookieless tracking'), null)
  })
})

test('PATCH /integrations/settings gates the cookieless_mode write', async (t) => {
  const src = fs.readFileSync(path.join(rootDir, 'api/routes/integrations.js'), 'utf8')

  await t.test('the handler accepts cookieless_mode at all', () => {
    assert.ok(
      src.includes('req.body.cookieless_mode'),
      'PATCH /settings must read req.body.cookieless_mode — otherwise the dashboard toggle silently no-ops'
    )
    assert.ok(
      src.includes('updates.cookieless_mode'),
      'the validated value must actually be added to the update payload'
    )
  })

  await t.test('enabling is gated by requireFeature on the cookieless_mode key', () => {
    assert.ok(
      /requireFeature\(\s*req\.site\?\.plan\s*,\s*'cookieless_mode'/.test(src),
      "enabling cookieless_mode must call requireFeature(req.site?.plan, 'cookieless_mode', …). " +
      'This endpoint uses the service role and bypasses RLS, so this gate is the only thing ' +
      'keeping a paid feature off free/starter plans.'
    )
  })

  await t.test('the gate is checked BEFORE the value reaches the update payload', () => {
    const gateAt = src.indexOf("requireFeature(req.site?.plan, 'cookieless_mode'")
    const writeAt = src.indexOf('updates.cookieless_mode')
    assert.ok(gateAt > -1 && writeAt > -1, 'both the gate and the write must be present')
    assert.ok(gateAt < writeAt, 'the plan gate must run before the column is staged for write')
  })

  await t.test('a non-boolean is rejected rather than coerced', () => {
    assert.ok(
      src.includes("error: 'cookieless_mode must be a boolean'"),
      'cookieless_mode must be validated as a boolean — a truthy string would flip the tracker build'
    )
  })
})

test('Settings.jsx does not write cookieless_mode directly to Supabase', () => {
  const src = fs.readFileSync(path.join(rootDir, 'dashboard/src/pages/Settings.jsx'), 'utf8')

  // The regression guard for the original bug. A direct client-side UPDATE on
  // `sites` is silently filtered to zero rows by prod RLS and reports success.
  assert.ok(
    !/\.update\(\s*\{[^}]*cookieless_mode/s.test(src),
    'cookieless_mode must not be written via supabase.from("sites").update(...) — prod RLS has no ' +
    'UPDATE policy on `sites`, so the write is silently dropped while the UI claims success. ' +
    'Route it through PATCH /api/integrations/settings instead.'
  )

  assert.ok(
    /fetchApi\(\s*`\/integrations\/settings\?site_key=\$\{site\.site_key\}`[\s\S]{0,240}cookieless_mode/.test(src),
    'the cookieless toggle must PATCH /integrations/settings with { cookieless_mode }'
  )
})
