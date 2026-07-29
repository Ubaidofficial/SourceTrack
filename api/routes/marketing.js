/**
 * Public marketing-site form intake.
 *
 * POST /api/marketing/submissions — contact form + blog newsletter.
 *
 * PUBLIC and UNAUTHENTICATED by design: the marketing site is a static Astro
 * build with no server of its own, so every write goes to api.srctk.com — the
 * same split the tracker already uses. There is no site_key here (this is
 * SourceTrack's own site, not a tenant's), so the abuse protection is the
 * per-IP + global-IP rate-limit pair mounted in api/index.js, mirroring the
 * /api/track limiter shape.
 *
 * Truthfulness contract (the bug this route exists to fix): the response says
 * `success: true` ONLY when the row is actually in the database. A validation
 * failure is a 400, a storage failure is a 500, and neither is ever dressed up
 * as success. The visitor's UI is wired to that distinction.
 */
import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { buildSubmission, storeSubmission, notifySubmission } from '../lib/marketing-submissions.js'

const router = Router()

router.post('/submissions', async (req, res) => {
  const built = buildSubmission(req.body || {})
  if (!built.ok) {
    return res.status(400).json({ success: false, data: null, error: built.error })
  }

  try {
    const { stored } = await storeSubmission(built.row, { supabase: getSupabase() })
    if (!stored) {
      // Storage is the whole point — a failed write MUST reach the visitor as a
      // failure so they can retry or use the mailto fallback.
      return res.status(500).json({ success: false, data: null, error: 'Could not save your submission. Please try again.' })
    }

    // Notification is best-effort and deliberately NOT awaited: a Resend outage
    // must not turn a stored submission into a visitor-facing error.
    notifySubmission(built.row).catch(() => {})

    return res.status(201).json({ success: true, data: { received: true, kind: built.row.kind }, error: null })
  } catch (err) {
    console.error('[marketing] submission error:', err?.message || err)
    return res.status(500).json({ success: false, data: null, error: 'Could not save your submission. Please try again.' })
  }
})

export { router as marketingRouter }
