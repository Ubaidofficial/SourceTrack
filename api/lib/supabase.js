/**
 * Singleton Supabase client.
 *
 * Before this module existed, every route file declared its own
 * `getSupabase()` factory that called `createClient(...)` per request.
 * That produced 35 different client instances (one per call site) and
 * built a new WebSocket transport on every HTTP request — wasteful and
 * harder to instrument.
 *
 * This module exposes a single shared client. Callers use:
 *
 *     import { getSupabase } from '../lib/supabase.js'
 *     const supabase = getSupabase()
 *
 * The `getSupabase()` accessor (vs. an exported `supabase` const) is
 * deliberate: it keeps the call sites identical to the legacy pattern
 * so the refactor is a one-line import swap, and it lets us defer
 * client construction until env vars are loaded (so this module can be
 * imported safely from job scripts that call `dotenv.config()` first).
 *
 * The client uses the service_role key — backend-only, never bundle
 * this into the frontend.
 */
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

let _client = null

export function getSupabase() {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error('[supabase] SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
    global: { fetch }
  })

  return _client
}

// Convenience default export so legacy `import supabase from '../lib/supabase.js'`
// patterns work too. Most call sites should use the named getSupabase() export.
export default { getSupabase }
