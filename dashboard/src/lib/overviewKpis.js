// Overview KPI tile selection — design.md §10.3, gated on REAL data availability.
//
// DESIGN-SPEC DEVIATION, deliberate and founder-directed (same class as the Rev / Visitor
// tile flagged in Dashboard.jsx). design.md §10.2 says "KPI Bar - full width, max 3 values"
// and §10.3 closes with "Overview shows only top 3 KPI slots by default". This module treats
// that 3 as a FLOOR worth exceeding only where real data supports a further tile — never as a
// target to pad up to. Flagged on the PR rather than silently reconciled (CLAUDE.md §12).
//
// The hard rule this module exists to enforce: a slot appears ONLY when a real value backs it.
// Every builder returns null otherwise and the caller renders nothing — never a $0, a 0, or a
// "—" placeholder standing in for missing data (§6). That matters more than usual here because
// /dashboard/overview hands the client a ZERO for almost every one of these when the underlying
// read found nothing: avg_value, sql_percent, ai_revenue and best_rpv all default to 0 (and
// best_rpv_channel to the literal '—') in api/routes/dashboard.js. Gating on the number alone
// would therefore render fabricated zeros; each builder below gates on an EXISTENCE signal
// instead, and the existence signal is never the metric's own value where that value is a
// server-side default.
//
// Two §10.3 slots are absent BY DATA, not by oversight:
//   - SaaS slot 2 "MRR" and slot 4 "Trial-to-Paid %" — CLAUDE.md §7 states these are not built.
//     The only MRR/trial strings in the repo are marketing copy in SolutionSaaS.jsx. There is
//     no field to read, so there is no honest tile.
//   - Slot 5's cost-gated variants (Best CAC / Best ROAS / Best CPL) — /dashboard/overview
//     carries no ad-cost field at all (cost lives on the Campaigns payload as kpis.total_spend).
//     §10.3's own rule covers this: "If cost data does not exist: do not show CAC/ROAS/CPL, use
//     Top Source/Top Revenue Source/Top Lead Source fallback." That fallback is what ships.
//
// Kept as a pure module (no React, no fetch) so api/tests can import and pin it — the same
// cross-boundary test pattern queryError.js / reportGating.js already use.

import { safeNumber } from '../utils/numbers.js'

// Canonical values, matching the DB constraint (sites_business_type_check) and
// api/routes/onboarding.js VALID_BUSINESS_TYPES exactly.
export const BUSINESS_TYPES = ['saas', 'ecommerce', 'leadgen']

// NOTE: deliberately NOT reusing ReportBuilder.jsx's getNormalizedBusinessType — that helper
// matches 'lead_gen' / 'lead generation' / 'agency' and never 'leadgen', so it returns
// 'unknown' for every real lead-gen site. Flagged separately; not fixed here (§3, surgical).
export function normalizeBusinessType(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/[\s-]/g, '_')
  if (t === 'saas') return 'saas'
  if (t === 'ecommerce' || t === 'e_commerce') return 'ecommerce'
  if (t === 'leadgen' || t === 'lead_gen' || t === 'lead_generation') return 'leadgen'
  return 'saas'   // matches the column default; never throws the strip away over a bad value
}

const isRealPct = (d) => d != null && Number.isFinite(Number(d.pct))

// Top source for the slot-5 fallback. Derived from the SAME rows the Top Sources card renders
// (overview.sources), so the tile and the table can never disagree.
//
// api/routes/dashboard.js:301 builds this as Object.values(sourceMap) with NO sort — the
// server does not rank it, so the ordering has to happen here. Ranking by revenue for revenue
// businesses and by conversions for lead gen, because "top" means a different column in each.
function topSource(rows, by) {
  const list = Array.isArray(rows) ? rows : []
  let best = null
  for (const r of list) {
    const val = safeNumber(r?.[by], 0)
    if (val <= 0) continue                       // a 0-value source is not a "top" anything
    if (!best || val > best.val) best = { val, row: r }
  }
  if (!best) return null
  const name = best.row.dim_value || best.row.source || null
  // '—' is api/routes/dashboard.js's own no-data placeholder; it is not a source name.
  if (!name || name === '—') return null
  return { name, value: best.val }
}

