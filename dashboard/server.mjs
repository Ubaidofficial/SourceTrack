import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, 'dist')
const PORT = process.env.PORT || 3000
const CANONICAL_HOST = 'www.sourcetrack.ai'
const APP_HOST = 'app.sourcetrack.ai'
const STAGING_HOSTS = (process.env.STAGING_HOSTS || '')
  .split(',')
  .map(h => h.trim())
  .filter(Boolean)

const app = express()

// www ↔ non-www canonical redirect — always serve from CANONICAL_HOST
// Exempt Railway's internal healthcheck hostname so deploys don't fail
app.use((req, res, next) => {
  const host = req.headers.host || ''
  const isInternal = host.startsWith('localhost') ||
                     host.startsWith('127.') ||
                     host.endsWith('.railway.app')
  const isStaging = STAGING_HOSTS.includes(host)
  const isValidHost = host === CANONICAL_HOST || host === APP_HOST || isInternal || isStaging
  if (host && !isValidHost) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.url}`)
  }
  next()
})

// Per-host indexing policy via X-Robots-Tag (authoritative: applies to every
// response, beats the index.html <meta robots>, and actively *removes* already-
// indexed URLs — unlike a robots.txt Disallow, which would block the crawl Google
// needs to even see the noindex). Railway healthchecks still get a normal 200.
//   - www.sourcetrack.ai  → marketing, fully indexable (no header).
//   - app.sourcetrack.ai  → noindex EVERYTHING except the public auth entry
//     points /login and /signup (their canonical is app.sourcetrack.ai/...).
//   - Railway *.up.railway.app (prod + staging) + any other host → noindex all;
//     they must not compete with the canonical domains in search.
const INDEXABLE_APP_PATHS = new Set(['/login', '/signup'])
app.use((req, res, next) => {
  const host = req.headers.host || ''
  if (host === CANONICAL_HOST) {
    // marketing — fully indexable
  } else if (host === APP_HOST) {
    if (!INDEXABLE_APP_PATHS.has(req.path)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    }
  } else {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  }
  next()
})

// Explicit XML / text routes so content-type is never ambiguous
app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.sendFile(join(DIST, 'sitemap.xml'))
})

app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.sendFile(join(DIST, 'robots.txt'))
})

// Static assets (sets correct Content-Type for .png, .ico, .svg, .js, .css …)
app.use(express.static(DIST, {
  index: false,          // don't serve index.html here — let the catch-all do it
  maxAge: '7d',          // cache static assets for 7 days
  setHeaders(res, path) {
    // Don't cache HTML or XML — always fresh
    if (path.endsWith('.html') || path.endsWith('.xml') || path.endsWith('.txt')) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  }
}))

// SPA catch-all — React Router handles all unknown paths
app.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(join(DIST, 'index.html'))
})

app.listen(PORT, () => process.stdout.write(`Dashboard on port ${PORT}\n`))
