import { supabase } from '../lib/supabase.js'

export async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key
  if (!key) return res.status(401).json({ error: 'Missing API key' })

  const { data: site } = await supabase
    .from('sites')
    .select('id, user_id, site_key')
    .eq('api_key', key)
    .single()

  if (!site) return res.status(401).json({ error: 'Invalid API key' })
  req.site = site
  next()
}
