// Shared bot-filter module.
//
// Consolidates the crawler UA regex that was duplicated byte-for-byte in
// api/routes/track.js and api/routes/analytics.js into a single source of
// truth, and adds an EXPANDED, privacy-safe heuristic used in LOG-ONLY mode
// by the browser-facing event routes (track / conversion / pixel).
//
// Invariants (non-negotiable — see CLAUDE.md §6, §6.5):
//   • Server-side only, reads request HEADERS only. No fingerprinting.
//   • Stores nothing (no DB, no IP, no raw headers). The only side effect is a
//     console log carrying a COARSE, non-reversible UA hash + reason + route.
//   • Fail-open: any error resolves to { bot: false } so a filter bug can never
//     drop or alter legitimate traffic.
//
// Layering of signals (checked in order by isBotRequest):
//   ua_empty    — no User-Agent            (already DROPPED today in track/collect)
//   ua_pattern  — matches BOT_UA_PATTERN   (already DROPPED today in track/collect)
//   ua_extra    — matches EXTRA_UA_PATTERN (NEW — unvalidated, log-only)
//   header_shape— browser-like UA missing the headers a real browser sends
//                 (NEW — unvalidated, log-only)

import { createHash } from 'crypto'

// Crawler pattern — kept BYTE-IDENTICAL to the copy that previously lived in
// track.js:18 and analytics.js:23 so the UA drop layer is a pure refactor.
// Do not reorder/edit tokens without re-verifying both dropping routes.
export const BOT_UA_PATTERN = /bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|bingpreview|googleweblight|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|wget|curl\/|python-requests|axios\/|go-http|java\/|ruby\/|php\/|google-extended|headless/i

// EXPANDED tokens the production pattern misses (scrapers, HTTP libraries,
// scanners). UNVALIDATED against real traffic — this is exactly why the wiring
// is log-only. Tokens already covered by BOT_UA_PATTERN are intentionally
// omitted (that check runs first).
const EXTRA_UA_PATTERN = /scrapy|httpclient|okhttp|node-fetch|libwww|lwp::|winhttp|zgrab|masscan|nuclei|nikto|semrush|ahrefs|mj12|dotbot|petalbot|dataforseo|ia_archiver|feedfetcher|apache-httpclient|guzzlehttp|urllib|aiohttp|scrapbot|serpstat/i

// Reasons that are NEW (not already dropped today). Only these get logged by
// the browser-facing wiring — the ua_empty / ua_pattern drops are unchanged.
const NEW_BOT_SIGNALS = new Set(['ua_extra', 'header_shape'])

// UA-layer check — the exact drop condition the two existing routes use
// (`!ua || BOT_UA_PATTERN.test(ua)`). Kept here so the refactor of track.js and
// analytics.js is behavior-identical.
export function isBotUserAgent(ua) {
  return !ua || BOT_UA_PATTERN.test(ua)
}

// ── INGESTION bot filter (incident 2026-07-14) ────────────────────────────────────────────────
// BOT_UA_PATTERN above is the REPORTING filter; applying it at INGESTION deleted real humans. The
// correct axis at ingestion is NOT "crawler vs human" — it is "DOES THE AGENT EXECUTE JAVASCRIPT?",
// because only a JS-executing client runs the tracker and POSTs to /api/track:
//   • No-JS LINK-PREVIEW crawlers (the WhatsApp/Telegram/Facebook link-unfurlers, generic bot/crawl/
//     spider) never run the tracker → they never legitimately arrive. Their tokens (`whatsapp`,
//     `telegrambot`, …) ALSO appear in the UA of a REAL HUMAN inside the WhatsApp/Telegram in-app
//     WebView. So these tokens must NOT gate ingestion — keeping them DELETES human events (200,
//     gone forever, no PostHog fallback). Systematic loss on a WhatsApp-dominant .pk site.
//   • JS-RENDERING BOTS — Googlebot (Web Rendering Service, evergreen Chromium), Bingbot, Applebot —
//     DO render pages and DO hit /api/track. They MUST still drop at ingestion, or their renders
//     land in `events` as fake visitors and pollute visitor/session/top-page counts. (This is the
//     error the "crawlers don't run JS" heuristic caused; do not reason that way.)
//   • Headless browsers / automation frameworks / non-browser HTTP libraries (curl/wget/python/
//     selenium/…) execute against /api/track but are never a human → drop.
// Net: ingestion drops JS-rendering search bots + automation + HTTP libraries, and lets EVERY real
// browser and in-app WebView through. §6/§6.5: an ingestion drop is irreversible. The invariant
// (JS-rendering bots DROPPED, every in-app WebView PASSES) is asserted in
// api/tests/bot-filter-ingestion.test.js. The strict reporting filter (BOT_UA_PATTERN /
// isBotUserAgent) is UNCHANGED, so analytics reads still exclude all crawlers.
export const INGESTION_BOT_UA_PATTERN = /googlebot|bingbot|applebot|headlesschrome|\bheadless\b|phantomjs|selenium|puppeteer|playwright|webdriver|\bwget\b|curl\/|python-requests|python-urllib|\burllib\b|aiohttp|\bhttpx\b|axios\/|node-fetch|go-http|okhttp|java\/|libwww|lwp::|scrapy|guzzlehttp|apache-httpclient|winhttp|zgrab|masscan|nuclei|nikto|\bpostman\b|insomnia\/|dataforseo/i

