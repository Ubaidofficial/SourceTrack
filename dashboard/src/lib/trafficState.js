// What the Dashboard actually KNOWS about a site's traffic — and, crucially, when it knows
// nothing at all.
//
// THE BUG THIS EXISTS TO KILL (§6, the #278 / #413 fake-empty-state class):
// useDashboardData fires three independent queries. Only /dashboard/overview surfaced an error;
// /analytics/summary and /analytics/recent-conversions were destructured for `data` alone, so a
// genuine fetch failure on either one silently produced `undefined` and every derived count fell
// to 0. `hasTraffic` reads those counts. The result: a customer with plenty of traffic was told
// "No attribution data yet — install the tracker on your website" because a read failed. That is
// an ERROR rendered as an EMPTY STATE, on the customer's own business data — the same class of
// lie as a fake zero, and arguably worse, because it blames the customer's setup for our outage.
//
// The rule this module encodes, which queryError.js already states for every data surface:
// an error must be rendered BEFORE any empty/zero state. So "no traffic" is a claim that
// requires evidence of ABSENCE, and a failed read is not evidence of anything.
//
//   provenTraffic       — positive evidence, from EITHER backing read
//   trafficUnavailable  — a read failed and nothing else proves traffic → we know nothing
//   showEmptyState      — we genuinely looked and there is genuinely nothing
//
// Pure (no React) so api/tests can pin it — the pattern liveFeed.js / overviewKpis.js use.

import { safeNumber } from '../utils/numbers.js'

/**
 * @param {object} input
 * @param {boolean} input.previewMode      - support preview reads a different payload entirely.
 * @param {boolean} input.summaryFailed    - /analytics/summary isError.
 * @param {number}  input.trafficPageviews - from /analytics/summary.
 * @param {number}  input.topPagesCount    - from /dashboard/overview (independent of summary).
 * @param {number}  input.sessions         - from /dashboard/overview (independent of summary).
 * @param {boolean} input.hasConversions   - conversions exist for the range.
 */
export function deriveTrafficState(input = {}) {
  const src = input || {}
  const previewMode = src.previewMode === true
  const summaryFailed = src.summaryFailed === true
  const hasConversions = src.hasConversions === true

  // Positive proof, from any of the three signals. topPagesCount and sessions ride on
  // /dashboard/overview, NOT on /analytics/summary — so they still count when the summary read
  // is the thing that failed. That independence is what keeps a single failed read from
  // blanking a site we can still see traffic for.
  const provenTraffic =
    safeNumber(src.trafficPageviews, 0) > 0 ||
    safeNumber(src.topPagesCount, 0) > 0 ||
    safeNumber(src.sessions, 0) > 0

  // Unchanged meaning for existing consumers (AttributionPage, the cold-start feed gate).
  const hasTraffic = previewMode ? hasConversions : provenTraffic

  // We cannot honestly say "no traffic": the read that would have told us failed, and nothing
  // else demonstrates traffic either way. Suppressed when conversions exist, because then the
  // page has real content to render and an error banner over it would be the louder lie.
  const trafficUnavailable = !previewMode && summaryFailed && !provenTraffic && !hasConversions

  // The §19.3 "no data yet" state is a POSITIVE CLAIM about the site. It requires that we
  // actually looked (no failure) and found nothing — including no conversions. A site with
  // conversions but zero traffic signal is not a fresh install; it is a partial read, and
  // telling that customer to go install the tracker is false.
  const showEmptyState = !previewMode && !summaryFailed && !provenTraffic && !hasConversions

  return { provenTraffic, hasTraffic, trafficUnavailable, showEmptyState }
}
