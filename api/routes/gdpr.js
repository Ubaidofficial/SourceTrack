/**
 * GDPR / Privacy endpoints
 *
 * DELETE /api/gdpr/visitor   — erase all data for one visitor (by anonymous_id)
 * DELETE /api/gdpr/account   — full account purge (all sites + auth user)
 * PUT    /api/gdpr/retention — set data_retention_days for a site
 * GET    /api/gdpr/export    — DSAR export of one site's data as a JSON bundle
 *
 * All endpoints require a logged-in user (requireUserAuth) and verify that the
 * caller owns (or is a member of) the site they are operating on.
 */

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { getStructuralLimits } from '../lib/plan-features.js'
import { validateSiteKey, requireSiteMembership } from '../middleware/auth.js'

export const gdprRouter = Router()

// Helper: resolve site record for calling user (membership-aware)
async function getSiteForUser(supabase, userId, siteKey) {
  const { data: member } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()

  const query = supabase
    .from('sites')
    .select('id, site_key, owner_id, company_id, posthog_site_id, plan')
    .eq('site_key', siteKey)
    .limit(1)

  if (member?.company_id) {
    query.eq('company_id', member.company_id)
  } else {
    query.eq('owner_id', userId)
  }

  const { data } = await query.maybeSingle()
  return data
}

