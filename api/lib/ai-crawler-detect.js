// AI / crawler identification for the "AI Visibility" report.
//
// ORTHOGONAL to channel-classifier.js. That module answers "a HUMAN arrived —
// which AI surface referred them?" from the REFERRER (AI_DOMAINS_MAP). This one
// answers "a MACHINE fetched a page — whose crawler was it?" from the
// USER-AGENT. Same vendors, different signal, different table, no shared code.
// A GPTBot fetch is not an AI referral and must never be counted as a visitor.
//
// Invariants (CLAUDE.md §0, §6, §6.5):
//   • Pure function of (userAgent, ip). No I/O, no DB, no network. Range refresh
//     is a separate, explicitly-called concern (see ai-crawler-ranges.js usage
//     note at the bottom) so this stays synchronous and testable.
//   • Stores nothing and logs nothing. Callers decide what to persist. The raw
//     IP must NOT be persisted by the caller (§6 "enrich() must never store raw
//     IP") — it is an input to verification only, and `detectAiCrawler` returns
//     no IP-derived field beyond the boolean verdict.
//   • NEVER claims verification it does not have. `verification` is a first-class
//     output with three distinct values, and 'ua_only' is not a soft 'verified'.
//
// ── Why UA alone is not enough ────────────────────────────────────────────────
// A User-Agent is a free-text request header; anyone can send `GPTBot`. Vendors
// that care about being impersonated publish the IP ranges their crawlers use,
// so the honest check is two-stage: match the UA token, then confirm the source
// IP falls inside a published range. Where a vendor publishes nothing there is
// no second stage available — that result is labelled `ua_only` and must stay
// visibly weaker everywhere downstream, including in the stored row.

// Verification outcomes. Ordered weakest → strongest for display purposes.
export const VERIFICATION = {
  // Vendor publishes ranges, the IP was checked, and it matched.
  IP_VERIFIED: 'ip_verified',
  // Vendor publishes ranges, the IP was checked, and it did NOT match.
  // This is an active impersonation signal, not merely "unverified".
  IP_MISMATCH: 'ip_mismatch',
  // Vendor publishes ranges but we had no IP / no loaded range set to check
  // against (e.g. ranges not fetched yet). Weaker than IP_VERIFIED and must
  // not be reported as verified.
  UA_ONLY: 'ua_only',
  // Vendor publishes NO ranges at all. UA match is the strongest signal that
  // exists for this bot; no amount of engineering upgrades it.
  UA_ONLY_NO_RANGES_PUBLISHED: 'ua_only_no_ranges_published'
}

// Category buckets requested by the report spec.
export const CATEGORY = {
  LLM_CRAWLER: 'llm_crawler',            // fetches content for model training
  AI_SEARCH: 'ai_search',                // builds an AI search / answer index
  AI_ASSISTANT: 'ai_assistant',          // fetches live, on behalf of a user prompt
  SEARCH_ENGINE: 'search_engine',        // classic search indexing
  SEO_TOOL: 'seo_tool'                   // third-party SEO/backlink crawlers
}

// How a vendor publishes its ranges. Consumed by ai-crawler-ranges.js (not in
// this PR — see the collection note in the PR body); recorded here so the
// registry stays the single source of truth for verifiability.
export const RANGE_SOURCE = {
  // Vendor-hosted JSON listing CIDRs. `url` is fetched server-side on a schedule.
  VENDOR_JSON: 'vendor_json',
  // Verified by reverse-DNS → forward-DNS on a vendor-owned domain suffix
  // (the classic Googlebot/Bingbot verification, and what those vendors
  // document instead of a stable published CIDR list).
  REVERSE_DNS: 'reverse_dns',
  // Vendor publishes nothing usable.
  NONE: 'none'
}

