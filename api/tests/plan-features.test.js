import test from 'node:test'
import assert from 'node:assert'
import { hasFeature, getStructuralLimits, getPvLimit, PLAN_DEFAULT_PV_LIMIT, FEATURE_MATRIX } from '../lib/plan-features.js'

// REPACKAGE: tiers now differentiate on volume, not features — starter matches
// growth on every feature row (see the invariant test below). This replaces the
// old assertion that starter was gated OUT of outbound webhooks with quota 0;
// under the new design starter is gated IN, with a real (5) quota — the flag and
// the quota must still agree, they just both flipped together.
test('starter — outbound webhooks now enabled, matching growth, with a real quota', () => {
  assert.strictEqual(hasFeature('starter', 'webhook_outbound'), true)
  assert.strictEqual(getStructuralLimits('starter').webhooks, 5)
})

// THE RULE we're adopting: starter = growth on every feature. Enforced so a
// future edit cannot silently reintroduce the downgrade-on-purchase gap (trial
// having more features than paid starter) that this change closes.
test('🔴 INVARIANT: starter equals growth for every FEATURE_MATRIX row', () => {
  for (const [featureKey, row] of Object.entries(FEATURE_MATRIX)) {
    assert.strictEqual(
      row.starter, row.growth,
      `${featureKey}: starter=${row.starter} but growth=${row.growth} — tiers differentiate on volume, not features`
    )
  }
})

// funnels_cohorts was false on EVERY tier because GET /funnel was dead twice over: it read
// .from('pageviews') (empty by design, CLAUDE.md §5) and had zero callers in dashboard/src.
// BOTH are now fixed — #456 repointed the read to the Tinybird `summary` pipe, and the
// Funnels section on the Analytics page (with FunnelChart.jsx, restored) is the caller — so
// the gate opens on every paid tier. free stays false: it is excluded from every cost-heavy
// feature and a funnel run is a 50k-row pipe read.
//
// If this ever goes back to false, the reason must be a PRODUCT decision, not "the endpoint
// is dead" — that justification no longer applies.
test('🔴 funnels_cohorts: paid tiers on, free off — the route now reads Tinybird and has a UI caller', () => {
  for (const plan of ['trial', 'starter', 'growth', 'scale']) {
    assert.strictEqual(hasFeature(plan, 'funnels_cohorts'), true, `${plan}: funnels_cohorts must be true`)
  }
  assert.strictEqual(hasFeature('free', 'funnels_cohorts'), false, 'free: funnels_cohorts must stay false')
})

// multi_user is false on EVERY tier. Same phantom-feature class as
// funnels_cohorts: `grep -rln "invite" api/routes/` returns nothing, and
// company_members is read-only everywhere it's touched (authorization checks
// in ad-platforms.js, admin.js, gdpr.js, google-search-console.js,
// middleware/user-auth.js) — no write, no invite route, no seat/role
// management endpoint anywhere in api/routes. Change 1 propagated this flag
// from growth (true) to starter without noticing it was already phantom on
// growth. The starter===growth invariant still holds — false everywhere
// still satisfies it.
test('🔴 multi_user is false on every tier — no invite/seat-management implementation exists', () => {
  for (const plan of ['free', 'trial', 'starter', 'growth', 'scale']) {
    assert.strictEqual(hasFeature(plan, 'multi_user'), false, `${plan}: multi_user must be false`)
  }
})

// Volume differentiation (Change 3): the new per-tier default event limits.
test('PLAN_DEFAULT_PV_LIMIT — new volume-based defaults', () => {
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.free, 10_000)
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.starter, 250_000)
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.growth, 1_000_000)
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.scale, 5_000_000)
  // trial/inactive/archived are untouched by this change.
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.trial, 10_000)
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.inactive, 0)
  assert.strictEqual(PLAN_DEFAULT_PV_LIMIT.archived, 0)
  assert.strictEqual(getPvLimit('free'), 10_000)
  assert.strictEqual(getPvLimit('starter'), 250_000)
  assert.strictEqual(getPvLimit('growth'), 1_000_000)
  assert.strictEqual(getPvLimit('scale'), 5_000_000)
})

// Structural limits (Change 4): retention/sites/team_members/webhooks per tier.
test('PLAN_STRUCTURAL_LIMITS — new structural limits', () => {
  assert.strictEqual(getStructuralLimits('free').retention_days, 365)

  const starter = getStructuralLimits('starter')
  assert.strictEqual(starter.retention_days, 1095)
  assert.strictEqual(starter.sites, 3)
  assert.strictEqual(starter.team_members, 3)
  assert.strictEqual(starter.webhooks, 5)

  const growth = getStructuralLimits('growth')
  assert.strictEqual(growth.retention_days, 1095)
  assert.strictEqual(growth.sites, 10)
  assert.strictEqual(growth.team_members, 10)

  // scale's retention_days stays 1825 — NOT a correction after all. This key is
  // a ceiling on PUT /api/gdpr/retention (app-side Postgres purge,
  // retention-purge.js) ONLY; Postgres has no TTL, so 1825 days is genuinely
  // achievable there. It does not govern the separate 400-day Tinybird
  // ENGINE_TTL. Reducing it to 1095 would have cut a real capability based on
  // a ceiling that doesn't apply to the mechanism it was compared against.
  assert.strictEqual(getStructuralLimits('scale').retention_days, 1825)

  // trial/inactive/archived are untouched by this change.
  assert.strictEqual(getStructuralLimits('trial').retention_days, 365)
  assert.strictEqual(getStructuralLimits('inactive').retention_days, 0)
  assert.strictEqual(getStructuralLimits('archived').retention_days, 0)
})

// Guard the rest of the matrix so flag and quota stay aligned per plan:
// a non-zero webhook quota must imply the feature is enabled, and vice versa.
test('webhook flag and quota agree across all plans', () => {
  for (const plan of ['free', 'trial', 'starter', 'growth', 'scale']) {
    const enabled = hasFeature(plan, 'webhook_outbound')
    const quota = getStructuralLimits(plan).webhooks
    assert.strictEqual(
      enabled, quota > 0,
      `${plan}: webhook_outbound=${enabled} but webhooks quota=${quota} (must match)`
    )
  }
})
