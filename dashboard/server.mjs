import express from 'express'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, 'dist')
const PORT = process.env.PORT || 3000
const CANONICAL_HOST = 'www.sourcetrack.ai'

const app = express()

// www ↔ non-www canonical redirect — always serve from CANONICAL_HOST
app.use((req, res, next) => {
  const host = req.headers.host
  if (host && host !== CANONICAL_HOST && !host.startsWith('localhost') && !host.startsWith('127.')) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.url}`)
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
