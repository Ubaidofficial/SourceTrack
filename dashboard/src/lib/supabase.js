import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function getSupabaseProjectRef(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname.split('.')[0] || 'sourcetrack'
  } catch {
    return 'sourcetrack'
  }
}

const supabaseProjectRef = getSupabaseProjectRef(supabaseUrl)
const authStorageKey = `sb-${supabaseProjectRef}-auth-token`

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: authStorageKey,
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
