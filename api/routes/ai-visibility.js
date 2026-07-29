// GET /api/ai-visibility/agents  — which crawlers fetched this site
// GET /api/ai-visibility/pages   — which pages crawlers fetched
//
// The read side of the AI Visibility report. Orthogonal to AI *referral*
// attribution (channel-classifier.js / AI_DOMAINS_MAP), which answers a
// different question from the referrer of a human visit. Nothing here touches
// `events`, revenue, or attribution.
//
// Tenant isolation (§6.5): site_id comes from the authenticated, membership-
// checked `req.site` set by validateSiteKey + requireSiteMembership. It is
// never read from the query string, and site_key is never returned.
//
// Read contract (§5): queryTinybirdPipe returns [] for a served-empty result
// and null only when the pipe is not serving. A null fails CLOSED — throw, so
// the UI shows an error rather than a fabricated zero. An empty [] is a real
// answer ("no crawler hits in range") and is passed through as [].

import { Router } from 'express'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { verificationCoverage } from '../lib/ai-crawler-detect.js'

const router = Router()

// Injectable seam for tests, mirroring seo-revenue.js.
let _queryTinybirdPipe = queryTinybirdPipe
export function __setQueryTinybird (fn) { _queryTinybirdPipe = fn || queryTinybirdPipe }
export function __resetQueryTinybird () { _queryTinybirdPipe = queryTinybirdPipe }

const MAX_DAYS = 365

// Accepts YYYY-MM-DD (the shape the dashboard sends) and widens it to a full
// UTC day, matching the DateTime params the pipes declare.
function parseRange (query) {
  const { from, to } = query
  if (!from || !to) return { error: 'from and to are required (YYYY-MM-DD)' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: 'from and to must be YYYY-MM-DD' }
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`)
  const toMs = Date.parse(`${to}T23:59:59Z`)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return { error: 'invalid date' }
  if (toMs < fromMs) return { error: 'to must be on or after from' }
  if ((toMs - fromMs) / 86400000 > MAX_DAYS) return { error: `range may not exceed ${MAX_DAYS} days` }
  return { from_ts: `${from} 00:00:00`, to_ts: `${to} 23:59:59` }
}

async function readPipe (pipeName, params) {
  const rows = await _queryTinybirdPipe(pipeName, params)
  if (rows === null) {
    // Never a fake zero (§6): a dead pipe is an error, not "no crawlers".
    throw new Error(`[ai-visibility] ${pipeName} returned null — FIX THE PIPE`)
  }
  return rows
}

const toInt = (v) => Number.isFinite(Number(v)) ? Number(v) : 0

router.get('/agents', async (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ success: false, data: null, error: range.error })

  try {
    const rows = await readPipe('crawler_agents', {
      site_id: req.site.id,
      from_ts: range.from_ts,
      to_ts: range.to_ts
    })

    return res.json({
      success: true,
      error: null,
      data: {
        agents: rows.map((r) => ({
          bot_name: r.bot_name,
          operator: r.operator,
          category: r.category,
          hits: toInt(r.hits),
          hits_ip_verified: toInt(r.hits_ip_verified),
          hits_ua_only: toInt(r.hits_ua_only) + toInt(r.hits_ua_only_no_ranges),
          // Surfaced separately, never folded into hits — an impersonated UA is
          // not the bot it claims to be.
          hits_ip_mismatch: toInt(r.hits_ip_mismatch),
          unique_paths: toInt(r.unique_paths),
          last_seen: r.last_seen || null
        })),
        // Ships with the payload so the UI legend states each bot's verification
        // ceiling from the registry rather than hardcoding it in JSX.
        coverage: verificationCoverage()
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: 'AI visibility read failed' })
  }
})

router.get('/pages', async (req, res) => {
  const range = parseRange(req.query)
  if (range.error) return res.status(400).json({ success: false, data: null, error: range.error })

  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''

  try {
    const params = {
      site_id: req.site.id,
      from_ts: range.from_ts,
      to_ts: range.to_ts
    }
    // OMIT the param for "all categories". The pipe gates on `{% if
    // defined(category) %}`, so sending an empty string would enter the block
    // and filter on '' — matching nothing instead of everything.
    if (category) params.category = category

    const rows = await readPipe('crawler_pages', params)

    return res.json({
      success: true,
      error: null,
      data: {
        pages: rows.map((r) => ({
          path: r.path,
          hits: toInt(r.hits),
          hits_ip_verified: toInt(r.hits_ip_verified),
          hits_ua_only: toInt(r.hits_ua_only_total),
          unique_bots: toInt(r.unique_bots),
          by_category: {
            llm_crawler: toInt(r.hits_llm_crawler),
            ai_search: toInt(r.hits_ai_search),
            ai_assistant: toInt(r.hits_ai_assistant),
            search_engine: toInt(r.hits_search_engine),
            seo_tool: toInt(r.hits_seo_tool)
          },
          last_seen: r.last_seen || null
        }))
      }
    })
  } catch (err) {
    return res.status(500).json({ success: false, data: null, error: 'AI visibility read failed' })
  }
})

export { router as aiVisibilityRouter }
