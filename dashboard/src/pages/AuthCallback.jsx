import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getAuthAppRole } from '../utils/authRole'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [error, setError] = useState(null)
  const [isTimeout, setIsTimeout] = useState(false)

  // Bounded wait: give Supabase JS up to 5 seconds to exchange OAuth tokens
  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''

    // Check if URL indicates an incoming auth flow
    const hasAuthTokens = search.includes('code=') ||
                          hash.includes('access_token=') ||
                          hash.includes('type=recovery') ||
                          search.includes('type=recovery')

    if (!hasAuthTokens) {
      // If no tokens, don't artificially wait
      setIsTimeout(true)
      return
    }

    const timer = setTimeout(() => {
      setIsTimeout(true)
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''

    // Check for explicit provider errors returned by Supabase or Google
    const urlParams = new URLSearchParams(search)
    const hashParams = new URLSearchParams(hash.replace(/^#/, '?'))
    const errorMsg = urlParams.get('error_description') ||
                     urlParams.get('error') ||
                     hashParams.get('error_description') ||
                     hashParams.get('error')

    if (errorMsg) {
      setError(decodeURIComponent(errorMsg.replace(/\+/g, ' ')))
      const timer = setTimeout(() => navigate('/login', { replace: true }), 3000)
      return () => clearTimeout(timer)
    }

    const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery')

    // If session establishes successfully, route to appropriate location
    if (user) {
      if (isRecovery) {
        navigate('/reset-password', { replace: true })
      } else {
        const metaRole = getAuthAppRole(user)
        if (metaRole === 'super_admin') {
          navigate('/ops', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      }
      return
    }

    // Only fail out if we have exhausted both the AuthContext load AND the 5-second bounded wait
    if (!loading && isTimeout) {
      if (isRecovery) {
        // Recovery expects the exact query string so the page can show the fallback UI
        navigate(`/reset-password${search}${hash}`, { replace: true })
      } else {
        // No session established and timeout reached, safely abort to login
        navigate('/login', { replace: true })
      }
    }
  }, [user, loading, isTimeout, navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0E1513]">
      <Helmet>
        <title>Signing in | SourceTrack</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {error ? (
        <div className="text-red-400 mt-4 max-w-sm text-center">
          Authentication failed: {error}
        </div>
      ) : (
        <div className="h-8 w-8 rounded-full border-2 border-[#CCF03F] border-t-transparent animate-spin" />
      )}
    </div>
  )
}
