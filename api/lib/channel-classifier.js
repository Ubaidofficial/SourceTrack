/**
 * Canonical channel classification — single source of truth used by both
 * the live attribution engine and the nightly pre-aggregation job.
 *
 * Previously duplicated in attribution-engine.js and nightly-attribution.js
 * with different AI domain lists, causing channel inconsistencies between
 * live queries and pre-aggregated reports.
 */

// All known AI assistant/search domains
export const AI_REFERRER_DOMAINS = [
  'chatgpt.com', 'chat.openai.com', 'claude.ai', 'anthropic.com',
  'perplexity.ai', 'gemini.google.com', 'bard.google.com', 'aistudio.google.com',
  'grok.com', 'grok.x.com', 'deepseek.com', 'copilot.microsoft.com',
  'poe.com', 'you.com', 'phind.com', 'kagi.com', 'meta.ai',
  'chat.mistral.ai', 'mistral.ai', 'character.ai', 'pi.ai', 'inflection.ai'
]

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

export function channelFromEvent(props = {}) {
  const medium  = String(props.utm_medium  || props.medium  || '').toLowerCase().trim()
  const source  = String(props.utm_source  || props.source  || props.derived_source || '').toLowerCase().trim()
  let   ref     = String(props.referrer    || '').toLowerCase()
  const aiSource = String(props.ai_source  || '').trim()
  const gclid   = props.gclid   || props.gbraid || props.wbraid
  const fbclid  = props.fbclid
  const msclkid = props.msclkid
  const ttclid  = props.ttclid
  const liclid  = props.li_fat_id

  // Treat same-domain (internal) referrers as no referrer for classification.
  // The classifier still credits UTMs / paid click IDs (which run BEFORE the
  // AI referrer / Organic / Referral branches via their own checks) — we only
  // neutralize the *referrer-based* branches so an internal blog→pricing link
  // does not silently inflate the "Referral" or "Organic Search" channels.
  if (ref && isSameDomainReferrer(ref, props.page_url)) {
    ref = ''
  }

  // 1. AI Search — explicit ai_source tag or referrer from known AI domain
  if (aiSource) return 'AI Search'
  if (AI_REFERRER_DOMAINS.some(d => ref.includes(d))) return 'AI Search'

  // 2. Paid Search
  const paidSearchMediums = ['cpc', 'ppc', 'paid', 'paid_search', 'paidsearch', 'sem']
  if (gclid || msclkid) return 'Paid Search'
  if (paidSearchMediums.includes(medium)) return 'Paid Search'

  // 3. Paid Social
  const paidSocialMediums = ['paid_social', 'paidsocial', 'social_paid']
  if (fbclid || ttclid || liclid) return 'Paid Social'
  if (paidSocialMediums.includes(medium)) return 'Paid Social'

  // 4. Display / Retargeting
  if (['display', 'banner', 'gdn', 'expandable', 'retargeting'].includes(medium)) return 'Display'

  // 5. Affiliate (medium-based — most affiliate networks pass utm_medium=affiliate)
  if (['affiliate', 'affiliates', 'partner', 'cpa', 'cps'].includes(medium)) return 'Affiliate'

  // 6. Email / SMS
  if (['email', 'e-mail', 'newsletter', 'mailing', 'edm'].includes(medium)) return 'Email'
  if (['sms', 'text', 'mms'].includes(medium)) return 'SMS'

  // 6. Organic Search (referrer or source match)
  const searchEngines = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'ecosia.', 'kagi.', 'brave.', 'yandex.', 'baidu.']
  const searchSources = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'brave', 'ecosia']
  if (searchEngines.some(se => ref.includes(se))) return 'Organic Search'
  if (source && searchSources.includes(source) && !medium) return 'Organic Search'

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
