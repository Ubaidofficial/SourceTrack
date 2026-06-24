import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'
import { getSupabase } from '../lib/supabase.js'
import { esc } from '../lib/utils.js'
import { requireFeature } from '../lib/plan-features.js'
import { serializeHogQLDateRange, buildHogQLTimestampFilter } from '../lib/hogql-date.js'
import { normalizeSource } from '../lib/source-normalizer.js'

const router = Router()

router.get('/', validateSiteKey, async (req, res) => {
  try {
    const siteKey = req.query.site_key || req.body?.site_key
    const siteId = String(req.site.id)
    const search = (req.query.search || '').toLowerCase()
    const filterAI = req.query.ai || 'all'
    const attributionModel = req.query.attribution_model === 'last_touch' ? 'last_touch' : 'first_touch'
    const dateFrom = req.query.date_from
    const dateTo = req.query.date_to
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)

    let dateFilter = ''
    if (dateFrom || dateTo) {
      if (!dateFrom || !dateTo) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'date_from and date_to must be provided together'
        })
      }

      try {
        const range = serializeHogQLDateRange(dateFrom, dateTo, { exclusiveEnd: true })
        dateFilter = `AND ${buildHogQLTimestampFilter('timestamp', range)}`
      } catch (err) {
        return res.status(400).json({ success: false, data: null, error: err.message })
      }
    }

    const sql = `
      SELECT
        distinct_id,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen,
        countIf(event = '$pageview') AS pageviews,
        countIf(event = '$conversion') AS conversions,
        SUM(CASE WHEN event = '$conversion' THEN toFloatOrZero(toString(properties.conversion_value)) ELSE 0 END) AS total_revenue,
        argMin(COALESCE(NULLIF(properties.utm_source, ''), NULLIF(properties.first_touch_source, ''), 'direct'), timestamp) AS source,
        argMin(COALESCE(NULLIF(properties.utm_medium, ''), NULLIF(properties.first_touch_medium, ''), 'none'), timestamp) AS medium,
        argMin(properties.first_touch_campaign, timestamp) AS campaign,
        argMin(COALESCE(NULLIF(properties.ai_source, ''), ''), timestamp) AS ai_source,
        argMin(properties.country, timestamp) AS country,
        argMin(properties.page_url, timestamp) AS first_page_url,
        argMaxIf(properties.conversion_type, timestamp, event = '$conversion') AS last_conversion_type
      FROM events
      WHERE properties.site_id = '${esc(siteId)}'
        ${dateFilter}
      GROUP BY distinct_id
      HAVING conversions > 0 OR pageviews > 0
      ORDER BY last_seen DESC
      LIMIT ${limit}
    `

    const rows = await queryHogQL(sql, 'leads_list')

    let leads = rows.map(([
      distinctId, firstSeen, lastSeen, pageviews, conversions, totalRevenue,
      source, medium, campaign, aiSource, country, firstPageUrl, lastConversionType
    ]) => ({
      id: distinctId,
      first_seen: firstSeen,
      last_seen: lastSeen,
      pageviews: Number(pageviews) || 0,
      conversions: Number(conversions) || 0,
      revenue: Number(totalRevenue) || 0,
      source: source || 'direct',
      medium: medium || 'none',
      campaign: campaign || null,
      ai_source: aiSource || null,
      country: country || null,
      first_page_url: firstPageUrl || null,
      last_conversion_type: lastConversionType || null
    }))

    // Stitch Supabase attribution data
    const distinctIds = leads.map(l => l.id).filter(Boolean)
    const attMap = {}
    if (distinctIds.length > 0) {
      const { data: convs, error: convErr } = await getSupabase()
        .from('attributed_conversions')
        .select('distinct_id, first_touch_source, first_touch_medium, first_touch_campaign, last_touch_source, last_touch_medium, last_touch_campaign, channel, first_touch_channel, last_touch_channel')
        .eq('site_id', siteId)
        .in('distinct_id', distinctIds)
      if (convErr) {
        console.error('Failed to query attributed_conversions:', convErr)
      } else if (convs) {
        for (const c of convs) {
          if (!attMap[c.distinct_id]) {
            attMap[c.distinct_id] = c
          }
        }
      }
    }

    const isLastTouch = attributionModel === 'last_touch'
    leads = leads.map(l => {
      const c = attMap[l.id]
      if (c) {
        const rawSrc = isLastTouch ? c.last_touch_source : c.first_touch_source
        const rawMed = isLastTouch ? c.last_touch_medium : c.first_touch_medium
        const rawCamp = isLastTouch ? c.last_touch_campaign : c.first_touch_campaign
        const rawChan = isLastTouch ? c.last_touch_channel : c.first_touch_channel

        const norm = normalizeSource(rawSrc || 'direct')
        const isAI = rawChan === 'AI Search'

        return {
          ...l,
          source: norm.name,
          medium: rawMed || 'none',
          campaign: rawCamp || null,
          ai_source: isAI ? norm.name : null
        }
      } else {
        const norm = normalizeSource(l.source || 'direct')
        const isAI = !!l.ai_source || norm.category === 'ai'
        return {
          ...l,
          source: norm.name,
          ai_source: isAI ? (l.ai_source ? normalizeSource(l.ai_source).name : norm.name) : null
        }
      }
    })

    if (search) {
      leads = leads.filter(l =>
        (l.id && l.id.toLowerCase().includes(search)) ||
        (l.source && l.source.toLowerCase().includes(search)) ||
        (l.campaign && l.campaign.toLowerCase().includes(search))
      )
    }

    if (filterAI === 'ai') {
      leads = leads.filter(l => l.ai_source)
    } else if (filterAI === 'non-ai') {
      leads = leads.filter(l => !l.ai_source)
    }

    const totalRevenue = leads.reduce((s, l) => s + l.revenue, 0)
    const totalConversions = leads.reduce((s, l) => s + l.conversions, 0)

    return res.status(200).json({
      success: true,
      data: {
        leads,
        total: leads.length,
        total_revenue: totalRevenue,
        total_conversions: totalConversions
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Leads query failed' })
  }
})

