import crypto from 'crypto'

/**
 * Generates the standardized non-null cost deduplication key.
 *
 * @param {string|object} campaignIdOrRow — Campaign ID string, or the full row object
 * @param {string} [campaignName] — Campaign Name string (if not using row object)
 * @returns {string}
 */
export function getCostDedupeKey(campaignIdOrRow, campaignName) {
  let cid = ''
  let cname = ''

  if (campaignIdOrRow && typeof campaignIdOrRow === 'object') {
    cid = campaignIdOrRow.campaign_id || ''
    cname = campaignIdOrRow.campaign_name || ''
  } else {
    cid = campaignIdOrRow || ''
    cname = campaignName || ''
  }

  const cleanId = typeof cid === 'string' ? cid.trim() : String(cid || '').trim()
  if (cleanId) {
    return `id:${cleanId}`
  }

  const cleanName = typeof cname === 'string' ? cname.trim().toLowerCase() : String(cname || '').trim().toLowerCase()
  return `name:${cleanName}`
}

/**
 * Normalizes an incoming CSV/JSON row object.
 *
 * @param {object} row
 * @returns {object}
 */
export function normalizeAdCostRow(row = {}) {
  const date = typeof row.date === 'string' ? row.date.trim() : String(row.date || '').trim()
  const platform = typeof row.platform === 'string' ? row.platform.trim().toLowerCase() : String(row.platform || 'manual_csv').trim().toLowerCase()
  const campaignName = typeof row.campaign_name === 'string' ? row.campaign_name.trim() : String(row.campaign_name || '').trim()
  const campaignId = row.campaign_id !== undefined && row.campaign_id !== null ? String(row.campaign_id).trim() : null
  const spend = row.spend !== undefined && row.spend !== null && row.spend !== '' ? parseFloat(row.spend) : 0
  const clicks = row.clicks !== undefined && row.clicks !== null && row.clicks !== '' ? parseInt(row.clicks, 10) : 0
  const impressions = row.impressions !== undefined && row.impressions !== null && row.impressions !== '' ? parseInt(row.impressions, 10) : 0
  const currency = typeof row.currency === 'string' ? row.currency.trim().toUpperCase() : String(row.currency || 'USD').trim().toUpperCase()

  return {
    date,
    platform: platform || 'manual_csv',
    campaign_name: campaignName,
    campaign_id: campaignId || null,
    spend: isNaN(spend) ? 0 : spend,
    clicks: isNaN(clicks) ? 0 : clicks,
    impressions: isNaN(impressions) ? 0 : impressions,
    currency: currency || 'USD'
  }
}

/**
 * Validates a single row object and returns an error message or null.
 *
 * @param {object} row
 * @returns {string|null}
 */
function validateSingleRow(row) {
  if (!row) return 'Empty row payload'

  // 1. Date Checks
  const dateStr = String(row.date || '').trim()
  if (!dateStr) return 'Date is required'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Date must be in YYYY-MM-DD format'
  const dateObj = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(dateObj.getTime())) return 'Invalid date value'
  const todayStr = new Date().toISOString().slice(0, 10)
  if (dateStr > todayStr) return 'Date cannot be in the future'

  // 2. Campaign Name Checks
  const nameStr = String(row.campaign_name || '').trim()
  if (!nameStr) return 'Campaign name is required'
  if (nameStr.length > 255) return 'Campaign name must be 255 characters or less'

  // 3. Campaign ID Checks
  const idStr = String(row.campaign_id || '').trim()
  if (idStr.length > 255) return 'Campaign ID must be 255 characters or less'

  // 4. Spend Checks
  if (row.spend === undefined || row.spend === null || row.spend === '') return 'Cost/spend is required'
  const spendVal = parseFloat(row.spend)
  if (isNaN(spendVal) || !Number.isFinite(spendVal)) return 'Cost/spend must be a valid number'
  if (spendVal < 0) return 'Cost/spend cannot be negative'

  // 5. Clicks Checks
  const clicksVal = row.clicks !== undefined && row.clicks !== null && row.clicks !== '' ? parseInt(row.clicks, 10) : 0
  if (isNaN(clicksVal) || clicksVal < 0) return 'Clicks must be a non-negative integer'

  // 6. Impressions Checks
  const impressionsVal = row.impressions !== undefined && row.impressions !== null && row.impressions !== '' ? parseInt(row.impressions, 10) : 0
  if (isNaN(impressionsVal) || impressionsVal < 0) return 'Impressions must be a non-negative integer'

  // 7. Clicks vs Impressions Check
  if (impressionsVal > 0 && clicksVal > impressionsVal) return 'Clicks cannot be greater than impressions'

  // 8. Currency Checks
  const currencyStr = String(row.currency || 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currencyStr)) return 'Currency must be a valid 3-letter uppercase code (e.g. USD)'

  // 9. Platform Checks
  const platformStr = String(row.platform || 'manual_csv').trim().toLowerCase()
  if (!platformStr) return 'Platform is required'
  if (!/^[a-z0-9_-]+$/.test(platformStr)) return 'Platform must be alphanumeric, underscores, or hyphens'
  if (platformStr.length > 50) return 'Platform must be 50 characters or less'

  return null
}

