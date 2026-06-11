import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { fetchApi } from '../lib/api'
import { useAuth } from './AuthContext'

const SiteContext = createContext(null)

export function SiteProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites] = useState([])
  const [activeSite, setActiveSite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadSites = useCallback(async () => {
    if (authLoading) return

    if (!user) {
      setSites([])
      setActiveSite(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await fetchApi('/sites')
      const sitesList = data?.sites || []
      setSites(sitesList)

      if (sitesList.length > 0) {
        const savedKey = window.localStorage.getItem('sourcetrack_active_site_key')
        const completedSites = sitesList.filter(s => s.onboarding_completed)
        const incompleteSites = sitesList.filter(s => !s.onboarding_completed)

        const savedSite = sitesList.find(s => s.site_key === savedKey)

        const nextActiveSite = (savedSite && savedSite.onboarding_completed)
          ? savedSite
          : (completedSites[0] || incompleteSites[0] || null)

        if (nextActiveSite) {
          setActiveSite(nextActiveSite)
          window.localStorage.setItem('sourcetrack_active_site_key', nextActiveSite.site_key)
        } else {
          setActiveSite(null)
          window.localStorage.removeItem('sourcetrack_active_site_key')
        }
      } else {
        setActiveSite(null)
        window.localStorage.removeItem('sourcetrack_active_site_key')
      }
    } catch (err) {
      console.error('[SiteContext] load failed:', err)
      setError(err?.message || 'Failed to load sites')
      // Fail safely — if API fails, try to read from localStorage if it's there
      const savedKey = window.localStorage.getItem('sourcetrack_active_site_key')
      if (savedKey) {
        setActiveSite({ site_key: savedKey })
      } else {
        setActiveSite(null)
      }
    } finally {
      setLoading(false)
    }
  }, [user, authLoading])

  useEffect(() => {
    loadSites()
  }, [loadSites])

  const setActiveSiteKey = useCallback((siteKey) => {
    const matched = sites.find(s => s.site_key === siteKey)
    if (matched) {
      setActiveSite(matched)
      window.localStorage.setItem('sourcetrack_active_site_key', siteKey)
    } else if (!siteKey) {
      setActiveSite(null)
      window.localStorage.removeItem('sourcetrack_active_site_key')
    }
  }, [sites])

  const activeSiteKey = activeSite?.site_key || null

  return (
    <SiteContext.Provider value={{ sites, activeSite, activeSiteKey, setActiveSiteKey, loading, error, refetch: loadSites }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const context = useContext(SiteContext)
  if (!context) {
    throw new Error('useSite must be used within a SiteProvider')
  }
  return context
}