// UA-layer INGESTION check. Empty UA is kept as a drop (a real browser/WebView always sends one; an
// empty UA is a script, never a human page load). Everything else that isn't a JS-rendering bot,
// automation, or a non-browser HTTP client is LET IN.
export function isIngestionBotUserAgent (ua) {
  return !ua || INGESTION_BOT_UA_PATTERN.test(ua)
}

// A real browser UA starts with "Mozilla/". Scripted clients that spoof a
// browser copy this too — which is why header_shape (below) needs a second
// signal to separate them.
function isBrowserLikeUA(ua) {
  return /^mozilla\//i.test(ua)
}

// Header-shape heuristic (UNVALIDATED — log-only). Real browsers send Accept
// and Accept-Language on navigations, fetch/beacon, and image (pixel) loads;
// the browser controls Accept-Language and always attaches it. A browser-like
// UA arriving with NEITHER header is a strong scripted/headless signal.
// Threshold is deliberately conservative (both missing) to hold down false
// positives while we measure. Reads headers only.
function hasSuspiciousHeaderShape(headers) {
  const hasAccept = !!headers['accept']
  const hasAcceptLang = !!headers['accept-language']
  return !hasAccept && !hasAcceptLang
}

// Full request classification. Returns { bot, reason }. Fail-open on any error.
export function isBotRequest(req) {
  try {
    const headers = req?.headers || {}
    const ua = headers['user-agent'] || ''

    if (!ua) return { bot: true, reason: 'ua_empty' }
    if (BOT_UA_PATTERN.test(ua)) return { bot: true, reason: 'ua_pattern' }
    if (EXTRA_UA_PATTERN.test(ua)) return { bot: true, reason: 'ua_extra' }
    if (isBrowserLikeUA(ua) && hasSuspiciousHeaderShape(headers)) {
      return { bot: true, reason: 'header_shape' }
    }
    return { bot: false, reason: null }
  } catch (_) {
    return { bot: false, reason: null }
  }
}

// Coarse, non-reversible bucket for a UA string — 48 bits of SHA-256. Enough to
// group repeated offenders in logs; not enough to reconstruct the UA. Never log
// the raw UA (or IP / headers) — only this.
export function coarseUaHash(ua) {
  try {
    return createHash('sha256').update(String(ua || '')).digest('hex').slice(0, 12)
  } catch (_) {
    return 'na'
  }
}

// LOG-ONLY wiring helper for the browser-facing routes. Classifies the request
// and, when the EXPANDED heuristic (and only the expanded heuristic) would have
// flagged it, emits one structured line so we can measure the would-drop volume
// before ever enabling a drop. Never drops; always returns the classification.
export function logWouldDropBot(route, req) {
  try {
    const result = isBotRequest(req)
    if (result.bot && NEW_BOT_SIGNALS.has(result.reason)) {
      const ua = req?.headers?.['user-agent'] || ''
      console.log('[bot-filter][would-drop] ' + JSON.stringify({
        route,
        reason: result.reason,
        ua_hash: coarseUaHash(ua)
      }))
    }
    return result
  } catch (_) {
    return { bot: false, reason: null }
  }
}
