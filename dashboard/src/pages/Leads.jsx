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

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek']

export default function Leads() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterAI, setFilterAI] = useState('all')

  const dateFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const dateTo = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key, name')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads-page', site?.site_key, debouncedSearch, filterAI, dateFrom, dateTo],
    queryFn: async () => {
      if (!site?.site_key) return null
      const params = new URLSearchParams({
        site_key: site.site_key,
        date_from: dateFrom,
        date_to: dateTo,
        limit: '100'
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterAI !== 'all') params.set('ai', filterAI)
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
          <h2 className="text-2xl font-bold text-gray-900">Leads</h2>
          <p className="text-sm text-gray-500 mt-0.5">Individual visitors who have converted or engaged with your site</p>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by visitor ID, source, or campaign..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <select value={filterAI} onChange={e => setFilterAI(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
          <option value="all">All Sources</option>
          <option value="ai">AI Sources</option>
          <option value="non-ai">Non-AI Sources</option>
        </select>
      </div>

      <DashboardCard title="All Leads" subtitle={`${totalLeads} visitors`}>
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
          </div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {search || filterAI !== 'all' ? 'No leads match your filters.' : 'No leads yet. Visitors will appear here after they engage with your site.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500">Visitor</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500">Source</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">Conversions</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">Revenue</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-gray-500">Last seen</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500">Country</th>
                  <th className="text-right py-3 px-3 text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const isAI = lead.ai_source && AI_SOURCES.includes(lead.ai_source)
                  const shortId = lead.id ? lead.id.slice(0, 8) : 'unknown'
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-gray-900 font-mono text-xs">{shortId}...</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-900">{lead.source || 'direct'}</span>
                          {isAI && <StatusBadge status="verified" label="AI" />}
                        </div>
                        {lead.medium && lead.medium !== 'none' && (
                          <span className="text-xs text-gray-400">{lead.medium}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600">{lead.conversions}</td>
                      <td className="py-3 px-3 text-right font-medium text-gray-900">
                        ${lead.revenue.toFixed(0)}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">
                        {lead.last_seen ? new Date(lead.last_seen).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-500 text-xs">
                        {lead.country || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/leads/${encodeURIComponent(lead.id)}`)}
                            className="text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center gap-1"
                          >
                            <User className="w-3 h-3" />
                            View
                          </button>
                          <button
                            onClick={() => navigate(`/journey?visitorId=${encodeURIComponent(lead.id)}`)}
                            className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1"
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
    </div>
  )
}
