// PATH-NORMALIZER #2 of TWO (by design — the first is parsePathname() in api/lib/url-normalize.js).
// Produces the canonical path used to JOIN two INDEPENDENT sources — Google Search Console's reported
// paths vs the tracker's captured page_url (see seo-revenue.js / gsc-daily-sync.js). It LOWERCASES +
// strips the trailing slash for match ROBUSTNESS across those sources (case/slash differences would
// otherwise miss the join); empty -> '/'. DELIBERATELY DIFFERENT from parsePathname(), which is
// case-PRESERVED for the money rail. They are NOT interchangeable — making this case-sensitive would
// risk silently missing GSC↔tracker matches (the SEO-revenue moat). Do NOT unify (both are load-bearing
// on persisted output). Drift guard: api/tests/url-normalizer-drift-guard.test.js (fails on a THIRD).
/**
 * Shared URL path normalization helper.
 * Strips protocols, subdomains, trailing slashes, queries, and hashes to get a canonical pathname.
 *
 * @param {string} urlStr - Raw GSC page URL or PostHog pageview URL.
 * @returns {string} Normalized path (e.g., '/pricing').
 */
export function normalizePath(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '/'
  try {
    // If it's a relative path, parse with a dummy base
    const url = urlStr.startsWith('http') ? new URL(urlStr) : new URL(urlStr, 'https://dummy.com')
    let pathname = url.pathname.trim()

    // Remove trailing slash if not root
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }

    // Ensure starts with /
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname
    }

    return pathname.toLowerCase()
  } catch (_e) {
    // Fallback if URL parsing fails: strip queries/hashes manually
    let path = urlStr.split('?')[0].split('#')[0].trim()
    // Strip protocol/host if absolute
    path = path.replace(/^https?:\/\/[^\/]+/, '')
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    if (!path.startsWith('/')) {
      path = '/' + path
    }
    return path.toLowerCase()
  }
}
