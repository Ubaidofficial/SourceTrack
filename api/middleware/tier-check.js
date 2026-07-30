import { normalizePlan } from '../lib/plan-features.js'

// Middleware — call AFTER validateSiteKey (req.site must exist).
//
// IMPORTANT — 140G-4 scope clarification:
// This middleware enforces ACCOUNT STATUS gates only:
//   - Expired trials → 402
//   - Inactive subscriptions → 402
//   - Archived sites → 402
//
// Pageview QUOTA claiming has been deliberately moved OUT of this middleware and into
// each ingestion handler at the latest safe point (immediately before ph.capture or
// Supabase pageviews.insert). This was required because blind middleware-level quota
// claiming would consume quota for events that the handler itself would drop (bots,
// excluded paths, custom events, unsupported events, duplicates). Quota must only be
// consumed for events that actually reach the PostHog/Supabase capture step.
//
// The old count_monthly_pageviews RPC used here was also broken: it counted from the
// Supabase `pageviews` table, which the modern tracker never writes to (it writes to
// PostHog only). The counter was effectively always 0. It has been replaced by the
// atomic claim_site_pageview_usage RPC in api/lib/pageview-limits.js, called in-handler.
//
// See: docs/archive/qa/pageview_limit_enforcement_140G-4.md for full audit and rationale.
export async function checkTierLimit(req, res, next) {
  try {
    const plan = normalizePlan(req.site?.plan || 'free')

    // Block expired trials regardless of usage
    if (plan === 'trial' && req.site?.trial_ends_at) {
      const expired = new Date(req.site.trial_ends_at) < new Date()
      if (expired) {
        return res.status(402).json({
          success: false,
          error: 'Trial expired',
          data: {
            current_plan: 'trial',
            trial_ends_at: req.site.trial_ends_at,
            upgrade_url: '/billing',
            message: 'Your 28-day trial has ended. Upgrade to continue tracking.'
          }
        })
      }
    }

    // Block inactive / archived sites entirely
    if (plan === 'inactive' || plan === 'archived') {
      return res.status(402).json({
        success: false,
        error: plan === 'archived' ? 'Site archived due to inactivity' : 'Subscription inactive',
        data: {
          current_plan: plan,
          upgrade_url: '/billing',
          message: plan === 'archived'
            ? 'This free-tier site was archived after 60 days of no activity. Reactivate from Settings.'
            : 'Your subscription is inactive. Update payment to resume tracking.'
        }
      })
    }

    next()
  } catch (_err) {
    // Fail open — never block tracking due to a status check error
    next()
  }
}
