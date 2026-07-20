/**
 * Canonical channel classification — single source of truth used by both
 * the live attribution engine and the nightly pre-aggregation job.
 *
 * Previously duplicated in attribution-engine.js and nightly-attribution.js
 * with different AI domain lists, causing channel inconsistencies between
 * live queries and pre-aggregated reports.
 */

import { isGoogleSource } from './utils.js'

// All known AI assistant/search domains
export const AI_REFERRER_DOMAINS = [
  'chatgpt.com', 'chat.openai.com', 'claude.ai', 'anthropic.com',
  'perplexity.ai', 'gemini.google.com', 'bard.google.com', 'aistudio.google.com',
  'grok.com', 'grok.x.com', 'deepseek.com', 'copilot.microsoft.com',
  'poe.com', 'you.com', 'phind.com', 'kagi.com', 'meta.ai',
  'chat.mistral.ai', 'mistral.ai', 'character.ai', 'pi.ai', 'inflection.ai'
]

// Canonical Organic Search signals — exported so other surfaces (e.g. the
// SEO-revenue landing-page query) detect organic identically and stay in sync.
// Host tokens carry a trailing dot to match the registrable domain
// (e.g. 'google.' → google.com / google.co.uk, not "googleads").
export const ORGANIC_SEARCH_ENGINE_HOSTS = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'ecosia.', 'kagi.', 'brave.', 'yandex.', 'baidu.']
export const ORGANIC_SEARCH_SOURCES = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'brave', 'ecosia']

// Strip protocol, www., and lowercase. Returns null on malformed input.
function extractHost(url) {
  if (!url || typeof url !== 'string') return null
  let s = url.trim()
  if (!s) return null
  if (!s.includes('://')) s = 'https://' + s
  try {
    return new URL(s).hostname.replace(/^www\./i, '').toLowerCase() || null
  } catch (_) {
    return null
  }
}

/**
 * True when the referrer and the page being viewed live on the same registrable
 * domain. Used to skip the "Referral" branch so that internal navigation
 * (e.g. example.com/blog → example.com/pricing) is NOT counted as external
 * referral traffic, which would inflate Referral attribution.
 *
 * Treats a host as same-domain when either is an exact match or a subdomain
 * of the other (so app.example.com → www.example.com is internal).
 */
export function isSameDomainReferrer(referrer, pageUrl) {
  const refHost  = extractHost(referrer)
  const pageHost = extractHost(pageUrl)
  if (!refHost || !pageHost) return false
  if (refHost === pageHost) return true
  return refHost.endsWith('.' + pageHost) || pageHost.endsWith('.' + refHost)
}

export const AI_DOMAINS_MAP = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'anthropic.com': 'Claude',
  'perplexity.ai': 'Perplexity',
  'gemini.google.com': 'Gemini',
  'bard.google.com': 'Gemini',
  'aistudio.google.com': 'Gemini',
  'grok.com': 'Grok',
  'grok.x.com': 'Grok',
  'deepseek.com': 'DeepSeek',
  'copilot.microsoft.com': 'Copilot',
  'poe.com': 'Poe',
  'you.com': 'You.com',
  'phind.com': 'Phind',
  'kagi.com': 'Kagi',
  'meta.ai': 'Meta AI',
  'chat.mistral.ai': 'Mistral',
  'mistral.ai': 'Mistral',
  'character.ai': 'Character.ai',
  'pi.ai': 'Pi',
  'inflection.ai': 'Inflection AI'
}

export const AI_UTM_SOURCES_MAP = {
  'chatgpt': 'ChatGPT',
  'openai': 'ChatGPT',
  'claude': 'Claude',
  'anthropic': 'Claude',
  'perplexity': 'Perplexity',
  'gemini': 'Gemini',
  'bard': 'Gemini',
  'grok': 'Grok',
  'xai': 'Grok',
  'copilot': 'Copilot',
  'deepseek': 'DeepSeek',
  'you': 'You.com',
  'phind': 'Phind',
  'mistral': 'Mistral',
  'poe': 'Poe',
  'kagi': 'Kagi',
  // Aliases folded in from the (now-deleted) ai-platform.js / proxy.js duplicate maps so this
  // single source covers every UTM key the ingest middleware previously caught — a naive import
  // would otherwise have dropped these 9, incl. Meta AI entirely (KI-32).
  'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'perplexity.ai': 'Perplexity',
  'google-gemini': 'Gemini',
  'bing-copilot': 'Copilot',
  'microsoft-copilot': 'Copilot',
  'deep-seek': 'DeepSeek',
  'meta-ai': 'Meta AI',
  'meta.ai': 'Meta AI'
}

// Canonical labels (the values of the maps above) — used by resolveAiSource to accept a value
// that is already canonical. All AI_UTM_SOURCES_MAP values are also AI_DOMAINS_MAP values, so the
// domain map's value set is the full canonical label set.
const AI_CANONICAL_LABELS = new Set(Object.values(AI_DOMAINS_MAP))

