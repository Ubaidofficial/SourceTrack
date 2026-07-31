// Bearer API-key authentication with an EXACT scope check — the reusable form of the guard
// that api/routes/server-events.js and api/routes/server-crawler-hits.js each inline.
//
// ── Why a new file and NOT api/middleware/api-key.js ─────────────────────────────────
// That file is the KI-42 dead middleware. Verified: zero importers across api/, dashboard/
// and mcp/. It must not be revived, because it does three things this one deliberately
// does not:
//   1. It accepts the credential from `?api_key=` in the QUERY STRING as well as a header.
//      A secret in a URL lands in access logs, browser history, and onward Referer.
//   2. It resolves against `sites.api_key_hash` with a fallback to the PLAINTEXT
//      `sites.api_key` column — the KI-42 plaintext-key problem itself.
//   3. It performs NO scope check at all, so every key it admits is all-powerful per-site.
// This module takes the credential from the Authorization header only, resolves against
// `api_keys.key_hash` only, and denies anything lacking the exact scope.
//
// ── Fail-closed, and exactly ─────────────────────────────────────────────────────────
// hasScope() (api/lib/api-key-scopes.js) is true only for an array that actually contains
// the required value, so '{}' (the DB default), null, and a missing column all deny. Scopes
// are siblings, not a hierarchy: no scope implies another, and holding write:events does not
// admit a read:diagnostics endpoint — nor does read:diagnostics admit a read:volume one.
// That is intended, not an oversight — see the rationale in api-key-scopes.js.
//
// ── Revocation ───────────────────────────────────────────────────────────────────────
// The lookup filters `revoked_at IS NULL`. Today that is a NO-OP: revoke is still a hard
// DELETE (api/routes/integrations.js), so a revoked key is simply absent and the lookup
// 401s on its own. The filter is here anyway because the `revoked_at` column already exists
// (migration 20260722000000) and KI-43 PR B will switch revoke to setting it. On the day
// that lands, any auth path NOT filtering it silently keeps honouring revoked keys — a live
// auth bypass. The two inlined precedents will each need this line added; this one already
// has it, so it is not a third site to remember.

import { createHash } from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { hasScope } from '../lib/api-key-scopes.js'
import { requireFeature } from '../lib/plan-features.js'

/**
 * Express middleware factory. Authenticates a Bearer API key and requires `requiredScope`.
 *
 * On success sets:
 *   req.apiKeyId   — the api_keys row id
 *   req.apiKeySite — { id, plan, ... } the site the KEY belongs to
 *   req.site       — same object, so downstream handlers read req.site.id like every
 *                    user-authed route already does
 *
 * TENANCY: `site_id` comes from the authenticated key row and NOTHING else. No handler
 * behind this guard may accept a site_id/site_key from the caller — one key is one site,
 * and honouring a caller-supplied id would be a cross-tenant read (§6.5).
 *
 * @param {string} requiredScope one of api/lib/api-key-scopes.js's exported scope values
 */
export function requireApiKeyScope (requiredScope) {
  if (typeof requiredScope !== 'string' || !requiredScope) {
    // A guard constructed without a scope would admit everything. Fail at boot, loudly,
    // rather than serve one request unguarded.
    throw new Error('requireApiKeyScope: a scope is required')
  }

  const guard = async function apiKeyScopeGuard (req, res, next) {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, data: null, error: 'Missing API key' })
      }

      const rawKey = authHeader.slice('Bearer '.length).trim()
      if (!rawKey) {
        return res.status(401).json({ success: false, data: null, error: 'Missing API key' })
      }

      const keyHash = createHash('sha256').update(rawKey).digest('hex')
      const supabase = getSupabase()

      const { data: apiKey, error: keyErr } = await supabase
        .from('api_keys')
        .select('id, site_id, scopes')
        .eq('key_hash', keyHash)
        .is('revoked_at', null)
        .maybeSingle()

      if (keyErr || !apiKey) {
        return res.status(401).json({ success: false, data: null, error: 'Invalid API key' })
      }

      if (!hasScope(apiKey.scopes, requiredScope)) {
        return res.status(403).json({
          success: false,
          data: null,
          error: `API key is not authorized for this endpoint (requires the '${requiredScope}' scope)`
        })
      }

      const { data: site, error: siteErr } = await supabase
        .from('sites')
        .select('id, plan, domain, name, timezone, attribution_window_days, onboarding_completed, last_seen_at, created_at, trial_ends_at')
        .eq('id', apiKey.site_id)
        .maybeSingle()

      if (siteErr || !site) {
        return res.status(401).json({ success: false, data: null, error: 'Invalid site associated with API key' })
      }

      // API keys ARE the api_access feature, so the same gate that guards
      // POST /api/server/event guards everything reached by a key. Not a second,
      // diagnostics-specific entitlement.
      const block = requireFeature(site.plan, 'api_access', 'API access')
      if (block) {
        return res.status(402).json(block)
      }

      req.apiKeyId = apiKey.id
      req.apiKeySite = site
      req.site = site

      // Audit touch. Awaited so a failure surfaces in the catch rather than as an
      // unhandled rejection, but a failure here must not deny an otherwise-valid read —
      // hence it is the last thing before next() and its own try.
      try {
        await supabase
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', apiKey.id)
      } catch (touchErr) {
        console.error('[api-key-scope] last_used_at touch failed:', touchErr?.message || touchErr)
      }

      return next()
    } catch (err) {
      console.error('[api-key-scope] auth failed:', err?.message || err)
      return res.status(500).json({ success: false, data: null, error: 'Internal server error' })
    }
  }

  // Every instance this factory returns is the same named function, so two guards built
  // for two different scopes are indistinguishable to anything walking a router stack.
  // Stamping the scope on the returned middleware is what lets a test assert WHICH scope
  // a given route enforces, rather than only that it carries some guard. Without it, a
  // route silently moved from one read scope to the other still passes a route-list test.
  guard.requiredScope = requiredScope
  return guard
}
