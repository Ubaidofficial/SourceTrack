import { getStructuralLimits } from './plan-features.js'
import { getSupabase } from './supabase.js'

// METERING ONLY — a conversion is NEVER refused on quota, on any tier.
//
// THE BUG THIS CLOSES: passing the plan limit as p_limit made `allowed:false` the
// at-cap signal, and every call site turned that into a drop. On the Stripe path
// (stripe-webhook.js) the drop rolled the idempotency key back and returned HTTP
// **200** — Stripe reads 2xx as delivered and never retries, and the released claim
// meant no durable record survived either. A customer's purchase was destroyed while
// we reported success: §6.5 inverted on the money path, the same principle as "an
// erasure that deletes nothing must never report success". It was not free-tier-only
// (free 30 / starter 150 / growth 750 / scale 2500 — every tier reaches its cap).
//
// THE DECISION (founder, 2026-07-26): count it, message about it, never refuse the
// write. A quota exists for cost control and 2500 conversions/month is not a cost; a
// dropped conversion is a permanently wrong revenue number.
//
// MECHANISM (same shape as the pageview fix in #429 — no RPC change, no migration):
// claim_site_conversion_usage freezes at p_limit WITHOUT incrementing, exactly like
// claim_site_pageview_usage. So we pass a very high p_limit (soft x ANOMALY_MULTIPLIER)
// to keep the counter truthful far past the cap, and the RPC's `allowed:false` is
// re-read as an ANOMALY ALARM rather than a drop signal.
//
// The anomaly threshold is NOT a drop point. Exceeding soft x 100 indicates a loop or
// a bug, not usage — so it logs at ERROR and STILL PERSISTS. We do not silently
// discard revenue to protect ourselves from our own bug.
export const ANOMALY_MULTIPLIER = 100

/**
 * The count at which sustained over-quota usage stops being plausible usage and starts
 * being an alarm. Mirrors hardCapFor() in pageview-limits.js in shape, but note the
 * crucial difference: that one is a DROP point, this one never drops.
 *
 * @param {number} softLimit
 * @returns {number}
 */
export function anomalyThresholdFor(softLimit) {
  if (softLimit === Infinity) return Infinity
  return softLimit * ANOMALY_MULTIPLIER
}

/**
 * Meters one conversion for the given site in the current calendar month.
 *
 * THREE QUOTA STATES — all of them WRITE. `allowed` is invariantly true for every real
 * tier; it exists only so the pre-existing call sites keep compiling, and it must never
 * be used to refuse a conversion again:
 *   'ok'         count <  soft                -> write
 *   'over_soft'  count >= soft                -> write, flagged over-quota
 *   'anomaly'    count >= soft x 100 (frozen)  -> write, ERROR alarm
 *
 * ONE NON-QUOTA STATE, the only case where `allowed` is false:
 *   'no_allowance'  limit === 0 (inactive/archived)
 * That is a SITE-STATUS block, not a quota outcome. It is load-bearing:
 * /api/conversion and /api/conversion/offline mount WITHOUT checkTierLimit
 * (api/index.js:450, :460) and neither route file carries its own status guard, so this
 * is currently the only thing stopping an archived (churned) site from ingesting.
 *
 * Fail-open: throws on DB error; every call site catches and proceeds.
 *
 * @param {Object} site - The site object containing `id` and `plan`.
 * @returns {Promise<{ state: 'ok'|'over_soft'|'anomaly'|'no_allowance', allowed: boolean,
 *                     overQuota: boolean, count: number, limit: number, softLimit: number,
 *                     anomalyThreshold: number }>}
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
    return { state: 'ok', allowed: true, overQuota: false, count: 0, limit, softLimit: limit, anomalyThreshold: Infinity }
  }

  // Site-status block (inactive/archived), NOT a quota outcome — see the doc block above.
  // No allowance exists to meter against, so there is nothing to count and no DB call.
  if (limit === 0) {
    return { state: 'no_allowance', allowed: false, overQuota: false, count: 0, limit: 0, softLimit: 0, anomalyThreshold: 0 }
  }

  const anomalyThreshold = anomalyThresholdFor(limit)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthStr = `${year}-${month}`

  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('claim_site_conversion_usage', {
      p_site_id: site.id,
      p_month: monthStr,
      // The ANOMALY THRESHOLD, not the plan limit — the RPC freezes at p_limit, so
      // passing the plan limit is what stopped the counter and made a drop look necessary.
      p_limit: anomalyThreshold
    })

  if (error) {
    throw error
  }

  // claim_site_conversion_usage returns a table set of (allowed boolean, current_count integer)
  // Since rpc returns an array of records in `data`, select the first one.
  const result = data && data[0] ? data[0] : { allowed: false, current_count: 0 }
  const count = result.current_count ?? 0

  // The RPC only refuses at p_limit, which is now the anomaly threshold. This is an
  // ALARM, not a drop: allowed stays true and the caller still writes.
  if (!result.allowed) {
    console.error(
      `[conversion-limits] ANOMALY: site ${site.id} is at ${count} conversions this month ` +
      `(soft=${limit}, alarm threshold=${anomalyThreshold}). That is ${ANOMALY_MULTIPLIER}x the plan ` +
      'allowance and indicates a loop or a bug, not usage. The conversion is STILL being ' +
      'persisted — revenue is never discarded to hide our own defect. Investigate the site.'
    )
    return { state: 'anomaly', allowed: true, overQuota: true, count, limit, softLimit: limit, anomalyThreshold }
  }

  const state = count < limit ? 'ok' : 'over_soft'

  // Runaway visibility, mirroring pageview-limits.js: WARN once per crossing of an
  // integer multiple of the soft limit (2x, 3x, …). Exact equality means one line per
  // crossing, not one per conversion past quota.
  if (state === 'over_soft' && count % limit === 0) {
    const multiple = count / limit
    if (multiple >= 2) {
      console.warn(
        `[conversion-limits] site ${site.id} crossed ${multiple}x its conversion quota ` +
        `(over-quota: count=${count} soft=${limit}) — still persisting; conversions are never dropped`
      )
    }
  }

  return { state, allowed: true, overQuota: state === 'over_soft', count, limit, softLimit: limit, anomalyThreshold }
}
