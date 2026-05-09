import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { Copy, Check, Code, ExternalLink, RefreshCw, Circle, Bug } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Snippet() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key, name, domain')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const checkStatus = useCallback(async () => {
    if (!site) return
    setStatusLoading(true)
    try {
      const params = new URLSearchParams({ site_key: site.site_key })
      const data = await fetchApi(`/install/status?${params}`)
      setStatus(data)
    } catch (_err) {
      setStatus({ status: 'error' })
    } finally {
      setStatusLoading(false)
    }
  }, [site])

  useEffect(() => {
    if (site) checkStatus()
  }, [site, checkStatus])

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin
  const snippet = site
    ? `<script async src="${apiUrl}/tracker/loader.min.js" data-site-key="${site.site_key}"></script>`
    : ''

  const handleCopy = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      /* clipboard unavailable */
    }
  }

  const handleTest = async () => {
    if (!site) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const params = new URLSearchParams({ site_key: site.site_key })
      const data = await fetchApi(`/install/status?${params}`)
      if (data.status === 'verified') {
        setTestResult({ ok: true, message: 'Install verified! Events are flowing.', domain: data.domain })
      } else {
        setTestResult({ ok: false, message: 'No events received yet. Paste the snippet and visit your site.' })
      }
    } catch (_err) {
      setTestResult({ ok: false, message: 'Could not reach the server. Check your connection.' })
    } finally {
      setTestLoading(false)
    }
  }

  const statusColor = status?.status === 'verified'
    ? 'text-green-500'
    : status?.status === 'not_installed'
      ? 'text-amber-500'
      : 'text-gray-400'

  const statusLabel = status?.status === 'verified'
    ? 'Verified'
    : status?.status === 'not_installed'
      ? 'Waiting for first event'
      : 'Checking...'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Install</h2>
        <p className="text-sm text-gray-500 mt-1">Add TrackIQ to your website in 30 seconds</p>
      </div>

      {/* Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Install Status</h3>
          <button
            onClick={checkStatus}
            disabled={statusLoading}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Circle className={`w-3 h-3 fill-current ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
        </div>

        {status?.status === 'verified' && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400">Last event</p>
              <p className="text-sm text-gray-700">{new Date(status.last_event).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Domain</p>
              <p className="text-sm text-gray-700 truncate">{status.domain || '—'}</p>
            </div>
            <div className="col-span-2">
              <Link
                to="/debugger"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <Bug className="w-3.5 h-3.5" />
                See recent events in Debugger
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Snippet */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Install Snippet</h3>
        </div>

        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 pl-1">
          <li>Copy the snippet below</li>
          <li>Paste it in the <code className="bg-gray-100 px-1 rounded text-xs">&lt;head&gt;</code> of your website</li>
          <li>Deploy and visit your site — the tracker activates automatically</li>
        </ol>

        {site && (
          <div className="bg-gray-900 rounded-lg p-4 relative">
            <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
            <button
              onClick={handleCopy}
              className="absolute top-3 right-3 p-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}

        {!site && (
          <p className="text-sm text-gray-400">Create a site first in Settings to get your snippet.</p>
        )}
      </div>

      {/* Test Install */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Test Install</h3>
        <p className="text-sm text-gray-500">
          After pasting the snippet, click below to verify events are being received.
        </p>

        <button
          onClick={handleTest}
          disabled={testLoading || !site}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
        >
          {testLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Check Now
            </>
          )}
        </button>

        {testResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            testResult.ok
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <p>{testResult.message}</p>
            {testResult.domain && (
              <p className="text-xs mt-1 opacity-75">Domain: {testResult.domain}</p>
            )}
          </div>
        )}
      </div>

      {/* API Reference */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3">
        <h3 className="font-semibold text-gray-900">JavaScript API</h3>
        <p className="text-xs text-gray-400">Available after the tracker loads. Use in your own scripts.</p>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700">Get visitor ID</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">window.trackiq.id()</code>
          </div>
          <div>
            <p className="font-medium text-gray-700">Identify user</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.identify({ email: "user@example.com" })'}</code>
          </div>
          <div>
            <p className="font-medium text-gray-700">Track custom event</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.event("signup", { plan: "pro" })'}</code>
          </div>
          <div>
            <p className="font-medium text-gray-700">Track conversion</p>
            <code className="block bg-gray-100 px-3 py-1.5 rounded text-xs mt-1">{'window.trackiq.conversion(29.99, { product: "starter" })'}</code>
          </div>
        </div>
      </div>
    </div>
  )
}
