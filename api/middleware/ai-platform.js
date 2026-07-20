import { detectAiPlatformFromReferrer, AI_UTM_SOURCES_MAP, resolveAiSource } from '../lib/channel-classifier.js'

// AI-platform detection for the ingest path. Single source of truth is
// api/lib/channel-classifier.js (CLAUDE.md §11) — this middleware imports its maps + helpers and
// MUST NOT redefine them. The two path-based referrer cases (bing.com/chat -> Copilot,
// x.com/i/grok -> Grok) live in detectAiPlatformFromReferrer, so ingest and read emit one
// canonical string per source. (Previously a divergent AI_HOST_MAP + title-cased UTM path; KI-32.)
export function detectAIPlatform(req, _res, next) {
  try {
    const referer = req.headers.referer || req.headers.referrer
    const fromRef = detectAiPlatformFromReferrer(referer)
    if (fromRef) { req.ai_source = fromRef; return next() }

    const utmSource = String(
      req.body?.utm_source || req.query?.utm_source || ''
    ).toLowerCase().trim()
    if (utmSource && AI_UTM_SOURCES_MAP[utmSource]) {
      req.ai_source = AI_UTM_SOURCES_MAP[utmSource]
      return next()
    }

    // Explicit body value: canonicalize, reject-unknown. Never trust an arbitrary caller value —
    // verbatim acceptance here was the origin of the 'chatgpt.com'/'Chatgpt' junk rows and let any
    // site_key holder write arbitrary ai_source (§6.5 ingest-integrity boundary; KI-32).
    req.ai_source = resolveAiSource(req.body?.ai_source)
  } catch (_err) {
    req.ai_source = null
  }
  next()
}
