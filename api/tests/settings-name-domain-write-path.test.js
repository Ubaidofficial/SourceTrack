// Settings "General" card (site name + domain): plan-independent write-path guard.
//
// Background — the same bug #410 fixed for cookieless_mode, on the same table.
// handleSave wrote name/domain with a direct client-side
// `supabase.from('sites').update({ name, domain }).eq('id', site.id)`. On prod,
// `sites` has RLS enabled with exactly ONE policy (SELECT for `authenticated`,
// owner_id = auth.uid()) and no UPDATE policy, while `authenticated` DOES hold the
// table-level UPDATE grant. RLS is row/command-scoped, not column-scoped, so every
// UPDATE from that role matches zero rows regardless of which columns are set.
//
// Verified functionally on prod, non-mutating, as role `authenticated` with the
// owner's JWT claim:
//   select  -> 1 row visible          (the SELECT policy applies, claims are live)
//   explain update sites set name=name where id=<owned row>
//        -> Update on sites / Result / One-Time Filter: false
// i.e. the planner statically proves no row is updatable. It is not an error, so
// PostgREST returned 0 rows and supabase-js returned error: null. This version was
// worse than cookieless_mode's: handleSave checked `error` on neither branch, so it
// always reported "Saved!".

import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const settingsSrc = fs.readFileSync(path.join(rootDir, 'dashboard/src/pages/Settings.jsx'), 'utf8')
const routeSrc = fs.readFileSync(path.join(rootDir, 'api/routes/integrations.js'), 'utf8')

test('Settings.jsx does not write name/domain directly to Supabase', () => {
  // The regression guard for this exact bug. Any `.update({...name...})` or
  // `.update({...domain...})` against `sites` from the browser is silently dropped
  // by prod RLS while reporting success.
  assert.ok(
    !/\.update\(\s*\{[^}]*\bname\b[^}]*\}\s*\)/s.test(settingsSrc),
    'name must not be written via supabase.from("sites").update(...) — prod RLS has no UPDATE ' +
    'policy on `sites`, so the write is silently dropped while the UI claims "Saved!". ' +
    'Route it through PATCH /api/integrations/settings instead.'
  )
  assert.ok(
    !/\.update\(\s*\{[^}]*\bdomain\b[^}]*\}\s*\)/s.test(settingsSrc),
    'domain must not be written via supabase.from("sites").update(...) — same silent-drop path.'
  )
})

test('handleSave routes the update through PATCH /integrations/settings', () => {
  assert.ok(
    /fetchApi\(\s*`\/integrations\/settings\?site_key=\$\{site\.site_key\}`[\s\S]{0,400}JSON\.stringify\(\{\s*name,\s*domain\s*\}\)/.test(settingsSrc),
    'handleSave must PATCH /integrations/settings with { name, domain }'
  )
})

test('handleSave surfaces the server error instead of reporting success', () => {
  // The original swallowed everything into a fixed 'Error saving' *and* never
  // inspected `error` on the update at all. A rejected PATCH must reach the user —
  // the DB trigger's PaaS-subdomain message is the whole point of the 400.
  assert.ok(
    !settingsSrc.includes("} catch (_err) {\n      setMessage('Error saving')"),
    'handleSave must not swallow the failure into a fixed message'
  )
  const handleSave = settingsSrc.slice(
    settingsSrc.indexOf('const handleSave'),
    settingsSrc.indexOf('const handlePortal')
  )
  assert.ok(handleSave.length > 0, 'handleSave must be locatable')
  assert.ok(
    /catch\s*\(\s*err\s*\)\s*\{[\s\S]{0,120}setMessage\(\s*err\?\.message/.test(handleSave),
    'handleSave must surface err.message to the user'
  )
})

test('PATCH /integrations/settings accepts and validates name + domain', async (t) => {
  await t.test('both fields are read and staged for the update', () => {
    assert.ok(routeSrc.includes('req.body.name'), 'handler must read req.body.name')
    assert.ok(routeSrc.includes('req.body.domain'), 'handler must read req.body.domain')
    assert.ok(routeSrc.includes('updates.name'), 'name must reach the update payload')
    assert.ok(routeSrc.includes('updates.domain'), 'domain must reach the update payload')
  })

  await t.test('an empty or non-string name is rejected, not written as NULL', () => {
    // sites.name is NOT NULL on prod — an unvalidated blank would 500 instead of
    // telling the user what is wrong.
    assert.ok(
      routeSrc.includes("error: 'Site name is required'"),
      'a blank/non-string name must return a 400 explaining the requirement'
    )
  })

  await t.test('domain is canonicalized with the shared normalizer, not a local copy', () => {
    // §11: one source of truth. onboarding.js's normalizeDomain is the tested
    // canonicalizer that the sites_normalized_domain_uniq index expects. A second
    // inline implementation here would drift.
    assert.ok(
      /import\s*\{\s*normalizeDomain\s*\}\s*from\s*'\.\/onboarding\.js'/.test(routeSrc),
      'must import normalizeDomain from onboarding.js rather than reimplementing it'
    )
    assert.ok(
      routeSrc.includes('normalizeDomain(req.body.domain)'),
      'the submitted domain must pass through normalizeDomain'
    )
  })

  await t.test('an invalid domain is rejected', () => {
    assert.ok(
      routeSrc.includes("error: 'Please enter a valid domain, for example yoursite.com'"),
      'an unparseable domain must return a 400'
    )
  })
})

test('the DB-enforced free-tier and uniqueness failures surface as 400s, not 500s', async (t) => {
  // The PaaS-subdomain rule is NOT duplicated in this handler on purpose: the live
  // trigger sites_free_tier_abuse_guards (BEFORE INSERT OR UPDATE ON sites, free plan
  // only) reads paas_subdomain_blocklist and raises check_violation. The DB is the
  // authority (CLAUDE.md §10 — the JS abuse-guards.js is vestigial). What this handler
  // owes the user is an honest translation of that error.
  await t.test('check_violation (23514) → 400 carrying the trigger message', () => {
    assert.ok(
      routeSrc.includes("error.code === '23514'"),
      "the trigger's check_violation must be mapped to a 400, not fall through to the generic 500"
    )
  })

  await t.test('unique_violation (23505) → 400, because the domain index is global', () => {
    assert.ok(
      routeSrc.includes("error.code === '23505'"),
      'sites_normalized_domain_uniq is a GLOBAL unique index — a taken domain must return a 400'
    )
  })

  await t.test('the mapping runs before the generic error rethrow', () => {
    const at23514 = routeSrc.indexOf("error.code === '23514'")
    const rethrow = routeSrc.indexOf('throw error', at23514)
    assert.ok(at23514 > -1 && rethrow > at23514, 'the 23514/23505 mapping must precede `throw error`')
  })
})

test('the unreachable insert branch in handleSave was left alone', () => {
  // handleSave returns early when `site` is falsy, so the `else` insert branch is
  // pre-existing dead code. It is deliberately NOT touched here (CLAUDE.md §3 —
  // mention orphans, do not delete them). This test documents that and will fail if
  // someone assumes this PR converted it.
  assert.ok(
    /\.insert\(\{\s*\n?\s*name,\s*domain,\s*owner_id: user\.id\s*\n?\s*\}\)/.test(settingsSrc),
    'the insert branch must remain as-is — rewiring it is out of scope for the RLS-gap fix'
  )
})
