import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Search, Download, TrendingUp, TrendingDown, Filter, Eye, Pencil, Check } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const DIMENSIONS = [
  { key: 'campaign', label: 'Campaign', icon: null },
  { key: 'source', label: 'Source', icon: null },
  { key: 'medium', label: 'Medium', icon: null },
  { key: 'ai_source', label: 'AI Source', icon: null }
]

const DATE_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 }
]

const COLORS = [
  'rgba(17, 24, 39, 0.85)',
  'rgba(215, 245, 80, 0.85)',
  'rgba(107, 114, 128, 0.85)',
  'rgba(55, 65, 81, 0.85)',
  'rgba(209, 213, 219, 0.85)',
  'rgba(31, 41, 55, 0.85)',
  'rgba(180, 195, 60, 0.85)'
]

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'low') return 'Low Volume'
  return 'No Activity'
}

export default function Campaigns() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [spendMap, setSpendMap] = useState({}) // { campaignName: spend }
  const [editingSpend, setEditingSpend] = useState(null)
  const [spendInput, setSpendInput] = useState('')
  const [site, setSite] = useState(null)
  const [activeDim, setActiveDim] = useState('source')
  const [dateRange, setDateRange] = useState(30)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns-overview', site?.site_key, activeDim, dateRange, search, statusFilter],
    queryFn: () => fetchApi(`/campaigns/overview?site_key=${site.site_key}&dimension=${activeDim}&days=${dateRange}&search=${encodeURIComponent(search)}&status=${statusFilter}`),
    enabled: !!site
  })

  const overview = data?.data
  const kpis = overview?.kpis
  const rows = overview?.rows || []

  const dateFrom = overview?.date_from || format(subDays(new Date(), dateRange), 'yyyy-MM-dd')
  const dateTo = overview?.date_to || format(new Date(), 'yyyy-MM-dd')

  const chartData = {
    labels: rows.slice(0, 10).map(r => r.name || 'unknown'),
    datasets: [{
      label: 'Revenue', data: rows.slice(0, 10).map(r => r.revenue || 0),
      backgroundColor: rows.slice(0, 10).map((_, i) => COLORS[i % COLORS.length]),
      borderRadius: 6, borderSkipped: false
    }]
  }

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` $${Number(ctx.raw).toFixed(0)}` } }
    },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v) => `$${v}`, maxTicksLimit: 4 }, grid: { color: '#f3f4f6' } },
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } }
    }
  }


  const { data: costsData, refetch: refetchCosts } = useQuery({
    queryKey: ['campaign-costs', site?.site_key, dateFrom, dateTo],
    queryFn: async () => {
      if (!site?.site_key) return []
      const res = await fetchApi(`/campaign-costs?site_key=${site.site_key}&date_from=${dateFrom}&date_to=${dateTo}`)
      return res.data || []
    },
    enabled: !!site?.site_key,
    onSuccess: (data) => {
      const map = {}
      data.forEach(c => { map[c.campaign_name] = c.spend })
      setSpendMap(map)
    }
  })

  async function saveSpend(campaignName) {
    const spend = parseFloat(spendInput) || 0
    await fetchApi('/campaign-costs', {
      method: 'POST',
      body: JSON.stringify({ site_key: site.site_key, campaign_name: campaignName, spend, period_start: dateFrom, period_end: dateTo })
    })
    setSpendMap(prev => ({ ...prev, [campaignName]: spend }))
    setEditingSpend(null)
    refetchCosts()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Campaigns & Attribution</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">Performance by marketing channel with real-time revenue and conversion data</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/report-builder')}
            className="px-3 py-1.5 text-sm text-st-black dark:text-white bg-gray-50 dark:bg-[#111414] rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2E2E] font-medium">
            Advanced Report
          </button>
          <button onClick={() => {
            if (!site) return
            const params = new URLSearchParams({ site_key: site.site_key, model: 'last_touch', date_from: dateFrom, date_to: dateTo, group_by: activeDim, metric: 'revenue' })
            window.open(`/api/export/report?${params}`, '_blank')
          }} className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1A1D1D] border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-st-gray" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Filter by ${DIMENSIONS.find(d => d.key === activeDim)?.label?.toLowerCase() || 'name'}...`}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="flex bg-gray-100 dark:bg-[#252929] rounded-lg p-1">
            {DATE_RANGES.map(dr => (
              <button key={dr.label} onClick={() => setDateRange(dr.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dateRange === dr.days ? 'bg-white dark:bg-[#1A1D1D] text-st-black dark:text-white shadow-sm' : 'text-st-gray dark:text-gray-400 hover:text-gray-700'
                }`}>
                {dr.label}
              </button>
            ))}
          </div>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="low">Low Volume</option>
            <option value="none">No Activity</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-st-gray">
            <Filter className="w-3.5 h-3.5" />
            <span>{rows.length} results</span>
          </div>
        </div>
      </div>

      {/* Dimension Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {DIMENSIONS.map(d => (
          <button key={d.key} onClick={() => setActiveDim(d.key)}
            className={`px-3.5 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              activeDim === d.key ? 'bg-st-black text-white' : 'bg-gray-100 dark:bg-[#252929] text-gray-600 dark:text-gray-300 hover:bg-gray-200'
            }`}>
            {d.label}
          </button>
        ))}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricTile label="Total Revenue" value={`$${(kpis?.total_revenue || 0).toFixed(0)}`} />
        <MetricTile label="Conversions"   value={(kpis?.total_conversions || 0).toLocaleString()} />
        <MetricTile label="Avg Value"     value={`$${(kpis?.avg_value || 0).toFixed(2)}`} />
        <MetricTile label="Active Channels" value={(kpis?.active_channels || 0).toLocaleString()} />
        {(() => {
          const totalSpend = Object.values(spendMap).reduce((s, v) => s + (Number(v) || 0), 0)
          const totalRev   = kpis?.total_revenue || 0
          const roas = totalSpend > 0 ? (totalRev / totalSpend).toFixed(2) + 'x' : '—'
          return <MetricTile label="Blended ROAS" value={roas} isEmpty={totalSpend === 0} />
        })()}
      </div>

      {/* Campaign Table + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardCard title={DIMENSIONS.find(d => d.key === activeDim)?.label || 'Channels'}
          subtitle={isLoading ? 'Loading...' : `${rows.length} ${activeDim}s`}
          className="lg:col-span-2"
        >
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black mx-auto" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-st-gray">
              {search || statusFilter !== 'all'
                ? 'No results match your filters.'
                : 'No attribution data yet. UTM-tagged traffic will appear here after conversions.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      {DIMENSIONS.find(d => d.key === activeDim)?.label || 'Name'}
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Conversions
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Avg Value
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Trend
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      Spend ✏️
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      CPL
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wider">
                      ROAS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => {
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-[#252929] transition-colors">
                        <td className="py-3 px-4">
                          <p className="text-st-black dark:text-white font-medium">{r.name || 'unknown'}</p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <StatusBadge status={r.status} label={statusLabel(r.status)} />
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-st-black">
                          ${(r.revenue || 0).toFixed(0)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {r.conversions || 0}
                        </td>
                        <td className="py-3 px-4 text-right text-st-gray">
                          ${(r.avg_value || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {editingSpend === r.name ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                className="w-20 text-right border border-gray-300 rounded px-1 py-0.5 text-xs"
                                value={spendInput}
                                onChange={e => setSpendInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveSpend(r.name)}
                                autoFocus
                              />
                              <button onClick={() => saveSpend(r.name)} className="text-green-600 hover:text-green-700">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 group">
                              <span className="text-gray-600">{spendMap[r.name] ? `$${Number(spendMap[r.name]).toFixed(0)}` : '—'}</span>
                              <button onClick={() => { setEditingSpend(r.name); setSpendInput(spendMap[r.name] || '') }} className="opacity-0 group-hover:opacity-100 text-st-gray dark:text-gray-400 hover:text-gray-600">
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {spendMap[r.name] && spendMap[r.name] > 0 && r.conversions > 0
                            ? <span className="text-xs font-medium">${(spendMap[r.name] / r.conversions).toFixed(0)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {spendMap[r.name] && spendMap[r.name] > 0
                            ? <span className={Number(r.revenue || 0) / spendMap[r.name] >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>{(Number(r.revenue || 0) / spendMap[r.name]).toFixed(2)}x</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {r.trend != null ? (
                            <div className={`flex items-center justify-end gap-1 ${
                              r.trend >= 0 ? 'text-green-600' : 'text-red-500'
                            }`}>
                              {r.trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                              <span className="text-xs font-medium">{Math.abs(r.trend).toFixed(0)}%</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 text-st-gray">
                              <Eye className="w-3.5 h-3.5" />
                              <span className="text-xs">—</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Revenue Breakdown" subtitle="Top 10 by revenue">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          ) : rows.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-st-gray">
              No data to display
            </div>
          ) : (
            <div className="h-72">
              <Bar data={chartData} options={chartOptions} />
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
