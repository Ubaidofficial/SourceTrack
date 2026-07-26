import { getPvLimit, normalizePlan } from './plan-features.js'
import { getSupabase } from './supabase.js'

// SOFT vs HARD cap — exceeding a quota must never destroy data irreversibly.
//
// Passing the plan limit as the RPC's p_limit is what USED to make this a data-loss
// path: claim_site_pageview_usage (baseline_schema.sql:164-205) does NOT increment once
// v_current_count >= p_limit — it returns FALSE with the count frozen. So the counter
// could never pass the plan limit, and every event beyond it was dropped before any
// write. Permanently. For an attribution product a gap in the event stream does not
// yield MISSING numbers, it yields confidently WRONG ones (split sessions, lost
// first-touch, revenue credited to the wrong source) — the §6 failure mode.
//
// So we pass the HARD CAP as p_limit (letting the counter climb past the plan limit) and
// derive the lock state in the app by comparing the returned count against the SOFT plan
// limit. No RPC change, no migration.
//
// The hard cap is a SAFETY VALVE against a runaway loop or an abusive install — not a
// product limit, and not a number to put on a pricing page. Free/trial get the tighter
// multiple; paying customers get the wide one, because cutting off a paying customer's
// data is the worse of the two failures.
export const HARD_CAP_MULTIPLIER_FREE = 3
export const HARD_CAP_MULTIPLIER_PAID = 10

const FREE_TIER_PLANS = new Set(['free', 'trial'])

/**
 * Hard cap for a plan's soft limit. `trial` counts as free-tier: a trial user is not a
 * paying customer, so it gets the tighter valve.
 *
 * @param {string} plan
 * @param {number} softLimit
 * @returns {number} the count at which events are finally dropped
 */
export function hardCapFor(plan, softLimit) {
  if (softLimit === Infinity) return Infinity
  const multiplier = FREE_TIER_PLANS.has(normalizePlan(plan))
    ? HARD_CAP_MULTIPLIER_FREE
    : HARD_CAP_MULTIPLIER_PAID
  return softLimit * multiplier
}

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
 * THREE STATES — deliberately not collapsed to a boolean, because "past quota" and
 * "stop collecting" are different facts and only one of them may drop data:
 *   'ok'         count <  soft   -> write the event, no flag
 *   'over_soft'  soft <= count < hard -> WRITE THE EVENT, flag it over-quota
 *   'hard_cap'   count >= hard   -> drop (the ONLY case that drops)
 *
 * `allowed` is kept as a convenience alias for "write the event" (i.e. state !== 'hard_cap')
 * so existing call sites that branch on it stay correct. `limit` remains the SOFT plan
 * limit — what the customer actually bought, and what every existing log line and test
 * means by "limit".
 *
 * BOUNDARY: the RPC returns the POST-increment count, so 'over_soft' begins at
 * count === soft — the event that consumes 100% of the allowance is the first one flagged.
 * That matches the 100% usage-threshold email, which also fires at count >= limit.
 *
 * @param {Object} site - The site object with `id`, `plan`, and optionally `pv_limit`.
 * @returns {Promise<{ state: 'ok'|'over_soft'|'hard_cap', allowed: boolean, overQuota: boolean,
 *                     count: number, limit: number, softLimit: number, hardCap: number }>}
 */
export async function claimPageviewUsage(site) {
  if (!site || !site.id) {
    throw new Error('Invalid site object: id is required')
  }

  const limit = getPvLimit(site.plan, site.pv_limit)

  // Unlimited plans (limit === Infinity) bypass DB rpc checks and are always allowed
  if (limit === Infinity) {
    return { state: 'ok', allowed: true, overQuota: false, count: 0, limit, softLimit: limit, hardCap: Infinity }
  }

  // Inactive/archived sites have a pv_limit of 0 — block without a DB write.
  // (checkTierLimit middleware already catches these, but defence-in-depth applies here too.)
  // Deliberately NOT routed through the soft/hard logic: there is no allowance to exceed,
  // so 0 x any multiplier is still 0 and the event is dropped as before.
  if (limit === 0) {
    return { state: 'hard_cap', allowed: false, overQuota: true, count: 0, limit: 0, softLimit: 0, hardCap: 0 }
  }

  const hardCap = hardCapFor(site.plan, limit)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthStr = `${year}-${month}`

  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('claim_site_pageview_usage', {
      p_site_id: site.id,
      p_month: monthStr,
      // The HARD cap, not the plan limit — see the note at the top of this file.
      p_limit: hardCap
    })

  if (error) {
    throw error
  }

  // claim_site_pageview_usage returns a table set of (allowed boolean, current_count integer).
  // Supabase RPC returns an array of records; select the first.
  const result = data && data[0] ? data[0] : { allowed: false, current_count: 0 }
  const count = result.current_count ?? 0

  // The RPC only refuses at p_limit, which is now the hard cap.
  if (!result.allowed) {
    return { state: 'hard_cap', allowed: false, overQuota: true, count, limit, softLimit: limit, hardCap }
  }

  const state = count < limit ? 'ok' : 'over_soft'

  // Runaway visibility: WARN once per crossing of an integer multiple of the soft limit
  // (2x, 3x, …), so sustained over-quota usage is visible in logs BEFORE it silently
  // rides up to the hard cap. Exact equality means one line per crossing, not one per
  // event past quota.
  if (state === 'over_soft' && count % limit === 0) {
    const multiple = count / limit
    if (multiple >= 2) {
      console.warn(
        `[pageview-limits] site ${site.id} crossed ${multiple}x its pageview quota ` +
        `(over-quota: count=${count} soft=${limit} hard=${hardCap}) — still collecting; ` +
        'events drop only at the hard cap'
      )
    }
  }

  return { state, allowed: true, overQuota: state === 'over_soft', count, limit, softLimit: limit, hardCap }
}
