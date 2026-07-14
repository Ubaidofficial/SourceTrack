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

    const hostname = urlObj.hostname.toLowerCase()
    const domain = hostname.replace(/^www\./i, '')

    let site = trackerSiteCache.get(domain)
    if (site === undefined) {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_key, domain')
        .or(`domain.eq.${domain},domain.eq.www.${domain}`)

      if (error || !data || data.length === 0) {
        trackerSiteCache.set(domain, null)
        site = null
      } else {
        site = data[0]
        trackerSiteCache.set(domain, site)
      }
    }

    if (!site || !site.id) {
      console.warn(`[privacy-suppression] skipped reason=site_not_found domain=${domain}`)
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