/**
 * Select the Overview KPI tiles that have real data behind them.
 *
 * @param {object} input - values useDashboardData already derives; nothing new is fetched.
 * @returns {Array<{key,label,value,format,trend,sub,title}>} ordered, ready for <MetricTile>.
 */
export function selectOverviewKpis(input = {}) {
  // Destructuring defaults only fire on `undefined`, so an explicit `kpis: null` — which the
  // hook can produce from a partial payload — would sail past `kpis = {}` and throw on first
  // property access, blanking the whole page. Normalized rather than defaulted.
  const src = input || {}
  const kpis = src.kpis || {}
  const {
    businessType,
    totalRevenue = 0,
    totalConversions = 0,
    totalLeads = 0,
    leadsTracked = true,
    totalCustomers = 0,
    revenueDelta = null,
    leadsDelta = null,
    customersDelta = null,
    avgValue = 0,
    leadConvRate = 0,
    customerConvRate = 0,
    revenuePerVisitor = null,
    activeResults = [],
    aiSourceRows = []
  } = src

  const type = normalizeBusinessType(businessType)

  const hasRevenue = safeNumber(totalRevenue, 0) > 0
  const aiRevenue = safeNumber(kpis.ai_revenue, 0)
  // AI leads = AI-attributed conversions, merged per source in useDashboardData from
  // ai_conversions ?? ai_leads. Summed rather than read from a KPI because the payload has
  // no scalar AI-conversion count — only ai_revenue.
  const aiLeads = (Array.isArray(aiSourceRows) ? aiSourceRows : [])
    .reduce((s, r) => s + safeNumber(r?.conversions, 0), 0)

  const tiles = []
  const push = (t) => { if (t) tiles.push(t) }

  // ── Slot 1 — the headline number for this business type ───────────────────
  if (type === 'leadgen') {
    push(leadsTracked ? {
      key: 'leads',
      label: 'Total Leads',
      value: safeNumber(totalLeads, 0),
      format: 'number',
      trend: isRealPct(leadsDelta) ? leadsDelta.pct : null,
      sub: leadConvRate > 0 ? `${safeNumber(leadConvRate, 0).toFixed(1)}% conversion rate` : null
    } : null)
  } else {
    push(hasRevenue ? {
      key: 'revenue',
      label: type === 'ecommerce' ? 'Total Revenue' : 'Revenue',
      value: safeNumber(totalRevenue, 0),
      format: 'currency',
      trend: isRealPct(revenueDelta) ? revenueDelta.pct : null
    } : null)
  }

  // ── Slot 2 — growth ───────────────────────────────────────────────────────
  // Rendered as its own tile only for the types whose §10.3 row names it (eCommerce Revenue
  // Growth %, Lead Gen Lead Growth %). SaaS slot 2 is MRR — not built — so SaaS gets no slot 2.
  // formatDeltaVal returns null whenever the prior period is 0, so isRealPct is the difference
  // between a measured change and "nothing to compare against"; the latter shows no tile.
  if (type === 'ecommerce') {
    push(isRealPct(revenueDelta) ? {
      key: 'revenue_growth',
      label: 'Revenue Growth',
      value: safeNumber(revenueDelta.pct, 0),
      format: 'percent',
      sub: 'vs prior period'
    } : null)
  } else if (type === 'leadgen') {
    push(isRealPct(leadsDelta) ? {
      key: 'lead_growth',
      label: 'Lead Growth',
      value: safeNumber(leadsDelta.pct, 0),
      format: 'percent',
      sub: 'vs prior period'
    } : null)
  }

  // ── Slot 3 — AI ───────────────────────────────────────────────────────────
  // §26 truthful-AI: this is a counted, attributed figure off real events, not a prediction.
  if (type === 'leadgen') {
    push(aiLeads > 0 ? {
      key: 'ai_leads',
      label: 'AI Leads',
      value: aiLeads,
      format: 'number',
      sub: 'Attributed to AI sources'
    } : null)
  } else {
    push(aiRevenue > 0 ? {
      key: 'ai_revenue',
      label: 'AI Revenue',
      value: aiRevenue,
      format: 'currency',
      sub: safeNumber(kpis.ai_revenue_share, 0) > 0
        ? `${safeNumber(kpis.ai_revenue_share, 0).toFixed(1)}% of revenue`
        : null
    } : null)
  }

  // ── Slot 4 — the type-specific quality metric ─────────────────────────────
  if (type === 'ecommerce') {
    // AOV. api/routes/dashboard.js computes avg_value as revenue/customers and falls back to a
    // literal 0, so > 0 is the existence check.
    push(safeNumber(avgValue, 0) > 0 ? {
      key: 'aov',
      label: 'AOV',
      value: safeNumber(avgValue, 0),
      format: 'currency',
      sub: 'Average order value'
    } : null)
  } else if (type === 'leadgen') {
    // §10.3 calls this slot "Qualified %". The only backing field is sql_percent, which counts
    // ONLY status === 'sql' (api/routes/dashboard.js:229) — not the wider qualified/mql set the
    // Journey status dropdown offers. Labelled "Sales Qualified" so the tile cannot overstate
    // what it measures.
    //
    // Gated on totalConversions, not on the percentage: dashboard.js:350 returns a literal 0
    // when there are no conversions at all, and that 0 is a placeholder. With conversions
    // present and none marked SQL, 0.0% is a REAL measurement and does show.
    push(safeNumber(totalConversions, 0) > 0 && kpis.sql_percent != null ? {
      key: 'sql_percent',
      label: 'Sales Qualified',
      value: safeNumber(kpis.sql_percent, 0),
      format: 'percent',
      sub: 'Of tracked conversions',
      title: 'Share of conversions marked Sales Qualified (SQL). Excludes MQL and Qualified.'
    } : null)
  } else {
    // SaaS slot 4 is Trial-to-Paid % — not built (CLAUDE.md §7). Rev / Visitor takes the slot
    // instead: it is the founder-directed tile already shipping on this strip, and it is the
    // one additional SaaS number with a real backing denominator. Caller passes null whenever
    // there is no honest value.
    push(revenuePerVisitor != null && safeNumber(revenuePerVisitor, 0) > 0 ? {
      key: 'rev_per_visitor',
      label: 'Rev / Visitor',
      value: safeNumber(revenuePerVisitor, 0),
      format: 'currency',
      sub: 'Revenue per unique visitor'
    } : null)
  }

  // ── Slot 5 — top source (cost-gated variants omitted; see the header note) ─
  const rankBy = type === 'leadgen' ? 'conversions' : 'revenue'
  const top = topSource(activeResults, rankBy)
  push(top ? {
    key: 'top_source',
    label: type === 'ecommerce' ? 'Top Revenue Source' : type === 'leadgen' ? 'Top Lead Source' : 'Top Source',
    value: top.name,
    format: 'text',
    sub: rankBy === 'revenue'
      ? `$${top.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} attributed`
      : `${top.value.toLocaleString()} conversions`
  } : null)

  // ── Customers — not a §10.3 slot, but it is a real number this strip already showed and
  // dropping it would be a silent regression for revenue sites. Appended last so it never
  // displaces a spec slot.
  if (type !== 'leadgen' && safeNumber(totalCustomers, 0) > 0) {
    push({
      key: 'customers',
      label: 'Customers',
      value: safeNumber(totalCustomers, 0),
      format: 'number',
      trend: isRealPct(customersDelta) ? customersDelta.pct : null,
      sub: customerConvRate > 0 ? `${safeNumber(customerConvRate, 0).toFixed(1)}% conversion rate` : null
    })
  }

  // Baseline. Every slot above can legitimately gate itself off — a lead-gen site that tracks
  // no lead events, has no AI touches and no ranked source clears the whole strip. The caller
  // only renders this strip once conversions exist, so a raw conversion count is both available
  // and honest there; without it the page would show a conversions branch with no numbers at
  // all. Appended ONLY when nothing else survived, so it never competes with a real slot.
  if (tiles.length === 0 && safeNumber(totalConversions, 0) > 0) {
    push({
      key: 'conversions',
      label: 'Conversions',
      value: safeNumber(totalConversions, 0),
      format: 'number'
    })
  }

  return tiles
}
