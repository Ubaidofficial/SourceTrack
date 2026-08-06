import 'dotenv/config'
import { getSupabase } from '../lib/supabase.js'
import { verifyProxyDelivery, nextProxyState } from '../lib/proxy-verification.js'

// Scheduled re-verification of managed proxy domains.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
// Verification was manual-only: POST /api/integrations/proxy-domain/verify, triggered
// from the Integrations UI. It writes last_checked_at on every run, so the column was
// never broken — but nothing ever called it a second time. One production row sat at
// status='active' with last_checked_at fixed at 2026-07-15 for three weeks.
//
// That is the stale-success class this codebase keeps re-encountering: `active` meant
// "passed once, at some point" and the UI had no way to say otherwise. It also matters
// more than a normal stale badge, because Setup.jsx:77 keys the install snippet off
// `status === 'active'` — a dead proxy that still reads active hands customers a
// script tag pointing at a host that does not serve.
//
// ── CADENCE ──────────────────────────────────────────────────────────────────
//   pending_dns / pending_ssl_or_routing / error  -> hourly
//   active                                        -> daily
// Certificate issuance is async and takes 10-30 minutes, so a pending domain needs a
// tight loop to activate promptly. An active domain does not: daily bounds the
// detection window at 24h while keeping the outbound request volume per customer to
// one a day. Run this job hourly; it selects its own due set.
//
// Invocation (external scheduler, same pattern as the other jobs here):
//   node api/jobs/proxy-domain-recheck.js
//
// Idempotent and safe to run more often than the cadence — DUE_AFTER_MS is what
// actually gates work, not the scheduler.

const HOUR_MS = 60 * 60 * 1000
const DUE_AFTER_MS = {
  active: 24 * HOUR_MS,
  pending_dns: HOUR_MS,
  pending_ssl_or_routing: HOUR_MS,
  error: HOUR_MS
}

// Bounded per run so a large tenant base cannot turn one sweep into a long-running
// outbound crawl. Domains past the cap are simply picked up by the next hourly run;
// the oldest last_checked_at is served first, so nothing starves.
const MAX_PER_RUN = 200

export function isDue (row, now = Date.now()) {
  const window = DUE_AFTER_MS[row.status]
  if (window === undefined) return false          // unknown status: leave it alone
  if (!row.last_checked_at) return true           // never checked
  const age = now - new Date(row.last_checked_at).getTime()
  return Number.isFinite(age) ? age >= window : true
}

export async function run () {
  const supabase = getSupabase()

  // cookieless_mode lives on sites, and decides WHICH bundle must be served, so the
  // check has to agree with Setup.jsx:134 or it would verify a file the customer is
  // never told to load.
  const { data: rows, error } = await supabase
    .from('managed_proxy_domains')
    .select('site_key, domain, status, last_checked_at, error_code, sites!inner(cookieless_mode)')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN)

  if (error) {
    // Fail loudly. A sweep that cannot read its work list has NOT verified anything,
    // and must never be reported as a clean run (KI-45 / the anomaly-watcher lesson).
    console.error('[proxy-recheck] FAILED to load domains:', error.message)
    throw error
  }

  const now = Date.now()
  const due = (rows || []).filter(r => isDue(r, now))

  const summary = { scanned: rows?.length ?? 0, due: due.length, ok: 0, failed: 0, demoted: 0, errored: 0 }
  if (!due.length) {
    console.log(`[proxy-recheck] scanned=${summary.scanned} due=0 — nothing to do`)
    return summary
  }

  for (const row of due) {
    const cookieless = row.sites?.cookieless_mode === true
    try {
      const result = await verifyProxyDelivery(row.domain, cookieless)
      const next = nextProxyState(row.status, row.error_code, result)

      const { error: upErr } = await supabase
        .from('managed_proxy_domains')
        .update({
          status: next.status,
          error_code: next.error_code,
          error_message: next.error_message,
          // ALWAYS written, pass or fail. The age of this column is what lets the UI
          // say "verified 3 minutes ago" instead of implying a stale `active` is live.
          last_checked_at: new Date().toISOString(),
          ...(result.ok ? { verified_at: new Date().toISOString() } : {})
        })
        .eq('site_key', row.site_key)

      if (upErr) throw upErr

      if (result.ok) summary.ok++
      else summary.failed++
      if (next.demoted) {
        summary.demoted++
        // Domain only, never the site_key (§6.5) — the domain is the customer's own
        // public hostname, the site_key is a credential.
        console.warn(`[proxy-recheck] DEMOTED ${row.domain}: ${next.error_code} — ${next.error_message}`)
      }
    } catch (err) {
      // One bad domain must not abort the sweep for everyone else.
      summary.errored++
      console.error(`[proxy-recheck] error checking ${row.domain}:`, err?.message)
    }
  }

  console.log(`[proxy-recheck] scanned=${summary.scanned} due=${summary.due} ok=${summary.ok} failed=${summary.failed} demoted=${summary.demoted} errored=${summary.errored}`)
  return summary
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then(s => process.exit(s.errored > 0 ? 1 : 0))
    .catch(err => { console.error('[proxy-recheck] fatal:', err?.message); process.exit(1) })
}
