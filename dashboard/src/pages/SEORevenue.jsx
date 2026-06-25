import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Search, AlertTriangle, RefreshCw, BarChart2, MousePointer, Eye, DollarSign, Award, ChevronRight } from 'lucide-react'
import { formatCurrency, formatPercent } from '../utils/numbers'
import { hasRevenueData } from './seoRevenueTruthGate'

export default function SEORevenue() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [selectedPagePath, setSelectedPagePath] = useState(null)

  // 1. Fetch site context
  const { data: site } = useQuery({
    queryKey: ['site-seo-revenue', user?.id],
    queryFn: async () => {
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
      return data
    },
    enabled: !!user
  })

  // Calculate standard GSC daily performance lag ranges (skip today's date)
  const dateRange = useMemo(() => {
    const toDate = new Date()
    toDate.setDate(toDate.getDate() - 1) // yesterday
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    return {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0]
    }
  }, [days])

  // 2. Fetch SEO revenue allocation report data
  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['seo-revenue-report', site?.site_key, dateRange.from, dateRange.to],
    queryFn: () =>
      fetchApi(`/seo-revenue?site_key=${site.site_key}&from=${dateRange.from}&to=${dateRange.to}`),
    enabled: !!site?.site_key
  })

  // Get selected landing page queries
  const selectedPageQueries = useMemo(() => {
    if (!selectedPagePath || !reportData?.landing_pages) return []
    const page = reportData.landing_pages.find(p => p.page_path === selectedPagePath)
    return page?.queries || []
  }, [selectedPagePath, reportData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-st-lime animate-spin" />
      </div>
    )
  }

  const gscConnected = !!reportData?.gsc_connected
  const gscPropertySelected = !!reportData?.gsc_property_selected
  const summary = reportData?.summary || { organic_conversions: 0, organic_revenue: 0, gsc_clicks: 0 }
  const landingPages = reportData?.landing_pages || []
  // Truth-gate: only show revenue figures when revenue genuinely exists. When
  // there's no revenue at all, show a calm empty-state instead of a fake $0.
  const hasRevenue = hasRevenueData(summary, landingPages)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">SEO Revenue Allocation</h2>
          <p className="text-sm text-st-gray mt-0.5">
            Landing-page matched SEO revenue estimates & associated search console queries
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={e => {
              setDays(Number(e.target.value))
              setSelectedPagePath(null)
            }}
            className="px-3 py-1.5 bg-[#1A1D1D] border border-[#2A2E2E] text-white rounded-lg text-xs font-semibold focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => refetch()}
            className="p-1.5 bg-[#1A1D1D] hover:bg-[#242829] border border-[#2A2E2E] rounded-lg text-st-gray hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Integration Callouts / Error States */}
      {!gscConnected ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">Google Search Console is not connected</p>
              <p className="text-xs text-st-gray mt-0.5">
                Connect your account in Integrations to stitch aggregate queries and clicks to organic conversions.
              </p>
            </div>
          </div>
          <Link
            to="/app/integrations"
            className="px-3.5 py-1.5 bg-st-lime text-black font-semibold rounded-lg text-xs hover:bg-st-lime/90 transition-colors shrink-0 text-center"
          >
            Connect Integration
          </Link>
        </div>
      ) : (
        !gscPropertySelected && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">No Search Console Property Selected</p>
                <p className="text-xs text-st-gray mt-0.5">
                  You must select a verified property URL to fetch search analytics data.
                </p>
              </div>
            </div>
            <Link
              to="/app/integrations"
              className="px-3.5 py-1.5 bg-st-lime text-black font-semibold rounded-lg text-xs hover:bg-st-lime/90 transition-colors shrink-0 text-center"
            >
              Select Property
            </Link>
          </div>
        )
      )}

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Award className="w-4 h-4 text-st-lime" />
            <p className="text-[11px] text-st-gray font-medium uppercase tracking-wider">Organic Search Conversions</p>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{summary.organic_conversions.toLocaleString()}</p>
          <p className="text-[10px] text-st-gray mt-0.5">First-touch organic conversions</p>
        </div>

        <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-400" />
            <p className="text-[11px] text-st-gray font-medium uppercase tracking-wider">Organic Search Revenue</p>
          </div>
          {hasRevenue ? (
            <>
              <p className="text-2xl font-bold text-white tabular-nums">{formatCurrency(summary.organic_revenue, 0)}</p>
              <p className="text-[10px] text-st-gray mt-0.5">First-touch organic revenue</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-st-gray tabular-nums">No revenue yet</p>
              <p className="text-[10px] text-st-gray mt-0.5">Connect Stripe, a webhook, or manual conversion values</p>
            </>
          )}
        </div>

        <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <MousePointer className="w-4 h-4 text-blue-400" />
            <p className="text-[11px] text-st-gray font-medium uppercase tracking-wider">GSC Organic Clicks</p>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {gscConnected && gscPropertySelected ? summary.gsc_clicks.toLocaleString() : '—'}
          </p>
          <p className="text-[10px] text-st-gray mt-0.5">Total search clicks for matching pages</p>
        </div>
      </div>

      {/* Report Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Landing Pages Table (Primary) */}
        <div className="lg:col-span-2 bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Top Organic Landing Pages</h3>
            <span className="text-[10px] text-st-gray uppercase tracking-wider">SourceTrack + GSC</span>
          </div>

          <div className="overflow-x-auto">
            {landingPages.length === 0 ? (
              <p className="text-xs text-st-gray py-12 text-center">No organic search traffic or conversions recorded in this date range.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#2A2E2E] text-st-gray text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-medium">Landing Page Path</th>
                    <th className="py-2.5 px-3 font-medium text-right">Conversions</th>
                    <th className="py-2.5 px-3 font-medium text-right">Revenue</th>
                    <th className="py-2.5 px-3 font-medium text-right">GSC Clicks</th>
                    <th className="py-2.5 px-3 font-medium text-right">Impressions</th>
                    <th className="py-2.5 px-4 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {landingPages.map(page => (
                    <tr
                      key={page.page_path}
                      onClick={() => setSelectedPagePath(page.page_path)}
                      className={`border-b border-[#2A2E2E]/60 last:border-0 hover:bg-[#242829] cursor-pointer transition-colors text-xs ${
                        selectedPagePath === page.page_path ? 'bg-st-lime/5 border-l-2 border-l-st-lime' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-white max-w-[200px] truncate" title={page.page_path}>
                        {page.page_path}
                      </td>
                      <td className="py-3 px-3 text-right text-white tabular-nums font-semibold">
                        {page.conversions.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right text-orange-400 tabular-nums">
                        {hasRevenue ? formatCurrency(page.revenue, 0) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-white tabular-nums">
                        {gscConnected && gscPropertySelected ? page.clicks.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-st-gray tabular-nums">
                        {gscConnected && gscPropertySelected ? page.impressions.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          selectedPagePath === page.page_path
                            ? 'bg-st-lime text-black'
                            : 'bg-[#2a2e2e] text-st-gray hover:text-white'
                        }`}>
                          Queries
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Associated Queries Side panel (Secondary) */}
        <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#2A2E2E]">
            <h3 className="text-sm font-semibold text-white">Associated Queries</h3>
            <p className="text-[10px] text-st-gray mt-0.5">
              {selectedPagePath ? `Landing Page: ${selectedPagePath}` : 'Select a landing page on the left to view queries'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[600px]">
            {!selectedPagePath ? (
              <div className="text-center py-20 px-4">
                <Search className="w-10 h-10 text-[#2A2E2E] mx-auto mb-3" />
                <p className="text-xs font-semibold text-white">No Page Selected</p>
                <p className="text-[11px] text-st-gray mt-1">Select a landing page path from the table to distribute organic conversions to GSC keywords.</p>
              </div>
            ) : selectedPageQueries.length === 0 ? (
              <p className="text-xs text-st-gray py-20 text-center px-4">
                No Search Console keywords linked to this path. Verify GSC property domain settings.
              </p>
            ) : (
              <div className="divide-y divide-[#2A2E2E]/60">
                {selectedPageQueries.map(q => (
                  <div key={q.query} className="p-4 space-y-2 hover:bg-[#242829]/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-white font-mono break-all" title={q.query}>
                        {q.query}
                      </p>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-orange-400 tabular-nums">
                          {hasRevenue ? formatCurrency(q.estimated_revenue, 0) : '—'}
                        </p>
                        <p className="text-[10px] text-st-gray tabular-nums">
                          {q.estimated_conversions.toFixed(1)} conversions
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-[10px] text-st-gray pt-1">
                      <div>
                        <span className="block font-medium text-[9px] uppercase tracking-wider">Clicks</span>
                        <span className="text-white font-semibold tabular-nums">{q.clicks.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-[9px] uppercase tracking-wider">Impressions</span>
                        <span className="text-white font-semibold tabular-nums">{q.impressions.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-[9px] uppercase tracking-wider">CTR</span>
                        <span className="text-white font-semibold tabular-nums">{formatPercent(q.ctr, 1)}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-[9px] uppercase tracking-wider">Avg Pos</span>
                        <span className="text-white font-semibold tabular-nums">{q.position.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate Query Disclaimer Alert */}
      <div className="bg-blue-900/15 border border-blue-900/30 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-200 leading-relaxed font-sans">
          <strong>Aggregated Data Notice:</strong> Google Search Console provides aggregated query data, not user-level query-to-conversion identity. Query revenue is estimated from click share on matching landing pages.
        </p>
      </div>
    </div>
  )
}
