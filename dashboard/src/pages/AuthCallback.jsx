import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useAuth } from '../contexts/AuthContext'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery')

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
        navigate('/login', { replace: true })
      }
    }
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0E1513]">
      <Helmet>
        <title>Signing in | SourceTrack</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="h-8 w-8 rounded-full border-2 border-[#CCF03F] border-t-transparent animate-spin" />
    </div>
  )
}
