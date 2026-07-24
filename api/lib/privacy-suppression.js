import NodeCache from 'node-cache'
import { getSupabase } from './supabase.js'

export const trackerSiteCache = new NodeCache({ stdTTL: 300 })

export async function handlePrivacySuppression(req) {
  try {
    const secGpc = req.headers['sec-gpc']
    const dnt = req.headers['dnt']
    const isSuppressed = secGpc === '1' || dnt === '1'

    if (!isSuppressed) {
      if (process.env.NODE_ENV === 'test') {
        console.log('[privacy-suppression] skipped reason=no_signal')
      }
      return
    }

    const referer = req.headers.referer
    if (!referer) {
      console.warn('[privacy-suppression] skipped reason=no_referer')
      return
    }

    let urlObj
    try {
      urlObj = new URL(referer)
    } catch (_) {
      console.warn(`[privacy-suppression] skipped reason=invalid_referer referer=${referer}`)
      return
    }

    const hostname = urlObj.hostname.toLowerCase()          // e.g. "www.techrupt.pk"
    const stripped = hostname.replace(/^www\./i, '')        // "techrupt.pk"

    // Cache by the EXACT hostname (not the stripped form) so www.X and X resolve independently — a
    // shared stripped key would defeat the exact-match preference below on a cache hit.
    let site = trackerSiteCache.get(hostname)
    if (site === undefined) {
      const supabase = getSupabase()
      // Match either stored form (bare or www-prefixed). NB: the incoming hostname is always one of
      // these two, so no third clause is needed.
      const { data, error } = await supabase
        .from('sites')
        .select('id, domain, created_at')
        .or(`domain.eq.${stripped},domain.eq.www.${stripped}`)

      if (error || !data || data.length === 0) {
        trackerSiteCache.set(hostname, null)
        site = null
      } else {
        // DETERMINISTIC pick — never index [0] off an unordered .or(). Postgres returns matching rows
        // in arbitrary order, and prod carries duplicate www/bare rows for one domain (techrupt.pk had
        // two). The EXACT hostname the visitor came from wins; otherwise the OLDEST row (created_at
        // asc) is a stable tie-break. Attributing a GPC/DNT signal to the wrong site is silently wrong.
        const exact = data.find((s) => (s.domain || '').toLowerCase() === hostname)
        const oldest = [...data].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0]
        site = exact || oldest
        // Surface the ambiguity — do NOT resolve it silently.
        if (data.length > 1) {
          console.warn(`[privacy-suppression] AMBIGUOUS domain=${hostname} matched ${data.length} sites: ${data.map((s) => s.id).join(',')} — chose ${site.id}`)
        }
        trackerSiteCache.set(hostname, site)
      }
    }

    if (!site || !site.id) {
      console.warn(`[privacy-suppression] skipped reason=site_not_found domain=${hostname}`)
      return
    }

    const reason = secGpc === '1' ? 'gpc' : 'dnt'

    // Coarse hour bucket
    const now = new Date()
    now.setMinutes(0, 0, 0, 0)

    const host = process.env.TINYBIRD_HOST
    const token = process.env.TINYBIRD_APPEND_TOKEN

    if (!host || !token) {
      console.error('[privacy-suppression] skipped reason=missing_env')
      return
    }

    const url = `${host.replace(/\/$/, '')}/v0/events?name=privacy_signals`
    const payload = JSON.stringify({
      site_id: site.id,
      reason,
      timestamp: now.toISOString()
    }) + '\n'

    // Direct fire-and-forget POST to Tinybird Events API
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: payload
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Tinybird Events API responded ${res.status}: ${text}`)
    }

    console.log(`[privacy-suppression] written site_id=${site.id} reason=${reason}`)
  } catch (err) {
    // Fail silently to client, but log error loudly to server console
    console.error('[privacy-suppression] failed:', err.message)
  }
}
