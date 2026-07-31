import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { getSupabase } from '../lib/supabase.js'
import { esc } from '../lib/utils.js'
import { requireFeature } from '../lib/plan-features.js'
import { serializeHogQLDateRange, buildHogQLTimestampFilter } from '../lib/hogql-date.js'
import { normalizeSource } from '../lib/source-normalizer.js'
import { collapseCurrencies } from '../lib/currency.js'

const router = Router()

// ── Tinybird read seam (W1 leads/journey read cutover) — mirrors dashboard.js/integrations.js.
// Unit tests inject stubs for the two read backends; production uses the real imports.
let _queryTinybirdPipe = queryTinybirdPipe
export function __setLeadsReadDeps ({ queryTinybird } = {}) {
  if (queryTinybird) _queryTinybirdPipe = queryTinybird
}
export function __resetLeadsReadDeps () {
  _queryTinybirdPipe = queryTinybirdPipe
}
// Tinybird-first read: null (flag off / error) -> HogQL fallback; the pipe's NAMED rows are
// remapped to the HogQL POSITIONAL shape (mapRows) so every downstream consumer is
// byte-identical. Fail-closed under the test-only TINYBIRD_FORCE_READ. Tenant isolation:
// pipes are called with the authenticated site_id (req.site.id), never client-supplied.
async function readTb (pipeName, params, hogSql, hogName, mapRows) {
  const tb = await _queryTinybirdPipe(pipeName, params)
  if (tb !== null) return mapRows(tb)
  // D1b-2: Tinybird is the SOLE read path. A null pipe throws (loud) instead of reading dead-store
  // HogQL. The _queryHogQL seam/import stays for D3 (deleted with the engine legs). FIX THE PIPE.
  throw new Error(`[tinybird-force-read] ${pipeName} returned null — FIX THE PIPE, do not restore the read`)
}

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
    // Tinybird pipe DateTime boundaries (ClickHouse space format) — passed only when a range is
    // active, matching the pipe's optional `{% if defined(date_from_ts) %}` block and the exact
    // exclusive-end window buildHogQLTimestampFilter produces. Same derivation as events.js:187.
    let dateFromTs = null
    let dateToTs = null
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
        dateFromTs = range.from.match(/'([^']+)'/)[1].slice(0, 19).replace('T', ' ')
        dateToTs = range.to.match(/'([^']+)'/)[1].slice(0, 19).replace('T', ' ')
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

    // leads_list pipe cols → the L68 positional destructure order (mapped by NAME):
    // [distinct_id, first_seen, last_seen, pageviews, conversions, total_revenue, source, medium,
    //  campaign, ai_source, country, first_page_url, last_conversion_type].
    // offset_val=0 — faithful port; real pagination is a SEPARATE change (parity gate depends on 0).
    const rows = await readTb('leads_list',
      { site_id: siteId, limit_val: limit, offset_val: 0, date_from_ts: dateFromTs, date_to_ts: dateToTs },
      sql, 'leads_list',
      tb => tb.map(r => [
        r.distinct_id, r.first_seen, r.last_seen, r.pageviews, r.conversions, r.total_revenue,
        r.source, r.medium, r.campaign, r.ai_source, r.country, r.first_page_url, r.last_conversion_type
      ]))

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
        .select('distinct_id, first_touch_source, first_touch_medium, first_touch_campaign, last_touch_source, last_touch_medium, last_touch_campaign, channel, first_touch_channel, last_touch_channel, ai_influenced_source')
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
          ai_source: isAI ? norm.name : null,
          ai_influenced_source: c.ai_influenced_source || null
        }
      } else {
        const norm = normalizeSource(l.source || 'direct')
        const isAI = !!l.ai_source || norm.category === 'ai'
        return {
          ...l,
          source: norm.name,
          ai_source: isAI ? (l.ai_source ? normalizeSource(l.ai_source).name : norm.name) : null,
          ai_influenced_source: null
        }
      }
    })

    // Stitch persisted qualification status (source of truth: lead_qualifications.status,
    // keyed by site_id + visitor_id). Canonical values: unqualified|qualified|mql|sql.
    // Back-compat: legacy rows where status IS NULL derive from the qualified bool
    // (true -> 'qualified', false -> 'unqualified'); no row -> null. Self-heals on next write.
    const qualMap = {}
    if (distinctIds.length > 0) {
      const { data: quals, error: qualErr } = await getSupabase()
        .from('lead_qualifications')
        .select('visitor_id, status, qualified')
        .eq('site_id', siteId)
        .in('visitor_id', distinctIds)
      if (qualErr) {
        console.error('Failed to query lead_qualifications:', qualErr)
      } else if (quals) {
        for (const q of quals) qualMap[q.visitor_id] = q
      }
    }
    leads = leads.map(l => {
      const q = qualMap[l.id]
      return {
        ...l,
        status: q ? (q.status ?? (q.qualified ? 'qualified' : 'unqualified')) : null
      }
    })

    // Stitch VOLUNTEERED identity (name/email the visitor submitted via identify()).
    // Keyed by distinct_id — the SAME id in l.id — so this joins directly. Present
    // ONLY for visitors who volunteered it; everyone else stays name/email = null,
    // which the UI renders as "—". Never enriched/looked-up (CLAUDE.md §6, §6.5).
    const identityMap = {}
    if (distinctIds.length > 0) {
      const { data: identities, error: idErr } = await getSupabase()
        .from('volunteered_identity')
        .select('distinct_id, email, name')
        .eq('site_id', siteId)
        .in('distinct_id', distinctIds)
      if (idErr) {
        console.error('Failed to query volunteered_identity:', idErr)
      } else if (identities) {
        for (const row of identities) identityMap[row.distinct_id] = row
      }
    }
    leads = leads.map(l => {
      const v = identityMap[l.id]
      return { ...l, name: v?.name ?? null, email: v?.email ?? null }
    })

    if (search) {
      leads = leads.filter(l =>
        (l.id && l.id.toLowerCase().includes(search)) ||
        (l.source && l.source.toLowerCase().includes(search)) ||
        (l.campaign && l.campaign.toLowerCase().includes(search)) ||
        (l.name && l.name.toLowerCase().includes(search)) ||
        (l.email && l.email.toLowerCase().includes(search))
      )
    }

    if (filterAI === 'ai') {
      leads = leads.filter(l => l.ai_source)
    } else if (filterAI === 'non-ai') {
      leads = leads.filter(l => !l.ai_source)
    }

    // Full-window totals (distinct converters / conversions / revenue) from attributed_conversions —
    // Supabase is the §5 source of truth for conversions & revenue, and the exact source Analytics
    // reads (which shows these correctly). ONE query so the three are internally consistent
    // (converters ≤ conversions), and full-WINDOW rather than a reduce over the ≤LIMIT page: a
    // revenue-bearing converter can sit beyond the page (leads sort last_seen desc), which made all
    // three page-scoped values wrong (KPI undercount + the "No revenue" banner despite real revenue).
    // The page-derived values are kept ONLY as a degraded fallback if the aggregate read fails — loud
    // log, never a silent zero (that silent-degradation was the #278/#280 class).
    let total = new Set(leads.filter(l => Number(l.conversions) > 0).map(l => l.id)).size
    let totalConversions = leads.reduce((s, l) => s + l.conversions, 0)
    let totalRevenue = leads.reduce((s, l) => s + l.revenue, 0)
    // Stays 'unknown' on the degraded page-scoped fallback below: that path sums the Tinybird page,
    // whose pipe does not select `currency`, so no unit is knowable for it. Claiming one there
    // would be the silent-degradation class this block's own comment warns about.
    let siteCurrency = { currency: null, currency_status: 'unknown' }
    try {
      let convQ = getSupabase()
        .from('attributed_conversions')
        .select('distinct_id, conversion_value, conversion_type, currency')   // (A): conversion_type to exclude refunds from COUNTS
        .eq('site_id', siteId)
      if (dateFrom && dateTo) convQ = convQ.gte('conversion_date', dateFrom).lte('conversion_date', dateTo)
      const { data: convAgg, error: aggErr } = await convQ
      if (aggErr) {
        console.error('[leads] attributed_conversions totals read FAILED (keeping page fallback):', aggErr.message || aggErr)
      } else {
        const convRows = convAgg || []
        // (A) counts exclude refunds (a refund is not an additional converter/conversion);
        // revenue still nets over ALL rows so the refunded amount comes back off the total.
        const nonRefund = convRows.filter(r => r.conversion_type !== 'refund')
        total = new Set(nonRefund.map(r => r.distinct_id)).size
        totalConversions = nonRefund.length
        totalRevenue = convRows.reduce((s, r) => s + (Number(r.conversion_value) || 0), 0)
        // Unit for totalRevenue, taken from the SAME rows that produced it rather than from a
        // separate site-level lookup — so the label can never describe a different set of rows
        // than the number does. $0 rows are filtered out (no unit to be missing); revenue-bearing
        // rows are ALL passed through, nulls included, so one undenominated amount reports
        // 'partial' instead of hiding inside an 'ok'.
        siteCurrency = collapseCurrencies(
          convRows.filter(r => (Number(r.conversion_value) || 0) !== 0).map(r => r.currency)
        )
      }
    } catch (e) {
      console.error('[leads] attributed_conversions totals read THREW (keeping page fallback):', e?.message || e)
    }

    return res.status(200).json({
      success: true,
      data: {
        leads,
        total,
        total_revenue: totalRevenue,
        total_conversions: totalConversions,
        // Unit for total_revenue, derived from the same attributed_conversions rows that produced
        // it. currency_status lets the client suppress rather than render a symbol it cannot
        // justify: 'mixed' means these amounts are not summable, 'unknown' means no unit is known
        // (including the degraded page-scoped fallback, where the Tinybird pipe has no currency).
        ...siteCurrency
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

    // lead_detail pipe cols → the L253 14-positional destructure order (mapped by NAME).
    // Target order: [firstSeen, lastSeen, pageviews, conversions, totalRevenue, source, medium,
    //  aiSource, country, firstPageUrl, campaign, firstTouchSource, firstTouchMedium, activeDays].
    // NOTE: the pipe aliases first_touch_source/medium as `ft_source`/`ft_medium` (a rename forced by
    // ClickHouse's "aggregate alias == input column" rejection) — mapped explicitly below.
    const rows = await readTb('lead_detail',
      { site_id: String(req.site.id), distinct_id: leadId },
      sql, 'lead_detail',
      tb => tb.map(r => [
        r.first_seen, r.last_seen, r.pageviews, r.conversions, r.total_revenue,
        r.source, r.medium, r.ai_source, r.country, r.first_page_url,
        r.campaign, r.ft_source, r.ft_medium, r.active_days
      ]))

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Lead not found' })
    }

    const [firstSeen, lastSeen, pageviews, conversions, totalRevenue, source, medium, aiSource, country, firstPageUrl, campaign, firstTouchSource, firstTouchMedium, activeDays] = rows[0]

    // Persisted qualification status (source of truth: lead_qualifications.status).
    // Back-compat: legacy row with status NULL derives from the qualified bool.
    let qualStatus = null
    {
      const { data: qual, error: qualErr } = await getSupabase()
        .from('lead_qualifications')
        .select('status, qualified')
        .eq('site_id', req.site.id)
        .eq('visitor_id', leadId)
        .maybeSingle()
      if (qualErr) {
        console.error('Failed to query lead_qualifications:', qualErr)
      } else if (qual) {
        qualStatus = qual.status ?? (qual.qualified ? 'qualified' : 'unqualified')
      }
    }

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
        active_days: Number(activeDays) || 0,
        status: qualStatus
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
    // Canonical 4-state vocabulary (matches lead_qualifications_status_check + the frontend).
    const VALID = ['unqualified', 'qualified', 'mql', 'sql']
    if (!leadId || leadId.trim() === '') {
      return res.status(400).json({ success: false, data: null, error: 'leadId is required' })
    }
    // Legacy boolean callers (no explicit status) map to qualified/unqualified.
    const newStatus = VALID.includes(status) ? status : (req.body.qualified !== false ? 'qualified' : 'unqualified')

    const { data, error } = await getSupabase()
      .from('lead_qualifications')
      .upsert({
        site_id: req.site.id,
        visitor_id: leadId,
        status: newStatus,
        qualified: ['qualified', 'mql', 'sql'].includes(newStatus),
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
