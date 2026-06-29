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

// Deindex non-canonical hosts. Railway's public *.up.railway.app URLs (production
// + staging) and any configured staging host serve the app for healthchecks /
// preview, but must NOT be indexed — they compete with www./app.sourcetrack.ai in
// search. Only the two canonical hosts stay indexable. X-Robots-Tag is the
// authoritative signal here: it applies to every response (not just HTML), beats
// the index.html <meta robots>, and actively *removes* already-indexed URLs —
// unlike a robots.txt Disallow, which would block the very crawl Google needs to
// see the noindex. The Railway healthcheck still gets a normal 200.
app.use((req, res, next) => {
  const host = req.headers.host || ''
  const isCanonical = host === CANONICAL_HOST || host === APP_HOST
  if (!isCanonical) {
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
