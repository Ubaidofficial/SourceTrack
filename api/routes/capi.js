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
// non-secret identifiers shown back in status. Every platform listed here forwards
// LIVE via the conversion fan-out (dispatchCapi) — a platform belongs here only
// once its column, config card AND forwarding wiring all exist, never as a config
// card that saves a token but never forwards.
//
// LinkedIn joins here: sendLinkedInConversion already Bearer-authenticates against
// api.linkedin.com/v2/conversionEvents and is already in the fan-out, so adding the
// config card is the last thing it was missing. No migration — linkedin_partner_id
// and linkedin_capi_token already exist on prod (verified) via the baseline schema
// and 20260712000000_backfill_sites_capi_google_ads_columns.sql, and both are
// already in the SELECT on api/routes/conversion.js and conversion-offline.js.
//
// MICROSOFT REMAINS ABSENT, and now for a sharper reason than "no columns".
// sendMicrosoftConversion POSTs to https://bat.bing.com/bat.svc/c — the UET
// *tracking* endpoint — with `Content-Type` as its ONLY header. It reads
// microsoft_capi_token solely to check it is present and decryptable and then never
// transmits it; its own comment says "Phase 2 wires the token into the request
// if/when needed". Exposing a Microsoft card here would therefore save a credential
// that is never sent, which is exactly the failure the rule above forbids — a config
// card that appears connected while the token does nothing.
//
// Finishing it is not a config-map entry: Microsoft's offline conversions run through
// the Microsoft Advertising Campaign Management API, which needs OAuth2 (developer
// token + customer ID + account ID + refresh/access token) — a different credential
// SHAPE from the tag_id + token pair the current column pair models. That is a sender
// rewrite plus new columns, tracked separately.
// GOOGLE IS NO LONGER A TOKEN-COLUMN PLATFORM. Its credential is an OAuth grant, held
// in ad_platform_connections (keyed by site_key, RLS-enabled, already established by
// api/routes/ad-platforms.js for ad-cost import). Ad-cost import and CAPI offline-
// conversion upload need the SAME grant — same connection, opposite direction of travel.
//
// The sites columns it used to read are DEAD and deliberately still present (dropped in
// a separate later migration): google_ads_developer_token was a per-site copy of a
// credential Google issues once to the software provider, so it could never be correct;
// google_ads_customer_id / google_ads_conversion_action_id are superseded by the
// connection's account_id / conversion_action_id.
//
// An `external` entry has NO tokenCol and NO idCols. Every helper below branches on it
// explicitly rather than assuming the sites-column shape — the /status dynamic SELECT in
// particular would build a malformed column list if it iterated an external entry.
export const CAPI_PLATFORMS = {
  meta:     { tokenCol: 'meta_capi_token',   idCols: { pixel_id: 'meta_pixel_id' } },
  google:   { external: 'ad_platform_connections', externalPlatformValue: 'google_ads' },
  ga4:      { tokenCol: 'ga4_api_secret',    idCols: { measurement_id: 'ga4_measurement_id' } },
  tiktok:   { tokenCol: 'tiktok_capi_token', idCols: { pixel_code: 'tiktok_pixel_code' } },
  linkedin: { tokenCol: 'linkedin_capi_token', idCols: { partner_id: 'linkedin_partner_id' } }
}

// The sites-column platforms, i.e. everything the `sites` SELECT/UPDATE paths apply to.
// Derived, never hand-listed, so adding a platform above cannot desync this.
export const SITES_BACKED_PLATFORMS = Object.entries(CAPI_PLATFORMS)
  .filter(([, cfg]) => !cfg.external)

const enforceCapi = (req, res, next) => {
  const block = requireFeature(req.site?.plan, 'capi_server_side', 'Server-side CAPI')
  if (block) return res.status(402).json(block)
  next()
}

