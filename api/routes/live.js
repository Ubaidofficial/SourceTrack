import express from 'express'
import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { esc } from '../lib/utils.js'

const router = express.Router()

// ── Test seam ────────────────────────────────────────────────────────────────
// The repo has no ESM module mocker, so — mirroring the write-side adapter's
// setDualWriteTransport() seam — these let unit tests inject stubs for the two
// read backends. Production NEVER calls the setter, so it uses the real imports
// and behaves identically.
let _queryTinybirdPipe = queryTinybirdPipe
let _queryHogQL = queryHogQL
export function __setLiveReadDeps ({ queryTinybird, queryHog } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
  if (queryHog) _queryHogQL = queryHog
}
export function __resetLiveReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
  _queryHogQL = queryHogQL
}

// Parent mount in api/index.js applies requireUserAuth + validateSiteKey +
// requireSiteMembership, so req.site is guaranteed populated here.
router.get('/', async (req, res) => {
  // Test-only, fail-closed dispatch-path proof: when TINYBIRD_FORCE_READ is on
  // and the Tinybird read yields null/error, THROW instead of silently falling
  // back to HogQL — so a test can prove the Tinybird path was actually taken and
  // never gets a false green from a silent HogQL bypass. Unset in prod/CI.
  const forceRead = process.env.TINYBIRD_FORCE_READ === 'true'
  try {
    if (!req.site?.id) {
      return res.status(400).json({ success: false, data: null, error: 'Site context missing' })
    }

    // ── Tinybird read (flag-gated inside the client) ──
    // Returns null when TINYBIRD_READ_ENABLED is off, misconfigured, or on any
    // error — in which case we fall through to the unchanged HogQL path below.
    // Tenant isolation: the pipe's required site_id is the AUTHENTICATED
    // req.site.id (never client-supplied). Backing pipe: live_visitors_bag
    // (1:1 port of the HogQL query below; 5-minute window is fixed in the pipe).
    const tbRows = await _queryTinybirdPipe('live_visitors_bag', { site_id: String(req.site.id) })
    if (tbRows !== null) {
      const live_visitors = Number(tbRows?.[0]?.live_visitors ?? 0)
      return res.json({ success: true, data: { live_visitors }, error: null })
    }
    if (forceRead) {
      throw new Error('[tinybird-force-read] live_visitors_bag returned null under TINYBIRD_FORCE_READ — dispatch path not exercised')
    }

    // ── HogQL fallback (unchanged — the pre-cutover behavior) ──
    const sql = `
      SELECT count(DISTINCT properties.anonymous_id) AS live_visitors
      FROM events
      WHERE event = '$pageview'
        AND properties.site_id = '${esc(req.site.id)}'
        AND timestamp >= now() - INTERVAL 5 MINUTE
    `
    const rows = await _queryHogQL(sql, 'live_visitors')
    const live_visitors = Number(rows?.[0]?.[0] ?? 0)
    res.json({ success: true, data: { live_visitors }, error: null })
  } catch (err) {
    console.error('Live visitors error:', err)
    if (forceRead) {
      // Fail-closed under the dispatch-proof harness — never soft-fail to 0.
      return res.status(500).json({ success: false, data: null, error: 'tinybird-force-read dispatch failure' })
    }
    // Soft-fail to 0 so the dashboard widget doesn't break on PostHog hiccups.
    res.json({ success: true, data: { live_visitors: 0 }, error: null })
  }
})

export default router
