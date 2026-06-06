import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Code, Bug, Copy, Check, ShieldCheck, AlertTriangle,
  ExternalLink, Globe, Tag, ShoppingCart, BarChart3, Plug, Mail, Radio, Trash, Play, RefreshCw
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'
import MetricTile from '../components/MetricTile'
import { safeNumber, formatNumber } from '../utils/numbers'
import { hasFeature } from '../lib/planFeatures'

const FUTURE_INTEGRATIONS = [
  { key: 'google-ads', label: 'Google Ads', icon: BarChart3, desc: 'Import campaign spend and sync attribution data' },
  { key: 'facebook', label: 'Facebook Ads', icon: BarChart3, desc: 'Track Facebook campaign performance' },
  { key: 'shopify', label: 'Shopify', icon: ShoppingCart, desc: 'Pull order data and revenue tracking' },
  { key: 'google-analytics', label: 'Google Analytics', icon: Globe, desc: 'Compare SourceTrack with GA attribution' },
  { key: 'hubspot', label: 'HubSpot', icon: Tag, desc: 'Sync leads and CRM data' }
]

export default function Integrations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedPixel, setCopiedPixel] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('site_key, name, domain, plan').limit(1)
      if (member?.company_id) {
        query.eq('company_id', member.company_id)
      } else {
        query.eq('owner_id', user.id)
      }
      const { data } = await query.maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const { data } = useQuery({
    queryKey: ['integrations-overview', site?.site_key],
    queryFn: () => fetchApi(`/integrations/overview?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    refetchInterval: 30_000
  })

  const { data: webhookData, refetch: refetchWebhook } = useQuery({
    queryKey: ['webhook-config', site?.site_key],
    queryFn: () => fetchApi(`/webhooks?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const [url, setUrl] = useState('')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uiMessage, setUiMessage] = useState('')
  const [showSecret, setShowSecret] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Stripe Webhook Sync integration state
  const { data: stripeIntegData, refetch: refetchStripeInteg } = useQuery({
    queryKey: ['stripe-integration', site?.site_key],
    queryFn: () => fetchApi(`/integrations/stripe?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const [stripeSecret, setStripeSecret] = useState('')
  const [stripeSubmitting, setStripeSubmitting] = useState(false)
  const [stripeMessage, setStripeMessage] = useState('')
  const [stripeError, setStripeError] = useState('')
  const [copiedStripeUrl, setCopiedStripeUrl] = useState(false)

  const stripeWebhookUrl = site?.site_key ? `${window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://api.srctk.com'}/api/webhooks/stripe/${site.site_key}` : ''

  const handleCopyStripeUrl = () => {
    if (stripeWebhookUrl) {
      navigator.clipboard.writeText(stripeWebhookUrl).catch(() => {})
      setCopiedStripeUrl(true)
      setTimeout(() => setCopiedStripeUrl(false), 2000)
    }
  }

  const handleSaveStripe = async (e) => {
    e.preventDefault()
    if (!site?.site_key) return
    setStripeSubmitting(true)
    setStripeMessage('')
    setStripeError('')
    try {
      const res = await fetchApi(`/integrations/stripe?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: stripeSecret }
      })
      if (res?.configured !== undefined) {
        setStripeMessage('Stripe webhook signing secret saved successfully!')
        setStripeSecret('')
        refetchStripeInteg()
      } else {
        setStripeError('Failed to save Stripe secret')
      }
    } catch (err) {
      setStripeError(err?.message || 'Error saving Stripe secret')
    } finally {
      setStripeSubmitting(false)
    }
  }

  const handleDeleteStripe = async () => {
    if (!site?.site_key) return
    if (!window.confirm('Are you sure you want to disconnect Stripe webhook sync? This will remove the signing secret.')) return
    setStripeSubmitting(true)
    setStripeMessage('')
    setStripeError('')
    try {
      const res = await fetchApi(`/integrations/stripe?site_key=${site.site_key}`, {
        method: 'POST',
        body: { secret: '' }
      })
      if (res?.configured !== undefined) {
        setStripeMessage('Stripe webhook sync disconnected.')
        refetchStripeInteg()
      } else {
        setStripeError('Failed to disconnect Stripe')
      }
    } catch (err) {
      setStripeError(err?.message || 'Error disconnecting Stripe')
    } finally {
      setStripeSubmitting(false)
    }
  }

  useEffect(() => {
    if (webhookData?.webhook) {
      setUrl(webhookData.webhook.url || '')
      setActive(!!webhookData.webhook.active)
    } else {
      setUrl('')
      setActive(true)
    }
  }, [webhookData])

  const handleSaveWebhook = async (e) => {
    e.preventDefault()
    if (!site?.site_key) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const isEdit = !!webhookData?.webhook?.id
      const method = isEdit ? 'PATCH' : 'POST'
      const endpoint = isEdit ? `/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}` : `/webhooks?site_key=${site.site_key}`
      const body = { url, active }

      const res = await fetchApi(endpoint, {
        method,
        body: JSON.stringify(body)
      })

      if (res?.webhook) {
        setUiMessage('Webhook destination saved successfully!')
        if (res.webhook.secret && method === 'POST') {
          setShowSecret(res.webhook.secret)
        }
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to save webhook')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error saving webhook destination')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWebhook = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    if (!window.confirm('Are you sure you want to delete this webhook destination? This will also purge its delivery logs.')) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}`, {
        method: 'DELETE'
      })
      if (res?.deleted) {
        setUiMessage('Webhook destination deleted.')
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to delete webhook')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error deleting webhook')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegenerateSecret = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    if (!window.confirm('Are you sure you want to regenerate the signing secret? This will invalidate the previous secret immediately.')) return
    setSubmitting(true)
    setUiMessage('')
    setShowSecret(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}/regenerate-secret?site_key=${site.site_key}`, {
        method: 'POST'
      })
      if (res?.secret) {
        setShowSecret(res.secret)
        setUiMessage('Signing secret regenerated successfully. Copy it now, it will not be shown again!')
        refetchWebhook()
      } else {
        setUiMessage(res?.error || 'Failed to regenerate secret')
      }
    } catch (err) {
      setUiMessage(err?.message || 'Error regenerating secret')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTestWebhook = async () => {
    if (!site?.site_key || !webhookData?.webhook?.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetchApi(`/webhooks/${webhookData.webhook.id}/test?site_key=${site.site_key}`, {
        method: 'POST'
      })
      setTestResult(res)
      refetchWebhook()
    } catch (err) {
      setTestResult({ success: false, error_message: err?.message || 'Failed to send test' })
    } finally {
      setTesting(false)
    }
  }

  // Over-reporting detection — fetch the latest data quality run and surface a
  // banner when duplicate_conversion_rate is flagged as 'warning'. Only fires
  // above the 15% threshold set by the DQ job; below that it's normal noise.
  // Over-reporting detection is paid-only. Skip the request entirely for free
  // plan (the API returns 402; no point firing a doomed fetch).
  const canSeeOverReporting = hasFeature(site?.plan, 'over_reporting_detection')
  const { data: dqLatest } = useQuery({
    queryKey: ['dq-latest', site?.site_key],
    queryFn: () => fetchApi(`/analytics/data-quality/latest?site_key=${site.site_key}`),
    enabled: !!site?.site_key && canSeeOverReporting
  })
  const dupWarning = (dqLatest?.checks || []).find(
    c => c.check_name === 'duplicate_conversion_rate' && c.status === 'warning'
  )

  const overview = data
  const installData = overview?.install
  const hygieneData = overview?.hygiene
  const alerts = overview?.alerts?.alerts || []
  const isVerified = installData?.status === 'verified'
  const issueCount = safeNumber(alerts.length, 0) + safeNumber(hygieneData?.total_issues, 0)

  const snippet = site?.site_key
    ? `<script async src="${(import.meta.env.VITE_TRACKER_BASE_URL || '').replace(/\/+$/, '') || window.location.origin}/tracker/tracker.min.js" data-site-key="${site.site_key}"></script>`
    : ''

  const handleCopy = () => {
    if (snippet) {
      navigator.clipboard.writeText(snippet).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const apiBase = window.location.origin.includes('localhost') ? 'https://api.srctk.com' : 'https://api.srctk.com'
  const pixelBase = site?.site_key ? `${apiBase}/api/pixel?site_key=${site.site_key}` : ''
  const emailPixelExample = pixelBase ? `${pixelBase}&event=email_open&uid={{USER_ID}}&campaign={{CAMPAIGN_NAME}}` : ''
  const serverPixelExample = pixelBase ? `${pixelBase}&event=pageview&uid={{USER_ID}}&url={{PAGE_URL}}` : ''

  const handleCopyPixel = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedPixel(true)
    setTimeout(() => setCopiedPixel(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Integrations</h2>
          <p className="text-sm text-st-gray mt-0.5">
            Tracking setup, verification, and data health
          </p>
        </div>
        <button onClick={() => navigate('/debugger')}
          className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
          <Bug className="w-4 h-4" /> Live Events
        </button>
      </div>

      {/* Over-reporting warning — only when DQ flagged duplicate_conversion_rate */}
      {dupWarning && (
        <div className="flex items-start gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
          <span className="text-orange-400 text-lg mt-0.5 leading-none">⚠</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400 mb-1">
              Possible Over-Reporting Detected
            </p>
            <p className="text-sm text-st-gray">{dupWarning.message}</p>
            <p className="text-sm text-st-gray mt-1">
              Check if you have another tracking pixel (Meta native pixel, Google
              Tag Manager, or a third-party app) also sending the same events to
              your ad platforms. Remove any duplicate sources to ensure accurate
              attribution.
            </p>
          </div>
        </div>
      )}

      {/* Free-plan upsell — surfaces the paid feature so users know it exists */}
      {!canSeeOverReporting && site?.plan && (
        <div className="flex items-start gap-3 p-4 bg-st-lime/5 border border-st-lime/20 rounded-xl">
          <span className="text-st-lime text-lg mt-0.5 leading-none">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white mb-1">
              Over-reporting detection · Starter plan
            </p>
            <p className="text-sm text-st-gray">
              Automatically flag duplicate pixel fires that inflate Meta / Google / TikTok
              conversion counts. Upgrade to keep your ad platform numbers honest.
            </p>
          </div>
          <a href="/billing" className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-st-lime text-black hover:bg-st-lime/90">
            Upgrade
          </a>
        </div>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Install Status" format="text"
          value={isVerified ? 'Verified' : 'Pending'} />
        <MetricTile label="Site" format="text"
          value={site?.domain || '—'} />
        <MetricTile label="Active Alerts"
          value={alerts.length} />
        <MetricTile label="Hygiene" format="text"
          value={safeNumber(hygieneData?.total_issues, 0) > 0 ? 'Needs Review' : 'Clean'} />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Installation Card */}
        <DashboardCard title="Installation"
          subtitle="Tracking script and site verification"
          action={
            <button onClick={() => navigate('/snippet')} className="text-xs text-st-black hover:text-gray-700 font-medium flex items-center gap-1">
              Full setup <ExternalLink className="w-3 h-3" />
            </button>
          }
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-st-black">{site?.domain || 'No site configured'}</p>
                {site?.name && <p className="text-xs text-st-gray mt-0.5">{site.name}</p>}
              </div>
              <StatusBadge
                status={isVerified ? 'verified' : 'pending'}
                label={isVerified ? 'Live — Events Flowing' : 'Not Installed'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-st-gray font-medium uppercase tracking-wider mb-1">Last Event</p>
                <p className="text-sm text-st-black">
                  {installData?.last_event ? new Date(installData.last_event).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-st-gray font-medium uppercase tracking-wider mb-1">Event Type</p>
                <p className="text-sm text-st-black">{installData?.last_event_type || '—'}</p>
              </div>
            </div>

            <div className="bg-st-black rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-st-gray font-medium">Tracking Script</span>
                <button onClick={handleCopy}
                  className="px-2.5 py-1 bg-gray-700 text-white text-xs rounded-md hover:bg-gray-600 flex items-center gap-1.5 transition-colors">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed">
                {snippet || 'Loading...'}
              </pre>
            </div>

            {!isVerified && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-medium">Installation not verified</p>
                <p className="text-xs text-amber-600 mt-1">
                  Paste the tracking script in your site's &lt;head&gt; tag and visit the site to trigger verification.
                </p>
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Data Health */}
        <DashboardCard title="Data Health"
          subtitle="Real-time monitoring"
        >
          {issueCount === 0 ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-st-black">All Systems Healthy</p>
              <p className="text-xs text-st-gray mt-1">No issues detected with your tracking setup.</p>
              <p className="text-xs text-st-gray mt-2">
                {installData?.status === 'verified' ? `${installData?.last_event_type || 'Events'} flowing normally` : 'Complete installation to begin monitoring'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-st-gray font-medium uppercase tracking-wider">
                {issueCount} issue{issueCount > 1 ? 's' : ''} detected
              </p>
              {alerts.map(a => (
                <div key={a.id} className={`rounded-lg p-3 text-sm border ${
                  a.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.severity === 'high' ? 'error' : 'warning'} label={a.severity} />
                    <span className="font-medium text-st-black">{a.metric}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600">{a.message}</p>
                </div>
              ))}
              {(hygieneData?.issues || []).map(h => (
                <div key={h.type} className="rounded-lg p-3 text-sm bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="warning" label="Hygiene" />
                    <span className="font-medium text-st-black">{h.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600">{h.message}</p>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      </div>

      {/* Pixel Tracking */}
      <DashboardCard
        title="Pixel Tracking"
        subtitle="Track email opens and server-side events without JavaScript"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-100 dark:bg-[#252929] rounded-lg shrink-0">
              <Mail className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-st-black dark:text-white">Email open attribution</p>
              <p className="text-xs text-st-gray mt-1">
                Embed a 1×1 transparent GIF in any HTML email. When the recipient opens it, SourceTrack records the event and attributes it to the correct campaign — no JavaScript, no SDK.
              </p>
            </div>
          </div>

          {site?.site_key ? (
            <div className="space-y-3">
              {/* Email pixel */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">Email img tag</p>
                  <button onClick={() => handleCopyPixel(emailPixelExample)}
                    className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black dark:hover:text-white transition-colors">
                    {copiedPixel ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedPixel ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="bg-st-black rounded-lg p-3">
                  <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                    {`<img src="${emailPixelExample}" width="1" height="1" alt="" />`}
                  </pre>
                </div>
              </div>

              {/* Server-side pixel */}
              <div>
                <p className="text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1.5">Server-side HTTP GET (no JS)</p>
                <div className="bg-st-black rounded-lg p-3">
                  <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                    {`GET ${serverPixelExample}`}
                  </pre>
                </div>
              </div>

              {/* Param reference */}
              <div className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3 border border-gray-100 dark:border-[#2A2E2E]">
                <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Query parameters</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    ['site_key', 'Your site key (required)'],
                    ['event', 'Event name — e.g. email_open'],
                    ['uid', 'User ID for attribution stitching'],
                    ['campaign', 'Campaign name (utm_campaign)'],
                    ['utm_source', 'Traffic source'],
                    ['utm_medium', 'Traffic medium'],
                    ['url', 'Page or email URL'],
                    ['val', 'Numeric value (for conversions)'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start gap-1.5">
                      <code className="text-[10px] font-mono text-st-black dark:text-white bg-gray-200 dark:bg-[#2A2E2E] px-1 py-0.5 rounded shrink-0">{k}</code>
                      <span className="text-[10px] text-st-gray dark:text-gray-400">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-st-gray py-2">Site key loading…</p>
          )}
        </div>
      </DashboardCard>

      {/* Stripe Webhook Sync */}
      <DashboardCard
        title="Stripe Webhook Sync"
        subtitle="Signed Stripe checkout revenue events for attribution"
      >
        <div className="space-y-4">
          {stripeMessage && (
            <div className="p-3 text-xs rounded-lg bg-green-50 text-green-700 border border-green-200">
              {stripeMessage}
            </div>
          )}
          {stripeError && (
            <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
              {stripeError}
            </div>
          )}

          {/* Configuration State */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-st-black dark:text-white">Status</p>
              <p className="text-xs text-st-gray mt-0.5">Stripe customer webhook sync</p>
            </div>
            <StatusBadge
              status={stripeIntegData?.configured ? 'verified' : 'pending'}
              label={stripeIntegData?.configured ? 'Active' : 'Not Configured'}
            />
          </div>

          {/* Copyable Webhook URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Stripe Webhook Listener URL</label>
              <button
                type="button"
                onClick={handleCopyStripeUrl}
                className="flex items-center gap-1 text-xs text-st-gray hover:text-st-black dark:hover:text-white transition-colors"
              >
                {copiedStripeUrl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copiedStripeUrl ? 'Copied' : 'Copy URL'}
              </button>
            </div>
            <div className="bg-st-black rounded-lg p-3">
              <pre className="text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                {stripeWebhookUrl || 'Loading URL...'}
              </pre>
            </div>
          </div>

          {/* Form */}
          {stripeIntegData?.configured ? (
            <div className="space-y-3 bg-gray-50 dark:bg-[#1a1d1d] border border-gray-100 dark:border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Stripe Webhook Secret</p>
                  <code className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 block">
                    {stripeIntegData.masked_secret}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteStripe}
                  disabled={stripeSubmitting}
                  className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveStripe} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">
                  Stripe Webhook Secret (whsec_...)
                </label>
                <input
                  type="password"
                  value={stripeSecret}
                  onChange={e => setStripeSecret(e.target.value)}
                  placeholder="whsec_..."
                  disabled={stripeSubmitting}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1d1d] text-st-black dark:text-white rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-st-black/20"
                />
              </div>
              <button
                type="submit"
                disabled={stripeSubmitting || !stripeSecret.trim()}
                className="px-4 py-2 bg-st-black dark:bg-white text-white dark:text-black text-xs font-semibold rounded-lg hover:bg-st-black/90 dark:hover:bg-white/95 disabled:opacity-50 transition-colors"
              >
                {stripeSubmitting ? 'Saving...' : 'Connect Stripe'}
              </button>
            </form>
          )}

          {/* Setup Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3.5 space-y-2">
            <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300">Stripe Webhook Setup Instructions</h4>
            <ol className="list-decimal pl-4 text-xs text-blue-800 dark:text-blue-400 space-y-1.5 font-light">
              <li>Open your <strong>Stripe Dashboard</strong> and go to <strong>Developers &gt; Webhooks</strong>.</li>
              <li>Click <strong>Add endpoint</strong> and paste the <strong>Stripe Webhook Listener URL</strong> copy block above.</li>
              <li>Select the event to send: <code className="font-mono bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded text-[11px]">checkout.session.completed</code>.</li>
              <li>Click <strong>Add endpoint</strong>, then reveal and copy the <strong>Signing secret</strong> (starts with <code className="font-mono">whsec_</code>).</li>
              <li>Paste the signing secret in the input field above and save.</li>
            </ol>
            <p className="text-[11px] text-blue-700 dark:text-blue-400 pt-1">
              <strong>Test mode / Live mode:</strong> Webhook events from both Stripe Live mode and Test mode are fully supported.
            </p>
            <p className="text-[11px] text-blue-700 dark:text-blue-400">
              <strong>Attribution Stitching:</strong> Ensure your checkout sessions include a stitching metadata key (e.g. <code className="font-mono">visitor_id</code>, <code className="font-mono">anonymous_id</code>, or <code className="font-mono">client_reference_id</code>). Sessions without metadata are logged as unattributed revenue.
            </p>
          </div>
        </div>
      </DashboardCard>

      {/* Outbound Webhooks */}
      <DashboardCard
        title="Outbound Webhooks"
        subtitle="Send attributed conversion data to Zapier, n8n, Make, or custom HTTP endpoints in real time"
      >
        <div className="space-y-4">
          {uiMessage && (
            <div className={`p-3 text-xs rounded-lg ${uiMessage.includes('Error') || uiMessage.includes('Failed') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {uiMessage}
            </div>
          )}

          <form onSubmit={handleSaveWebhook} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider mb-1">Webhook URL</label>
              <input
                type="text"
                placeholder="https://your-endpoint.com/webhook"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-st-black/20"
              />
              <p className="text-[10px] text-st-gray mt-1">
                Must use HTTPS in production. Endpoint will receive a POST request with the conversion payload and X-SourceTrack-Signature header.
              </p>
            </div>

            {webhookData?.webhook && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-3">
                {/* Signing secret */}
                <div>
                  <label className="block text-xs font-semibold text-st-gray uppercase tracking-wider mb-1">Signing Secret</label>
                  {showSecret ? (
                    <div className="space-y-2">
                      <div className="bg-green-50 border border-green-200 rounded p-2 flex items-center justify-between gap-2">
                        <code className="text-xs font-mono text-green-700 select-all break-all">{showSecret}</code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(showSecret).catch(() => {})
                            alert('Copied to clipboard!')
                          }}
                          className="px-2 py-1 bg-green-600 text-white rounded text-[10px] font-semibold flex items-center gap-1 shrink-0"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                      </div>
                      <p className="text-[10px] text-green-700 font-semibold">
                        Make sure to copy this secret now. It will not be shown again.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono text-gray-700 select-all">{webhookData.webhook.secret}</code>
                      <button
                        type="button"
                        onClick={handleRegenerateSecret}
                        disabled={submitting}
                        className="text-[10px] text-gray-500 hover:text-st-black font-semibold flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" /> Regenerate
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-st-gray mt-1">
                    Use this secret to verify the HMAC SHA-256 signature in the request headers.
                  </p>
                </div>

                {/* Status Toggle & Last delivery */}
                <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={e => {
                          setActive(e.target.checked)
                          // Trigger save instantly
                          const isEdit = !!webhookData?.webhook?.id
                          const endpoint = `/webhooks/${webhookData.webhook.id}?site_key=${site.site_key}`
                          fetchApi(endpoint, {
                            method: 'PATCH',
                            body: JSON.stringify({ active: e.target.checked })
                          }).then(() => refetchWebhook()).catch(() => {})
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-st-black"></div>
                      <span className="ml-2 text-xs font-medium text-gray-700">Webhook Enabled</span>
                    </label>
                  </div>
                  <div>
                    {webhookData.deliveries && webhookData.deliveries.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-st-gray">Last Delivery:</span>
                        <StatusBadge
                          status={webhookData.deliveries[0].success ? 'verified' : 'error'}
                          label={webhookData.deliveries[0].success ? `Success (${webhookData.deliveries[0].status_code})` : `Failed (${webhookData.deliveries[0].status_code || 'Err'})`}
                        />
                      </div>
                    ) : (
                      <span className="text-[10px] text-st-gray">No deliveries yet</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-st-black text-white text-xs font-semibold rounded-lg hover:bg-st-black/90 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Configuration'}
                </button>

                {webhookData?.webhook && (
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testing || submitting}
                    className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <Play className="w-3 h-3" /> {testing ? 'Testing...' : 'Test Webhook'}
                  </button>
                )}
              </div>

              {webhookData?.webhook && (
                <button
                  type="button"
                  onClick={handleDeleteWebhook}
                  disabled={submitting}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1 transition-colors"
                >
                  <Trash className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>
          </form>

          {/* Test delivery result alert */}
          {testResult && (
            <div className={`p-3 text-xs rounded-lg border ${testResult.success ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
              <p className="font-semibold">{testResult.success ? 'Test Delivery Succeeded' : 'Test Delivery Failed'}</p>
              <p className="mt-1">
                {testResult.success
                  ? `Webhook endpoint responded with status code ${testResult.status_code}.`
                  : `Error: ${testResult.error_message || 'HTTP error ' + testResult.status_code}`
                }
              </p>
            </div>
          )}

          {/* Recent Deliveries list */}
          {webhookData?.webhook && webhookData.deliveries && webhookData.deliveries.length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-st-gray uppercase tracking-wider mb-2">Recent Deliveries</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-st-gray">
                      <th className="pb-1.5 font-medium">Event Type</th>
                      <th className="pb-1.5 font-medium">Status</th>
                      <th className="pb-1.5 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookData.deliveries.map(del => (
                      <tr key={del.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="py-1.5 font-mono text-gray-700">{del.event_type}</td>
                        <td className="py-1.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${del.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {del.status_code || 'Error'}
                          </span>
                        </td>
                        <td className="py-1.5 text-gray-500">
                          {new Date(del.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* Available Integrations (Future) */}
      <DashboardCard title="Coming Soon"
        subtitle="More integrations on the way"
      >
        <div className="flex flex-wrap gap-2">
          {FUTURE_INTEGRATIONS.map(int => (
            <span key={int.key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-[#252929] text-st-gray dark:text-gray-400 border border-gray-200 dark:border-[#2A2E2E]">
              {int.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-st-gray dark:text-gray-500 mt-3">
          Want a specific integration? <a href="mailto:support@sourcetrack.ai" className="underline hover:text-st-black dark:hover:text-white">Let us know →</a>
        </p>
      </DashboardCard>

      {/* Current Tracking Method */}
      <DashboardCard title="Tracking Method"
        subtitle="How SourceTrack is installed on your site"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-gray-100 rounded-lg">
            <Code className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-st-black">JavaScript Snippet</p>
            <p className="text-xs text-st-gray mt-1">
              A single &lt;script&gt; tag added to your site's &lt;head&gt; section.
              Tracks pageviews, UTM parameters, AI referrals, and conversions automatically.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={isVerified ? 'active' : 'pending'} label={isVerified ? 'Active' : 'Not Detected'} />
              <span className="text-xs text-st-gray">
                {installData?.domain || '—'}
              </span>
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>
  )
}
