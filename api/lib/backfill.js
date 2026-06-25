// Pure, testable core for the per-site historical attribution backfill.
// The orchestration (flag parsing, PostHog fetch, processConversion reuse, real
// Supabase upsert) lives in api/jobs/nightly-attribution.js; this module holds
// the logic that must be provable in isolation: day clamping, journey-truncation
// classification, and the idempotent apply loop.

/** Clamp a requested lookback to [1, 90] days; default 90 on bad input. */
export function clampDays(days) {
  const n = parseInt(days, 10)
  if (!Number.isFinite(n)) return 90
  return Math.min(90, Math.max(1, n))
}

/**
 * Classify a built attribution record's journey completeness, so a backfill never
 * silently presents a partial journey as complete.
 * - 'no_journey'         : no touchpoints matched (first_touch is null)
 * - 'possibly_truncated' : first touch sits at/under the attribution-window lower
 *                          bound (conversion - attrWindowDays), so earlier touches
 *                          may exist but are excluded by the <=90d window
 * - 'complete'           : first touch is strictly inside the window
 *
 * @param {{first_touch_timestamp?: string|null}} record
 * @param {string|number|Date} conversionTimestamp
 * @param {number} attrWindowDays  the site's attribution window (already clamped <=90)
 */
export function classifyJourney(record, conversionTimestamp, attrWindowDays) {
  if (!record || !record.first_touch_timestamp) return 'no_journey'
  const convMs = new Date(conversionTimestamp).getTime()
  const boundaryMs = convMs - attrWindowDays * 86400000
  const firstMs = new Date(record.first_touch_timestamp).getTime()
  // Within ~1 day of the lower bound ⇒ treat as possibly truncated.
  return firstMs <= boundaryMs + 86400000 ? 'possibly_truncated' : 'complete'
}

/**
 * Apply built attribution records idempotently.
 *
 * @param {Array<object>} records
 * @param {object} opts
 * @param {boolean} opts.dryRun  — if true, count only; never call store.upsert
 * @param {{upsert: (record:object)=>Promise<'upserted'|'skipped_duplicate'>}} opts.store
 *        store.upsert must use onConflict (site_id, conversion_event_id) →
 *        existing row UPDATEs (returns 'upserted'); a conflict on the partial
 *        (site_id, external_event_id) unique index for a DIFFERENT
 *        conversion_event_id must be caught and returned as 'skipped_duplicate'
 *        (never thrown) so re-runs and source-duplicate events don't error.
 * @returns {Promise<{total:number, wouldWrite:number, upserted:number, skippedDuplicate:number}>}
 */
export async function applyBackfill(records, { dryRun, store } = {}) {
  const result = { total: records.length, wouldWrite: 0, upserted: 0, skippedDuplicate: 0 }
  for (const record of records) {
    if (dryRun) { result.wouldWrite++; continue }
    const outcome = await store.upsert(record)
    if (outcome === 'skipped_duplicate') result.skippedDuplicate++
    else result.upserted++
  }
  return result
}
