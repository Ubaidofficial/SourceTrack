import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowLeft, Copy, Check, Globe, Clock, MousePointerClick,
  DollarSign, MapPin, Bot, Route, Layers, Sparkles, UserCircle, Hash, Calendar,
  Eye, ShoppingCart
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

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead-detail', site?.site_key, leadId],
    queryFn: () => fetchApi(`/leads/${encodeURIComponent(leadId)}?site_key=${site.site_key}`),
    enabled: !!site && !!leadId
  })

  const { data: recentEvents, isLoading: eventsLoading } = useQuery({
    queryKey: ['lead-timeline', site?.site_key, leadId],
    queryFn: () => fetchApi(`/journey/${encodeURIComponent(leadId)}?site_key=${site.site_key}&limit=10`),
    enabled: !!site && !!leadId
  })

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

      {/* Recent Activity Timeline */}
      <DashboardCard title="Recent Activity" subtitle={recentEvents?.events?.length > 0 ? `Last ${recentEvents.events.length} event${recentEvents.events.length === 1 ? '' : 's'}` : 'No events recorded'}>
        {eventsLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-300" />
          </div>
        ) : !recentEvents?.events || recentEvents.events.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No events recorded yet for this visitor.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {recentEvents.events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                  e.event === '$conversion' ? 'bg-lime-100' :
                  e.event === '$pageview' ? 'bg-gray-100' :
                  'bg-blue-50'
                }`}>
                  {e.event === '$conversion' ? (
                    <ShoppingCart className="w-4 h-4 text-lime-700" />
                  ) : e.event === '$pageview' ? (
                    <Eye className="w-4 h-4 text-gray-500" />
                  ) : (
                    <Layers className="w-4 h-4 text-blue-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium ${
                      e.event === '$conversion' ? 'text-lime-700' :
                      e.event === '$pageview' ? 'text-gray-600' :
                      'text-blue-600'
                    }`}>
                      {e.event === '$conversion' ? 'Conversion' :
                       e.event === '$pageview' ? 'Pageview' :
                       e.event === 'install_verified' ? 'Install Verified' :
                       e.event}
                    </span>
                    {e.ai_source && (
                      <span className="px-1.5 py-0.5 text-xs bg-lime-50 text-lime-700 rounded-full font-medium">
                        {e.ai_source}
                      </span>
                    )}
                    {e.is_conversion && e.conversion_value != null && (
                      <span className="text-xs text-gray-700 font-medium">${Number(e.conversion_value).toFixed(0)}</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {e.page_url && (
                    <p className="text-xs text-gray-400 truncate mt-0.5" title={e.page_url}>
                      {(() => { try { return new URL(e.page_url).pathname } catch { return e.page_url } })()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {/* AI Source Insight */}
      {isAI && (
        <DashboardCard title="AI Source Insight" subtitle="This visitor came from an AI platform"
          className="border-lime-200 border-l-2">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-lime-100 rounded-xl flex-shrink-0">
              <Sparkles className="w-6 h-6 text-lime-700" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-900">
                This visitor discovered you through <span className="font-semibold text-lime-800">{lead.ai_source}</span> — an AI-powered search or assistant platform.
              </p>
              {lead.ai_source === 'ChatGPT' && (
                <p className="text-xs text-gray-500">ChatGPT users often research products before buying. These leads typically have high intent.</p>
              )}
              {lead.ai_source === 'Claude' && (
                <p className="text-xs text-gray-500">Claude users tend to be technical buyers researching deeply before converting.</p>
              )}
              {lead.ai_source === 'Perplexity' && (
                <p className="text-xs text-gray-500">Perplexity traffic often comes from comparison shoppers evaluating multiple options.</p>
              )}
              {lead.ai_source === 'Grok' && (
                <p className="text-xs text-gray-500">Grok users tend to be early adopters exploring emerging tools and products.</p>
              )}
              {lead.ai_source === 'Copilot' && (
                <p className="text-xs text-gray-500">Copilot traffic often comes from professionals researching within their existing Microsoft workflow.</p>
              )}
              {lead.ai_source === 'Gemini' && (
                <p className="text-xs text-gray-500">Gemini users span a broad audience — from casual searchers to deep researchers in the Google ecosystem.</p>
              )}
              {(lead.revenue > 0 && lead.conversions > 0) && (
                <p className="text-xs text-gray-700 mt-1 font-medium">
                  Revenue from AI: ${lead.revenue.toFixed(0)} across {lead.conversions} conversion{lead.conversions === 1 ? '' : 's'}.
                </p>
              )}
            </div>
          </div>
        </DashboardCard>
      )}

      {/* Identity Summary */}
      <DashboardCard title="Identity" subtitle={lead.id && lead.id.includes('-') ? 'Anonymous visitor ID' : 'Known user ID'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${lead.id && lead.id.includes('-') ? 'bg-gray-100' : 'bg-green-100'}`}>
              {lead.id && lead.id.includes('-') ? (
                <Hash className="w-5 h-5 text-gray-500" />
              ) : (
                <UserCircle className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Status</p>
              <p className="text-sm font-medium text-gray-900">
                {lead.id && lead.id.includes('-') ? 'Anonymous' : 'Identified'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100">
              <Calendar className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Activity</p>
              <p className="text-sm font-medium text-gray-900">{lead.active_days || 0} active day{(lead.active_days || 0) === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>
      </DashboardCard>

      {/* Journey CTA Card */}
      <DashboardCard title="Full Journey" subtitle="See the complete event timeline for this visitor">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-lime-100 rounded-lg">
              <Route className="w-6 h-6 text-lime-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                View every pageview, conversion, and event from this visitor in chronological order.
              </p>
            </div>
          </div>
          <button onClick={() => navigate(`/journey?visitorId=${encodeURIComponent(lead.id)}`)}
            className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-700 flex items-center gap-2 whitespace-nowrap">
            <Route className="w-4 h-4" />
            Open Full Journey
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}
