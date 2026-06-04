// Dashboard-side mirror of api/lib/plan-features.js. Keep the two in sync —
// the API gates writes, this gates the UI so users see locked states instead
// of broken/empty surfaces.

export const PLAN_ALIASES = {
  pro:    'growth',
  agency: 'business',
}

export function normalizePlan(plan) {
  return PLAN_ALIASES[plan] || plan || 'free'
}

const FEATURE_MATRIX = {
  multi_touch_attribution:  { free: false, trial: true,  starter: true,  growth: true,  business: true },
  capi_server_side:         { free: false, trial: true,  starter: true,  growth: true,  business: true },
  over_reporting_detection: { free: false, trial: true,  starter: true,  growth: true,  business: true },
  revenue_analytics:        { free: false, trial: true,  starter: true,  growth: true,  business: true },
  custom_segments:          { free: false, trial: true,  starter: true,  growth: true,  business: true },
  funnels_cohorts:          { free: false, trial: true,  starter: true,  growth: true,  business: true },
  email_reports:            { free: false, trial: true,  starter: true,  growth: true,  business: true },
  csv_export:               { free: false, trial: true,  starter: true,  growth: true,  business: true },
  api_access:               { free: false, trial: true,  starter: true,  growth: true,  business: true },
  multi_user:               { free: false, trial: true,  starter: true,  growth: true,  business: true },
  cookieless_mode:          { free: false, trial: true,  starter: false, growth: true,  business: true },
  white_label:              { free: false, trial: false, starter: false, growth: false, business: true },
  manual_spend:             { free: false, trial: true,  starter: true,  growth: true,  business: true },
  ai_analytics:             { free: false, trial: true,  starter: true,  growth: true,  business: true },
  ai_chat:                  { free: false, trial: true,  starter: true,  growth: true,  business: true },
  saved_reports:            { free: false, trial: true,  starter: true,  growth: true,  business: true },
  live_analytics:           { free: true,  trial: true,  starter: true,  growth: true,  business: true },
  last_touch_attribution:   { free: true,  trial: true,  starter: true,  growth: true,  business: true },
  webhook_outbound:         { free: true,  trial: true,  starter: true,  growth: true,  business: true },
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
  custom_segments:          'Custom segments',
  funnels_cohorts:          'Funnels & cohorts',
  email_reports:            'Email reports',
  csv_export:               'CSV export',
  api_access:               'API access',
  multi_user:               'Team members',
  cookieless_mode:          'Cookieless tracking',
  white_label:              'White-label reports',
  manual_spend:             'Manual spend entry',
  ai_analytics:             'AI Analytics',
  ai_chat:                  'AI Chat assistant',
  saved_reports:            'Saved reports',
}

// Returns the minimum paid plan name that unlocks the feature, for upgrade copy.
export function minPlanFor(featureKey) {
  const row = FEATURE_MATRIX[featureKey]
  if (!row) return 'starter'
  for (const plan of ['starter', 'growth', 'business']) {
    if (row[plan] === true) return plan
  }
  return 'business'
}
