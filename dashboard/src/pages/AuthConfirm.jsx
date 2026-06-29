import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { supabase } from '../lib/supabase'
import { LogoMark } from '../components/Logo'

// Same-domain auth confirmation. Email links point here as
//   /auth/confirm?token_hash=...&type=recovery|signup|email|magiclink|email_change
// so the visible URL stays on app.sourcetrack.ai with no redirect_to param —
// Gmail no longer flags the message and SPF/DKIM/DMARC remain intact.
// We exchange the token_hash for a session via verifyOtp, then route by type.

// Where to land after a verified link, per OTP type.
function destinationForType(type) {
  switch (type) {
    case 'recovery':
      return '/reset-password'
    case 'email_change':
      return '/settings'
    case 'signup':
    case 'email':
    case 'magiclink':
    default:
      return '/dashboard'
  }
}

export default function AuthConfirm() {
  const navigate = useNavigate()
  const [error, setError] = useState(false)
  // Recovery failures should point at the reset-request flow; everything else
  // back to sign-in. Captured up-front so the error UI can offer the right link.
  const [type, setType] = useState('')

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const otpType = params.get('type') || ''
    setType(otpType)

    async function confirm() {
      if (!tokenHash || !otpType) {
        if (active) setError(true)
        return
      }
      const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType })
      if (!active) return
      if (verifyErr) {
        setError(true)
        return
      }
      navigate(destinationForType(otpType), { replace: true })
    }

    confirm()
    return () => { active = false }
  }, [navigate])

  if (!error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F4F4] dark:bg-[#2B302F]">
        <Helmet>
          <title>Confirming | SourceTrack</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div className="h-8 w-8 rounded-full border-2 border-st-lime border-t-transparent animate-spin" />
      </div>
    )
  }

  const isRecovery = type === 'recovery'
  const requestPath = isRecovery ? '/forgot-password' : '/login'
  const requestLabel = isRecovery ? 'Request a new reset link' : 'Back to sign in'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F4F4] dark:bg-[#2B302F] px-4">
      <Helmet>
        <title>Link expired | SourceTrack</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LogoMark className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold tracking-[-0.06em] text-[#1F2323] dark:text-dark-primary">SourceTrack</h1>
          <p className="text-st-gray dark:text-gray-400 mt-2">Link expired or invalid</p>
        </div>

        <div className="bg-white dark:bg-[#1A1F1F] shadow-[0_18px_50px_rgba(31,35,35,0.10)] border border-[#DDE4E4] dark:border-white/10 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-st-gray dark:text-gray-400">
            This link has expired or has already been used. Request a new one and we&rsquo;ll email you a fresh link.
          </p>
          <Link
            to={requestPath}
            className="block w-full text-center py-2.5 bg-[#1F2323] dark:bg-st-lime text-white dark:text-[#1F2323] rounded-xl text-sm font-extrabold hover:opacity-90"
          >
            {requestLabel}
          </Link>
        </div>
      </div>
    </div>
  )
}
