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
  '/api/identify',
  // Health check path — must be in allowlist so it reaches the pending-safe
  // handler at line ~98 even when the gate's ALLOWED_PATHS check runs first.
  '/.well-known/sourcetrack/proxy-health'
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

    // 2. Determine if this request is a verified proxy request via Bunny CDN
    const proxySecret = process.env.ST_PROXY_SECRET
    const expectedPullZoneId = process.env.BUNNY_PULL_ZONE_ID
    const matchesPullZone = !expectedPullZoneId || req.headers['cdn-pullzoneid'] === expectedPullZoneId
    const isProxyRequest = proxySecret && req.headers['x-st-proxy-secret'] === proxySecret && matchesPullZone

    let hostname
    if (isProxyRequest && req.headers['cdn-host']) {
      const cdnHost = req.headers['cdn-host'].trim().toLowerCase()
      hostname = cdnHost.split(':')[0]
    } else {
      hostname = hostHeader.split(':')[0].trim().toLowerCase()
    }

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

    // 5. Handle pending-safe health check path first (accessible regardless of status).
    //
    // ⚠️ THIS RESPONSE DELIBERATELY OMITS `origin: true`, AND THAT IS THE WHOLE POINT.
    // verifySslAndRouting() now requires `origin === true`, which is set ONLY by the
    // real origin handler that sits BEHIND this gate (api/index.js). So this reply is
    // structurally INCAPABLE of passing verification — the gate cannot certify itself.
    //
    // Before this change it returned the exact shape the verifier asserted, so a 200
    // here proved the gate was up and nothing more: the check never reached the origin
    // or its static files, and #648 recorded that as its one real gap. Making the gate
    // unable to produce a passing body is stronger than trusting it not to.
    //
    // The path stays pending-safe (answered regardless of status) because a domain
    // still provisioning DNS/SSL must be reachable for the pending loop — the caller
    // just learns "gate up, origin unproven", which is the honest answer.
    //
    // ⚠️ DO NOT "FIX" THE SHAPE MISMATCH BY ADDING origin:true HERE. That would restore
    // the exact defect. If a future check needs a gate-level probe, give it its own
    // path and its own assertion.
    if (req.path === '/.well-known/sourcetrack/proxy-health') {
      return res
        .set('Cache-Control', 'no-store, no-cache, must-revalidate')
        .set('Pragma', 'no-cache')
        .json({ ok: true, service: 'sourcetrack-proxy', gate: true })
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
