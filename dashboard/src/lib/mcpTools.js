// The MCP tool catalogue — name, human-readable description, and which credential each
// tool needs. This is the SINGLE SOURCE for that copy.
//
// ── Why the copy lives here and not in mcp/server.js ─────────────────────────────────
// Two places need it: mcp/server.js's TOOLS array (served to MCP clients over stdio and
// /api/mcp) and the customer docs page at /docs/mcp. dashboard/src may not import from
// mcp/ or api/ — Railway builds the Dashboard service with rootDirectory=/dashboard, so
// that direction does not resolve at deploy time (#252; guarded by
// api/tests/dashboard-build-root.test.js). The safe direction is the inverse, so the copy
// lives under dashboard/ and mcp/server.js reaches in, exactly as
// api/lib/platform-guides.js reaches into dashboard/src/lib/shopifyWalkthrough.js and
// api/lib/report-config-validation.js reaches into gate-constants.js.
//
// ── Why an IMPORT and not a sync-guard test ──────────────────────────────────────────
// mcp/server.js BUILDS its TOOLS array from this catalogue by name, and throws at module
// load if a name here has no protocol entry there or vice versa. Drift is therefore
// impossible rather than merely tested: the server does not start. That is a stronger
// guarantee than the DocsShopify sync guard, which can only fail a test after the fact,
// and it is available here because both files are reachable from the same build root.
//
// ── The descriptions are the REAL ones, verbatim ─────────────────────────────────────
// The docs page renders these strings rather than a friendlier re-description written for
// humans. That is deliberate. A second, nicer wording is exactly the defect fixed in the
// Shopify walkthrough earlier: two hand-written descriptions of one thing drift, and the
// customer-facing copy is the one that goes stale silently. These strings are also
// governed by docs/mcp_tool_policy.md §3/§6 — the "no revenue, no cost" negations are
// load-bearing and asserted by api/tests/mcp-tool-policy-guard.test.js — so they must not
// be paraphrased anywhere.
//
// `credential` is what a customer has to supply, not the internal auth constant:
//   'none'     — no credential; the tool acts on a domain or platform the caller names.
//   'user_jwt' — a signed-in SourceTrack user session.
//   'api_key'  — a SourceTrack API token, minted at Settings → Advanced → API tokens,
//                holding exactly the scope named in `scope`.
export const MCP_TOOL_CATALOG = [
  {
    name: 'detect_platform',
    credential: 'none',
    scope: null,
    description: 'Detect the CMS or platform (Shopify, WordPress, Webflow, GTM) of a website domain'
  },
  {
    name: 'get_install_snippet',
    credential: 'none',
    scope: null,
    description: 'Get the tracking script snippet and step-by-step install instructions for a target platform'
  },
  {
    name: 'verify_installation',
    credential: 'user_jwt',
    scope: null,
    description: 'Verify if tracking script events are active on a site. Note: Live backend status API requires an authenticated user session Bearer token (auth_token or SOURCETRACK_AUTH_TOKEN env var)'
  },
  {
    name: 'get_workspace_context',
    credential: 'api_key',
    scope: 'read:diagnostics',
    description: 'Identify the site this API key reads: site_id, domain, timezone, attribution window, onboarding state. Configuration only, no metrics — call this first so later answers can name which site and timezone they refer to.'
  },
  {
    name: 'get_site_health',
    credential: 'api_key',
    scope: 'read:diagnostics',
    description: 'Is the tracker plumbed in? Reports script_detected, last_seen_at, hours since last seen, onboarding state and plan. Answerable without the analytics read store, so it still works when that store is the thing that is broken.'
  },
  {
    name: 'get_data_quality',
    credential: 'api_key',
    scope: 'read:diagnostics',
    description: 'Latest result per check from the nightly data-quality job (status, value, threshold, message). Returns has_data:false when the job has never run for this site — never an all-clear it cannot substantiate.'
  },
  {
    name: 'debug_data_flow',
    credential: 'api_key',
    scope: 'read:diagnostics',
    description: 'Attribution COVERAGE over a window: how many recorded conversions carry a usable source, and what share arrived UTM/click-id tagged. Pipeline completeness only — it does not say which channel deserves credit and returns no revenue.'
  },
  {
    name: 'verify_events',
    credential: 'api_key',
    scope: 'read:diagnostics',
    description: 'Is the ingest rail receiving events? Returns the most recent event timestamp and minutes since. If the analytics read store is unreachable this fails explicitly (READ_STORE_UNAVAILABLE) rather than reporting zero events — a SourceTrack read failure must never be read as broken customer tracking.'
  },
  {
    name: 'get_leads_volume',
    credential: 'api_key',
    scope: 'read:volume',
    description: 'Lead COUNTS over a window, plus a breakdown by one dimension (source, medium or campaign). Volume only: returns no revenue, no cost and no cost-derived metric, and takes no attribution-model argument — dimension values are always the FIRST touch, echoed back as "touch":"first" on every row. The breakdown is a complete partition: untagged traffic is reported as its own "(untagged)" bucket rather than omitted. distinct_leads (unique converting visitors) and breakdown.total (conversion events) are different units and are not expected to match.'
  },
  {
    name: 'get_campaign_volume',
    credential: 'api_key',
    scope: 'read:volume',
    description: 'Per-campaign VOLUME over a window: distinct visitors and lead-type conversions per campaign. Volume only: there is no revenue, cost, ROAS or CPL column, and no attribution-model argument — campaign values are always the FIRST touch, echoed back as "touch":"first" on every row. Untagged traffic is included as the "(untagged)" campaign so the totals are a complete partition. This tool ranks campaigns by volume and says nothing about which campaign caused or deserves credit for anything.'
  }
]

// Lookup by name, for the consumer that merges protocol fields onto this catalogue.
export const MCP_TOOL_CATALOG_BY_NAME = Object.freeze(
  Object.fromEntries(MCP_TOOL_CATALOG.map(t => [t.name, t]))
)
