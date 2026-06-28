import { assertWebhookDestinationSafe } from './ssrf-guard.js'

// Setup Concierge: best-effort detection of the CMS/site platform behind a
// customer-registered domain, used purely to highlight the matching install
// guide in the dashboard. Advisory only — never blocks, never persisted.
//
// SSRF: the domain is customer-controlled, so every fetch is routed through
// assertWebhookDestinationSafe() (HTTPS-only + DNS-resolved private/loopback/
// link-local rejection — the same guard used for managed-proxy verification).
// Redirects are followed manually with re-validation on every hop so a public
// host cannot bounce us onto an internal address.

const FETCH_TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3
const MAX_HTML_BYTES = 512 * 1024
const USER_AGENT = 'SourceTrack-Setup/1.0'

const ERROR_RESULT = Object.freeze({
  platform: 'unknown',
  confidence: 'low',
  gtm_present: false,
  signals: [],
  error: true
})

// Platform signal table — checked IN THIS PRIORITY ORDER. The first platform
// with at least one matching signal wins. Tokens are matched case-sensitively
// against the raw HTML body + serialized response headers, exactly as listed.
const PLATFORM_SIGNALS = [
  { platform: 'shopify', tokens: ['cdn.shopify.com', 'Shopify'] },
  { platform: 'wordpress', tokens: ['/wp-content/', '/wp-includes/', '/wp-json/'] },
  { platform: 'wix', tokens: ['static.wixstatic.com'] },
  { platform: 'squarespace', tokens: ['squarespace.com', 'SQUARESPACE_CONTEXT'] },
  { platform: 'webflow', tokens: ['webflow.com', 'data-wf-site'] }
]

const GTM_TOKEN = 'googletagmanager.com/gtm.js'

// Validate a bare hostname before building a URL: reject empty, IP literals,
// and anything with a scheme/path/whitespace. Deeper IP/DNS checks happen in
// assertWebhookDestinationSafe; this is a cheap pre-filter.
function isPlausibleHostname(domain) {
  if (!domain || typeof domain !== 'string') return false
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!host || /\s/.test(host)) return false
  if (!host.includes('.')) return false       // require a dot — rejects "localhost" and bare labels
  return true
}

function normalizeHost(domain) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

// Read at most MAX_HTML_BYTES of the response body so a hostile/huge page
// cannot exhaust memory. Returns decoded text of whatever was read.
async function readCappedBody(res) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text()
    return text.slice(0, MAX_HTML_BYTES)
  }
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  try { await reader.cancel() } catch { /* noop */ }
  const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
  return buf.toString('utf8').slice(0, MAX_HTML_BYTES)
}

// Bounded, SSRF-guarded GET that follows up to MAX_REDIRECTS hops manually,
// re-validating each destination. Single overall deadline across all hops.
async function safeGet(initialUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    let url = initialUrl
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Throws on non-HTTPS / unresolvable / private-IP destinations.
      await assertWebhookDestinationSafe(url)
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: controller.signal
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        try { await res.body?.cancel?.() } catch { /* noop */ }
        if (!location) break
        url = new URL(location, url).toString()
        continue
      }
      return res
    }
    throw new Error('too many redirects')
  } finally {
    clearTimeout(timer)
  }
}

// Build the case-sensitive haystack (HTML body + serialized header values) and
// classify it against PLATFORM_SIGNALS. Exported for unit testing without a
// network round-trip.
export function classifyHtml(html, headerText = '') {
  const haystack = `${html}\n${headerText}`
  const gtm_present = haystack.includes(GTM_TOKEN)

  for (const { platform, tokens } of PLATFORM_SIGNALS) {
    const signals = tokens.filter(t => haystack.includes(t))
    if (signals.length > 0) {
      return {
        platform,
        confidence: signals.length >= 2 ? 'high' : 'medium',
        gtm_present,
        signals
      }
    }
  }

  // Fetch succeeded but matched no known platform.
  return { platform: 'custom', confidence: 'low', gtm_present, signals: [] }
}

/**
 * Detect the site platform behind a customer domain. Never throws — any fetch
 * or validation failure resolves to a low-confidence "unknown" with error:true
 * so the route can return it verbatim.
 *
 * @param {string} domain - bare registered hostname (no scheme/path)
 * @returns {Promise<{platform:string,confidence:string,gtm_present:boolean,signals:string[],error?:boolean}>}
 */
export async function detectPlatform(domain) {
  if (!isPlausibleHostname(domain)) return ERROR_RESULT
  try {
    const res = await safeGet(`https://${normalizeHost(domain)}`)
    const html = await readCappedBody(res)
    const headerText = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n')
    return classifyHtml(html, headerText)
  } catch {
    return ERROR_RESULT
  }
}