// ── Registry ──────────────────────────────────────────────────────────────────
// `token` is matched case-insensitively as a literal substring of the UA.
// Order matters: entries are tested top-down and the FIRST match wins, so more
// specific tokens must precede the substrings they contain
// (`Google-InspectionTool` before `Googlebot`; `ChatGPT-User` before `GPT`).
//
// `executesJs` records whether the agent runs JavaScript. It is not cosmetic:
// it is exactly the axis api/lib/bot-filter.js gates ingestion on, and it is
// what decides whether a given bot can EVER be observed by a JS tracker. See
// the coverage note in the PR body.
export const AI_CRAWLERS = [
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  {
    token: 'ChatGPT-User', name: 'ChatGPT-User', operator: 'OpenAI',
    category: CATEGORY.AI_ASSISTANT, executesJs: false,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://openai.com/chatgpt-user.json',
    note: 'Live fetch triggered by a user prompt or a ChatGPT browsing session.'
  },
  {
    token: 'OAI-SearchBot', name: 'OAI-SearchBot', operator: 'OpenAI',
    category: CATEGORY.AI_SEARCH, executesJs: false,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://openai.com/searchbot.json',
    note: 'Builds the ChatGPT Search index. Distinct from the training crawler.'
  },
  {
    token: 'GPTBot', name: 'GPTBot', operator: 'OpenAI',
    category: CATEGORY.LLM_CRAWLER, executesJs: false,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://openai.com/gptbot.json',
    note: 'Training-data crawler. Governed by the GPTBot robots.txt token.'
  },

  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    token: 'ClaudeBot', name: 'ClaudeBot', operator: 'Anthropic',
    category: CATEGORY.LLM_CRAWLER, executesJs: false,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://www.anthropic.com/claudebot.json',
    note: 'Anthropic crawler. Also seen as Claude-Web / anthropic-ai historically.'
  },

  // ── Perplexity ──────────────────────────────────────────────────────────────
  {
    token: 'PerplexityBot', name: 'PerplexityBot', operator: 'Perplexity',
    category: CATEGORY.AI_SEARCH, executesJs: false,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://www.perplexity.ai/perplexitybot.json',
    note: 'Indexes for Perplexity answers.'
  },

  // ── Google ──────────────────────────────────────────────────────────────────
  // Google-Extended is deliberately ABSENT from this list. It is a robots.txt
  // CONTROL TOKEN for Gemini/Vertex training opt-out, NOT a crawler: no request
  // ever arrives carrying it as a User-Agent. Matching it would produce a row
  // that can never be non-zero. (It appears in bot-filter.js's reporting regex,
  // where it is likewise inert.) Documented rather than silently dropped,
  // because "why is Google-Extended missing" is the obvious review question.
  {
    token: 'Google-InspectionTool', name: 'Google-InspectionTool', operator: 'Google',
    category: CATEGORY.SEARCH_ENGINE, executesJs: true,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
    note: 'Search Console URL Inspection / Rich Results fetches.'
  },
  {
    token: 'Googlebot', name: 'Googlebot', operator: 'Google',
    category: CATEGORY.SEARCH_ENGINE, executesJs: true,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
    note: 'Renders JS via the Web Rendering Service — DOES reach a JS tracker.'
  },

  // ── Microsoft ───────────────────────────────────────────────────────────────
  {
    token: 'bingbot', name: 'Bingbot', operator: 'Microsoft',
    category: CATEGORY.SEARCH_ENGINE, executesJs: true,
    rangeSource: RANGE_SOURCE.VENDOR_JSON,
    rangeUrl: 'https://www.bing.com/toolbox/bingbot.json',
    note: 'Renders JS. Also feeds Copilot grounding.'
  },

  // ── Mistral ─────────────────────────────────────────────────────────────────
  {
    token: 'MistralAI-User', name: 'MistralAI-User', operator: 'Mistral',
    category: CATEGORY.AI_ASSISTANT, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE,
    note: 'Live fetch on behalf of a Le Chat user.'
  },
  {
    token: 'MistralAI-Index', name: 'MistralAI-Index', operator: 'Mistral',
    category: CATEGORY.AI_SEARCH, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE,
    note: 'No published range list — UA match is the ceiling for this bot.'
  },

  // ── Meta ────────────────────────────────────────────────────────────────────
  {
    token: 'Meta-ExternalAgent', name: 'Meta-ExternalAgent', operator: 'Meta',
    category: CATEGORY.LLM_CRAWLER, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE,
    note: 'Meta AI training / indexing crawler.'
  },
  {
    token: 'meta-webindexer', name: 'meta-webindexer', operator: 'Meta',
    category: CATEGORY.AI_SEARCH, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE
  },
  {
    token: 'FacebookBot', name: 'FacebookBot', operator: 'Meta',
    category: CATEGORY.LLM_CRAWLER, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE,
    note: 'Distinct from facebookexternalhit, which is the link-preview unfurler.'
  },

  // ── Common Crawl ────────────────────────────────────────────────────────────
  {
    token: 'CCBot', name: 'CCBot', operator: 'Common Crawl',
    category: CATEGORY.LLM_CRAWLER, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE,
    note: 'Open corpus that most LLM training sets are derived from.'
  },

  // ── SEO tools ───────────────────────────────────────────────────────────────
  {
    token: 'AhrefsBot', name: 'AhrefsBot', operator: 'Ahrefs',
    category: CATEGORY.SEO_TOOL, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE
  },
  {
    token: 'SemrushBot', name: 'SemrushBot', operator: 'Semrush',
    category: CATEGORY.SEO_TOOL, executesJs: false,
    rangeSource: RANGE_SOURCE.NONE
  }
]

// Pre-lowered tokens so matching does not re-lowercase the registry per call.
const MATCHERS = AI_CRAWLERS.map((bot) => ({ bot, needle: bot.token.toLowerCase() }))

// ── IP matching ───────────────────────────────────────────────────────────────
// Deliberately IPv4 + IPv6 CIDR containment only. Vendors publish plain CIDR
// lists, so nothing more general is needed and anything more general is more to
// get wrong.

