import NodeCache from 'node-cache'
import { getSupabase } from '../lib/supabase.js'

// In-memory host configuration cache — 5 min TTL.
// Eliminates DB lookups on every tracking event routed through custom domains.
export const proxyCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

/**
 * Invalidates the cached proxy domain configuration.
 * 
 * @param {string} domain 
 */
export function invalidateProxyCache(domain) {
  if (domain && typeof domain === 'string') {
    const clean = domain.trim().toLowerCase()
    proxyCache.del(clean)
  }
}

// Strict allowlist of paths accessible through the managed proxy custom domains.
const ALLOWED_PATHS = new Set([
  '/tracker.min.js',
  '/tracker.cookieless.min.js',
  '/api/track',
  '/api/collect',
  '/track',
  '/api/conversion',
  '/api/tracker/id',
  '/api/identify'
])

/**
 * Stage 1: Early Managed Proxy Gate Middleware
 * Mount at the very top of the Express app, before body-parsing or rate-limiters.
 */
export async function managedProxyEarlyGate(req, res, next) {
  try {
    const hostHeader = req.headers.host || ''

    // 1. Guard against malformed headers, multiple host values, or HTTP header injection attempts
    if (
      hostHeader.includes(' ') || 
      hostHeader.includes('\r') || 
      hostHeader.includes('\n') || 
      hostHeader.includes(',')
    ) {
      return res.status(400).json({ error: 'Malformed Host header' })
    }

    // 2. Normalize host and strip port
    const hostname = hostHeader.split(':')[0].trim().toLowerCase()
    if (!hostname) {
      return res.status(400).json({ error: 'Missing Host header' })
    }

    // 3. Platform Hosts check (comma-separated env list or standard local/prod defaults)
    const platformHostsEnv = process.env.ST_PLATFORM_HOSTS || 'api.sourcetrack.io,localhost,127.0.0.1'
    const platformHosts = new Set(
      platformHostsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    )

    if (platformHosts.has(hostname)) {
      return next() // Skip managed proxy checks for standard API/dashboard traffic
    }

    // 4. Resolve domain configuration (Cache-first)
    let record = proxyCache.get(hostname)

    if (record === undefined) {
      // Cache miss: query Supabase service role
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('managed_proxy_domains')
        .select('site_key, domain, status')
        .eq('domain', hostname)
        .maybeSingle()

      if (error || !data) {
        // Cache negative lookup (null) for 1 minute to prevent DB hammer on unconfigured hosts
        proxyCache.set(hostname, null, 60)
        record = null
      } else {
        record = {
          site_key: data.site_key,
          domain: data.domain,
          status: data.status
        }
        proxyCache.set(hostname, record)
      }
    }

    // If host is not a registered custom tracking domain
    if (record === null) {
      return res.status(404).send('Not Found')
    }

    // 5. Handle pending-safe health check path first (accessible regardless of status)
    if (req.path === '/.well-known/sourcetrack/proxy-health') {
      return res.json({ status: 'ok', service: 'sourcetrack-managed-proxy' })
    }

    // 6. Enforce active status
    if (record.status !== 'active') {
      return res.status(403).send('Custom domain inactive or pending DNS configuration')
    }

    // 7. Enforce strict path allowlist boundary
    if (!ALLOWED_PATHS.has(req.path)) {
      return res.status(404).send('Not Found')
    }

    // 8. Attach proxy context and proceed to body parsing / next stages
    req.managedProxy = record
    next()
  } catch (err) {
    console.error('[managedProxyEarlyGate] Error:', err.message)
    return res.status(500).send('Internal server error')
  }
}

/**
 * Stage 2: Managed Proxy Site Key Binding Middleware
 * Mount inside ingestion routes after body-parsing, before rate-limiting and route-handlers.
 */
export function bindManagedProxySiteKey(req, res, next) {
  if (req.managedProxy) {
    const siteKey = req.body?.site_key || req.query?.site_key

    if (siteKey && siteKey !== req.managedProxy.site_key) {
      // Host-site key mismatch blocks traffic
      return res.status(403).json({
        success: false,
        data: null,
        error: 'Host-site key binding violation'
      })
    }
  }
  next()
}
