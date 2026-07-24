// URL normalization — the SINGLE source for turning a page URL into a landing-page path.
//
// WHY THIS MODULE EXISTS: two readers of the same `attributed_conversions.*_attribution` JSONB
// disagreed about how a touch stores its landing page. The nightly writes
// `landing_page: parsePathname(page_url)` (nightly-attribution.js), while the LIVE reader
// (getMultiTouchAttributionLive) kept only the raw `page_url` and then read a key the touch never
// had — so every multi-touch landing_page report on the live path collapsed into one bucket.
//
// The fix needs the SAME normalizer on both sides. Re-typing it in the engine would be a second
// copy of query-stripping / relative-URL / 'unknown'-fallback semantics — the duplicate-source bug
// (#248) that this codebase has paid for repeatedly. So it lives here ONCE and both import it.
//
// ⚠️ Keep this module PURE: no imports, no node-only APIs. It is imported by a job
// (nightly-attribution.js) and by a request-path lib (attribution-engine.js).
// ANTI-DRIFT: `api/tests/served-allowlist.test.js` asserts parsePathname is defined exactly ONCE in
// the repo (the SINGLE-SOURCE #248 check), and `api/tests/url-normalizer-drift-guard.test.js` fails
// if a THIRD, differently-named path-normalizer appears. (An earlier version of this header cited
// `api/tests/url-normalize.test.js` and a behaviour-pinning test — NEITHER was ever created; the real
// assertion lives in served-allowlist.test.js. Corrected 2026-07-24.)
//
// PATH-NORMALIZER #1 of TWO (by design — the second is normalizePath() in api/lib/url-normalization.js).
// This one is CASE-PRESERVED and keeps the trailing slash: it writes attributed_conversions.landing_page,
// which is a report/groupby dimension on the MONEY RAIL — lowercasing it would re-bucket landing-page
// revenue/conversion reports. DELIBERATELY DIFFERENT from normalizePath(), which LOWERCASES + strips the
// slash for the GSC cross-source join. They are NOT interchangeable; do NOT unify (both are load-bearing
// on persisted output). A drift guard — api/tests/url-normalizer-drift-guard.test.js — fails if a THIRD
// path-normalizer appears anywhere in source.

/**
 * A page URL -> its pathname, for landing-page bucketing.
 * Query string and fragment are dropped (url.pathname). Relative paths ("/a") are resolved against
 * a dummy origin. Anything unparseable or empty -> 'unknown' (never a fabricated path).
 *
 * Body is byte-identical to the original nightly-attribution.js implementation it replaces —
 * the money rail already depends on this exact behaviour.
 */
export function parsePathname (urlStr) {
  if (!urlStr) return 'unknown'
  try {
    const url = urlStr.startsWith('/') ? new URL(urlStr, 'http://localhost') : new URL(urlStr)
    return url.pathname || 'unknown'
  } catch (_) {
    return 'unknown'
  }
}
