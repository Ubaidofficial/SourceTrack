// Single source of truth for per-plan limits and feature gates.
// Importable from both routes (request-time checks) and jobs (batch filtering).

// Canonical plan names — match Landing.jsx marketing.
// 'pro', 'agency', and 'business' are legacy aliases; mapped here for backwards compat.
export const PLAN_ALIASES = {
  pro:      'growth',
  agency:   'scale',
  business: 'scale',
}

export function normalizePlan(plan) {
  return PLAN_ALIASES[plan] || plan || 'free'
}

// Default monthly analytics event limits per plan tier.
//
// ⚠️ THESE DEFAULTS DO NOT REACH AN EXISTING SITE. Per-site overrides live in
// sites.pv_limit, getPvLimit() below returns the override whenever one is present, and the
// column carries a DEFAULT of 5000 — so an override ALWAYS exists and this table is only
// consulted for a plan with no row behind it. Changing a number here reprices NOTHING
// without a backfill migration. #428 changed this table on 2026-07-26 and shipped no
// backfill; every live site is still metered on its pre-#428 value. See KI-109.
//
// HOW A ROW ACTUALLY GETS ITS VALUE — the previous version of this comment said "set by
// Stripe webhook from price", which is why the defect resisted three investigations: no
// Stripe price carries pv_limit metadata, so the stated mechanism could not have produced
// the stored values and each search stalled there. The real path is pvLimitFromPrice
// (api/routes/billing.js:77-81): price.metadata.pv_limit IF PRESENT, otherwise a fallback
// to getPvLimit(plan) — the plan default FROZEN AT WRITE TIME. The fallback is the normal
// case; metadata is the exception nobody uses.
export const PLAN_DEFAULT_PV_LIMIT = {
  free:     10_000,
  trial:    10_000,
  starter:  250_000,
  growth:   1_000_000,
  scale:    5_000_000,
  inactive: 0,
  archived: 0,
}