// Helper: delete a PostHog person by distinct_id (best-effort)
async function deletePostHogPerson(distinctId, posthogSiteId) {
  if (!distinctId || !posthogSiteId) return
  try {
    const host = (process.env.POSTHOG_HOST || 'https://app.posthog.com').replace(/\/$/, '')
    const projectId = process.env.POSTHOG_PROJECT_ID
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
    if (!projectId || !apiKey) return

    // First fetch person UUID by distinct_id
    const searchRes = await fetch(
      `${host}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!searchRes.ok) return
    const { results } = await searchRes.json()
    if (!results?.length) return

    const personId = results[0].id
    await fetch(
      `${host}/api/projects/${projectId}/persons/${personId}/?delete_events=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } }
    )
  } catch (_e) { /* best-effort — never block the response */ }
}

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/gdpr/visitor
// Body: { site_key, anonymous_id }
// Erases: attributed_conversions rows for this visitor
//         PostHog person + events for this distinct_id
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.delete('/visitor', async (req, res) => {
  try {
    const userId     = req.user?.id
    const { site_key, anonymous_id } = req.body

    if (!site_key || !anonymous_id) {
      return res.status(400).json({ success: false, error: 'site_key and anonymous_id are required' })
    }

    const supabase = getSupabase()
    const site = await getSiteForUser(supabase, userId, site_key)
    if (!site) {
      return res.status(403).json({ success: false, error: 'Site not found or access denied' })
    }

    // 1. Delete from attributed_conversions
    const { error: dbErr } = await supabase
      .from('attributed_conversions')
      .delete()
      .eq('site_id', site.id)
      .eq('anonymous_id', anonymous_id)

    if (dbErr) throw dbErr

    // 1b. Resolve any linked user_ids for this anonymous_id on this site to delete their identity links too
    const { data: resolvedLinks } = await supabase
      .from('site_identity_links')
      .select('user_id')
      .eq('site_id', site.id)
      .eq('anonymous_id', anonymous_id)

    const linkedUserIds = (resolvedLinks || []).map(r => r.user_id).filter(Boolean)

    // Delete identity links matching anonymous_id scoped strictly to this site
    await supabase
      .from('site_identity_links')
      .delete()
      .eq('site_id', site.id)
      .eq('anonymous_id', anonymous_id)

    // Delete identity links matching resolved user_id(s) scoped strictly to this site
    if (linkedUserIds.length > 0) {
      await supabase
        .from('site_identity_links')
        .delete()
        .eq('site_id', site.id)
        .in('user_id', linkedUserIds)
    }

    // 2. Delete from PostHog (best-effort, don't fail the response)
    await deletePostHogPerson(anonymous_id, site.posthog_site_id)

    return res.json({
      success: true,
      message: `Visitor data for anonymous_id "${anonymous_id}" has been erased.`
    })
  } catch (err) {
    console.error('[GDPR] visitor delete error:', err)
    return res.status(500).json({ success: false, error: 'Failed to delete visitor data' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// DELETE /api/gdpr/account
// No body needed — deletes everything owned by req.user
// Erases: attributed_conversions for all sites, sites, company_members,
//         companies (if sole member), then the Supabase auth user
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.delete('/account', async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorised' })

    const supabase = getSupabase()

    // 1. Find all sites owned by (or associated with) this user
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', userId)
      .maybeSingle()

    let shouldDeleteSites = true
    let isSoleMember = true

    if (memberRow?.company_id) {
      // Look up all members in the company
      const { data: members, error: memErr } = await supabase
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', memberRow.company_id)

      if (memErr) throw memErr

      if (members && members.length > 1) {
        isSoleMember = false
        shouldDeleteSites = false

        // Check if the deleting user is the sole owner/admin
        const isAdmin = memberRow.role === 'admin'
        const otherAdmins = members.filter(m => m.role === 'admin' && m.user_id !== userId)

        if (isAdmin && otherAdmins.length === 0) {
          return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: 'You are the sole administrator of a shared workspace. Please transfer ownership or contact support before deleting your account.'
          })
        }
      }
    }

    if (shouldDeleteSites) {
      const sitesQuery = supabase.from('sites').select('id, posthog_site_id')
      if (memberRow?.company_id) sitesQuery.eq('company_id', memberRow.company_id)
      else sitesQuery.eq('owner_id', userId)

      const { data: sites } = await sitesQuery

      if (sites?.length) {
        const siteIds = sites.map(s => s.id)

        // 2. Delete attributed_conversions for all sites
        await supabase
          .from('attributed_conversions')
          .delete()
          .in('site_id', siteIds)

        // 3. Delete sites. This CASCADE-deletes all site-scoped GSC data via the
        // FK `... REFERENCES sites(site_key) ON DELETE CASCADE` on each table:
        //   - gsc_connections      (incl. encrypted_refresh_token + google_account_email)
        //   - gsc_performance_daily
        //   - gsc_sync_runs
        // (see supabase/migrations/20260607212000_add_google_search_console.sql).
        // If that cascade is ever dropped, these tables must be deleted explicitly here.
        await supabase.from('sites').delete().in('id', siteIds)
      }
    }

    // 4. Remove company membership
    if (memberRow?.company_id) {
      await supabase
        .from('company_members')
        .delete()
        .eq('user_id', userId)

      // If no members left (and we are sole member), delete the company too
      if (isSoleMember) {
        const { count } = await supabase
          .from('company_members')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', memberRow.company_id)

        if (count === 0) {
          await supabase.from('companies').delete().eq('id', memberRow.company_id)
        }
      }
    }

    // 5. Delete the Supabase auth user (uses service role key)
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId)
    if (authErr) throw authErr

    return res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.'
    })
  } catch (err) {
    console.error('[GDPR] account delete error:', err)
    return res.status(500).json({ success: false, error: 'Failed to delete account' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// PUT /api/gdpr/retention
// Body: { site_key, retention_days }  (retention_days: 30 | 90 | 180 | 365 | 0=forever)
// ────────────────────────────────────────────────────────────────────────────
gdprRouter.put('/retention', async (req, res) => {
  try {
    const userId = req.user?.id
    const { site_key, retention_days } = req.body

    const days = parseInt(retention_days, 10)
    const ALLOWED = [30, 60, 90, 180, 365, 0]
    if (!site_key || !ALLOWED.includes(days)) {
      return res.status(400).json({
        success: false,
        error: `retention_days must be one of: ${ALLOWED.join(', ')} (0 = keep forever)`
      })
    }

    const supabase = getSupabase()
    const site = await getSiteForUser(supabase, userId, site_key)
    if (!site) {
      return res.status(403).json({ success: false, error: 'Site not found or access denied' })
    }

    const limits = getStructuralLimits(site.plan)
    if (days === 0 && limits.retention_days < 1825) {
      return res.status(402).json({
        success: false,
        data: null,
        error: 'Feature not available on your plan',
        upgrade: {
          current_plan: site.plan,
          required_feature: 'keep_forever_retention',
          message: `Keep forever data retention is not available on the ${site.plan} plan. Upgrade to Scale to unlock.`,
          upgrade_url: '/billing',
        }
      })
    }
    if (days > limits.retention_days) {
      return res.status(402).json({
        success: false,
        data: null,
        error: 'Feature not available on your plan',
        upgrade: {
          current_plan: site.plan,
          required_feature: 'extended_retention',
          message: `Retention period of ${days} days exceeds the ${limits.retention_days}-day limit for the ${site.plan} plan. Upgrade to unlock.`,
          upgrade_url: '/billing',
        }
      })
    }

    const { error } = await supabase
      .from('sites')
      .update({ data_retention_days: days === 0 ? null : days })
      .eq('id', site.id)

    if (error) throw error

    return res.json({
      success: true,
      message: days === 0
        ? 'Data will be kept indefinitely.'
        : `Data older than ${days} days will be auto-purged nightly.`
    })
  } catch (err) {
    console.error('[GDPR] retention update error:', err)
    return res.status(500).json({ success: false, error: 'Failed to update retention policy' })
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /api/gdpr/export?site_key=<key>
// DSAR export of ONE site's data as a single JSON bundle. Auth chain mirrors
// /api/webhooks (requireUserAuth at mount + validateSiteKey + requireSiteMembership
// here) so cross-tenant access is rejected by middleware. Every query is ALSO
// filtered by the resolved site_id/site_key in code — this runs as service-role
// and must not trust RLS alone.
// ────────────────────────────────────────────────────────────────────────────

// Mask a webhook signing secret — never serialize the raw value.
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string' || secret.length < 15) return ''
  return secret.slice(0, 10) + '••••••••' + secret.slice(-4)
}

// Build the DSAR bundle for one site. `supabase` is injected so this is
// unit-testable; `site` is the membership-verified req.site ({ id, site_key,
// company_id, ... }). EXCLUDES every secret column by using explicit allowlist
// selects (never select('*') on tables that carry secrets).
export async function buildGdprExport(supabase, site, { now = () => new Date() } = {}) {
  const siteId = site.id
  const siteKey = site.site_key

  const pull = async (table, columns, column, value) => {
    const { data, error } = await supabase.from(table).select(columns).eq(column, value)
    if (error) throw new Error(`${table}: ${error.message}`)
    return data || []
  }

  const tables = {}

  // attributed_conversions — all columns (no secrets on this table), by site_id.
  tables.attributed_conversions = await pull('attributed_conversions', '*', 'site_id', siteId)

  // lead_qualifications — status trail. NOTE: schema has no created_at/updated_at;
  // qualified_at is the real timestamp column, so it stands in for them.
  tables.lead_qualifications = await pull('lead_qualifications', 'status, qualified_by, qualified_at', 'site_id', siteId)

  // site_identity_links — the tenant's own identity graph.
  tables.site_identity_links = await pull('site_identity_links', 'anonymous_id, user_id, created_at', 'site_id', siteId)

  // gsc_performance_daily — aggregates only, by site_key.
  tables.gsc_performance_daily = await pull('gsc_performance_daily', 'query, page_path, clicks, impressions, ctr, position, date', 'site_key', siteKey)

  // gsc_connections — NON-SECRET columns only (encrypted_refresh_token excluded).
  tables.gsc_connections = await pull('gsc_connections', 'property_url, google_account_email, status, last_synced_at, created_at', 'site_key', siteKey)

  // webhook_destinations — config + MASKED secret (raw secret never serialized).
  const dests = await pull('webhook_destinations', 'url, active, created_at, secret', 'site_key', siteKey)
  tables.webhook_destinations = dests.map(d => ({ url: d.url, active: d.active, created_at: d.created_at, secret: maskSecret(d.secret) }))

  // sites — explicit safe allowlist (excludes api_key/api_key_hash, all *_capi_token,
  // google_ads_developer_token, encrypted_* secrets, public_share_token, stripe ids).
  tables.sites = await pull('sites', 'id, site_key, name, domain, plan, created_at, onboarding_completed, business_type, timezone, data_retention_days', 'id', siteId)

  // companies + company_members — account context, scoped to this site's company.
  if (site.company_id) {
    tables.companies = await pull('companies', 'id, name, created_at', 'id', site.company_id)
    tables.company_members = await pull('company_members', 'company_id, user_id, role, created_at', 'company_id', site.company_id)
  } else {
    tables.companies = []
    tables.company_members = []
  }

  // PostHog events deferred — not queried this release.
  tables.posthog_events = 'available on request'

  return { generated_at: now().toISOString(), site_key: siteKey, tables }
}

gdprRouter.get('/export', validateSiteKey, requireSiteMembership, async (req, res) => {
  try {
    const supabase = getSupabase()
    const bundle = await buildGdprExport(supabase, req.site)
    return res.json(bundle)
  } catch (err) {
    console.error('[GDPR] export error:', err.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to export data' })
  }
})
