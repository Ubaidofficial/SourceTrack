import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Search, Download, TrendingUp, TrendingDown, Filter, Eye } from 'lucide-react'
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaigns & Attribution</h2>
          <p className="text-sm text-gray-500 mt-0.5">Performance by marketing channel with real-time revenue and conversion data</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/report-builder')}
            className="px-3 py-1.5 text-sm text-gray-900 bg-gray-50 rounded-lg hover:bg-gray-100 font-medium">
            Advanced Report
          </button>
          <button onClick={() => {
            if (!site) return
            const params = new URLSearchParams({ site_key: site.site_key, model: 'last_touch', date_from: dateFrom, date_to: dateTo, group_by: activeDim, metric: 'revenue' })
            window.open(`/api/export/report?${params}`, '_blank')
          }} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Filter by ${DIMENSIONS.find(d => d.key === activeDim)?.label?.toLowerCase() || 'name'}...`}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            {DATE_RANGES.map(dr => (
              <button key={dr.label} onClick={() => setDateRange(dr.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  dateRange === dr.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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

          <div className="flex items-center gap-1.5 text-xs text-gray-400">
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
              activeDim === d.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {d.label}
          </button>
        ))}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricTile label="Total Revenue" value={`$${(kpis?.total_revenue || 0).toFixed(0)}`}
          iconBg="bg-green-100" iconColor="text-green-600" />
        <MetricTile label="Conversions" value={(kpis?.total_conversions || 0).toLocaleString()}
          iconBg="bg-blue-100" iconColor="text-blue-600" />
        <MetricTile label="Active Channels" value={(kpis?.active_channels || 0).toLocaleString()}
          iconBg="bg-lime-100" iconColor="text-lime-700" />
        <MetricTile label="Avg Value" value={`$${(kpis?.avg_value || 0).toFixed(2)}`}
          iconBg="bg-purple-100" iconColor="text-purple-600" />
        <MetricTile label="Date Range" value={`${dateRange} days`}
          iconBg="bg-gray-100" iconColor="text-gray-600" />
      </div>

      {/* Campaign Table + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardCard title={DIMENSIONS.find(d => d.key === activeDim)?.label || 'Channels'}
          subtitle={isLoading ? 'Loading...' : `${rows.length} ${activeDim}s`}
          className="lg:col-span-2"
        >
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {search || statusFilter !== 'all'
                ? 'No results match your filters.'
                : 'No attribution data yet. UTM-tagged traffic will appear here after conversions.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {DIMENSIONS.find(d => d.key === activeDim)?.label || 'Name'}
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Revenue
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Conversions
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Value
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => {
                    return (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <p className="text-gray-900 font-medium">{r.name || 'unknown'}</p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <StatusBadge status={r.status} label={statusLabel(r.status)} />
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-gray-900">
                          ${(r.revenue || 0).toFixed(0)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {r.conversions || 0}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500">
                          ${(r.avg_value || 0).toFixed(2)}
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
                            <div className="flex items-center justify-end gap-1 text-gray-400">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : rows.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
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
