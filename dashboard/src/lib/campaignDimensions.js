// The dimension tabs the Campaigns page may offer.
//
// This is NOT a product choice — it is the set of breakdowns the SERVER can actually answer for
// this page's FIXED argument shape. api/routes/campaigns.js calls servedByDeployedBackend with
// model:'last_touch', viaRoutePreAgg:false, hasAttributionWindow:false for EACH of
// revenue/conversions/sessions/leads, and 422s (gated_dead_store) unless ALL FOUR back. A tab the
// gate denies is a button whose only possible outcome is an error, so it is not rendered at all.
// (Hiding rather than greying is a founder product call — the design doc's "no disabled clutter"
// line is §5.3 and scoped to COST metrics, so it does not decide this. Do not re-cite it here.)
//
// Under that shape only `campaign` survives (servedReportShape rules 7/8):
//   campaign  -> flexible_report_campaign_by_site (revenue, conversions)
//                flexible_report_campaign_sessions_by_site (sessions)
//                flexible_report_campaign_leads_by_site (leads)
//   source    -> rule 7/8 requires model === 'first_touch'; this page hardcodes last_touch.
//   medium    -> no pre-agg (viaRoutePreAgg:false) and no pipe.
//   ai_source -> no pre-agg and no pipe.
//
// ⚠️ DO NOT hand-edit this list. api/tests/campaign-dimension-gate.test.js asserts it EXACTLY
// equals the live gate's verdict, so deploying a new pipe (or losing one) turns that test red until
// this list is corrected. That binding is the entire point: a hand-maintained second copy of a gate
// is the #248 / KI-32 / KI-41 defect class.
//
// PURITY: zero imports, deliberately. A dashboard -> api import resolves fine from the repo root
// (CI, local) and then FAILS the real Railway dashboard build (rootDirectory=/dashboard) — that is
// exactly how #252 shipped a green CI and a broken prod deploy, and api/tests/dashboard-build-root
// .test.js guards it. The TEST reaches in from api/ (the safe direction) to do the comparison.
export const CAMPAIGN_DIMENSIONS = [
  { key: 'campaign', label: 'Campaign' }
]

// Every flexible_report_* pipe dispatches ONLY under the attribution engine's _flexBaseCommon,
// which requires tz === 'UTC' (servedReportShape's `flexBreaker`). On a non-UTC site the pipe is
// skipped and the read falls to the dead store, so the gate denies EVERY dimension — the page has
// nothing honest to offer and must render no tab bar at all. The route reaches the same verdict and
// answers 422 gated_dead_store, so the page's existing <QueryError> renders the server's own
// "Temporarily unavailable" reason. That is KI-53.
export function servableCampaignDimensions (timezone) {
  return (timezone || 'UTC') === 'UTC' ? CAMPAIGN_DIMENSIONS : []
}
