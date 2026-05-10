import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowLeft, Copy, Check, Globe, Clock, MousePointerClick,
  DollarSign, MapPin, Bot, Route, Layers
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek']

function truncateId(id) {
  if (!id) return 'unknown'
  if (id.length <= 16) return id
  return `${id.slice(0, 8)}...${id.slice(-8)}`
}

export default function LeadDetail() {
  const { user } = useAuth()
  const { leadId } = useParams()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead-detail', site?.site_key, leadId],
    queryFn: () => fetchApi(`/leads/${encodeURIComponent(leadId)}?site_key=${site.site_key}`),
    enabled: !!site && !!leadId
  })

  const lead = data?.data
  const isAI = lead?.ai_source && AI_SOURCES.includes(lead.ai_source)

  const handleCopyId = () => {
    if (leadId) {
      navigator.clipboard.writeText(leadId).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (isError || !lead) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/leads')}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-medium">Lead not found</p>
          <p className="text-sm text-gray-400 mt-1">
            The requested lead may have been removed or the ID is invalid.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate('/leads')}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </button>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900 font-mono">{truncateId(lead.id)}</h2>
              <button onClick={handleCopyId}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Copy full ID">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
              {isAI && (
                <StatusBadge status="verified" label={lead.ai_source} />
              )}
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                First seen {lead.first_seen ? new Date(lead.first_seen).toLocaleDateString() : '—'}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last seen {lead.last_seen ? new Date(lead.last_seen).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          <button onClick={() => navigate(`/journey?visitorId=${encodeURIComponent(lead.id)}`)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2">
            <Route className="w-4 h-4" />
            View Journey
          </button>
        </div>
      </div>

      {/* Source summary pill strip */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-gray-500">Acquisition:</span>
        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
          {lead.source || 'direct'}
        </span>
        {lead.medium && lead.medium !== 'none' && (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
            {lead.medium}
          </span>
        )}
        {lead.campaign && (
          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
            {lead.campaign}
          </span>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricTile label="Pageviews" value={(lead.pageviews || 0).toLocaleString()}
          icon={Globe} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <MetricTile label="Conversions" value={(lead.conversions || 0).toLocaleString()}
          icon={MousePointerClick} iconBg="bg-green-100" iconColor="text-green-600" />
        <MetricTile label="Revenue" value={`$${(lead.revenue || 0).toFixed(0)}`}
          icon={DollarSign} iconBg="bg-lime-100" iconColor="text-lime-700" />
        <MetricTile label="Country" value={lead.country || '—'}
          icon={MapPin} iconBg="bg-purple-100" iconColor="text-purple-600" />
        <MetricTile label="AI Source" value={lead.ai_source || 'None'}
          icon={Bot} iconBg={lead.ai_source ? 'bg-amber-100' : 'bg-gray-100'}
          iconColor={lead.ai_source ? 'text-amber-600' : 'text-gray-400'} />
      </div>

      {/* Detail Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Attribution / Acquisition */}
        <DashboardCard title="Attribution" subtitle="First-touch acquisition data">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">First-Touch Source</p>
                <p className="text-sm text-gray-900">{lead.first_touch_source || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">First-Touch Medium</p>
                <p className="text-sm text-gray-900">{lead.first_touch_medium || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">First-Touch Campaign</p>
                <p className="text-sm text-gray-900">{lead.campaign || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">First Page URL</p>
                <p className="text-sm text-gray-900 truncate" title={lead.first_page_url}>
                  {lead.first_page_url ? (() => {
                    try { return new URL(lead.first_page_url).pathname } catch { return lead.first_page_url }
                  })() : '—'}
                </p>
              </div>
            </div>
          </div>
        </DashboardCard>

        {/* Activity Summary */}
        <DashboardCard title="Activity Summary" subtitle={`Active on ${lead.active_days || 0} day${(lead.active_days || 0) === 1 ? '' : 's'}`}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">First Seen</p>
                <p className="text-sm text-gray-900">
                  {lead.first_seen ? new Date(lead.first_seen).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Last Seen</p>
                <p className="text-sm text-gray-900">
                  {lead.last_seen ? new Date(lead.last_seen).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Total Pageviews</p>
                <p className="text-sm text-gray-900">{(lead.pageviews || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Total Conversions</p>
                <p className="text-sm text-gray-900">{lead.conversions || 0}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">Total Revenue</p>
                <p className="text-lg font-semibold text-gray-900">${(lead.revenue || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>

      {/* Journey CTA Card */}
      <DashboardCard title="Visitor Journey" subtitle="See the full event timeline for this visitor">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gray-100 rounded-lg">
              <Layers className="w-6 h-6 text-gray-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                View every pageview, conversion, and event from this visitor in chronological order.
              </p>
            </div>
          </div>
          <button onClick={() => navigate(`/journey?visitorId=${encodeURIComponent(lead.id)}`)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2 whitespace-nowrap">
            <Route className="w-4 h-4" />
            Open Full Journey
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}
