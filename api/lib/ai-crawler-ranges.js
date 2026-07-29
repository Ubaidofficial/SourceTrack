// Published crawler IP ranges: fetch, parse, persist, and load.
//
// The counterpart to api/lib/ai-crawler-detect.js, which is a PURE function and
// takes `ranges` as an argument precisely so that all of the I/O lives here.
// detectAiCrawler() is not imported for detection — only isValidCidr(), so that
// exactly one IP parser exists in the codebase.
//
// ── The fail-open contract (the reason this file is structured this way) ──────
// A vendor's range endpoint being briefly down must NOT downgrade every
// subsequent hit from that crawler to `ua_only`. So:
//   • Refresh is PER BOT. One vendor failing never affects another's row.
//   • A row is written ONLY on a successful fetch + parse yielding >=1 valid
//     CIDR. Anything else leaves the existing row untouched — last-known-good.
//   • Nothing in this file ever DELETEs a range row. There is no code path that
//     blanks a bot's ranges, because "we could not reach the vendor" and "the
//     vendor no longer publishes ranges" are indistinguishable from a failed
//     fetch, and the safe reading of the ambiguity is to keep what we have.
//   • An empty or all-invalid parse is treated as a FAILURE, not as "the vendor
//     published nothing". Writing [] would silently destroy verification.

import { AI_CRAWLERS, RANGE_SOURCE, isValidCidr } from './ai-crawler-detect.js'

// Only these are refreshable. REVERSE_DNS and NONE have nothing to fetch.
export function refreshableCrawlers() {
  return AI_CRAWLERS.filter((bot) => bot.rangeSource === RANGE_SOURCE.VENDOR_JSON && bot.rangeUrl)
}

/**
 * Extract CIDR strings from a vendor payload.
 *
 * Google, Bing, OpenAI, Anthropic and Perplexity all publish the same shape:
 *   { "prefixes": [ { "ipv4Prefix": "1.2.3.0/24" }, { "ipv6Prefix": "2a0b::/32" } ] }
 * Tolerant of two documented-in-the-wild variants (a bare array of strings, and
 * prefixes-as-strings) because a vendor changing shape should degrade to "no
 * valid CIDRs" -> refresh failure -> last-known-good retained, never to a throw.
 *
 * Invalid entries are DROPPED, not coerced. Returns [] on anything unusable —
 * the caller treats [] as a failure, so [] can never be persisted.
 */
export function parseVendorRanges(payload) {
  if (!payload) return []

  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.prefixes)
      ? payload.prefixes
      : []

  const out = []
  for (const entry of raw) {
    let candidate = null
    if (typeof entry === 'string') {
      candidate = entry
    } else if (entry && typeof entry === 'object') {
      candidate = entry.ipv4Prefix || entry.ipv6Prefix || entry.ipv4 || entry.ipv6 || null
    }
    if (typeof candidate === 'string' && isValidCidr(candidate)) {
      out.push(candidate.trim())
    }
  }
  // De-dupe: vendors occasionally repeat a prefix across sections.
  return [...new Set(out)]
}

/**
 * Fetch + parse ONE bot's ranges. Never throws.
 * @returns {Promise<{ok: true, cidrs: string[]} | {ok: false, error: string}>}
 */
export async function fetchBotRanges(bot, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  try {
    // AbortController so a hanging vendor endpoint cannot wedge the whole job.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res
    try {
      res = await fetchImpl(bot.rangeUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (!res || !res.ok) {
      return { ok: false, error: `HTTP ${res ? res.status : 'no-response'}` }
    }

    const json = await res.json()
    const cidrs = parseVendorRanges(json)
    // An empty parse is a FAILURE, never a legitimate "no ranges" — see the
    // fail-open contract above. Persisting [] would silently un-verify the bot.
    if (cidrs.length === 0) {
      return { ok: false, error: 'no valid CIDRs in payload' }
    }
    return { ok: true, cidrs }
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 200) }
  }
}

/**
 * Refresh every VENDOR_JSON crawler's ranges.
 *
 * Per-bot fail-open: a failure leaves that bot's stored row untouched and is
 * reported in `failed`, never thrown. Returns a summary the job turns into a
 * job_runs row.
 */
export async function refreshAllRanges({ supabase, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const bots = refreshableCrawlers()
  const updated = []
  const failed = []

  for (const bot of bots) {
    const result = await fetchBotRanges(bot, { fetchImpl, timeoutMs })

    if (!result.ok) {
      // LAST-KNOWN-GOOD RETAINED: no write of any kind on this branch.
      failed.push({ token: bot.token, error: result.error })
      console.warn(`[ai-crawler-ranges] refresh FAILED for ${bot.token}: ${result.error} — keeping last-known-good`)
      continue
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('ai_crawler_ranges')
      .upsert({
        bot_token: bot.token,
        cidrs: result.cidrs,
        source_url: bot.rangeUrl,
        cidr_count: result.cidrs.length,
        fetched_at: now,
        updated_at: now
      }, { onConflict: 'bot_token' })

    if (error) {
      // A DB write failure is also fail-open — the prior row stands.
      failed.push({ token: bot.token, error: `db: ${error.message}` })
      console.error(`[ai-crawler-ranges] UPSERT failed for ${bot.token}: ${error.message} — keeping last-known-good`)
      continue
    }

    updated.push({ token: bot.token, count: result.cidrs.length })
  }

  return { attempted: bots.length, updated, failed }
}

/**
 * Build the Map that detectAiCrawler() consumes: token -> CIDR[].
 *
 * Returns an EMPTY Map (never null, never throws) if the table is unreachable.
 * An empty Map degrades detection to `ua_only`, which is the honest verdict
 * when verification data is unavailable — it never fabricates `ip_verified`.
 */
export async function loadRanges(supabase) {
  try {
    const { data, error } = await supabase
      .from('ai_crawler_ranges')
      .select('bot_token, cidrs')

    if (error || !Array.isArray(data)) return new Map()

    const map = new Map()
    for (const row of data) {
      if (row?.bot_token && Array.isArray(row.cidrs) && row.cidrs.length > 0) {
        map.set(row.bot_token, row.cidrs)
      }
    }
    return map
  } catch (_) {
    return new Map()
  }
}
