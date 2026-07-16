// CANONICAL gate constants — the SINGLE source of truth for which report shapes the server
// can actually serve. Both sides import these: api/lib/report-config-validation.js re-exports
// them (its public surface is unchanged), and dashboard/src/lib/reportGating.js derives the
// picker's greying from them. A hand-maintained second copy is exactly the bug #248 killed
// (attribution.js held a byte-identical duplicate allowlist; trimming one leaked the gated
// shape through the other).
//
// ── WHY THIS FILE LIVES UNDER dashboard/, NOT api/ ──────────────────────────────────────
// Railway builds the Dashboard service with rootDirectory=/dashboard, so /api is NOT in that
// build context: a dashboard->api import resolves fine from the repo root (CI, local) and then
// FAILS the real Railway build. That is exactly how #252 shipped a green CI and a broken prod
// deploy. The API service builds from the repo ROOT, so api->dashboard resolves in both — the
// direction proven by api/lib/source-normalizer.js, which re-exports from dashboard/src/lib and
// is imported by live routes (dashboard.js, journey.js, leads-server.js).
//
// ⚠️ COUPLING TO PRESERVE: this module must stay PURE — zero imports, zero node-only APIs
// (no fs/path/process). The API reaches into it, so a node-only dependency here would be fine
// server-side but would break the dashboard bundle; a dashboard-only dependency would break the
// API. It holds no secrets — the API already echoes these same lists to unauthenticated clients
// in its 400 "Must be one of: …" messages.

// ── GATED_* = known param vocabulary, but currently UNSERVABLE (dead PostHog) -> 422, not 400 ──
// Dims with no pre-agg column AND no pipe, at ANY window/model. (`custom_param:*` is matched by
// prefix server-side in gatedReportReason / client-side in reportGating.)
export const GATED_GROUPS = new Set(['keyword', 'referrer_domain'])

// Metrics that reach a bare/`pipe=NONE` queryHogQL:
//   ltv_revenue        -> engine :2791 bare queryHogQL
//   ai_conversion_share / ai_revenue_share -> engine :2998 bare queryHogQL
//   ai_conversions / ai_revenue            -> no pre-agg, no pipe -> :2923 else-branch
// NOT gated (verified LIVE — gating these would break working money-rail paths):
//   revenue/conversions/leads/customers/avg_conversion_value -> Supabase pre-agg
//     (PREAGG_CONVERSION_METRICS resolves to exactly these five at runtime;
//     avg_conversion_value IS pre-agg-served — gating it would break the shipped
//     `ecom_aov` template and the campaign AOV read).
//   days_to_convert / touchpoints_per_conversion -> dedicated Tinybird pipes.
//   session_count/avg_session_duration/pages_per_session/conversion_sessions -> diverted
//     to getSessionReport (Tinybird-primary when unfiltered), but ONLY for SESSION_REPORT_DIMS
//     below — any other dim there fabricates a bucket, so it is gated as unsupported_session_dim.
// ALSO gated:
//   sessions / conversion_rate -> GATED ENTIRELY (founder decision, Option A). VERIFIED: neither
//     routes to the session pipes on ANY dim — the metric switch `break`s for both, so they fall to
//     the main flexible sql, where only revenue/conversions pass the pipe gate. They are dead
//     PostHog on all 15 dims. (Only the 4 session_* metrics below reach getSessionReport.)
//     Accepted cost: Report Builder loses Unique-Visitors-by-dim + the univ_cvr template. Backlogged.
export const GATED_METRICS = new Set([
  'ltv_revenue', 'ai_conversion_share', 'ai_revenue_share', 'ai_conversions', 'ai_revenue',
  'sessions', 'conversion_rate'
])

// The ONLY metrics that reach getSessionReport -> session_report_pageviews/_conversions.
// (attribution-engine's metric switch: these four `return getSessionReport(...)`.)
export const SESSION_PIPE_METRICS = new Set(['session_count', 'avg_session_duration', 'pages_per_session', 'conversion_sessions'])

// CANONICAL session dimension contract. attribution-engine imports this (via
// report-config-validation's re-export) and must NOT keep its own copy. A session is derived from
// PAGEVIEWS ONLY; getSessionReport selects distinct_id, timestamp, page_url, utm_source,
// utm_medium, utm_campaign, country, device_type, and its conversion query selects only
// (distinct_id, timestamp). A dim is servable only if its value is derivable from that set —
// anything else would FABRICATE a bucket (worse than a zero, §6).
// Unsupported: channel (channelFromEvent needs referrer/ai_source/click-IDs — none selected, so
// every non-UTM session would misclassify to Direct), keyword (utm_term), referrer_domain
// (referrer), browser (browser_name), provider/attribution_status/stitching_method/conversion_type
// (conversion properties), custom_param:* (entry event not retained).
export const SESSION_REPORT_DIMS = new Set([
  'source', 'medium', 'campaign', 'landing_page', 'country', 'device', 'date'
])
