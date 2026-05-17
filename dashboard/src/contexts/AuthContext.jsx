import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch role when user changes
  useEffect(() => {
    if (!user) {
      setRole(null)
      return
    }

    // Check for super_admin in raw_app_meta_data
    const metaRole = user.raw_app_meta_data?.role
    if (metaRole === 'super_admin') {
      setRole('super_admin')
      return
    }

    // Look up workspace membership role
    supabase
      .from('company_members')
      .select('role, company_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setRole(data?.role || null)
      })
      .catch(() => {
        setRole(null)
      })
  }, [user])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

