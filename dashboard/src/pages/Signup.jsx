import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LogoMark } from '../components/Logo'

// Common disposable email providers — see api/lib/abuse-guards.js for the full
// list. Kept inline here so the signup form can validate before hitting the
// network. The Supabase trigger is the bulletproof backstop.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com','10minutemail.net','mailinator.com','tempmail.com',
  'temp-mail.org','temp-mail.io','guerrillamail.com','guerrillamail.net',
  'sharklasers.com','grr.la','getnada.com','throwawaymail.com','yopmail.com',
  'maildrop.cc','dispostable.com','fakeinbox.com','tempinbox.com','mintemail.com',
  'mailnesia.com','emailondeck.com','mailcatch.com','spambox.us','mohmal.com',
  'trashmail.com','trashmail.net','tempr.email','spam4.me','tempmailo.com',
  'minuteinbox.com','tempemail.com','tempemail.net','discard.email','mt2015.com',
])
function isDisposableEmail(email) {
  const at = (email || '').lastIndexOf('@')
  if (at === -1) return false
  return DISPOSABLE_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase().trim())
}

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    // Anti-abuse: block ~35 common disposable email providers before hitting
    // Supabase. The DB trigger (enforce_free_tier_abuse_guards) is the
    // bulletproof backstop — this is the UX-friendly early check.
    if (isDisposableEmail(email)) {
      setError('Disposable email addresses are not allowed. Please use a real work or personal email.')
      return
    }
    setLoading(true)
    try {
      const redirectUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin
      await signUp(email, password, {
        emailRedirectTo: `${redirectUrl}/auth/callback`
      })

      // If Supabase requires email confirmation there's no session yet — tell
      // the user instead of routing them straight to onboarding.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setMessage('Account created. Check your email to confirm your account, then sign in to continue setup.')
        return
      }

      // ProtectedRoute / /onboarding/me decides whether to redirect to onboarding
      // or dashboard — no need to query Supabase directly here.
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setError('')
    try {
      const redirectUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${redirectUrl}/auth/callback`
        }
      })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F4F4] dark:bg-[#2B302F] px-4">
      <Helmet>
        <title>Start free with SourceTrack | SourceTrack</title>
        <meta name="description" content="Create a free SourceTrack account and start tracking attribution across 9 models in under 3 minutes." />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href="https://app.sourcetrack.ai/signup" />
      </Helmet>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-[-0.06em] text-[#1F2323] dark:text-dark-primary">SourceTrack</h1>
          <p className="text-st-gray dark:text-gray-400 mt-2">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1A1F1F] shadow-[0_18px_50px_rgba(31,35,35,0.10)] border border-[#DDE4E4] dark:border-white/10 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 text-sm p-3 rounded">{error}</div>
          )}
          {message && (
            <div className="bg-green-50 dark:bg-green-900/20 text-green-600 text-sm p-3 rounded">{message}</div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="w-full py-2.5 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign up with Google
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white dark:bg-[#1A1F1F] px-2 text-st-gray">or</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#252A29] text-[#1F2323] dark:text-dark-primary border border-gray-300 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-st-lime focus:border-st-lime outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#252A29] text-[#1F2323] dark:text-dark-primary border border-gray-300 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-st-lime focus:border-st-lime outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-st-gray">
            Already have an account? <Link to="/login" className="text-st-black dark:text-dark-primary hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
