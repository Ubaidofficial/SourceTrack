import NodeCache from 'node-cache'
import { getSupabase } from '../lib/supabase.js'
import { normalizePlan, getPvLimit } from '../lib/plan-features.js'

// Cache counts for 5 minutes — avoids a Supabase query on every pageview
const countCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

// Returns start of current calendar month as ISO string
function monthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

// Count pageviews this month for the site (raw pageview count, not unique sessions).
// Backed by RPC `count_monthly_pageviews(site_id, month_start)` which the
// retention migration assumes exists; if it doesn't, the catch in the middleware
// fails open so tracking still works.
async function getMonthlyPageviews(siteId) {
  const cacheKey = `pv:${siteId}:${new Date().toISOString().slice(0, 7)}`
  const cached = countCache.get(cacheKey)
  if (cached !== undefined) return cached
  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('count_monthly_pageviews', {
      p_site_id: siteId,
      p_month_start: monthStart()
    })
  const count = error ? 0 : (data ?? 0)
  countCache.set(cacheKey, count)
  return count
}

// Middleware — call AFTER validateSiteKey (req.site must exist)
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
            message: 'Your 14-day trial has ended. Upgrade to continue tracking.'
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

    const limit = getPvLimit(plan, req.site?.pv_limit)
    if (!limit || limit <= 0) return next()  // No limit configured → fail open

    const siteId = req.site?.id
    if (!siteId) return next()

    const currentCount = await getMonthlyPageviews(siteId)

    if (currentCount >= limit) {
      return res.status(402).json({
        success: false,
        error: 'Monthly pageview limit reached',
        data: {
          current_plan: plan,
          limit,
          current_count: currentCount,
          upgrade_url: '/billing',
          message: `Your ${plan} plan allows ${limit.toLocaleString()} pageviews/month. Upgrade to continue tracking.`
        }
      })
    }

    req._tierCacheKey = `pv:${siteId}:${new Date().toISOString().slice(0, 7)}`
    next()
  } catch (_err) {
    // Fail open — never block tracking due to a counting error
    next()
  }
}

// Call this after a pageview/conversion is recorded to bust the cache
export function bustTierCache(siteId) {
  const key = `pv:${siteId}:${new Date().toISOString().slice(0, 7)}`
  countCache.del(key)
}
