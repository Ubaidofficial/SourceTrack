/**
 * GDPR / Privacy endpoints
 *
 * DELETE /api/gdpr/visitor   — erase all data for one visitor (by anonymous_id)
 * DELETE /api/gdpr/account   — full account purge (all sites + auth user)
 * PUT    /api/gdpr/retention — set data_retention_days for a site
 *
 * All endpoints require a logged-in user (requireUserAuth) and verify that the
 * caller owns (or is a member of) the site they are operating on.
 */

import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

export const gdprRouter = Router()

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: WebSocket } }
  )
}

// Helper: resolve site record for calling user (membership-aware)
async function getSiteForUser(supabase, userId, siteKey) {
  const { data: member } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle()

  const query = supabase
    .from('sites')
    .select('id, site_key, owner_id, company_id, posthog_site_id')
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
      .select('company_id')
      .eq('user_id', userId)
      .maybeSingle()

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

      // 3. Delete sites
      await supabase.from('sites').delete().in('id', siteIds)
    }

    // 4. Remove company membership
    if (memberRow?.company_id) {
      await supabase
        .from('company_members')
        .delete()
        .eq('user_id', userId)

      // If no members left, delete the company too
      const { count } = await supabase
        .from('company_members')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', memberRow.company_id)

      if (count === 0) {
        await supabase.from('companies').delete().eq('id', memberRow.company_id)
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