// Classify an AI platform from a referrer URL: the two PATH-based special cases that a
// hostname-keyed map cannot express, then the host map. bing.com is an ORGANIC_SEARCH_ENGINE_HOST,
// so ONLY its /chat surface is Copilot — /search is organic Bing, not AI (KI-32 narrowing).
// Shared by detectAiPlatformFromEvent (read side), the ingest middleware, and the proxy so all
// three emit one canonical string for the same referrer.
export function detectAiPlatformFromReferrer(referrer) {
  const raw = String(referrer || '').toLowerCase().trim()
  if (!raw) return null
  try {
    const u = new URL(raw.includes('://') ? raw : 'https://' + raw)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    const path = u.pathname || ''
    if (host === 'bing.com' && path.startsWith('/chat')) return 'Copilot'
    if (host === 'x.com' && path.includes('/i/grok')) return 'Grok'
    for (const [domain, name] of Object.entries(AI_DOMAINS_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) return name
    }
    return null
  } catch { return null }
}

// Canonicalize an already-supplied ai_source value (request body / stored props) to the single
// canonical label, or null if unrecognized. Accepts a canonical label ('ChatGPT'), a host
// ('chatgpt.com'), or a utm-style key ('chatgpt'). REJECT-UNKNOWN: no map hit -> null, so an
// arbitrary caller-supplied value never lands in ai_source (the §6.5 ingest-integrity boundary).
export function resolveAiSource(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (AI_CANONICAL_LABELS.has(v)) return v
  const lower = v.toLowerCase()
  if (AI_UTM_SOURCES_MAP[lower]) return AI_UTM_SOURCES_MAP[lower]
  const host = lower.replace(/^www\./i, '')
  for (const [domain, name] of Object.entries(AI_DOMAINS_MAP)) {
    if (host === domain || host.endsWith('.' + domain)) return name
  }
  return null
}

export function detectAiPlatformFromEvent(props = {}) {
  let ref = String(props.referrer || '').toLowerCase().trim()
  if (ref && isSameDomainReferrer(ref, props.page_url)) {
    ref = ''
  }

  // 1. Check properties.ai_source or props.ai_source
  const aiSource = String(props.ai_source || '').trim()
  if (aiSource) return aiSource

  // 2. Check utm_source / source / derived_source
  const utmSource = String(props.utm_source || props.source || props.derived_source || '').toLowerCase().trim()
  if (utmSource && AI_UTM_SOURCES_MAP[utmSource]) {
    return AI_UTM_SOURCES_MAP[utmSource]
  }

  // 3. Check referrer — shared detector (path cases + host map; /chat-only for bing)
  if (ref) {
    const fromRef = detectAiPlatformFromReferrer(ref)
    if (fromRef) return fromRef
  }

  // 4. Check referrer_domain
  const refDom = String(props.referrer_domain || '').toLowerCase().trim()
  if (refDom) {
    const host = refDom.replace(/^www\./i, '')
    for (const [domain, name] of Object.entries(AI_DOMAINS_MAP)) {
      if (host === domain || host.endsWith('.' + domain)) {
        return name
      }
    }
  }

  return null
}

