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
// Per-site overrides live in sites.pv_limit (set by Stripe webhook from price).
export const PLAN_DEFAULT_PV_LIMIT = {
  free:     5_000,
  trial:    10_000,
  starter:  50_000,
  growth:   150_000,
  scale:    500_000,
  inactive: 0,
  archived: 0,
}

// Feature matrix. true = available on that plan, false = blocked.
// Keep this list in sync with what the Landing page promises.
const FEATURE_MATRIX = {
  // ── Free is excluded from every cost-heavy feature ────────────────────────
  multi_touch_attribution: { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  capi_server_side:        { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  over_reporting_detection:{ free: false, trial: true,  starter: true,  growth: true,  scale: true },
  revenue_analytics:       { free: false, trial: true,  starter: false, growth: true,  scale: true },
  custom_segments:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  funnels_cohorts:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  email_reports:           { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  csv_export:              { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  api_access:              { free: false, trial: true,  starter: false, growth: true,  scale: true },
  multi_user:              { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  cookieless_mode:         { free: false, trial: true,  starter: false, growth: true,  scale: true },
  white_label:             { free: false, trial: false, starter: false, growth: false, scale: false },
  manual_spend:            { free: false, trial: true,  starter: false, growth: true,  scale: true },
  manual_revenue_status:    { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_analytics:            { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_chat:                 { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  saved_reports:           { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  dashboard_widgets:       { free: false, trial: true,  starter: false, growth: true,  scale: true },
  advanced_report_builder: { free: false, trial: false, starter: false, growth: true,  scale: true },
  revenue_attribution:     { free: false, trial: true,  starter: false, growth: true,  scale: true },
  campaign_drilldowns:     { free: false, trial: false, starter: false, growth: true,  scale: true },
  ad_cost_sync:            { free: false, trial: false, starter: false, growth: true,  scale: true },
  gsc_seo_revenue:         { free: false, trial: false, starter: false, growth: true,  scale: true },
  cross_domain_tracking:   { free: false, trial: false, starter: false, growth: true,  scale: true },
  alerts:                  { free: false, trial: false, starter: false, growth: true,  scale: true },
  // ── Live analytics: explicitly kept ON for free tier (no delay) ───────────
  live_analytics:          { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  last_touch_attribution:  { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  webhook_outbound:        { free: false, trial: true,  starter: false, growth: true,  scale: true },
}

// Numeric/structural limits beyond the feature toggle matrix.
export const PLAN_STRUCTURAL_LIMITS = {
  free:     { sites: 1,        webhooks: 0, team_members: 1,  retention_days: 30,   conversion_events: 30 },
  trial:    { sites: 1,        webhooks: 5, team_members: 1,  retention_days: 365,  conversion_events: 99 },
  starter:  { sites: 1,        webhooks: 0, team_members: 1,  retention_days: 90,   conversion_events: 150 },
  growth:   { sites: 3,        webhooks: 20,team_members: 3,  retention_days: 365,  conversion_events: 750 },
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
