// Per-site GDPR retention purge.
//
// Deletes one tenant's retention-governed rows older than `cutoffStr` (a
// 'YYYY-MM-DD' date). attributed_conversions is keyed by the internal site_id;
// the GSC cache/log tables are keyed by the customer-facing site_key. EVERY
// delete is scoped to a single tenant (site_id or site_key) — there is no
// cross-tenant delete.
//
// `db` is a Supabase-like client (injected so this is unit-testable with an
// in-memory store). Returns per-table deleted counts. Throws on the first
// delete error so the caller can log it per-site and move on.
export async function purgeSiteRetention(db, site, cutoffStr) {
  const counts = { attributed_conversions: 0, gsc_performance_daily: 0, gsc_sync_runs: 0 }

  // attributed_conversions — scoped by internal site_id, by conversion_date.
  const conv = await db
    .from('attributed_conversions')
    .delete({ count: 'exact' })
    .eq('site_id', site.id)
    .lt('conversion_date', cutoffStr)
  if (conv.error) throw new Error(`attributed_conversions: ${conv.error.message}`)
  counts.attributed_conversions = conv.count || 0

  // gsc_performance_daily — scoped by site_key, by the aggregate row `date`.
  const perf = await db
    .from('gsc_performance_daily')
    .delete({ count: 'exact' })
    .eq('site_key', site.site_key)
    .lt('date', cutoffStr)
  if (perf.error) throw new Error(`gsc_performance_daily: ${perf.error.message}`)
  counts.gsc_performance_daily = perf.count || 0

  // gsc_sync_runs — scoped by site_key, by sync_start timestamp.
  const runs = await db
    .from('gsc_sync_runs')
    .delete({ count: 'exact' })
    .eq('site_key', site.site_key)
    .lt('sync_start', cutoffStr)
  if (runs.error) throw new Error(`gsc_sync_runs: ${runs.error.message}`)
  counts.gsc_sync_runs = runs.count || 0

  return counts
}
