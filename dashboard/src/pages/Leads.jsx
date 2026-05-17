import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { ArrowRight, Search, Download, User } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com AI', 'Phind', 'Kagi']

// Source channel classification + badge colors
function classifySource(source, medium) {
  const s = (source || '').toLowerCase()
  const m = (medium || '').toLowerCase()
  if (!s || s === 'direct' || s === '(direct)') return { label: 'Direct', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  if (['cpc','ppc','paid','paid_search','paid_social'].includes(m)) return { label: 'Paid', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' }
  if (['email','newsletter'].includes(m)) return { label: 'Email', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' }
  if (AI_SOURCES.map(a => a.toLowerCase()).includes(s)) return { label: 'AI Search', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
  if (['google','bing','yahoo','duckduckgo','baidu'].some(se => s.includes(se))) return { label: 'Organic', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  if (['facebook','instagram','linkedin','twitter','x.com','tiktok','reddit'].some(sn => s.includes(sn))) return { label: 'Social', color: 'bg-pink-100 text-pink-700', dot: 'bg-pink-500' }
  if (m === 'referral' || (!m && s)) return { label: 'Referral', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' }
  return { label: source, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
}

export default function Leads() {
  const { user } = useAuth()
  const [statusMap, setStatusMap] = useState({})
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterAI, setFilterAI]         = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [attributionModel, setAttributionModel] = useState('first_touch')
  const [journeyVisitorId, setJourneyVisitorId] = useState(null)

  const dateFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const dateTo = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase
        .from('sites')
        .select('site_key, name')
        .limit(1)

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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads-page', site?.site_key, debouncedSearch, filterAI, filterSource, attributionModel, dateFrom, dateTo],
    queryFn: async () => {
      if (!site?.site_key) return null
      const params = new URLSearchParams({
        site_key: site.site_key,
        date_from: dateFrom,
        date_to: dateTo,
        attribution_model: attributionModel,
        limit: '100'
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterAI !== 'all') params.set('ai', filterAI)
      if (filterSource !== 'all') params.set('source_type', filterSource)
      return fetchApi(`/leads?${params}`)
    },
    enabled: !!site?.site_key
  })

  const leads = leadsData?.leads || []
  const totalRevenue = leadsData?.total_revenue || 0
  const totalConversions = leadsData?.total_conversions || 0
  const totalLeads = leadsData?.total || leads.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Leads</h2>
          <p className="text-sm text-st-gray mt-0.5">Individual visitors who have converted or engaged with your site</p>
        </div>
        <button onClick={() => {
          if (!site) return
          const params = new URLSearchParams({ site_key: site.site_key, model: 'first_touch', date_from: dateFrom, date_to: dateTo, group_by: 'source', metric: 'revenue' })
          window.open(`/api/export/report?${params}`, '_blank')
        }} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricTile label="Total Leads" value={totalLeads.toLocaleString()} />
        <MetricTile label="Total Conversions" value={totalConversions.toLocaleString()} />
        <MetricTile label="Total Revenue" value={`$${totalRevenue.toFixed(0)}`} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-st-gray" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by visitor ID, source, or campaign..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
          <option value="all">All Types</option>
          <option value="organic">Organic</option>
          <option value="paid">Paid</option>
          <option value="ai">AI</option>
          <option value="social">Social</option>
          <option value="email">Email</option>
          <option value="direct">Direct</option>
          <option value="referral">Referral</option>
        </select>
        <select value={filterAI} onChange={e => setFilterAI(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
          <option value="all">All Sources</option>
          <option value="ai">AI Sources</option>
          <option value="non-ai">Non-AI Sources</option>
        </select>
        <select value={attributionModel} onChange={e => setAttributionModel(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
          <option value="first_touch">First Touch</option>
          <option value="last_touch">Last Touch</option>
        </select>
      </div>

      <DashboardCard title="All Leads" subtitle={`${totalLeads} visitors`}>
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black mx-auto" />
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-sm text-st-gray">
            {search || filterAI !== 'all' ? 'No leads match your filters.' : 'No leads yet. Visitors will appear here after they engage with your site.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 text-xs font-medium text-st-gray">Visitor</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-st-gray">Source</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-st-gray">Event Type</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-st-gray">Conversions</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-st-gray">Revenue</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-st-gray">Last seen</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-st-gray">Status</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-st-gray">Country</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-st-gray"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const isAI = lead.ai_source && AI_SOURCES.includes(lead.ai_source)
                  const shortId = lead.id ? lead.id.slice(0, 8) : 'unknown'
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-st-black font-mono text-xs">{shortId}...</td>
                      <td className="py-3 px-3">
                        {(() => {
                          const cls = classifySource(lead.source, lead.medium)
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${cls.color}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cls.dot}`} />
                                {lead.ai_source || lead.source || 'Direct'}
                              </span>
                              {lead.campaign && lead.campaign !== 'none' && (
                                <span className="text-[10px] text-st-gray truncate max-w-[120px]">{lead.campaign}</span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="py-3 px-3">
                        {lead.last_conversion_type ? (() => {
                          const key = String(lead.last_conversion_type).toLowerCase()
                          const style = CONVERSION_TYPE_BADGE[key] || {
                            bg: 'bg-gray-100',
                            text: 'text-gray-600',
                            label: lead.last_conversion_type
                          }
                          return (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                          )
                        })() : (
                          <span className="text-xs text-st-gray">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600">{lead.conversions}</td>
                      <td className="py-3 px-3 text-right font-medium text-st-black">
                        ${lead.revenue.toFixed(0)}
                      </td>
                      <td className="py-3 px-3 text-xs text-st-gray">
                        {lead.last_seen ? new Date(lead.last_seen).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-st-gray text-xs">
                        {lead.country || '—'}
                      </td>
                      <td className="py-3 px-3">
                        {(() => {
                          const STATUS_STYLES = {
                            lead:     'bg-gray-100 text-gray-600',
                            mql:      'bg-blue-50 text-blue-600',
                            sql:      'bg-purple-50 text-purple-600',
                            customer: 'bg-green-50 text-green-700',
                            rejected: 'bg-red-50 text-red-500'
                          }
                          const cur = statusMap[lead.id] || lead.status || 'lead'
                          return (
                            <select
                              value={cur}
                              onChange={async (e) => {
                                const newStatus = e.target.value
                                setStatusMap(prev => ({ ...prev, [lead.id]: newStatus }))
                                await fetchApi(`/leads/${lead.id}/qualify`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: newStatus })
                                })
                              }}
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${STATUS_STYLES[cur] || STATUS_STYLES.lead}`}
                            >
                              <option value="lead">Lead</option>
                              <option value="mql">MQL</option>
                              <option value="sql">SQL</option>
                              <option value="customer">Customer</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          )
                        })()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/leads/${encodeURIComponent(lead.id)}`)}
                            className="text-xs text-gray-600 hover:text-st-black font-medium flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            View
                          </button>
                          <button
                            onClick={() => setJourneyVisitorId(lead.id || lead.visitor_id || lead.anonymous_id)}
                            className="text-xs text-st-black hover:text-gray-700 font-medium flex items-center gap-1"
                          >
                            Journey <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      {journeyVisitorId && (
        <JourneyModal
          visitorId={journeyVisitorId}
          siteKey={site?.site_key}
          onClose={() => setJourneyVisitorId(null)}
          onQualified={async () => { try { await fetchApi(`/leads/${journeyVisitorId}/qualify`, { method: 'PATCH', body: JSON.stringify({ qualified: true }) }) } catch(e) { console.error('qualify failed', e) } setJourneyVisitorId(null) }}
        />
      )}
    </div>
  )
}
