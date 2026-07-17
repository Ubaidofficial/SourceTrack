import express from 'express'
import { queryHogQL } from '../lib/posthog.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'

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
    // D1b: the HogQL fallback is DELETED — live_visitors_bag is the SOLE read path. A null means the
    // DEPLOYED pipe is not serving -> throw instead of a silent dead-store read. FIX THE PIPE, do not
    // restore the read. Under FORCE_READ the catch below 500s loud (staging dispatch-proof); in prod
    // the catch's existing soft-fail keeps this non-critical realtime widget alive (0 is a valid live
    // count — see PR body). The queryHogQL import/seam stays inert for D3.
    throw new Error('[tinybird-force-read] live_visitors_bag returned null — FIX THE PIPE, do not restore the read')
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