/**
 * Validates an array of row objects.
 * Returns an array of objects describing errors with line indexes, or empty array if valid.
 *
 * @param {Array} rows
 * @returns {Array<{row: number, error: string}>}
 */
export function validateAdCostRows(rows = []) {
  if (!Array.isArray(rows)) {
    throw new Error('Payload must be an array of rows')
  }

  if (rows.length > 1000) {
    throw new Error('Maximum batch size is 1000 rows')
  }

  const errors = []
  for (let i = 0; i < rows.length; i++) {
    const error = validateSingleRow(rows[i])
    if (error) {
      errors.push({ row: i + 1, error })
    }
  }

  return errors
}

/**
 * Groups and aggregates duplicates in the uploaded rows before database upsert.
 * Sums spend, clicks, and impressions. Grouping key: site_id + platform + cost_dedupe_key + date.
 *
 * @param {Array} rows
 * @returns {Array}
 */
export function aggregateAdCostRows(rows = []) {
  const groups = {}

  for (const r of rows) {
    const norm = normalizeAdCostRow(r)
    const key = `${norm.platform}:${norm.currency}:${getCostDedupeKey(norm)}:${norm.date}`

    if (!groups[key]) {
      groups[key] = {
        date: norm.date,
        platform: norm.platform,
        campaign_name: norm.campaign_name,
        campaign_id: norm.campaign_id,
        spend: 0,
        clicks: 0,
        impressions: 0,
        currency: norm.currency
      }
    }

    groups[key].spend += norm.spend
    groups[key].clicks += norm.clicks
    groups[key].impressions += norm.impressions
  }

  return Object.values(groups).map(g => ({
    ...g,
    spend: parseFloat(g.spend.toFixed(2)) // avoid floating point inaccuracy
  }))
}

/**
 * Determines the currency status for a set of spend records compared to a tracked default currency.
 *
 * @param {Array<{currency: string}>} spendRows
 * @param {string} trackedCurrency
 * @returns {{status: 'ok'|'mixed'|'mismatch', spendCurrency: string}}
 */
export function summarizeCurrencyStatus(spendRows = [], trackedCurrency = 'USD') {
  const currencies = [...new Set(spendRows.map(r => r.currency?.toUpperCase()).filter(Boolean))]

  if (currencies.length === 0) {
    return { status: 'ok', spendCurrency: trackedCurrency }
  }

  if (currencies.length > 1) {
    return { status: 'mixed', spendCurrency: 'MIXED' }
  }

  const spendCurrency = currencies[0]
  if (spendCurrency !== trackedCurrency.toUpperCase()) {
    return { status: 'mismatch', spendCurrency }
  }

  return { status: 'ok', spendCurrency }
}

/**
 * Robust RFC 4180-compliant CSV parser.
 * Handles quoted values, commas inside quotes, escaped double quotes (""), and CRLF newlines.
 *
 * @param {string} text
 * @returns {Array<Array<string>>}
 */