function ipv4ToBigInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let acc = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    acc = (acc << 8n) | BigInt(octet)
  }
  return acc
}

function ipv6ToBigInt(ip) {
  // Reject the IPv4-mapped forms rather than half-handle them; resolveClientIp
  // already normalises ::ffff:a.b.c.d down to dotted-quad before this is called.
  if (ip.includes('.')) return null
  const halves = ip.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && head.length !== 8) return null
  const fillCount = 8 - head.length - tail.length
  if (fillCount < 0) return null

  const groups = [...head, ...Array(halves.length === 2 ? fillCount : 0).fill('0'), ...tail]
  if (groups.length !== 8) return null

  let acc = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    acc = (acc << 16n) | BigInt(parseInt(group, 16))
  }
  return acc
}

function parseIp(ip) {
  const raw = String(ip || '').trim().toLowerCase()
  if (!raw) return null
  if (raw.includes(':')) {
    const value = ipv6ToBigInt(raw)
    return value === null ? null : { value, bits: 128 }
  }
  const value = ipv4ToBigInt(raw)
  return value === null ? null : { value, bits: 32 }
}

/**
 * True when `ip` falls inside CIDR (e.g. "20.171.207.0/24", "2a03:2880::/29").
 * Returns false — never throws — on anything malformed.
 */
export function ipInCidr(ip, cidr) {
  try {
    const [network, prefixRaw] = String(cidr || '').trim().split('/')
    const prefix = Number(prefixRaw)
    const target = parseIp(ip)
    const base = parseIp(network)
    if (!target || !base) return false
    if (target.bits !== base.bits) return false
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > target.bits) return false

    const hostBits = BigInt(target.bits - prefix)
    return (target.value >> hostBits) === (base.value >> hostBits)
  } catch (_) {
    return false
  }
}

/**
 * Identify the crawler behind a request.
 *
 * @param {string} userAgent  raw User-Agent header
 * @param {object} [options]
 * @param {string} [options.ip]      request IP, for stage-2 verification
 * @param {Map<string,string[]>} [options.ranges]
 *        token (as written in the registry) -> CIDR list, supplied by the
 *        caller from a refreshed cache. Absent => no stage-2 check is possible
 *        and the result is reported as UA_ONLY, never as verified.
 *
 * @returns {null|{name,operator,category,executesJs,verification,ipChecked}}
 *          null when the UA matches no known crawler. A null result means
 *          "not a bot we track" — it does NOT mean "human"; that judgement
 *          belongs to bot-filter.js.
 */
export function detectAiCrawler(userAgent, options = {}) {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return null

  const hit = MATCHERS.find(({ needle }) => ua.includes(needle))
  if (!hit) return null

  const { bot } = hit
  const { ip = null, ranges = null } = options

  // Vendor publishes nothing — UA match is the ceiling. Say so explicitly
  // rather than emitting the same 'ua_only' used for "we could have checked
  // but didn't", because the two have different remedies.
  if (bot.rangeSource === RANGE_SOURCE.NONE) {
    return {
      name: bot.name,
      operator: bot.operator,
      category: bot.category,
      executesJs: bot.executesJs,
      verification: VERIFICATION.UA_ONLY_NO_RANGES_PUBLISHED,
      ipChecked: false
    }
  }

  const cidrs = ranges instanceof Map ? ranges.get(bot.token) : null
  if (!ip || !Array.isArray(cidrs) || cidrs.length === 0) {
    return {
      name: bot.name,
      operator: bot.operator,
      category: bot.category,
      executesJs: bot.executesJs,
      verification: VERIFICATION.UA_ONLY,
      ipChecked: false
    }
  }

  const matched = cidrs.some((cidr) => ipInCidr(ip, cidr))
  return {
    name: bot.name,
    operator: bot.operator,
    category: bot.category,
    executesJs: bot.executesJs,
    // A UA claiming GPTBot from outside OpenAI's published ranges is an
    // impersonation signal worth keeping distinct — it is the one case where
    // the row should be treated as adversarial rather than merely unproven.
    verification: matched ? VERIFICATION.IP_VERIFIED : VERIFICATION.IP_MISMATCH,
    ipChecked: true
  }
}

/**
 * Per-bot verifiability, for the coverage note and for seeding the UI legend.
 * Derived from the registry so the doc can never drift from the code.
 */
export function verificationCoverage() {
  return AI_CRAWLERS.map((bot) => ({
    name: bot.name,
    operator: bot.operator,
    category: bot.category,
    executesJs: bot.executesJs,
    rangeSource: bot.rangeSource,
    bestPossibleVerification: bot.rangeSource === RANGE_SOURCE.NONE
      ? VERIFICATION.UA_ONLY_NO_RANGES_PUBLISHED
      : VERIFICATION.IP_VERIFIED
  }))
}
