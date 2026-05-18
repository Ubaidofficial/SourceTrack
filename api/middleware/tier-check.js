import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import NodeCache from 'node-cache'

// Cache counts for 5 minutes — avoids a Supabase query on every pageview
const countCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: WebSocket } }
  )
}

// Monthly lead limits per plan (unique sessions counted from pageviews table)
const PLAN_LIMITS = {
  trial:   200,   // same as Starter during trial
  starter: 1000,
  pro:     4000,
  agency:  10000
}

// Returns start of current calendar month as ISO string
function monthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

// Count unique sessions this month for the site
async function getMonthlyLeadCount(siteId) {
  const cacheKey = `leads:${siteId}:${new Date().toISOString().slice(0, 7)}`
  const cached = countCache.get(cacheKey)
  if (cached !== undefined) return cached
  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('count_monthly_sessions', {
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
    const plan  = req.site?.plan || 'trial'
    const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial

    // No limit for unknown plans — fail open (don't block tracking if misconfigured)
    if (!limit) return next()

    const siteId = req.site?.id
    if (!siteId) return next()

    const currentCount = await getMonthlyLeadCount(siteId)

    if (currentCount >= limit) {
      return res.status(402).json({
        success: false,
        error: 'Monthly lead limit reached',
        data: {
          current_plan: plan,
          limit,
          current_count: currentCount,
          upgrade_url: '/settings',
          message: `Your ${plan} plan allows ${limit} leads/month. Upgrade to continue tracking.`
        }
      })
    }

    // Invalidate cache after this request so next check is fresh
    // (only on conversion events, not every pageview — too expensive)
    req._tierCacheKey = `leads:${siteId}:${new Date().toISOString().slice(0, 7)}`
    next()
  } catch (_err) {
    // Fail open — never block tracking due to a counting error
    next()
  }
}

// Call this after a conversion is recorded to bust the cache
export function bustTierCache(siteId) {
  const key = `leads:${siteId}:${new Date().toISOString().slice(0, 7)}`
  countCache.del(key)
}
