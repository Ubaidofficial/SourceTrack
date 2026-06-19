import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [error, setError] = useState(null)

  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery')
    const hasCode = new URLSearchParams(search).get('code')
    const hasAccessToken = hash.includes('access_token=')

    // If there is a code, Supabase needs time to exchange it automatically,
    // or we can explicitly exchange it here to be safe.
    if (hasCode) {
      const code = new URLSearchParams(search).get('code')
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError(error.message)
          setTimeout(() => navigate('/login', { replace: true }), 3000)
          return
        }

        if (isRecovery) {
          navigate('/reset-password', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
      return
    }

    // If we have an access token, wait for Supabase to parse it
    if (hasAccessToken) {
      if (isRecovery) {
        navigate(`/reset-password${search}${hash}`, { replace: true })
      } else if (user) {
        navigate('/dashboard', { replace: true })
      }
      return
    }

    // Regular flow (no URL tokens)
    if (loading) return

    if (user) {
      if (isRecovery) {
        navigate('/reset-password', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }
    } else {
      if (isRecovery) {
        navigate(`/reset-password${search}${hash}`, { replace: true })
      } else {
        // No session, no tokens, go to login
        navigate('/login', { replace: true })
      }
    }
  }, [user, loading, navigate])

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