router.get('/:leadId', validateSiteKey, async (req, res) => {
  try {
    const { leadId } = req.params
    const siteKey = req.query.site_key || req.body?.site_key

    if (!leadId) {
      return res.status(400).json({ success: false, data: null, error: 'leadId is required' })
    }

    const sql = `
      SELECT
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen,
        countIf(event = '$pageview') AS pageviews,
        countIf(event = '$conversion') AS conversions,
        SUM(CASE WHEN event = '$conversion' THEN toFloatOrZero(toString(properties.conversion_value)) ELSE 0 END) AS total_revenue,
        argMin(COALESCE(NULLIF(properties.utm_source, ''), NULLIF(properties.first_touch_source, ''), 'direct'), timestamp) AS source,
        argMin(COALESCE(NULLIF(properties.utm_medium, ''), NULLIF(properties.first_touch_medium, ''), 'none'), timestamp) AS medium,
        argMin(COALESCE(NULLIF(properties.ai_source, ''), ''), timestamp) AS ai_source,
        argMin(properties.country, timestamp) AS country,
        argMin(properties.page_url, timestamp) AS first_page_url,
        argMin(properties.first_touch_campaign, timestamp) AS campaign,
        argMin(properties.first_touch_source, timestamp) AS first_touch_source,
        argMin(properties.first_touch_medium, timestamp) AS first_touch_medium,
        COUNT(DISTINCT toDate(timestamp)) AS active_days
      FROM events
      WHERE properties.site_id = '${esc(req.site.id)}'
        AND distinct_id = '${esc(leadId)}'
      GROUP BY distinct_id
      LIMIT 1
    `

    const rows = await queryHogQL(sql, 'lead_detail')

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Lead not found' })
    }

    const [firstSeen, lastSeen, pageviews, conversions, totalRevenue, source, medium, aiSource, country, firstPageUrl, campaign, firstTouchSource, firstTouchMedium, activeDays] = rows[0]

    // Query single lead Supabase attribution data
    const { data: convs, error: convErr } = await getSupabase()
      .from('attributed_conversions')
      .select('first_touch_source, first_touch_medium, first_touch_campaign, last_touch_source, last_touch_medium, last_touch_campaign, channel, first_touch_channel, last_touch_channel')
      .eq('site_id', req.site.id)
      .eq('distinct_id', leadId)

    if (convErr) {
      console.error('Failed to query attributed_conversions:', convErr)
    }

    let finalSource = source || 'direct'
    let finalMedium = medium || 'none'
    let finalCampaign = campaign || null
    let finalAiSource = aiSource || null
    let finalFirstTouchSource = firstTouchSource || null
    let finalFirstTouchMedium = firstTouchMedium || null

    if (convs && convs.length > 0) {
      const c = convs[0]
      const isLastTouch = req.query.attribution_model === 'last_touch'
      const rawSrc = isLastTouch ? c.last_touch_source : c.first_touch_source
      const rawMed = isLastTouch ? c.last_touch_medium : c.first_touch_medium
      const rawCamp = isLastTouch ? c.last_touch_campaign : c.first_touch_campaign
      const rawChan = isLastTouch ? c.last_touch_channel : c.first_touch_channel

      const norm = normalizeSource(rawSrc || 'direct')
      const isAI = rawChan === 'AI Search'

      finalSource = norm.name
      finalMedium = rawMed || 'none'
      finalCampaign = rawCamp || null
      finalAiSource = isAI ? norm.name : null
      finalFirstTouchSource = normalizeSource(c.first_touch_source || 'direct').name
      finalFirstTouchMedium = c.first_touch_medium || 'none'
    } else {
      const norm = normalizeSource(finalSource)
      const isAI = !!finalAiSource || norm.category === 'ai'
      finalSource = norm.name
      finalAiSource = isAI ? (finalAiSource ? normalizeSource(finalAiSource).name : norm.name) : null
      finalFirstTouchSource = normalizeSource(finalFirstTouchSource || 'direct').name
    }

    return res.status(200).json({
      success: true,
      data: {
        id: leadId,
        first_seen: firstSeen,
        last_seen: lastSeen,
        pageviews: Number(pageviews) || 0,
        conversions: Number(conversions) || 0,
        revenue: Number(totalRevenue) || 0,
        source: finalSource,
        medium: finalMedium,
        campaign: finalCampaign,
        ai_source: finalAiSource,
        country: country || null,
        first_page_url: firstPageUrl || null,
        first_touch_source: finalFirstTouchSource,
        first_touch_medium: finalFirstTouchMedium,
        active_days: Number(activeDays) || 0
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Lead detail failed' })
  }
})

router.patch('/:leadId/qualify', validateSiteKey, async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'manual_revenue_status', 'Lead status updates')
    if (block) return res.status(402).json(block)

    const { leadId } = req.params
    const { status, notes } = req.body
    const VALID = ['lead', 'mql', 'sql', 'customer', 'rejected']
    if (!leadId || leadId.trim() === '') {
      return res.status(400).json({ success: false, data: null, error: 'leadId is required' })
    }
    const newStatus = VALID.includes(status) ? status : (req.body.qualified !== false ? 'sql' : 'rejected')

    const { data, error } = await getSupabase()
      .from('lead_qualifications')
      .upsert({
        site_id: req.site.id,
        visitor_id: leadId,
        qualified: newStatus !== 'rejected',
        qualified_by: req.user?.id || null,
        qualified_at: new Date().toISOString(),
        notes: notes || ''
      }, { onConflict: 'site_id,visitor_id' })
      .select()
      .single()

    if (error) throw error

    await getSupabase()
      .from('attributed_conversions')
      .update({ status: newStatus, qualified_at: new Date().toISOString(), qualified_by: req.user?.id || null })
      .eq('site_id', req.site.id)
      .eq('distinct_id', leadId)

    return res.status(200).json({ success: true, data: { ...data, status: newStatus }, error: null })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Qualification failed' })
  }
})

export { router as leadsRouter }
