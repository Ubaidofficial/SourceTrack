// SourceTrack — AI crawler reporting middleware for Node/Express.
//
// COPY-INSTALLABLE CUSTOMER SURFACE. This is the server-side sibling of the
// tracker snippet and carries the same obligations: it runs inside someone
// else's request path, so it must never add latency, never throw, and never
// collect anything about a person. Treat edits here with tracker-level care.
//
//   import express from 'express'
//   import { createCrawlerMiddleware } from './express-crawler-middleware.js'
//
//   app.use(createCrawlerMiddleware({
//     apiKey:   process.env.SOURCETRACK_API_KEY,   // needs the write:events scope
//     endpoint: 'https://api.srctk.com/api/server/crawler-hit'
//   }))
//
// Ships as a PAIR with api/lib/ai-crawler-detect.js — the detection registry is
// imported, never copied, so a customer install cannot drift from the registry
// the reports are scored against.
//
// ── Why nothing runs in the request path ─────────────────────────────────────
// The middleware calls next() immediately and does all of its work from a
// `finish` listener inside setImmediate() — mirroring the fire-and-forget wiring
// api/index.js already uses for handlePrivacySuppression. Two consequences that
// are deliberate: the customer's response is already flushed before we do
// anything, and res.statusCode is final by then (it is not, at request time).
//
// ── Fail-open, stated as an invariant ────────────────────────────────────────
// Every path is wrapped so that ANY internal error degrades to doing nothing.
// This matches api/lib/bot-filter.js's own stated rule ("any error resolves to
// bot:false so a filter bug can never drop or alter legitimate traffic"): a
// broken middleware must degrade to silence, never to blocking, delaying, or
// crashing a customer request. next() is called from a finally block precisely
// so that no throw above it can strand the request.
//
// ── PII: none, by construction ───────────────────────────────────────────────
// The payload carries the crawler VERDICT and the path — nothing else. No IP
// (an input to verification, never transmitted or stored), no User-Agent, no
// query string, no headers, no cookies, no body. This mirrors the crawler_hits
// datasource, which has no raw-IP and no visitor-id column and therefore sits
// outside the three GDPR paths (§6.5). Do not add a field here without checking
// that decision still holds — a single subject-linkable field would move this
// table INTO all three GDPR paths.

import { detectAiCrawler } from '../api/lib/ai-crawler-detect.js'

// Bound so a pathological URL cannot produce an unbounded payload.
const MAX_PATH_LENGTH = 512

/**
 * Path only — query string and fragment stripped before the value ever leaves
 * the customer's process. Query strings routinely carry UTMs, session tokens
 * and email addresses; none of that belongs in a bot-fetch record.
 */
export function safePath(originalUrl) {
  const raw = String(originalUrl || '/')
  const cut = raw.split('?')[0].split('#')[0]
  return (cut || '/').slice(0, MAX_PATH_LENGTH)
}

/**
 * Best-effort client IP for stage-2 verification. Used LOCALLY only — it is
 * passed to detectAiCrawler() and then discarded; it is never put in the
 * payload. Kept small on purpose: this runs on the customer's infrastructure,
 * where their proxy layer is unknown to us.
 */
export function clientIpFrom(req) {
  const forwarded = req?.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // Left-most entry is the origin client in the standard XFF ordering.
    return forwarded.split(',')[0].trim()
  }
  return req?.ip || req?.socket?.remoteAddress || null
}

/**
 * Build the wire payload from a detection result. Pure + exported so the
 * "no PII" guarantee is directly testable rather than asserted in a comment.
 */
export function buildPayload({ hit, path, statusCode, collectionSource }) {
  return {
    bot_name: hit.name,
    operator: hit.operator,
    category: hit.category,
    // Passed through verbatim. `ua_only` must never be upgraded to a verified
    // value in transit — the server stores exactly what was determined here.
    verification: hit.verification,
    path,
    status_code: Number(statusCode) || 0,
    collection_source: collectionSource,
    timestamp: new Date().toISOString()
  }
}

/**
 * @param {object}  options
 * @param {string}  options.apiKey    SourceTrack API key (write:events scope).
 * @param {string}  options.endpoint  Absolute URL of the crawler-hit ingest route.
 * @param {Map<string,string[]>} [options.ranges]
 *        token -> CIDR[]. When absent, stage-2 IP verification cannot run and
 *        every hit is reported `ua_only` — the honest verdict, never an
 *        optimistic one. See the PR body on distributing ranges to customer
 *        installs.
 * @param {Function} [options.fetchImpl]        injectable for tests.
 * @param {string}   [options.collectionSource] crawler_hits.collection_source.
 * @param {Function} [options.onError]          observability hook; never rethrown.
 */
export function createCrawlerMiddleware(options = {}) {
  const {
    apiKey,
    endpoint,
    ranges = null,
    fetchImpl = (...args) => fetch(...args),
    collectionSource = 'server_api',
    onError = null
  } = options

  // Misconfiguration is fail-open too: a middleware without credentials returns
  // a pass-through rather than throwing at app boot. A customer must never find
  // that adding observability took their site down.
  const configured = Boolean(apiKey && endpoint)
  if (!configured && typeof console !== 'undefined') {
    console.warn('[sourcetrack-crawler] apiKey and endpoint are required — middleware installed as a no-op')
  }

  async function report(req, statusCode) {
    const hit = detectAiCrawler(req?.headers?.['user-agent'] || '', {
      ip: clientIpFrom(req),
      ranges
    })
    // Not a crawler we track. Not the same as "human" — that judgement belongs
    // to bot-filter.js — so we simply record nothing.
    if (!hit) return

    const payload = buildPayload({
      hit,
      path: safePath(req?.originalUrl || req?.url),
      statusCode,
      collectionSource
    })

    await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    })
  }

  return function sourcetrackCrawler(req, res, next) {
    try {
      if (configured && typeof res?.once === 'function') {
        res.once('finish', () => {
          // setImmediate: yield the event loop back before doing any work, so
          // reporting can never sit between the customer's handler and their
          // response. `.catch()` swallows deliberately — a reporting failure is
          // not the customer's problem and must not surface in their logs as an
          // unhandled rejection.
          setImmediate(() => {
            report(req, res.statusCode).catch((err) => {
              try { if (onError) onError(err) } catch (_) { /* fail-open */ }
            })
          })
        })
      }
    } catch (err) {
      // Attaching the listener failed. Report it if asked, then carry on — the
      // request proceeds exactly as if this middleware were not installed.
      try { if (onError) onError(err) } catch (_) { /* fail-open */ }
    } finally {
      // ALWAYS. No branch above may strand the request.
      next()
    }
  }
}

export default createCrawlerMiddleware
