import { getStructuralLimits } from './plan-features.js'
import { getSupabase } from './supabase.js'

/**
 * Checks if a user or company is allowed to create another site based on their existing active sites.
 * Uses plan structural limits from api/lib/plan-features.js.
 *
 * @param {Object} scope - The query scope { owner_id, company_id }
 * @returns {Promise<{ allowed: boolean, count: number, limit: number, scopeType: 'company' | 'owner' }>}
 */
export async function checkSiteCreationLimit(scope) {
  const supabase = getSupabase()

  // Prefer company_id if present, fallback to owner_id
  let scopeType
  let query = supabase
    .from('sites')
    .select('plan')
    .neq('plan', 'archived')

  if (scope.company_id) {
    query = query.eq('company_id', scope.company_id)
    scopeType = 'company'
  } else if (scope.owner_id) {
    query = query.eq('owner_id', scope.owner_id)
    scopeType = 'owner'
  } else {
    throw new Error('Invalid scope: owner_id or company_id must be provided')
  }

  const { data: activeSites, error } = await query
  if (error) {
    throw error
  }

  const count = activeSites ? activeSites.length : 0

  // Fallback limit logic:
  // - 0 active sites: treat as free (limit 1)
  // - >0 active sites: take the maximum limit configured across existing active plans
  let limit = getStructuralLimits('free').sites // Default to 1
  if (count > 0) {
    const limits = activeSites.map(s => getStructuralLimits(s.plan).sites)
    limit = Math.max(...limits)
  }

  return {
    allowed: count < limit,
    count,
    limit,
    scopeType
  }
}