// Build the update for a set/connect request. Pure + testable.
//
// Token platforms  -> { update }        applied to `sites`.
// External (google)-> { external: cfg, connectionUpdate } applied to ad_platform_connections.
//
// An external platform takes NO token here: the secret is the OAuth refresh token, and it
// is written by the OAuth callback in ad-platforms.js, never pasted into this endpoint.
// The only thing this surface sets for Google is which conversion action to upload against.
export function buildCapiUpdate(platform, body) {
  const cfg = CAPI_PLATFORMS[platform]
  if (!cfg) return { error: 'Unknown platform' }

  if (cfg.external) {
    const val = typeof body?.conversion_action_id === 'string' ? body.conversion_action_id.trim() : ''
    if (!val) return { error: 'conversion_action_id is required' }
    // Google conversion action ids are numeric. Reject early rather than letting an
    // unusable value sit in a "connected"-looking row until a conversion fails.
    if (!/^\d+$/.test(val)) return { error: 'conversion_action_id must be numeric' }
    if (body?.token) return { error: 'google is connected via OAuth — do not post a token' }
    return { external: cfg, connectionUpdate: { conversion_action_id: val } }
  }

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

// Build the disconnect update. Pure.
//
// For an external platform this clears ONLY conversion_action_id — it deliberately does
// NOT delete the connection row or revoke the OAuth grant. That row is shared with
// ad-cost import; deleting it here would silently break a different, still-wanted feature.
// Disconnecting CAPI means "stop uploading conversions", and a null conversion_action_id
// is exactly what makes sendGoogleConversion no-op. Revoking the grant is
// POST /ad-platforms/google/disconnect, which owns that lifecycle.
export function buildCapiDisconnect(platform) {
  const cfg = CAPI_PLATFORMS[platform]
  if (!cfg) return { error: 'Unknown platform' }
  if (cfg.external) return { external: cfg, connectionUpdate: { conversion_action_id: null } }
  const update = { [cfg.tokenCol]: null }
  for (const col of Object.values(cfg.idCols)) update[col] = null
  return { update }
}

// Summarize per-platform status from a site row, delivery rows, and any external
// connection rows. Pure. NEVER includes a token, a refresh token, or site_key —
// only connected bools, non-secret ids, and the last delivery.
//
// `connections` is the ad_platform_connections rows for this tenant (may be empty).
export function buildCapiStatus(siteRow, deliveries, connections = []) {
  const latestByPlatform = {}
  for (const d of deliveries || []) {
    if (!latestByPlatform[d.platform]) latestByPlatform[d.platform] = d // deliveries pre-sorted desc
  }
  const out = {}
  for (const [platform, cfg] of Object.entries(CAPI_PLATFORMS)) {
    const last = latestByPlatform[platform]
    const lastDelivery = last ? { status: last.status, at: last.created_at } : null

    if (cfg.external) {
      const row = (connections || []).find(c => c?.platform === cfg.externalPlatformValue) || null
      // Two distinct booleans, because the UI has two distinct states to render: the
      // OAuth grant can be live while no conversion action has been chosen yet, and that
      // is NOT "connected" for CAPI — the sender no-ops without an action id. Collapsing
      // these into one flag is what would let the card claim a forwarding path it lacks.
      const oauthConnected = row?.status === 'connected'
      out[platform] = {
        connected: oauthConnected && !!row?.conversion_action_id,
        oauth_connected: oauthConnected,
        connection_status: row?.status || null,
        customer_id: row?.account_id || null,
        conversion_action_id: row?.conversion_action_id || null,
        last_delivery: lastDelivery
      }
      continue
    }

    const ids = {}
    for (const [field, col] of Object.entries(cfg.idCols)) ids[field] = siteRow?.[col] || null
    out[platform] = {
      connected: !!(siteRow?.[cfg.tokenCol]) && Object.values(ids).every(Boolean),
      ...ids,
      last_delivery: lastDelivery
    }
  }
  return out
}

// ─── Routes ──────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const supabase = getSupabase()
    // Only the sites-backed platforms contribute columns here. An external entry has no
    // tokenCol/idCols, so including it would splice `undefined` into the column list and
    // make PostgREST reject the whole SELECT.
    const cols = SITES_BACKED_PLATFORMS.flatMap(([, c]) => [c.tokenCol, ...Object.values(c.idCols)])
    const { data: siteRow, error: siteErr } = await supabase
      .from('sites').select(cols.join(',')).eq('id', req.site.id).maybeSingle()
    if (siteErr) throw siteErr

    const { data: deliveries } = await supabase
      .from('capi_deliveries')
      .select('platform, status, created_at')
      .eq('site_id', req.site.id)
      .order('created_at', { ascending: false })
      .limit(50)

    // External-platform connections for this tenant. Scoped by site_key in code (§6.5) —
    // this is the service-role client, so RLS is bypassed and the filter is the isolation.
    // site_key is used as the lookup key ONLY; it is never placed on the response.
    const externalPlatformValues = Object.values(CAPI_PLATFORMS)
      .filter(c => c.external).map(c => c.externalPlatformValue)
    let connections = []
    if (externalPlatformValues.length) {
      const { data: connRows, error: connErr } = await supabase
        .from('ad_platform_connections')
        .select('platform, status, account_id, conversion_action_id')
        .eq('site_key', req.site.site_key)
        .in('platform', externalPlatformValues)
      if (connErr) throw connErr
      connections = connRows || []
    }

    return res.json({
      success: true,
      data: buildCapiStatus(siteRow || {}, deliveries || [], connections),
      error: null
    })
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

// Apply an external-platform update to the tenant's connection row.
// Returns null on success, or an error string. Never creates a row: the OAuth callback
// owns row creation, so "no row" here means the operator has not connected yet and the
// honest answer is to say so rather than to invent a half-connected row.
async function applyExternalConnectionUpdate(supabase, siteKey, cfg, connectionUpdate) {
  const { data, error } = await supabase
    .from('ad_platform_connections')
    .update(connectionUpdate)
    .eq('site_key', siteKey)
    .eq('platform', cfg.externalPlatformValue)
    .select('platform')
  if (error) throw error
  if (!data || data.length === 0) return 'Not connected — complete the Google Ads OAuth connection first'
  return null
}

router.post('/:platform', enforceCapi, async (req, res) => {
  try {
    const { update, external, connectionUpdate, error } = buildCapiUpdate(req.params.platform, req.body)
    if (error) return res.status(400).json({ success: false, data: null, error })

    const supabase = getSupabase()
    if (external) {
      const failure = await applyExternalConnectionUpdate(supabase, req.site.site_key, external, connectionUpdate)
      if (failure) return res.status(409).json({ success: false, data: null, error: failure })
      return res.json({ success: true, data: { platform: req.params.platform, connected: true }, error: null })
    }

    const { error: upErr } = await supabase.from('sites').update(update).eq('id', req.site.id)
    if (upErr) throw upErr
    return res.json({ success: true, data: { platform: req.params.platform, connected: true }, error: null })
  } catch (err) {
    console.error('[capi] set error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to save CAPI configuration' })
  }
})

router.post('/:platform/disconnect', enforceCapi, async (req, res) => {
  try {
    const { update, external, connectionUpdate, error } = buildCapiDisconnect(req.params.platform)
    if (error) return res.status(400).json({ success: false, data: null, error })

    const supabase = getSupabase()
    if (external) {
      // A missing row is already the desired end state here, so unlike the set path this
      // does not 409 — disconnecting something absent is a no-op success.
      await applyExternalConnectionUpdate(supabase, req.site.site_key, external, connectionUpdate)
      return res.json({ success: true, data: { platform: req.params.platform, connected: false }, error: null })
    }

    const { error: upErr } = await supabase.from('sites').update(update).eq('id', req.site.id)
    if (upErr) throw upErr
    return res.json({ success: true, data: { platform: req.params.platform, connected: false }, error: null })
  } catch (err) {
    console.error('[capi] disconnect error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to disconnect' })
  }
})

export { router as capiRouter }