export function channelFromEvent(props = {}) {
  const medium  = String(props.utm_medium  || props.medium  || '').toLowerCase().trim()
  const source  = String(props.utm_source  || props.source  || props.derived_source || '').toLowerCase().trim()
  let   ref     = String(props.referrer    || '').toLowerCase()
  const aiSource = String(props.ai_source  || '').trim()
  const gclid   = props.gclid   || props.gbraid || props.wbraid
  const fbclid  = props.fbclid
  const msclkid = props.msclkid
  const ttclid  = props.ttclid
  const liclid  = props.li_fat_id || props.li_fatid
  const twclid  = props.twclid
  const snapclid = props.snapclid
  const pclid   = props.pclid
  const dclid   = props.dclid
  const sccid   = props.sccid
  const ko_click_id = props.ko_click_id

  // Treat same-domain (internal) referrers as no referrer for classification.
  // The classifier still credits UTMs / paid click IDs (which run BEFORE the
  // AI referrer / Organic / Referral branches via their own checks) — we only
  // neutralize the *referrer-based* branches so an internal blog→pricing link
  // does not silently inflate the "Referral" or "Organic Search" channels.
  if (ref && isSameDomainReferrer(ref, props.page_url)) {
    ref = ''
  }

  // 1. AI Search — explicit ai_source tag or referrer from known AI domain
  if (detectAiPlatformFromEvent(props)) return 'AI Search'

  // 2. Paid Search
  const paidSearchMediums = ['cpc', 'ppc', 'paid', 'paid_search', 'paidsearch', 'sem']
  if (gclid || msclkid) return 'Paid Search'
  if (paidSearchMediums.includes(medium)) return 'Paid Search'

  // 3. Paid Social
  const paidSocialMediums = ['paid_social', 'paidsocial', 'social_paid']
  if (fbclid || ttclid || liclid || twclid || snapclid || pclid || sccid) return 'Paid Social'
  if (paidSocialMediums.includes(medium)) return 'Paid Social'

  // 4. Display / Retargeting
  if (dclid) return 'Display'
  if (['display', 'banner', 'gdn', 'expandable', 'retargeting'].includes(medium)) return 'Display'

  // 5. Affiliate (medium-based — most affiliate networks pass utm_medium=affiliate)
  if (['affiliate', 'affiliates', 'partner', 'cpa', 'cps'].includes(medium)) return 'Affiliate'

  // 6. Email / SMS
  if (['email', 'e-mail', 'newsletter', 'mailing', 'edm'].includes(medium)) return 'Email'
  if (['sms', 'text', 'mms'].includes(medium)) return 'SMS'

  // 6. Organic Search (referrer or source match)
  if (ORGANIC_SEARCH_ENGINE_HOSTS.some(se => ref.includes(se))) return 'Organic Search'
  if (source && ORGANIC_SEARCH_SOURCES.includes(source) && !medium) return 'Organic Search'

  // 7. Organic Social (referrer or source match)
  const socialDomains = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'youtube.com', 'snapchat.com', 'threads.net']
  const socialSources = ['facebook', 'instagram', 'linkedin', 'twitter', 'x', 'tiktok', 'pinterest', 'reddit', 'youtube', 'snapchat']
  if (socialDomains.some(s => ref.includes(s))) return 'Organic Social'
  if (source && socialSources.includes(source) && !medium) return 'Organic Social'

  // 8. Email (source-based — known ESP domains)
  const emailSources = ['mailchimp', 'klaviyo', 'hubspot', 'sendgrid', 'customer.io', 'brevo', 'activecampaign', 'drip', 'omnisend', 'postmark', 'mailerlite']
  if (emailSources.includes(source)) return 'Email'

  // 9. Referral — any other non-empty referrer
  if (ref && ref.length > 5) return 'Referral'

  // 10. Direct or tagged campaign
  if (!source || source === 'direct') return 'Direct'
  if (source) return 'Other Campaign'
  return 'Direct'
}

/**
 * Canonical SOURCE/ENGINE classifier — the source DIMENSION (distinct from the
 * channel dimension above). Returns the engine/host token, NOT a channel bucket:
 * a Bing referrer yields 'bing.com' (→ "Bing" once normalized), never
 * 'Organic Search'. Lifted verbatim from the canonical /analytics/sources
 * referrer-tab classifier so both Sources surfaces share one implementation.
 *
 * Pure: visitor-denomination is the caller's job (see topSourcesByVisitor).
 *
 * @param {object} props - { ai_source, utm_source, referrer }
 * @param {object} opts  - { isOwnDomain } per-site own-domain matcher (host => bool)
 * @returns {string} source token: 'AI: <X>' | 'google' | '<host>' | '<utm_source>' | 'Direct'
 */
export function sourceFromEvent(props = {}, { isOwnDomain } = {}) {
  const isOwn = typeof isOwnDomain === 'function' ? isOwnDomain : () => false
  if (props.ai_source) return `AI: ${props.ai_source}`
  if (props.utm_source && isGoogleSource(props.utm_source)) return 'google'
  if (props.utm_source) return String(props.utm_source).toLowerCase()
  if (props.referrer) {
    try {
      const host = new URL(props.referrer).hostname.replace('www.', '')
      if (isOwn(host)) return 'Direct'
      if (isGoogleSource(host)) return 'google'
      return host
    } catch (_e) {
      return 'Direct'
    }
  }
  return 'Direct'
}

/**
 * Visitor-denominated source aggregation for the "Top Sources" surface.
 * Counts UNIQUE VISITORS (distinct anonymous_id) per source token — NOT
 * pageviews — so a single visitor with N pageviews from one source counts once.
 *
 * @param {Array} rows - pageview rows ({ ai_source, utm_source, referrer, anonymous_id })
 * @param {object} opts - { isOwnDomain, limit = 50 }
 * @returns {Array<{source: string, visits: number}>} sorted desc by visits
 */
export function topSourcesByVisitor(rows = [], { isOwnDomain, limit = 50 } = {}) {
  const sets = {}
  for (const r of rows) {
    const src = sourceFromEvent(r, { isOwnDomain })
    if (!sets[src]) sets[src] = new Set()
    if (r.anonymous_id) sets[src].add(r.anonymous_id)
  }
  return Object.entries(sets)
    .map(([source, set]) => ({ source, visits: set.size }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}
