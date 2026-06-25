// Revenue truth-gate for the SEO Revenue page.
//
// Spec rule: never render a fake "$0" placeholder when there is genuinely no
// revenue data. Distinguish "revenue exists somewhere (even if a specific page
// is $0)" from "no revenue at all" so the UI can show a calm empty-state in the
// latter case instead of $0.
//
// Returns true only when revenue genuinely exists: the rolled-up
// summary.organic_revenue is > 0, OR at least one landing page has revenue > 0.
// A per-page $0 while other pages have revenue still returns true, so legitimate
// $0 rows are shown normally (guardrail: only hide when there's no revenue at all).
export function hasRevenueData(summary, landingPages) {
  const summaryRevenue = Number(summary?.organic_revenue) || 0
  if (summaryRevenue > 0) return true
  if (Array.isArray(landingPages) && landingPages.some(p => (Number(p?.revenue) || 0) > 0)) return true
  return false
}
