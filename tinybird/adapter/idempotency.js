// SourceTrack — Tinybird ingest adapter: parallel (site_id, event_id) idempotency
// claim (Phase 2b).
//
// A NEW, parallel money-rail dedup keyed on (site_id, event_id) — deliberately
// WITHOUT `provider` in the key, so a shared deterministic event_id (e.g. the
// offline<->browser external_event_id) cross-dedups producers that the existing
// provider-scoped revenue_idempotency_keys cannot. It does NOT replace the
// existing Supabase claim (api/lib/idempotency.js, keyed on
// site_KEY+provider+key_type+key_value); it runs alongside it for the Tinybird
// events plane.
//
// Mirrors the existing claim/rollback pattern (api/lib/idempotency.js:13-130 on
// origin/main): claim-before-emit, unique-constraint = the dedup, rollback to
// RELEASE the claim if the emit path fails so a retry can re-attempt. Simplified
// to a single key, so a direct INSERT + unique-violation (23505) detection
// replaces the multi-key PL/pgSQL RPC.
//
// Supabase client is DEPENDENCY-INJECTED (like batch.js's transport) — no api/
// import, fully mockable, no real DB call in tests.

export const TINYBIRD_IDEMPOTENCY_TABLE = 'tinybird_revenue_idempotency_keys'

// Postgres unique_violation. A duplicate (site_id, event_id) trips this.
const PG_UNIQUE_VIOLATION = '23505'

/**
 * @param {object} supabase - a Supabase client (or compatible mock) exposing
 *                            `.from(table).insert(row)` and
 *                            `.from(table).delete().eq().eq()`.
 * @returns {{ claim, rollback }}
 */
export function createRevenueIdempotency (supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new TypeError('createRevenueIdempotency: an injected Supabase client is required')
  }

  /**
   * Claim (site_id, event_id) BEFORE emit. The unique constraint is the dedup.
   *
   * Returns:
   *   { claimed: true }                       — fresh; caller should emit.
   *   { claimed: false, duplicate: true }     — already seen; caller must NOT emit.
   *   { claimed: false, error: <msg> }        — DB error. Caller should FAIL OPEN
   *                                             (emit anyway): better a rare
   *                                             duplicate than dropping real
   *                                             revenue on a DB hiccup. Mirrors the
   *                                             fail-open at conversion.js:309-333.
   *
   * Distinguishing `duplicate` from `error` is load-bearing: collapsing both into
   * claimed:false would make a DB outage silently drop conversions.
   */
  async function claim (siteId, eventId) {
    if (!siteId || !eventId) {
      return { claimed: false, error: 'missing site_id or event_id' }
    }
    try {
      const { error } = await supabase
        .from(TINYBIRD_IDEMPOTENCY_TABLE)
        .insert({ site_id: String(siteId), event_id: String(eventId) })

      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) return { claimed: false, duplicate: true }
        return { claimed: false, error: error.message || 'claim insert failed' }
      }
      return { claimed: true }
    } catch (err) {
      return { claimed: false, error: err?.message || 'claim threw' }
    }
  }

  /**
   * Release a previously-claimed (site_id, event_id) when the emit path fails
   * (e.g. transport rejected), so the retry can re-claim and re-emit. Best-effort;
   * mirrors rollbackIdempotencyKeys (api/lib/idempotency.js:102-130).
   */
  async function rollback (siteId, eventId) {
    if (!siteId || !eventId) return
    try {
      const { error } = await supabase
        .from(TINYBIRD_IDEMPOTENCY_TABLE)
        .delete()
        .eq('site_id', String(siteId))
        .eq('event_id', String(eventId))
      if (error) {
        // Best-effort: a stranded claim only risks dropping a future retry of the
        // SAME event; surface but don't throw.
        console.error('[tinybird-idempotency] rollback failed:', error.message || error)
      }
    } catch (err) {
      console.error('[tinybird-idempotency] rollback threw:', err?.message)
    }
  }

  return { claim, rollback }
}
