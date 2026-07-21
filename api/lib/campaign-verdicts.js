// KI-47 — deterministic campaign verdicts. Replaces the LLM call that
// api/routes/attribution.js previously made for GET /api/attribution/verdicts.
//
// WHAT CHANGED AND WHY: the old handler shipped real campaign names, revenue, conversions
// and sessions to a third-party model (api.deepseek.com by default; api.moonshot.cn under
// AI_PROVIDER=kimi) and returned the model's free text as a spend recommendation. That
// violates §26 (no LLM-narrated revenue/ROAS/attribution) and falsified the "no data to
// LLM" claim published in docs/SourceTrack_GTM.md:92. This module is pure: no network, no
// dynamic import, no model. Same output shape family, arrived at by arithmetic.
//
// ── WHAT THE OLD PROMPT ASKED FOR THAT THE DATA CANNOT SUPPORT ───────────────
// The old system prompt asked the model to weigh "positive trend", "good conversion rate"
// and "no conversions". All three are unsatisfiable from the payload it was handed:
//   · TREND     — the payload had NO time dimension at all. A trend could only be invented.
//   · SESSIONS  — the payload sent `sessions: c.sessions || 0`, but
//                 getPreAggregatedAttribution never emits a `sessions` field
//                 (attribution-engine.js:516-529). It sent literal 0 for every campaign,
//                 always. So "conversion rate" was uncomputable.
//   · NO CONVERSIONS — the aggregation iterates conversions
//                 (attribution-engine.js:441 `for (const conv of conversions)`), so a
//                 campaign only appears once it has at least one. "zero conversions" was
//                 unreachable by construction.
// This module therefore judges on what actually exists: REVENUE and CONVERSIONS.
// Trend is OMITTED rather than approximated — computing it would need a second
// prior-period read this endpoint has no contract for, and approximating it is what the
// model was doing. Sessions/conversion-rate are likewise absent, not faked.
//
// ── §6 GATES ────────────────────────────────────────────────────────────────
// Two states exist so the module never manufactures a judgment from missing data:
//   INSUFFICIENT_DATA — too few conversions to say anything
//   NO_REVENUE_DATA   — the site records no revenue at all in this range, so a
//                       revenue-based verdict would be meaningless (a lead-gen site would
//                       otherwise see every campaign marked KILL for having £0)
// No cost-gated metric (ROAS/CPL/CAC) is computed, so no ad-spend gate is needed — this
// reads only first-party revenue and conversion counts.

// ── THRESHOLDS — product decisions, named, not inline magic ──────────────────
// Below this many conversions a campaign is not judged at all. A 1- or 2-conversion
// campaign carries no signal; calling it KILL would be noise presented as advice.
export const MIN_CONVERSIONS_FOR_VERDICT = 5

// At or above this revenue (in the site's reporting currency) a campaign that clears the
// conversion floor is a SCALE candidate.
export const SCALE_MIN_REVENUE = 500

// Exactly zero revenue, with enough conversions to be meaningful and while OTHER campaigns
// on the site do produce revenue, is the KILL condition. Kept as a named constant so the
// "exactly zero" intent is explicit rather than an inline `=== 0`.
export const KILL_MAX_REVENUE = 0

export const VERDICTS = Object.freeze({
  SCALE: 'SCALE',
  PAUSE: 'PAUSE',
  KILL: 'KILL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  NO_REVENUE_DATA: 'NO_REVENUE_DATA'
})

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Deterministic verdicts for a set of campaigns. Pure — no I/O, no clock, no randomness.
 * Same input always yields the same output, including order.
 *
 * @param rows  rows as getPreAggregatedAttribution(groupBy:'campaign') emits them:
 *              { dim_value, revenue, conversions }
 * @returns array of { campaign, verdict, reason, inputs }
 */
export function computeCampaignVerdicts (rows) {
  if (!Array.isArray(rows)) throw new TypeError('computeCampaignVerdicts: rows must be an array')

  const campaigns = rows.map(r => ({
    campaign: r?.dim_value || 'unknown',
    revenue: Number(r?.revenue) || 0,
    conversions: Number(r?.conversions) || 0
  }))

  // §6 gate: if NOTHING on the site produced revenue in this range, revenue-based verdicts
  // are not meaningful. Decided across the whole set, not per campaign, so a lead-gen site
  // gets an honest "no revenue recorded" rather than a page of KILLs.
  const siteHasRevenue = campaigns.some(c => c.revenue > 0)

  const judged = campaigns.map(c => {
    const { campaign, revenue, conversions } = c
    const avgConversionValue = conversions > 0 ? round2(revenue / conversions) : 0
    const inputs = { revenue: round2(revenue), conversions, avg_conversion_value: avgConversionValue }

    // Defensive: revenue without conversions cannot occur via the pre-aggregated reader
    // (it counts one conversion per row it sums revenue from), so if it appears the two
    // numbers disagree. Never award SCALE off inconsistent data — say so instead.
    if (conversions <= 0 && revenue > 0) {
      return {
        campaign,
        verdict: VERDICTS.INSUFFICIENT_DATA,
        reason: `Inconsistent data: ${inputs.revenue} revenue recorded with 0 conversions — not judged`,
        inputs
      }
    }

    if (conversions < MIN_CONVERSIONS_FOR_VERDICT) {
      return {
        campaign,
        verdict: VERDICTS.INSUFFICIENT_DATA,
        reason: `Only ${conversions} conversion${conversions === 1 ? '' : 's'} — needs ${MIN_CONVERSIONS_FOR_VERDICT} to judge`,
        inputs
      }
    }

    if (!siteHasRevenue) {
      return {
        campaign,
        verdict: VERDICTS.NO_REVENUE_DATA,
        reason: `${conversions} conversions, no revenue recorded on any campaign in this range — revenue verdicts unavailable`,
        inputs
      }
    }

    if (revenue <= KILL_MAX_REVENUE) {
      return {
        campaign,
        verdict: VERDICTS.KILL,
        reason: `${conversions} conversions but 0 revenue, while other campaigns produced revenue`,
        inputs
      }
    }

    if (revenue >= SCALE_MIN_REVENUE) {
      return {
        campaign,
        verdict: VERDICTS.SCALE,
        reason: `${inputs.revenue} revenue from ${conversions} conversions (avg ${avgConversionValue}) — at or above the ${SCALE_MIN_REVENUE} scale threshold`,
        inputs
      }
    }

    return {
      campaign,
      verdict: VERDICTS.PAUSE,
      reason: `${inputs.revenue} revenue from ${conversions} conversions (avg ${avgConversionValue}) — below the ${SCALE_MIN_REVENUE} scale threshold`,
      inputs
    }
  })

  // Total order, so ties never depend on input order or engine sort stability:
  // revenue desc -> conversions desc -> campaign name asc. Campaign names are unique per
  // group key, so this is a strict total order and the output is fully deterministic.
  return judged.sort((a, b) =>
    b.inputs.revenue - a.inputs.revenue ||
    b.inputs.conversions - a.inputs.conversions ||
    a.campaign.localeCompare(b.campaign)
  )
}