// Feature matrix. true = available on that plan, false = blocked.
// Keep this list in sync with what the Landing page promises.
//
// REPACKAGE: paid tiers differentiate on VOLUME (see PLAN_DEFAULT_PV_LIMIT /
// PLAN_STRUCTURAL_LIMITS), not features — starter matches growth on every row
// here (enforced by the invariant test in plan-features.test.js). This closes
// a downgrade-on-purchase gap: trial previously had strictly more features
// than paid starter (revenue_attribution, api_access, cookieless_mode,
// dashboard_widgets, manual_spend, webhook_outbound, and others below), so a
// customer who paid for starter LOST access a trial user had. white_label is
// false everywhere — it doesn't exist as a feature; not part of this change.
export const FEATURE_MATRIX = {
  // ── Free is excluded from every cost-heavy feature ────────────────────────
  multi_touch_attribution: { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  capi_server_side:        { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  over_reporting_detection:{ free: false, trial: true,  starter: true,  growth: true,  scale: true },
  revenue_analytics:       { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  // Funnels: BOTH reasons this was false on every tier are now gone, so the gate opens.
  //   1. It read `.from('pageviews')`, empty by design (CLAUDE.md §5) — repointed to the
  //      Tinybird `summary` pipe in #456, so it returns real data.
  //   2. It had zero callers in dashboard/src — the Funnels section on the Analytics page
  //      is that caller, and FunnelChart.jsx (deleted as unimported dead code in #317) is
  //      restored alongside it.
  // starter MATCHES growth, as every paid row must. The brief said "growth + trial + any
  // tier above growth", which would have left starter FALSE while trial was TRUE — exactly
  // the downgrade-on-purchase gap (#428) that the 🔴 starter===growth invariant in
  // plan-features.test.js exists to prevent, and it fails that test. A trial user
  // converting to the cheapest paid tier must not LOSE funnels, so starter is true too.
  // free stays false: it is excluded from every cost-heavy feature, and a funnel run is a
  // 50k-row pipe read.
  funnels_cohorts:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  email_reports:           { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  csv_export:              { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  api_access:              { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  // Multi-user: same phantom-feature class as funnels_cohorts. There is no
  // invite route, seat-management endpoint, or role-management implementation
  // anywhere in api/routes (`grep -rln "invite" api/routes/` returns nothing),
  // and company_members is read ONLY — every reference is an authorization
  // check (ad-platforms.js, admin.js, gdpr.js, google-search-console.js,
  // middleware/user-auth.js), never a write. False on every tier, not
  // conditionally true — starter===growth still holds (false everywhere).
  multi_user:              { free: false, trial: false, starter: false, growth: false, scale: false },
  cookieless_mode:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  white_label:             { free: false, trial: false, starter: false, growth: false, scale: false },
  manual_spend:            { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  manual_revenue_status:    { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_analytics:            { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_chat:                 { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  saved_reports:           { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  dashboard_widgets:       { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  advanced_report_builder: { free: false, trial: false, starter: true,  growth: true,  scale: true },
  revenue_attribution:     { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  campaign_drilldowns:     { free: false, trial: false, starter: true,  growth: true,  scale: true },
  ad_cost_sync:            { free: false, trial: false, starter: true,  growth: true,  scale: true },
  gsc_seo_revenue:         { free: false, trial: false, starter: true,  growth: true,  scale: true },
  cross_domain_tracking:   { free: false, trial: false, starter: true,  growth: true,  scale: true },
  alerts:                  { free: false, trial: false, starter: true,  growth: true,  scale: true },
  // ── Live analytics: explicitly kept ON for free tier (no delay) ───────────
  live_analytics:          { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  last_touch_attribution:  { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  webhook_outbound:        { free: false, trial: true,  starter: true,  growth: true,  scale: true },
}

// Numeric/structural limits beyond the feature toggle matrix.
//
// WHAT'S ACTUALLY ENFORCED, per key — do not generate pricing copy from an
// unenforced number:
//   sites             ENFORCED — site-limits.js:41-48, 402 on create over limit.
//   conversion_events  METERED, NEVER ENFORCED — conversion-limits.js counts every
//                       conversion but never refuses one, on any tier (founder decision
//                       2026-07-26). It previously 402'd/dropped at the limit; on the
//                       Stripe path that drop also rolled the idempotency key back and
//                       returned HTTP 200, so a real customer purchase was destroyed
//                       while we told Stripe it was delivered — and Stripe never retries
//                       a 2xx. A quota exists for cost control and 2500 conversions/month
//                       is not a cost; a dropped conversion is a permanently wrong revenue
//                       number. The value below is therefore a soft target used for
//                       metering and messaging only — DO NOT write pricing copy that says
//                       conversions stop, pause, or are capped at it.
//   retention_days     ENFORCED as a CEILING only — gdpr.js:584-606 (PUT
//                       /api/gdpr/retention). Never applied per plan on its
//                       own: sites.data_retention_days defaults NULL, which
//                       means "keep forever." This governs the app-side
//                       Postgres purge (retention-purge.js) ONLY — the
//                       separate 400-day Tinybird ENGINE_TTL is a different
//                       mechanism this key does not touch at all.
//   webhooks           the quota value is kept consistent with the
//                       webhook_outbound flag (see the invariant test), but
//                       webhooks.js:75-96 hardcodes a max of 1 destination per
//                       site regardless of plan (MVP restriction) — so the
//                       per-plan number beyond 1 is not independently enforced.
//   team_members       NOT ENFORCED — no invite route exists; multi_user is
//                       false on every tier (see FEATURE_MATRIX above).
export const PLAN_STRUCTURAL_LIMITS = {
  free:     { sites: 1,        webhooks: 0, team_members: 1,  retention_days: 365,  conversion_events: 30 },
  trial:    { sites: 1,        webhooks: 5, team_members: 1,  retention_days: 365,  conversion_events: 99 },
  starter:  { sites: 3,        webhooks: 5, team_members: 3,  retention_days: 1095, conversion_events: 150 },
  growth:   { sites: 10,       webhooks: 20,team_members: 10, retention_days: 1095, conversion_events: 750 },
  scale:    { sites: Infinity, webhooks: 99,team_members: 99, retention_days: 1825, conversion_events: 2500 },
  inactive: { sites: 0,        webhooks: 0, team_members: 0,  retention_days: 0,    conversion_events: 0 },
  archived: { sites: 0,        webhooks: 0, team_members: 0,  retention_days: 0,    conversion_events: 0 },
}

// Public API ────────────────────────────────────────────────────────────────

export function isSiteStatusBlocked(site) {
  const plan = normalizePlan(site?.plan || 'free')
  if (plan === 'trial' && site?.trial_ends_at) {
    return new Date(site.trial_ends_at) < new Date()
  }
  return plan === 'inactive' || plan === 'archived'
}


export function hasFeature(plan, featureKey) {
  const p = normalizePlan(plan)
  const row = FEATURE_MATRIX[featureKey]
  if (!row) return false   // Unknown features are gated by default
  return row[p] === true
}

export function getPvLimit(plan, perSiteOverride) {
  if (perSiteOverride && (Number.isFinite(perSiteOverride) || perSiteOverride === Infinity)) return perSiteOverride
  return PLAN_DEFAULT_PV_LIMIT[normalizePlan(plan)] ?? 0
}

export function getStructuralLimits(plan) {
  return PLAN_STRUCTURAL_LIMITS[normalizePlan(plan)] || PLAN_STRUCTURAL_LIMITS.free
}

// Convenience guard — returns 402 payload if blocked, null if allowed.
// Usage: const block = requireFeature(req.site.plan, 'capi_server_side'); if (block) return res.status(402).json(block)
export function requireFeature(plan, featureKey, friendlyName) {
  if (hasFeature(plan, featureKey)) return null
  return {
    success: false,
    data: null,
    error: 'Feature not available on your plan',
    upgrade: {
      current_plan: normalizePlan(plan),
      required_feature: featureKey,
      message: `${friendlyName || featureKey} is not available on the ${normalizePlan(plan)} plan. Upgrade to unlock.`,
      upgrade_url: '/billing',
    },
  }
}
