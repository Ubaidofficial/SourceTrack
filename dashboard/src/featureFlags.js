// Build-time feature flags for pages that are BUILT but must not be reachable yet.
//
// A flag here is not plan gating (that is plan-features.js / FEATURE_MATRIX, a sales
// boundary) and not a dead-store gate (that is the 422 + error_code path, a migration
// boundary). It is a kill switch for a page whose backend does not exist at all, where
// the honest state is "absent", not "empty" and not "error".

// AI Visibility — OFF. The page is complete and correct; nothing beneath it is deployed.
//
// api/routes/ai-visibility.js reads exactly two pipes, crawler_agents (:63) and
// crawler_pages (:113). Both read FROM crawler_hits, and verified 2026-08-06 against the
// prod workspace:
//
//     SELECT count() FROM crawler_hits  ->  Resource 'crawler_hits' not found
//
// The workspace holds three datasources (events, events_by_visitor, privacy_signals).
// crawler_hits.datasource and both crawler_*.pipe files are authored in this repo and
// have never been deployed. readPipe() fails CLOSED on a null read by design — "a dead
// pipe is an error, not 'no crawlers'" (ai-visibility.js:47-51) — so every request to
// this page THROWS, and AIVisibility.jsx renders QueryError before it can reach its empty
// state. A page that throws is worse than one that is absent: the error implies something
// broke, when in truth the feature was never turned on.
//
// The page is left wired rather than deleted so this stays a one-line re-enable and so
// AIVisibility.jsx does not become an orphan. FLIP THIS TO true ONLY AFTER ALL FIVE:
//   1. crawler_hits.datasource deployed          (founder-gated, CLAUDE.md §8)
//   2. both crawler_*.pipe deployed              (founder-gated; `tb --cloud deploy
//                                                 --check` FAILS until 1 lands)
//   3. TINYBIRD_READ_PIPES includes both pipes   (the allowlist is SET in production;
//                                                 without this, 2 changes nothing)
//   4. ai-crawler-range-refresh actually scheduled — today nothing invokes it, so
//      ai_crawler_ranges is empty. Not required for the page to work: rows degrade
//      honestly to UA_ONLY and are never shown as verified. Required before anyone
//      believes a verified count.
//   5. a real crawler hit has landed — collection is a customer-installed middleware
//      (integrations/express-crawler-middleware.js) using a write:crawler_hits API key,
//      and prod api_keys is empty.
//
// Steps 1, 2 and 5 are the same bar marketing/src/config/roadmap.json already sets for
// calling this shipped: "deployed AND a real hit has landed". Keep the two in step.
export const AI_VISIBILITY_ENABLED = false
