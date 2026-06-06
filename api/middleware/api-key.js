import crypto from 'crypto'
import { getSupabase } from '../lib/supabase.js'

export async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key
  if (!key) return res.status(401).json({ error: 'Missing API key' })

  try {
    const supabase = getSupabase()
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    // 1. Try to look up by the SHA-256 key hash
    let { data: site } = await supabase
      .from('sites')
      .select('id, owner_id, site_key')
      .eq('api_key_hash', keyHash)
      .maybeSingle()

    // 2. Backward compatibility fallback: look up by raw plaintext api_key
    if (!site) {
      const { data: fallbackSite } = await supabase
        .from('sites')
        .select('id, owner_id, site_key')
        .eq('api_key', key)
        .maybeSingle()
      site = fallbackSite
    }

    if (!site) return res.status(401).json({ error: 'Invalid API key' })

    req.site = site
    next()
  } catch (err) {
    console.error('[requireApiKey] auth check failed:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
