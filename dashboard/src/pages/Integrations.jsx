import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Code, Bug, Copy, Check, ShieldCheck, AlertTriangle,
  ExternalLink, Globe, Tag, ShoppingCart, BarChart3, Plug, Mail, Radio
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'
import MetricTile from '../components/MetricTile'
import { safeNumber, formatNumber } from '../utils/numbers'

const FUTURE_INTEGRATIONS = [
  { key: 'google-ads', label: 'Google Ads', icon: BarChart3, desc: 'Import campaign spend and sync attribution data' },
  { key: 'facebook', label: 'Facebook Ads', icon: BarChart3, desc: 'Track Facebook campaign performance' },
  { key: 'shopify', label: 'Shopify', icon: ShoppingCart, desc: 'Pull order data and revenue tracking' },
  { key: 'google-analytics', label: 'Google Analytics', icon: Globe, desc: 'Compare SourceTrack with GA attribution' },
  { key: 'hubspot', label: 'HubSpot', icon: Tag, desc: 'Sync leads and CRM data' },
  { key: 'custom', label: 'Custom Webhook', icon: Plug, desc: 'Send events to any HTTP endpoint' }
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

      const query = supabase.from('sites').select('site_key, name, domain').limit(1)
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

  // Over-reporting detection — fetch the latest data quality run and surface a
  // banner when duplicate_conversion_rate is flagged as 'warning'. Only fires
  // above the 15% threshold set by the DQ job; below that it's normal noise.
  const { data: dqLatest } = useQuery({
    queryKey: ['dq-latest', site?.site_key],
    queryFn: () => fetchApi(`/analytics/data-quality/latest?site_key=${site.site_key}`),
    enabled: !!site?.site_key
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
    ? `<script async src="${window.location.origin}/tracker/tracker.min.js" data-site-key="${site.site_key}"></script>`
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
