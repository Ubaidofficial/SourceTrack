// Dashboard-side mirror of api/lib/plan-features.js. Keep the two in sync —
// the API gates writes, this gates the UI so users see locked states instead
// of broken/empty surfaces.

export const PLAN_ALIASES = {
  pro:      'growth',
  agency:   'scale',
  business: 'scale',
}

export function normalizePlan(plan) {
  return PLAN_ALIASES[plan] || plan || 'free'
}

// SYNCED to api/lib/plan-features.js, 2026-08-04. That file is the source of truth: it
// carries the design rationale, it is pinned by api/tests/plan-features.test.js, and it is
// what actually ENFORCES access. A value here can only ever be wrong about what the server
// will do — which is precisely what had happened.
//
// This table had drifted on 17 (key, tier) pairs, and the drift was not random. The backend
// was REPACKAGED (plan-features.js:31-38) so paid tiers differentiate on VOLUME, not
// features — "starter matches growth on every row". That repackaging existed to close a
// downgrade-on-purchase gap where trial had strictly more features than paid starter. The
// backend closed it; this file never followed, so the exact bug the backend fixed was still
// what a customer SAW: finish a trial, pay for Starter, watch 13 features re-lock.
//
// multi_user is the other direction and worse: it was true here on trial/starter/growth/
// scale while the backend grants it on NO tier at any price. The UI was advertising a
// capability that does not exist. It is false everywhere now, matching the backend.
//
// Parity is enforced by api/tests/plan-features-parity.test.js. If you edit one table,
// that test fails until you edit the other — the lockstep rule reportGating.js:8 has always
// documented, now with something behind it.
const FEATURE_MATRIX = {
  multi_touch_attribution:  { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  capi_server_side:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  over_reporting_detection: { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  revenue_analytics:        { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  funnels_cohorts:          { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  email_reports:            { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  csv_export:               { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  api_access:               { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  multi_user:               { free: false, trial: false, starter: false, growth: false, scale: false },
  cookieless_mode:          { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  white_label:              { free: false, trial: false, starter: false, growth: false, scale: false },
  manual_spend:             { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  manual_revenue_status:    { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_analytics:             { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  ai_chat:                  { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  saved_reports:            { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  dashboard_widgets:        { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  advanced_report_builder:  { free: false, trial: false, starter: true,  growth: true,  scale: true },
  revenue_attribution:      { free: false, trial: true,  starter: true,  growth: true,  scale: true },
  campaign_drilldowns:      { free: false, trial: false, starter: true,  growth: true,  scale: true },
  ad_cost_sync:             { free: false, trial: false, starter: true,  growth: true,  scale: true },
  gsc_seo_revenue:          { free: false, trial: false, starter: true,  growth: true,  scale: true },
  cross_domain_tracking:    { free: false, trial: false, starter: true,  growth: true,  scale: true },
  alerts:                   { free: false, trial: false, starter: true,  growth: true,  scale: true },
  live_analytics:           { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  last_touch_attribution:   { free: true,  trial: true,  starter: true,  growth: true,  scale: true },
  webhook_outbound:         { free: false, trial: true,  starter: true,  growth: true,  scale: true },
}

export function hasFeature(plan, featureKey) {
  const p = normalizePlan(plan)
  const row = FEATURE_MATRIX[featureKey]
  if (!row) return false
  return row[p] === true
}

// Friendly labels for the upgrade prompt UI.
export const FEATURE_LABELS = {
  multi_touch_attribution:  'Multi-touch attribution',
  capi_server_side:         'Server-side CAPI sync',
  over_reporting_detection: 'Over-reporting detection',
  revenue_analytics:        'Revenue analytics',
  funnels_cohorts:          'Funnels & cohorts',
  email_reports:            'Email reports',
  csv_export:               'CSV export',
  api_access:               'API access',
  multi_user:               '1 user',
  cookieless_mode:          'Cookieless tracking',
  white_label:              'Unbranded CSV export',
  manual_spend:             'Manual spend entry',
  manual_revenue_status:    'Manual revenue/status',
  ai_analytics:             'Campaign verdicts',
  ai_chat:                  'AI Chat assistant',
  saved_reports:            'Saved reports',
  dashboard_widgets:        'Dashboard widgets',
  advanced_report_builder:  'Advanced Report Builder',
  revenue_attribution:      'Revenue attribution',
  campaign_drilldowns:      'Campaign drilldowns',
  ad_cost_sync:             'Ad cost sync',
  gsc_seo_revenue:          'GSC/SEO revenue attribution',
  cross_domain_tracking:    'Cross-domain tracking',
  alerts:                   'Alerts',
  // These three are in FEATURE_MATRIX but were missing here, so an upgrade prompt raised on
  // any of them had no name to render. webhook_outbound is the live case: it is one of the
  // rows this sync unlocks for Starter, so it can now be the subject of a prompt.
  webhook_outbound:         'Outbound webhooks',
  live_analytics:           'Live analytics',
  last_touch_attribution:   'Last-touch attribution',
}

// Returns the minimum paid plan name that unlocks the feature, for upgrade copy.
export function minPlanFor(featureKey) {
  const row = FEATURE_MATRIX[featureKey]
  if (!row) return 'starter'
  for (const plan of ['starter', 'growth', 'scale']) {
    if (row[plan] === true) return plan
  }
  return 'scale'
}
