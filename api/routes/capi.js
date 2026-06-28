/**
 * CAPI config surface (Phase 2) — server-side conversion forwarding setup.
 *
 * GET  /api/integrations/capi/status         — per-platform connected + last delivery (NO tokens)
 * POST /api/integrations/capi/:platform      — set token + ids (encrypt-on-write, plan-gated)
 * POST /api/integrations/capi/:platform/disconnect — clear token + ids
 *
 * Mounted with requireUserAuth + validateSiteKey + requireSiteMembership, so
 * req.site is the membership-verified tenant. Tokens are encrypted at rest
 * (encryptCapiToken) and NEVER returned by any endpoint. Does NOT call the ad
 * platform's API to validate the token (test-connection is a later phase).
 */
import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { requireFeature } from '../lib/plan-features.js'
import { encryptCapiToken } from '../lib/conversion-sync.js'

const router = Router()

// Per-platform column map. tokenCol holds the (encrypted) secret; idCols are the
// non-secret identifiers shown back in status. Meta + Google forward LIVE via the
// conversion fan-out (dispatchCapi). TikTok is intentionally absent: it has no
// columns on prod and no forwarding wiring (#57), so it will ship later as one
// complete unit (column + config + forwarding) rather than a config card that
// saves a token but never forwards.
export const CAPI_PLATFORMS = {
  meta:   { tokenCol: 'meta_capi_token',           idCols: { pixel_id: 'meta_pixel_id' } },
  google: { tokenCol: 'google_ads_developer_token', idCols: { customer_id: 'google_ads_customer_id', conversion_action_id: 'google_ads_conversion_action_id' } }
}

const enforceCapi = (req, res, next) => {
  const block = requireFeature(req.site?.plan, 'capi_server_side', 'Server-side CAPI')
  if (block) return res.status(402).json(block)
  next()
}

// Build the encrypted column update for a set/connect request. Pure + testable.
// Returns { update } or { error }. The token is ENCRYPTED here — never stored raw.
export function buildCapiUpdate(platform, body) {
  const cfg = CAPI_PLATFORMS[platform]
  if (!cfg) return { error: 'Unknown platform' }
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return { error: 'token is required' }

  const update = { [cfg.tokenCol]: encryptCapiToken(token) }
  for (const [field, col] of Object.entries(cfg.idCols)) {
    const val = typeof body?.[field] === 'string' ? body[field].trim() : ''
    if (!val) return { error: `${field} is required` }
    update[col] = val
  }
  return { update }
}

// Build the disconnect update (null out token + ids). Pure.
export function buildCapiDisconnect(platform) {
  const cfg = CAPI_PLATFORMS[platform]
  if (!cfg) return { error: 'Unknown platform' }
  const update = { [cfg.tokenCol]: null }
  for (const col of Object.values(cfg.idCols)) update[col] = null
  return { update }
}

// Summarize per-platform status from a site row + delivery rows. Pure.
// NEVER includes any token — only connected bool, non-secret ids, last delivery.
export function buildCapiStatus(siteRow, deliveries) {
  const latestByPlatform = {}
  for (const d of deliveries || []) {
    if (!latestByPlatform[d.platform]) latestByPlatform[d.platform] = d // deliveries pre-sorted desc
  }
  const out = {}
  for (const [platform, cfg] of Object.entries(CAPI_PLATFORMS)) {
    const ids = {}
    for (const [field, col] of Object.entries(cfg.idCols)) ids[field] = siteRow?.[col] || null
    const connected = !!(siteRow?.[cfg.tokenCol]) && Object.values(ids).every(Boolean)
    const last = latestByPlatform[platform]
    out[platform] = {
      connected,
      ...ids,
      last_delivery: last ? { status: last.status, at: last.created_at } : null
    }
  }
  return out
}

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const supabase = getSupabase()
    const cols = Object.values(CAPI_PLATFORMS).flatMap(c => [c.tokenCol, ...Object.values(c.idCols)])
    const { data: siteRow, error: siteErr } = await supabase
      .from('sites').select(cols.join(',')).eq('id', req.site.id).maybeSingle()
    if (siteErr) throw siteErr

    const { data: deliveries } = await supabase
      .from('capi_deliveries')
      .select('platform, status, created_at')
      .eq('site_id', req.site.id)
      .order('created_at', { ascending: false })
      .limit(50)

    return res.json({ success: true, data: buildCapiStatus(siteRow || {}, deliveries || []), error: null })
  } catch (err) {
    console.error('[capi] status error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load CAPI status' })
  }
})

// Read-only delivery log for the Setup & Health surface. Returns the last 50
// delivery rows for the membership-verified tenant (req.site, set by the
// validateSiteKey + requireSiteMembership mount middleware). Tenant isolation is
// enforced in code via .eq('site_id', req.site.id) — never a client-supplied id.
// No tokens, no secrets, no plan gate (diagnostic visibility mirrors /status).
router.get('/deliveries', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('capi_deliveries')
      .select('id, platform, event_ref, status, http_status, attempt, error_message, created_at')
      .eq('site_id', req.site.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return res.json({ success: true, data: data || [], error: null })
  } catch (err) {
    console.error('[capi] deliveries error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to load CAPI deliveries' })
  }
})

router.post('/:platform', enforceCapi, async (req, res) => {
  try {
    const { update, error } = buildCapiUpdate(req.params.platform, req.body)
    if (error) return res.status(400).json({ success: false, data: null, error })

    const { error: upErr } = await getSupabase().from('sites').update(update).eq('id', req.site.id)
    if (upErr) throw upErr
    return res.json({ success: true, data: { platform: req.params.platform, connected: true }, error: null })
  } catch (err) {
    console.error('[capi] set error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to save CAPI configuration' })
  }
})

router.post('/:platform/disconnect', enforceCapi, async (req, res) => {
  try {
    const { update, error } = buildCapiDisconnect(req.params.platform)
    if (error) return res.status(400).json({ success: false, data: null, error })

    const { error: upErr } = await getSupabase().from('sites').update(update).eq('id', req.site.id)
    if (upErr) throw upErr
    return res.json({ success: true, data: { platform: req.params.platform, connected: false }, error: null })
  } catch (err) {
    console.error('[capi] disconnect error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to disconnect' })
  }
})

export { router as capiRouter }
