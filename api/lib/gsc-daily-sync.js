// GSC daily auto-sync (cron path).
//
// Pulls finalized Search Console performance for every CONNECTED property and
// upserts it into gsc_performance_daily, writing sync_type:'daily'. Invoked once
// nightly from the existing nightly-attribution Railway cron (option (a)) — NOT a
// new Railway service. Pure + injectable: ALL I/O (db, Google calls, sleep, now)
// arrives via `deps`, so this is unit-testable without network or a live DB.
//
// Guardrails:
//   - per-connection try/catch — one bad connection never aborts the batch
//   - exponential backoff + jitter on Google calls (429 / 5xx / Retry-After)
//   - idempotent upsert (onConflict site_key,property_url,date,query,page_url)
//   - auth failures flip the connection to 'needs_reconnect' (not generic 'error')

const GSC_DATA_LAG_DAYS = 1   // GSC finalizes 2-3 days late; never fetch "today"
const DEFAULT_DAYS = 30
const ROW_LIMIT = 5000
const MAX_SYNC_ROWS = 25000
const UPSERT_BATCH = 1000

// Transient (worth retrying): HTTP 429 or any 5xx.
export function isTransientGscError(err) {
  const s = err?.status
  return s === 429 || (typeof s === 'number' && s >= 500 && s < 600)
}

// Auth failure: the refresh token is dead → the connection needs reconnection.
export function isAuthGscError(err) {
  const s = err?.status
  return s === 401 || s === 403 || err?.message === 'google_access_token_refresh_failed'
}

// Retry `fn` with exponential backoff + jitter on transient errors, honoring
// err.retryAfterMs when Google sends Retry-After. `sleep` is injected so tests
// run instantly. Non-retryable errors (e.g. auth) propagate immediately.
export async function withRetry(fn, { retries = 3, baseMs = 500, sleep, isRetryable = isTransientGscError } = {}) {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      if (attempt > retries || !isRetryable(err)) throw err
      const backoff = err?.retryAfterMs ?? (baseMs * 2 ** (attempt - 1))
      const jitter = Math.floor(Math.random() * 100)
      await sleep(backoff + jitter)
    }
  }
}

// Sync ONE connection. Throws on failure after recording it (sync run → failed,
// connection → needs_reconnect on auth error else error). Returns rows synced.
export async function syncOneConnection(deps, conn, { days = DEFAULT_DAYS } = {}) {
  const { supabase, refreshAccessToken, fetchGscPerformance, normalizePath, sleep, now = () => new Date() } = deps
  const { site_key, property_url, encrypted_refresh_token } = conn

  // 1. Open a pending run row — sync_type:'daily' (the /sync route keeps 'manual').
  const { data: runRow, error: runErr } = await supabase
    .from('gsc_sync_runs')
    .insert({ site_key, property_url, status: 'pending', sync_type: 'daily', records_synced: 0 })
    .select('id')
    .single()
  if (runErr) throw new Error(`gsc_sync_runs insert: ${runErr.message}`)
  const runId = runRow.id

  try {
    // 2. Fresh access token (retryable on transient Google errors).
    const { access_token } = await withRetry(() => refreshAccessToken(encrypted_refresh_token), { sleep })

    // 3. Bounded window: [now-days, now-lag] — skip unfinalized recent days.
    const to = now(); to.setDate(to.getDate() - GSC_DATA_LAG_DAYS)
    const from = now(); from.setDate(from.getDate() - days)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)

    // 4. Paginated fetch (each page retryable).
    const rows = []
    let startRow = 0
    for (;;) {
      const page = await withRetry(
        () => fetchGscPerformance(property_url, fromStr, toStr, access_token, startRow, ROW_LIMIT),
        { sleep }
      )
      if (!page?.length) break
      rows.push(...page)
      startRow += ROW_LIMIT
      if (page.length < ROW_LIMIT || startRow >= MAX_SYNC_ROWS) break
    }

    // 5. Idempotent upsert in batches (re-runs dedupe on the conflict key).
    let synced = 0
    if (rows.length) {
      const records = rows.map((r) => {
        const [date, query, pageUrl] = r.keys
        return {
          site_key,
          property_url,
          date,
          query,
          page_url: pageUrl,
          page_path: normalizePath(pageUrl),
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0
        }
      })
      for (let i = 0; i < records.length; i += UPSERT_BATCH) {
        const batch = records.slice(i, i + UPSERT_BATCH)
        const { error: upErr } = await supabase
          .from('gsc_performance_daily')
          .upsert(batch, { onConflict: 'site_key,property_url,date,query,page_url' })
        if (upErr) throw new Error(`gsc_performance_daily upsert: ${upErr.message}`)
      }
      synced = records.length
    }

    // 6. Mark success + connection healthy.
    await supabase.from('gsc_sync_runs')
      .update({ status: 'success', records_synced: synced, sync_end: now().toISOString() })
      .eq('id', runId)
    await supabase.from('gsc_connections')
      .update({ status: 'connected', last_synced_at: now().toISOString(), last_error_code: null, last_error_message: null })
      .eq('site_key', site_key)

    return { site_key, records_synced: synced }
  } catch (err) {
    const authFail = isAuthGscError(err)
    await supabase.from('gsc_sync_runs')
      .update({ status: 'failed', error_message: err.message, sync_end: now().toISOString() })
      .eq('id', runId)
    await supabase.from('gsc_connections')
      .update({
        status: authFail ? 'needs_reconnect' : 'error',
        last_error_code: authFail ? 'token_refresh_failed' : 'sync_failed',
        last_error_message: err.message
      })
      .eq('site_key', site_key)
    throw err
  }
}

// Batch entrypoint. Queries eligible connections (connected + property + token)
// and syncs each in isolation — one failure never aborts the batch. Returns a
// summary; never throws on a per-connection error (only on the initial query).
export async function runGscDailySync(deps, { days = DEFAULT_DAYS } = {}) {
  const { supabase, log = () => {} } = deps

  const { data: connections, error } = await supabase
    .from('gsc_connections')
    .select('site_key, property_url, encrypted_refresh_token')
    .eq('status', 'connected')
    .not('property_url', 'is', null)
    .not('encrypted_refresh_token', 'is', null)
  if (error) throw new Error(`gsc_connections query: ${error.message}`)

  const summary = { eligible: connections?.length || 0, succeeded: 0, failed: 0, records_synced: 0 }

  for (const conn of connections || []) {
    try {
      const r = await syncOneConnection(deps, conn, { days })
      summary.succeeded++
      summary.records_synced += r.records_synced
    } catch (err) {
      summary.failed++
      log(`[gsc-daily-sync] site ${conn.site_key} failed: ${err.message}`)
    }
  }

  log(`[gsc-daily-sync] eligible:${summary.eligible} ok:${summary.succeeded} failed:${summary.failed} rows:${summary.records_synced}`)
  return summary
}
