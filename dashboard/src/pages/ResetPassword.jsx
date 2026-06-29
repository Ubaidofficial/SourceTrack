import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
import { LogoMark } from '../components/Logo'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let active = true
    let authSubscription = null
    let timerId = null
    let sessionFound = false

    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const hash = window.location.hash || ''

    // 1. If hash parameters exist, wait a moment for Supabase JS client to parse them
    if (hash.includes('access_token=') || hash.includes('type=recovery')) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session && active) {
          sessionFound = true
          setHasSession(true)
          setLoading(false)
          setError('')
          if (authSubscription) {
            authSubscription.unsubscribe()
          }
          if (timerId) {
            clearTimeout(timerId)
          }
        }
      })
      authSubscription = subscription

      // Fallback timeout in case parsing fails
      if (!sessionFound) {
        timerId = setTimeout(() => {
          if (authSubscription) {
            authSubscription.unsubscribe()
          }
          if (active && !sessionFound) {
            setError('This password reset link is invalid or has expired.')
            setLoading(false)
          }
        }, 3000)
      }
    }

    async function handleRecovery() {
      // 2. PKCE code exchange flow
      if (code) {
        try {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeErr) throw exchangeErr
          if (active) {
            sessionFound = true
            setHasSession(true)
            setLoading(false)
            setError('')
          }
        } catch (err) {
          if (active) {
            setError('This password reset link is invalid or has expired.')
            setLoading(false)
          }
        }
        return
      }

      // If we are already handling hash-token recovery, don't check session or throw error
      if (hash.includes('access_token=') || hash.includes('type=recovery')) {
        return
      }

      // 3. Check if session already exists
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          if (active) {
            sessionFound = true
            setHasSession(true)
            setLoading(false)
            setError('')
          }
          return
        }
      } catch (err) {
        // ignore
      }

      // 4. No recovery parameters and no session
      if (active && !sessionFound) {
        setError('No active password reset session found. Please request a new link.')
        setLoading(false)
      }
    }

    handleRecovery()

    return () => {
      active = false
      if (authSubscription) {
        authSubscription.unsubscribe()
      }
      if (timerId) {
        clearTimeout(timerId)
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) throw updateErr
      setSuccess(true)

      // Auto sign out after reset to ensure clean login state with new credentials
      await supabase.auth.signOut()
    } catch (err) {
      setError(err.message || 'An error occurred while updating your password.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F4F4] dark:bg-[#2B302F]">
        <div className="h-8 w-8 rounded-full border-2 border-st-lime border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F4F4] dark:bg-[#2B302F] px-4">
      <Helmet>
        <title>Create a new password | SourceTrack</title>
        <meta name="description" content="Set a new password for your SourceTrack account." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-[-0.06em] text-[#1F2323] dark:text-dark-primary">SourceTrack</h1>
          <p className="text-st-gray dark:text-gray-400 mt-2">Set new password</p>
        </div>

        <div className="bg-white dark:bg-[#1A1F1F] shadow-[0_18px_50px_rgba(31,35,35,0.10)] border border-[#DDE4E4] dark:border-white/10 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 text-sm p-3 rounded">
              {error}
              {!hasSession && (
                <div className="mt-2">
                  <Link to="/forgot-password" className="text-red-700 dark:text-red-400 underline font-semibold text-xs">
                    Request a new reset link &rarr;
                  </Link>
                </div>
              )}
            </div>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 text-green-600 text-sm p-3 rounded">
                Password updated successfully. You can now sign in with your new password.
              </div>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-2.5 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            hasSession && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#252A29] text-[#1F2323] dark:text-dark-primary border border-gray-300 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-st-lime focus:border-st-lime outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#252A29] text-[#1F2323] dark:text-dark-primary border border-gray-300 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-st-lime focus:border-st-lime outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Updating password...' : 'Update password'}
                </button>
              </form>
            )
          )}
        </div>
      </div>
    </div>
  )
}
