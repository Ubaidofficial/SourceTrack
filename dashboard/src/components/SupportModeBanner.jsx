import { Shield, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function SupportModeBanner({ siteName, siteDomain }) {
  const navigate = useNavigate()

  function handleExit() {
    sessionStorage.removeItem('sourcetrack_admin_preview')
    navigate('/admin')
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            Support Preview Mode: {siteName || siteDomain || 'Unknown site'}
          </span>
          <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
            Read-only
          </span>
        </div>
        <button
          onClick={handleExit}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors font-medium"
        >
          <X className="w-3.5 h-3.5" />
          Exit Preview
        </button>
      </div>
    </div>
  )
}
