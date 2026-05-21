/**
 * Annotations — mark deploys, campaigns, and events on trend charts
 *
 * GET    /api/annotations?site_key=...&date_from=...&date_to=...
 * POST   /api/annotations        { date, note, type? }
 * DELETE /api/annotations/:id
 */

import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'

const router = Router()

const ALLOWED_TYPES = new Set(['note', 'deploy', 'campaign', 'alert'])

// GET — list annotations for date range
router.get('/', async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const siteId = req.site?.id

    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_key required' })
    }

    const supabase = getSupabase()
    let query = supabase
      .from('annotations')
      .select('id, date, note, type, created_by, created_at')
      .eq('site_id', siteId)
      .order('date', { ascending: true })

    if (date_from) query = query.gte('date', date_from)
    if (date_to)   query = query.lte('date', date_to)

    const { data, error } = await query
    if (error) throw error

    return res.json({ success: true, data: data || [], error: null })
  } catch (err) {
    console.error('[annotations] GET error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch annotations' })
  }
})

// POST — create annotation
router.post('/', async (req, res) => {
  try {
    const siteId = req.site?.id
    const userId = req.user?.id || null

    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_key required' })
    }

    const { date, note, type = 'note' } = req.body

    if (!date || !note) {
      return res.status(400).json({ success: false, data: null, error: 'date and note are required' })
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, data: null, error: 'date must be YYYY-MM-DD' })
    }

    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({
        success: false, data: null,
        error: `type must be one of: ${[...ALLOWED_TYPES].join(', ')}`
      })
    }

    const sanitizedNote = String(note).trim().slice(0, 280)
    if (!sanitizedNote) {
      return res.status(400).json({ success: false, data: null, error: 'note cannot be empty' })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('annotations')
      .insert({ site_id: siteId, date, note: sanitizedNote, type, created_by: userId })
      .select('id, date, note, type, created_at')
      .single()

    if (error) {
      // Graceful degradation if annotations table doesn't exist yet
      if (error.code === '42P01') {
        return res.status(503).json({
          success: false, data: null,
          error: 'Annotations table not yet created. Please run the DB migration.'
        })
      }
      throw error
    }

    return res.status(201).json({ success: true, data, error: null })
  } catch (err) {
    console.error('[annotations] POST error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to create annotation' })
  }
})

// DELETE — remove annotation by id
router.delete('/:id', async (req, res) => {
  try {
    const siteId = req.site?.id
    const { id } = req.params

    if (!siteId) {
      return res.status(400).json({ success: false, data: null, error: 'site_key required' })
    }

    const supabase = getSupabase()
    // Only delete if the annotation belongs to this site (security guard)
    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', id)
      .eq('site_id', siteId)

    if (error) {
      if (error.code === '42P01') {
        return res.status(503).json({ success: false, data: null, error: 'Annotations table not yet created.' })
      }
      throw error
    }

    return res.json({ success: true, data: { deleted: id }, error: null })
  } catch (err) {
    console.error('[annotations] DELETE error:', err?.message)
    return res.status(500).json({ success: false, data: null, error: 'Failed to delete annotation' })
  }
})

export { router as annotationsRouter }
