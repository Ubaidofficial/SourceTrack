import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Code, Bug, Copy, Check, ShieldCheck, AlertTriangle,
  ExternalLink, Globe, Tag, ShoppingCart, BarChart3, Plug
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'
import MetricTile from '../components/MetricTile'

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

  const overview = data?.data
  const installData = overview?.install
  const hygieneData = overview?.hygiene
  const alerts = overview?.alerts?.alerts || []
  const isVerified = installData?.status === 'verified'
  const issueCount = alerts.length + (hygieneData?.total_issues || 0)

  const snippet = site?.site_key
    ? `<script async src="${window.location.origin}/tracker/loader.min.js" data-site-key="${site.site_key}"></script>`
    : ''

  const handleCopy = () => {
    if (snippet) {
      navigator.clipboard.writeText(snippet).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Integrations</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">
            Tracking setup, verification, and data health
          </p>
        </div>
        <button onClick={() => navigate('/debugger')}
          className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1D1D] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-1.5">
          <Bug className="w-4 h-4" /> Event Logger
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Install Status"
          value={isVerified ? 'Verified' : 'Pending'}
          icon={isVerified ? ShieldCheck : AlertTriangle}
          iconBg={isVerified ? 'bg-green-100' : 'bg-amber-100'}
          iconColor={isVerified ? 'text-green-600' : 'text-amber-600'} />
        <MetricTile label="Site" value={site?.domain || '—'}
          icon={Globe} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <MetricTile label="Active Alerts" value={alerts.length.toLocaleString()}
          icon={AlertTriangle} iconBg={alerts.length > 0 ? 'bg-red-100' : 'bg-green-100'}
          iconColor={alerts.length > 0 ? 'text-red-600' : 'text-green-600'} />
        <MetricTile label="Hygiene" value={hygieneData?.total_issues ? 'Needs Review' : 'Clean'}
          icon={ShieldCheck} iconBg={hygieneData?.total_issues ? 'bg-amber-100' : 'bg-green-100'}
          iconColor={hygieneData?.total_issues ? 'text-amber-600' : 'text-green-600'} />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Installation Card */}
        <DashboardCard title="Installation"
          subtitle="Tracking script and site verification"
          action={
            <button onClick={() => navigate('/snippet')} className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium flex items-center gap-1">
              Full setup <ExternalLink className="w-3 h-3" />
            </button>
          }
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-st-black">{site?.domain || 'No site configured'}</p>
                {site?.name && <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{site.name}</p>}
              </div>
              <StatusBadge
                status={isVerified ? 'verified' : 'pending'}
                label={isVerified ? 'Live — Events Flowing' : 'Not Installed'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-st-gray dark:text-gray-400 font-medium uppercase tracking-wider mb-1">Last Event</p>
                <p className="text-sm text-st-black">
                  {installData?.last_event ? new Date(installData.last_event).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-st-gray dark:text-gray-400 font-medium uppercase tracking-wider mb-1">Event Type</p>
                <p className="text-sm text-st-black">{installData?.last_event_type || '—'}</p>
              </div>
            </div>

            <div className="bg-st-black rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-st-gray dark:text-gray-400 font-medium">Tracking Script</span>
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
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3">
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
              <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-st-black">All Systems Healthy</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-1">No issues detected with your tracking setup.</p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-2">
                {installData?.status === 'verified' ? `${installData?.last_event_type || 'Events'} flowing normally` : 'Complete installation to begin monitoring'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-st-gray dark:text-gray-400 font-medium uppercase tracking-wider">
                {issueCount} issue{issueCount > 1 ? 's' : ''} detected
              </p>
              {alerts.map(a => (
                <div key={a.id} className={`rounded-lg p-3 text-sm border ${
                  a.severity === 'high' ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.severity === 'high' ? 'error' : 'warning'} label={a.severity} />
                    <span className="font-medium text-st-black">{a.metric}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-600">{a.message}</p>
                </div>
              ))}
              {(hygieneData?.issues || []).map(h => (
                <div key={h.type} className="rounded-lg p-3 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200">
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

      {/* Available Integrations (Future) */}
      <DashboardCard title="Available Integrations"
        subtitle="Connect your marketing stack — coming in future sessions"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FUTURE_INTEGRATIONS.map(int => {
            const Icon = int.icon
            return (
              <div key={int.key}
                className="border border-gray-200 dark:border-[#333838] rounded-lg p-4 bg-gray-50 dark:bg-[#111414] opacity-70 cursor-not-allowed select-none">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white dark:bg-[#1A1D1D] rounded-lg border border-gray-200">
                    <Icon className="w-5 h-5 text-st-gray" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-st-gray">{int.label}</p>
                    <p className="text-xs text-st-gray">Coming soon</p>
                  </div>
                </div>
                <p className="text-xs text-st-gray">{int.desc}</p>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-st-gray dark:text-gray-400 mt-4 text-center">
          Backend consolidation for integrations is planned in a later session.
        </p>
      </DashboardCard>

      {/* Current Tracking Method */}
      <DashboardCard title="Tracking Method"
        subtitle="How SourceTrack is installed on your site"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-gray-100 dark:bg-[#252929] rounded-lg">
            <Code className="w-6 h-6 text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-st-black">JavaScript Snippet</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1">
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