export function parseCSV(text = '') {
  const lines = []
  let row = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"'
        i++ // Skip next escaped double quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField)
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip CRLF \n
      }
      row.push(currentField)
      // Only add non-empty lines or lines with multiple fields
      if (row.length > 1 || row[0] !== '') {
        lines.push(row)
      }
      row = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  // Handle final line without trailing newline
  if (row.length > 0 || currentField !== '') {
    row.push(currentField)
    if (row.length > 1 || row[0] !== '') {
      lines.push(row)
    }
  }

  return lines
}

/**
 * Maps parsed CSV fields to row objects by analyzing header aliases.
 *
 * @param {Array<Array<string>>} lines
 * @returns {Array<object>}
 */
export function csvToObjects(lines = []) {
  if (lines.length < 2) return []

  const headers = lines[0].map(h => h.trim().toLowerCase())

  // Find indices based on aliases
  const dateIdx = headers.findIndex(h => ['date', 'period_start', 'day', 'timestamp'].includes(h))
  const platformIdx = headers.findIndex(h => ['source', 'platform', 'medium', 'channel'].includes(h))
  const nameIdx = headers.findIndex(h => ['campaign_name', 'campaign', 'campaign name'].includes(h))
  const idIdx = headers.findIndex(h => ['campaign_id', 'campaign id', 'id'].includes(h))
  const spendIdx = headers.findIndex(h => ['cost', 'spend', 'amount', 'ad spend', 'ad_spend'].includes(h))
  const currencyIdx = headers.findIndex(h => ['currency', 'currency_code', 'currency code'].includes(h))
  const clicksIdx = headers.findIndex(h => ['clicks', 'click_count', 'click count'].includes(h))
  const impressionsIdx = headers.findIndex(h => ['impressions', 'impression_count', 'impression count', 'views'].includes(h))

  const result = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0 || (line.length === 1 && line[0] === '')) continue

    // Map fields, keeping undefined if missing
    result.push({
      date: dateIdx !== -1 && line[dateIdx] !== undefined ? line[dateIdx] : undefined,
      platform: platformIdx !== -1 && line[platformIdx] !== undefined ? line[platformIdx] : undefined,
      campaign_name: nameIdx !== -1 && line[nameIdx] !== undefined ? line[nameIdx] : undefined,
      campaign_id: idIdx !== -1 && line[idIdx] !== undefined ? line[idIdx] : undefined,
      spend: spendIdx !== -1 && line[spendIdx] !== undefined ? line[spendIdx] : undefined,
      currency: currencyIdx !== -1 && line[currencyIdx] !== undefined ? line[currencyIdx] : undefined,
      clicks: clicksIdx !== -1 && line[clicksIdx] !== undefined ? line[clicksIdx] : undefined,
      impressions: impressionsIdx !== -1 && line[impressionsIdx] !== undefined ? line[impressionsIdx] : undefined
    })
  }

  return result
}

/**
 * Maps rows to campaign_costs db shape, deriving site_id from site.id context.
 *
 * @param {Array} rows - Normalized/aggregated rows
 * @param {object} site - Authenticated site context
 * @returns {Array}
 */
export function buildCampaignCostUpsertRows(rows = [], site = {}) {
  if (!site || !site.id) {
    throw new Error('Site context with valid ID is required')
  }

  return rows.map(r => {
    const platform = r.platform || 'manual_csv'
    const dedupeKey = getCostDedupeKey(r.campaign_id, r.campaign_name)
    return {
      site_id: site.id,
      campaign_name: r.campaign_name,
      campaign_id: r.campaign_id || null,
      platform,
      cost_dedupe_key: dedupeKey,
      spend: r.spend,
      clicks: r.clicks,
      impressions: r.impressions,
      currency: r.currency || 'USD',
      period_start: r.date,
      period_end: r.date
    }
  })
}

/**
 * Performs database upsert for campaign costs rows on conflict of site_id, platform, cost_dedupe_key, period_start.
 *
 * @param {object} supabase - Supabase client instance
 * @param {Array} dbRows - Prepared database rows
 * @returns {Promise<object>}
 */
export async function upsertCampaignCostRows(supabase, dbRows = []) {
  if (dbRows.length === 0) return { success: true, count: 0 }

  const { error } = await supabase
    .from('campaign_costs')
    .upsert(dbRows, { onConflict: 'site_id,platform,cost_dedupe_key,period_start' })

  if (error) throw error
  return { success: true, count: dbRows.length }
}
