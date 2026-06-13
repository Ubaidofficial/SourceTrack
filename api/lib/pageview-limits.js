import { getPvLimit } from './plan-features.js'
import { getSupabase } from './supabase.js'

/**
 * Atomically claims one pageview usage unit for the given site in the current calendar month.
 *
 * Design decisions (140G-4):
 * - Only called for true $pageview events; custom events and conversions never call this.
 * - Called at the latest safe point inside each ingestion handler — AFTER bot filtering,
 *   path exclusion, PII redaction, and all payload validation. NOT in middleware blindly.
 * - Mirrors claimConversionUsage from api/lib/conversion-limits.js exactly in structure.
 * - Fail-open: throws on DB error; callers catch and log, then fail open (do not block tracking).
 * - Month is always UTC YYYY-MM to avoid timezone drift across deployments.
 *
 * @param {Object} site - The site object with `id`, `plan`, and optionally `pv_limit`.
 * @returns {Promise<{ allowed: boolean, count: number, limit: number }>}
 */
export async function claimPageviewUsage(site) {
  if (!site || !site.id) {
    throw new Error('Invalid site object: id is required')
  }

  const limit = getPvLimit(site.plan, site.pv_limit)

  // Unlimited plans (limit === Infinity) bypass DB rpc checks and are always allowed
  if (limit === Infinity) {
    return { allowed: true, count: 0, limit }
  }

  // Inactive/archived sites have a pv_limit of 0 — block without a DB write.
  // (checkTierLimit middleware already catches these, but defence-in-depth applies here too.)
  if (limit === 0) {
    return { allowed: false, count: 0, limit: 0 }
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthStr = `${year}-${month}`

  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('claim_site_pageview_usage', {
      p_site_id: site.id,
      p_month: monthStr,
      p_limit: limit
    })

  if (error) {
    throw error
  }

  // claim_site_pageview_usage returns a table set of (allowed boolean, current_count integer).
  // Supabase RPC returns an array of records; select the first.
  const result = data && data[0] ? data[0] : { allowed: false, current_count: 0 }

  return {
    allowed: !!result.allowed,
    count: result.current_count ?? 0,
    limit
  }
}
