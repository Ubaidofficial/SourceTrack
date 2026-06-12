import { getStructuralLimits } from './plan-features.js'
import { getSupabase } from './supabase.js'

/**
 * Atomically claims one conversion usage for the given site in the current calendar month.
 * Uses limits from api/lib/plan-features.js and increments using a PostgreSQL RPC.
 *
 * @param {Object} site - The site object containing `id` and `plan`.
 * @returns {Promise<{ allowed: boolean, count: number, limit: number }>}
 */
export async function claimConversionUsage(site) {
  if (!site || !site.id) {
    throw new Error('Invalid site object: id is required')
  }

  const limits = getStructuralLimits(site.plan)
  const limit = limits.conversion_events ?? Infinity

  // If the limit is Infinity, returning allowed without a DB write is acceptable.
  // Note: unlimited-plan usage is not tracked by this counter unless intentionally tracked.
  if (limit === Infinity) {
    return { allowed: true, count: 0, limit }
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthStr = `${year}-${month}`

  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('claim_site_conversion_usage', {
      p_site_id: site.id,
      p_month: monthStr,
      p_limit: limit
    })

  if (error) {
    throw error
  }

  // claim_site_conversion_usage returns a table set of (allowed boolean, current_count integer)
  // Since rpc returns an array of records in `data`, select the first one.
  const result = data && data[0] ? data[0] : { allowed: false, current_count: 0 }

  return {
    allowed: !!result.allowed,
    count: result.current_count ?? 0,
    limit
  }
}
