import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
import { LogoMark } from '../components/Logo'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://app.sourcetrack.ai/reset-password'
      })
      if (resetErr) throw resetErr
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'An error occurred while requesting password reset.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F4ED] dark:bg-[#1B1811] px-4">
      <Helmet>
        <title>Reset your password | SourceTrack</title>
        <meta name="description" content="Request a password reset link for your SourceTrack account." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-[-0.06em] text-[#12100C] dark:text-dark-primary">SourceTrack</h1>
          <p className="text-st-gray dark:text-gray-400 mt-2">Reset your password</p>
        </div>

        <div className="bg-white dark:bg-[#1B1811] shadow-[0_18px_50px_rgba(18,16,12,0.10)] border border-[#E7E0D2] dark:border-white/10 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 text-sm p-3 rounded">{error}</div>
          )}

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 text-green-600 text-sm p-3 rounded">
                Check your inbox for a password reset link.
              </div>
              <p className="text-center text-sm text-st-gray">
                Done? <Link to="/login" className="text-st-black dark:text-dark-primary hover:underline">Back to sign in</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-st-gray dark:text-gray-400">
                Enter your email address and we'll send you a recovery link to reset your password.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-[#1B1811] text-[#12100C] dark:text-dark-primary border border-gray-300 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-st-lime focus:border-st-lime outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#12100C] dark:bg-st-lime text-white dark:text-[#12100C] rounded-xl text-sm font-extrabold hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Sending link...' : 'Send reset link'}
              </button>

              <p className="text-center text-sm text-st-gray">
                Remember your password? <Link to="/login" className="text-st-black dark:text-dark-primary hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
