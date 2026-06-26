import { PostHog } from 'posthog-node'
import { esc } from './utils.js'
import { serializeHogQLDateRange, buildHogQLTimestampFilter } from './hogql-date.js'

const flushAt = process.env.POSTHOG_FLUSH_AT
  ? parseInt(process.env.POSTHOG_FLUSH_AT, 10)
  : (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' ? 20 : 1)

const flushInterval = process.env.POSTHOG_FLUSH_INTERVAL_MS
  ? parseInt(process.env.POSTHOG_FLUSH_INTERVAL_MS, 10)
  : (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' ? 10000 : 0)

export const ph = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt,
  flushInterval
})

// Best-effort flush on natural process exit (covers short-lived job scripts).
// The API server's SIGTERM/SIGINT shutdown is owned solely by api/index.js,
// which awaits ph.shutdown() before exit — so this module must NOT register a
// competing SIGTERM handler that could call process.exit() ahead of that flush.
process.on('exit', () => ph.shutdown())

export async function queryHogQL(sql, queryName = 'trackiq') {
  try {
    const host = process.env.POSTHOG_HOST.replace(/\/$/, '')
    const projectId = process.env.POSTHOG_PROJECT_ID
    const url = `${host}/api/projects/${projectId}/query/`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {
          kind: 'HogQLQuery',
          query: sql
        }
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const raw = await res.text()
      // Strip HTML tags and truncate to avoid leaking huge HTML bodies into error messages
      const cleaned = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      const snippet = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
      throw new Error(`HogQL ${queryName} failed (${res.status}): ${snippet}`)
    }

    const data = await res.json()
    return data.results || []
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`HogQL ${queryName} timed out`)
    }
    throw err
  }
}

// ─── Canonical pageview reader ───────────────────────────────────────────────
// Source of truth for analytics pageviews is PostHog ($pageview events), NOT the
// legacy Supabase `pageviews` table (ingestion is server-routed to PostHog only).
// Returns rows shaped like the old Supabase rows so JS aggregation stays unchanged.
// NOTE: server-routed events carry no session_id; visitor-dedup uses anonymous_id
// (distinct_id). Session-only metrics (bounce, entry/exit) are suppressed by callers.
const PAGEVIEW_FIELDS = [
  ['url', 'properties.page_url'],
  ['referrer', 'properties.referrer'],
  ['utm_source', 'properties.utm_source'],
  ['utm_medium', 'properties.utm_medium'],
  ['utm_campaign', 'properties.utm_campaign'],
  ['country', 'properties.country'],
  ['device', 'properties.device_type'],
  ['browser', 'properties.browser_name'],
  ['os', 'properties.os_name'],
  ['ai_source', 'properties.ai_source'],
  ['anonymous_id', 'distinct_id'],
  ['timestamp', 'timestamp']
]

// Mirror of analytics.js applyPageviewFilters (drill-down filters) against PostHog props.
const PAGEVIEW_FILTER_COLUMNS = {
  Page: 'properties.page_url',
  Entry: 'properties.page_url',
  Exit: 'properties.page_url',
  Source: 'properties.referrer',
  Country: 'properties.country',
  Device: 'properties.device_type',
  Browser: 'properties.browser_name',
  OS: 'properties.os_name',
  'AI Source': 'properties.ai_source'
}

function buildPageviewFilterSql(filters = []) {
  const clauses = []
  for (const { type, value } of filters) {
    const col = PAGEVIEW_FILTER_COLUMNS[type]
    if (!col) continue
    if (type === 'Page' || type === 'Entry' || type === 'Exit') {
      clauses.push(`${col} ILIKE '%${esc(value)}%'`)
    } else {
      clauses.push(`${col} = '${esc(value)}'`)
    }
  }
  return clauses.length ? ` AND ${clauses.join(' AND ')}` : ''
}

/**
 * Fetch raw pageview rows for a site over a date range from PostHog.
 *
 * @param {string} siteId
 * @param {string|Date} dateFrom - YYYY-MM-DD or ISO; serialized via hogql-date helpers
 * @param {string|Date} dateTo   - YYYY-MM-DD or ISO
 * @param {object} [opts]
 * @param {number} [opts.limit=50000]
 * @param {Array<{type:string,value:string}>} [opts.filters=[]]
 * @param {string} [opts.queryName='pageviews']
 * @returns {Promise<Array<object>>} rows: { url, referrer, utm_source, utm_medium, utm_campaign, country, device, browser, os, ai_source, anonymous_id, timestamp }
 */
export async function fetchPageviews(siteId, dateFrom, dateTo, opts = {}) {
  const { limit = 50000, filters = [], queryName = 'pageviews' } = opts
  const range = serializeHogQLDateRange(dateFrom, dateTo)
  const tsFilter = buildHogQLTimestampFilter('timestamp', range)
  const select = PAGEVIEW_FIELDS.map(([k, expr]) => `${expr} AS ${k}`).join(', ')
  const sql = `SELECT ${select} FROM events
    WHERE event = '$pageview'
      AND properties.site_id = '${esc(siteId)}'
      AND ${tsFilter}${buildPageviewFilterSql(filters)}
    ORDER BY timestamp DESC
    LIMIT ${Number(limit) || 50000}`
  const rows = await queryHogQL(sql, queryName)
  return rows.map(r => {
    const obj = {}
    PAGEVIEW_FIELDS.forEach(([k], i) => { obj[k] = r[i] })
    return obj
  })
}
