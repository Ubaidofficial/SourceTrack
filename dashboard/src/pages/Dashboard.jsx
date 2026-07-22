import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { Line } from 'react-chartjs-2'
import { hasFeature } from '../lib/planFeatures'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  Users, ArrowRight, RefreshCw, Zap, AlertTriangle, Lock
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import QueryError from '../components/QueryError'
import { describeQueryError } from '../lib/queryError'
import FilterBar from '../components/FilterBar'
import JourneyModal from '../components/JourneyModal'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'
import { SourceChip } from '../components/SourceIcon'
import { safeNumber } from '../utils/numbers'
import { useDashboardData, MODELS, TIME_RANGES } from '../hooks/useDashboardData'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const METRIC_DEFS = {
  revenue: { label: 'Revenue', format: (v) => `$${v.toFixed(2)}` },
  conversions: { label: 'Conversions', format: (v) => v.toLocaleString() },
  sessions: { label: 'Sessions', format: (v) => v.toLocaleString() },
  leads: { label: 'Leads', format: (v) => v.toLocaleString() },
  conversion_rate: { label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%` },
  avg_conversion_value: { label: 'Avg Value', format: (v) => `$${v.toFixed(2)}` },
  ai_conversions: { label: 'AI Conversions', format: (v) => v.toLocaleString() },
  ai_revenue: { label: 'AI Revenue', format: (v) => `$${v.toFixed(2)}` },
  ai_conversion_share: { label: 'AI Conv Share', format: (v) => `${v.toFixed(1)}%` },
  ai_revenue_share: { label: 'AI Rev Share', format: (v) => `${v.toFixed(1)}%` },
  ltv_revenue: { label: 'LTV Revenue', format: (v) => `$${v.toFixed(2)}` }
}

function getRollingDateRange(days) {
  const safeDays = Number(days) > 0 ? Number(days) : 30
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - safeDays)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
}

export default function Dashboard() {
  const [journeyLead, setJourneyLead] = useState(null)
  const {
    user, site, siteLoading, navigate, previewMode, previewSiteName, previewSiteDomain,
    timeRange, setTimeRange, liveCount, freshnessLabel, handleExport,
    isLoading, isError, error, refetch,
    overview, analyticsSummary, recentConversions, dashboardReports,
    kpis, totalRevenue, totalConversions, totalLeads, leadsTracked, totalCustomers,
    leadConvRate, customerConvRate, avgValue, revenueDelta, leadsDelta, customersDelta,
    aiRevResults, aiSourceRows, activeResults, topPagesResults, timeResults,
    models, modelRevenues, revTrendData, channelTrendResults, channelTrendData,
    revTooltipRows, convTooltipRows, chartOpts, hasRevenue, isGscConnected,
    trafficKpis, trafficVisitors, trafficPageviews, trafficSources, trafficTopPages,
    hasConversions, hasTraffic,
  } = useDashboardData()

  // Already conversions-only and newest-first from the endpoint; no client-side filter or re-sort.
  const conversionRows = (recentConversions || []).slice(0, 5)

  return (
    <div className="st-container space-y-6">


      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-dark-primary">
            Dashboard
          </h2>
          {site && <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray dark:text-gray-300 text-xs">
              <Users className="w-3.5 h-3.5" />
              Recent visitors (5m): {liveCount}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray dark:text-gray-300 text-xs">
              <RefreshCw className="w-3 h-3" />
              Updated {freshnessLabel}
            </div>
            <FilterBar
              dateButtons={TIME_RANGES.map((tr) => ({ key: tr.days, label: tr.label }))}
              activeDate={timeRange}
              onDateChange={setTimeRange}
              onExport={handleExport}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-white" />
        </div>
      ) : isError ? (
        <QueryError isError={isError} error={error} onRetry={refetch} />
      ) : (
        <>
          {/* Onboarding / Installation Alert Banner */}
          {!isLoading && !previewMode && site && (!site.last_seen_at || site.onboarding_completed === false) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-400">Tracking setup incomplete</h4>
                  <p className="text-amber-700 dark:text-gray-300 mt-0.5">No events received yet. Finish setup to start seeing analytics and attribution.</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/setup')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shrink-0 transition-colors self-start sm:self-center"
              >
                Open Setup
              </button>
            </div>
          )}

          <div className="space-y-6">
              {!hasTraffic ? (
                <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-200 dark:border-[#2A2E2E] p-12 text-center flex flex-col items-center justify-center space-y-6">
                  <div>
                    <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-st-black dark:text-dark-primary mb-2">No attribution data yet</h3>
                    <p className="text-sm text-st-gray dark:text-gray-400 max-w-md mx-auto">
                      {!site?.last_seen_at
                        ? 'Install the tracker on your website to start seeing traffic and attribution reports.'
                        : 'Your dashboard is empty because no traffic or conversion data has been recorded for this date range.'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/snippet')}
                    className="px-4 py-2 bg-st-black text-white rounded-lg text-xs font-semibold hover:bg-st-black/90 transition-colors flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" /> Go to Install Guide
                  </button>
                </div>
              ) : !hasConversions ? (
                /* ── STATE (b): traffic exists, zero conversion events ─────────── */
                <>
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-200 dark:border-[#2A2E2E] p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-st-black dark:text-dark-primary shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-base font-semibold text-st-black dark:text-dark-primary">
                          You're getting visitors — now tell SourceTrack what counts as a conversion.
                        </h3>
                        <p className="text-sm text-st-gray dark:text-gray-400 mt-1 max-w-xl">
                          Traffic is flowing in. Set up conversion events to unlock revenue, attribution, and ROI reporting.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/setup?tab=conversions')}
                      className="px-4 py-2 bg-st-black text-white rounded-lg text-xs font-semibold hover:bg-st-black/90 transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      Set up conversion events <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Traffic KPIs (real data) + gated conversions tile */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricTile label="Visitors" value={trafficVisitors} format="number" />
                    <MetricTile label="Pageviews" value={trafficPageviews} format="number" />
                    <MetricTile label="Conversions" value="—" sub="No conversion events yet" />
                  </div>

                  {/* Command Center Nav */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate('/analytics')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Analytics <ArrowRight className="w-3 h-3" /></button>
                    <button onClick={() => navigate('/setup?tab=conversions')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Set up conversions <ArrowRight className="w-3 h-3" /></button>
                  </div>

                  {/* Top Sources + Top Pages — Analytics traffic data path */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DashboardCard title="Top Sources" subtitle="Traffic by source">
                      {trafficSources.length === 0 ? (
                        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No traffic detected yet.</p>
                      ) : (
                        <DashboardTable
                          columns={[
                            { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.source || 'Direct'} /> },
                            { key: 'visits', label: 'Visits', render: (r) => safeNumber(r.visits, 0).toLocaleString() }
                          ]}
                          rows={trafficSources.slice(0, 5)}
                        />
                      )}
                    </DashboardCard>

                    <DashboardCard title="Top Pages" subtitle="Most viewed pages">
                      {trafficTopPages.length === 0 ? (
                        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No page data yet.</p>
                      ) : (
                        <DashboardTable
                          columns={[
                            { key: 'page', label: 'Page', render: (r) => <span className="font-mono text-xs">{(r.page || '/').replace(/^https?:\/\/[^/]+/, '') || '/'}</span> },
                            { key: 'views', label: 'Views', render: (r) => safeNumber(r.views, 0).toLocaleString() }
                          ]}
                          rows={trafficTopPages.slice(0, 5)}
                        />
                      )}
                    </DashboardCard>
                  </div>

                  {/* Truth-gate: revenue / attribution withheld until conversions exist */}
                  <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-4 flex items-start gap-3 shadow-sm">
                    <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray dark:bg-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-st-black dark:text-dark-primary">Revenue &amp; attribution — no conversion events yet</p>
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                        Revenue, source attribution, and ROI reporting appear here once your site sends conversion events. See the <a href="/developers/conversions" className="underline hover:text-st-black dark:hover:text-dark-text transition-colors">conversion events docs</a> or <button onClick={() => navigate('/setup?tab=conversions')} className="underline hover:text-st-black dark:hover:text-dark-text transition-colors">set them up now</button>.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* KPI Strip: strictly max 3 primary KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {hasRevenue ? (
                  <>
                    <MetricTile
                      label="Revenue"
                      value={totalRevenue}
                      format="currency"
                      trend={revenueDelta?.pct}
                      sub={avgValue > 0 ? `Avg value: $${avgValue.toFixed(2)}` : null}
                    />
                    <MetricTile
                      label="Leads"
                      value={leadsTracked ? totalLeads : null}
                      isEmpty={!leadsTracked}
                      emptyReason="No lead events tracked for this site"
                      trend={leadsTracked ? leadsDelta?.pct : null}
                      sub={leadsTracked && leadConvRate > 0 ? `${leadConvRate.toFixed(1)}% conversion rate` : null}
                    />
                    <MetricTile
                      label="Customers"
                      value={totalCustomers}
                      trend={customersDelta?.pct}
                      sub={customerConvRate > 0 ? `${customerConvRate.toFixed(1)}% conversion rate` : null}
                    />
                  </>
                ) : (
                  <>
                    <MetricTile
                      label="Total Leads"
                      value={leadsTracked ? totalLeads : null}
                      isEmpty={!leadsTracked}
                      emptyReason="No lead events tracked for this site"
                      trend={leadsTracked ? leadsDelta?.pct : null}
                    />
                    <MetricTile
                      label="Customers"
                      value={totalCustomers}
                      trend={customersDelta?.pct}
                    />
                    <MetricTile
                      label="Lead Conversion Rate"
                      value={leadsTracked && totalLeads > 0 ? leadConvRate : null}
                      format="percent"
                      isEmpty={!leadsTracked || totalLeads === 0}
                      emptyReason={leadsTracked ? 'Not yet tracked' : 'No lead events tracked for this site'}
                    />
                  </>
                )}
              </div>

              {/* Secondary metric: Bounce Rate. Truth-gated — hidden entirely
                  when null (Analytics path / no data); never a fake 0% placeholder. */}
              {kpis.bounce_rate != null && (
                <div className="flex flex-wrap gap-4">
                  <div className="w-full sm:w-52" title="Bounce rate — share of sessions with only one page or action.">
                    <MetricTile
                      label="Bounce Rate"
                      value={`${Number(kpis.bounce_rate).toFixed(1)}%`}
                      compact
                      sub="Sessions with one page/action"
                    />
                  </div>
                </div>
              )}

              {/* Command Center Nav */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate('/analytics')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Analytics <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/app/attribution')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Attribution <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/leads')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Leads <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/app/integrations')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Integrations <ArrowRight className="w-3 h-3" /></button>
              </div>

              {/* Performance Trend Chart */}
              <DashboardCard title="Performance Trend" subtitle={`Last ${timeRange} days • ${site?.timezone || 'UTC'}`}>
                <div className="h-64">
                  <Line data={hasRevenue ? revTrendData : channelTrendData} options={chartOpts(hasRevenue ? '$' : '', hasRevenue ? revTooltipRows : convTooltipRows)} />
                </div>
              </DashboardCard>

              {/* Top Sources & Recent Conversions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardCard title="Top Sources" subtitle="Traffic and conversions by source">
                  {activeResults.length === 0 ? (
                    <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No traffic detected yet.</p>
                  ) : (
                    <DashboardTable
                      columns={[
                        { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                        { key: 'conversions', label: 'Conversions', render: (r) => r.conversions },
                        { key: 'revenue', label: 'Revenue', render: (r) => hasRevenue ? `$${(r.revenue || 0).toFixed(2)}` : '—' }
                      ].filter(c => hasRevenue || c.key !== 'revenue')}
                      rows={activeResults.slice(0, 5)}
                    />
                  )}
                </DashboardCard>

                <DashboardCard title="Recent Conversions" subtitle={totalConversions > 0 ? `Latest attributed conversions • ${totalConversions} total` : 'Latest attributed conversions'}
                  action={
                    <button onClick={() => navigate('/leads')} className="text-xs font-semibold text-st-black dark:text-dark-primary flex items-center gap-1">
                      View Leads <ArrowRight className="w-3 h-3" />
                    </button>
                  }
                >
                  {conversionRows.length === 0 ? (
                    <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No conversions in the recent window.</p>
                  ) : (
                    <DashboardTable
                      columns={[
                        { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.first_touch_source || 'Direct'} /> },
                        { key: 'event', label: 'Event', render: (r) => r.conversion_type || 'Conversion' },
                        { key: 'time', label: 'Time', render: (r) => new Date(r.conversion_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                        { key: 'action', label: '', render: (r) => (
                          r.visitor_id ? (
                            <button
                              onClick={() => setJourneyLead(r)}
                              className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline"
                            >
                              View journey
                            </button>
                          ) : (
                            <span className="text-xs text-st-gray">—</span>
                          )
                        )}
                      ]}
                      rows={conversionRows}
                    />
                  )}
                </DashboardCard>
              </div>

              {/* AI Source Performance (Only if real AI traffic or conversions exist) */}
              {aiSourceRows.length > 0 && (
                <DashboardCard title="AI Source Performance" subtitle="Traffic and conversions from AI engines">
                  <DashboardTable
                    columns={[
                      { key: 'source', label: 'AI Platform', render: (r) => <SourceChip source={r.name} /> },
                      { key: 'visitors', label: 'Traffic', render: (r) => safeNumber(r.visitors, 0).toLocaleString() },
                      { key: 'revenue', label: 'Revenue', render: (r) => r.revenue > 0 ? `$${r.revenue.toFixed(2)}` : '—' }
                    ]}
                    rows={aiSourceRows}
                  />
                </DashboardCard>
              )}

              {/* Pinned Reports Widgets - strictly below core cards */}
              {hasFeature(site?.plan, 'dashboard_widgets') && (
                <DashboardCard title="Pinned Reports" subtitle="Saved report widgets pinned to your dashboard">
                  {dashboardReports.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
                      <p className="text-sm text-st-gray dark:text-gray-400">No pinned reports yet. Pin reports from the Report Builder.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {dashboardReports.map((report) => (
                        <DashboardWidgetCard key={report.id} report={report} site={site} />
                      ))}
                    </div>
                  )}
                </DashboardCard>
              )}
            </>
          )}
        </div>
        </>
      )}

      {journeyLead?.visitor_id && (
        <JourneyModal
          visitorId={journeyLead.visitor_id}
          siteKey={site?.site_key}
          leadSummary={{ id: journeyLead.visitor_id }}
          onClose={() => setJourneyLead(null)}
          onQualified={() => setJourneyLead(null)}
        />
      )}
    </div>
  )
}

// Isolated Dashboard Widget Component
function DashboardWidgetCard({ report, site }) {
  const navigate = useNavigate()
  const cfg = report.config || {}

  // Guardrail 3: Handle legacy/invalid configurations safely
  const reportDateRange = (() => {
    try {
      if (cfg.isRolling) {
        return getRollingDateRange(cfg.rollingDays || 30)
      }
      return {
        from: cfg.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        to: cfg.dateTo || format(new Date(), 'yyyy-MM-dd')
      }
    } catch (e) {
      console.warn("Invalid widget date range:", report.id, e)
      return {
        from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd')
      }
    }
  })()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'saved-report-data',
      report.id,
      report.updated_at,
      site?.site_key,
      JSON.stringify(cfg)
    ],
    queryFn: async () => {
      // Guardrail 3: do not execute if config missing metric
      if (!cfg.metric) {
        throw new Error('Config missing metric')
      }
      const params = new URLSearchParams({
        site_key: site.site_key,
        model: cfg.model || 'last_touch',
        date_from: reportDateRange.from,
        date_to: reportDateRange.to,
        group_by: cfg.groupBy || 'source',
        metric: cfg.metric || 'revenue'
      })
      if (cfg.granularity && cfg.granularity !== 'day') params.set('time_granularity', cfg.granularity)
      if (cfg.groupBy2) params.set('group_by2', cfg.groupBy2)
      if (cfg.attributionWindow) params.set('attribution_window', cfg.attributionWindow)
      if (cfg.attributeBy && cfg.attributeBy !== 'conversion_date') params.set('attribute_by', cfg.attributeBy)
      if (cfg.filters) {
        Object.entries(cfg.filters).forEach(([k, v]) => {
          if (v) params.set(`filter_${k}`, v)
        })
      }
      return fetchApi(`/attribution?${params}`)
    },
    enabled: !!site?.site_key && !!cfg.metric
  })

  const results = data?.results || []
  const nightlyNotice = data?._notice || null
  const total = results.reduce((s, r) => {
    const metricKey = cfg.metric || 'revenue'
    return s + (r[metricKey] || r.revenue || r.conversions || r.sessions || 0)
  }, 0)
  const metricDef = METRIC_DEFS[cfg.metric] || METRIC_DEFS.revenue
  const maxVal = Math.max(...results.slice(0, 4).map(r => {
    const mk = cfg.metric || 'revenue'
    return r[mk] || r.revenue || r.conversions || r.sessions || 0
  }), 1)

  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-1 md:col-span-2',
    large: 'col-span-1 md:col-span-3'
  }
  const sizeClass = sizeClasses[report.dashboard_size] || sizeClasses.medium

  return (
    <div className={`bg-gray-50 dark:bg-[#111414] rounded-lg p-4 text-left border border-gray-100 dark:border-[#2A2E2E] hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex flex-col justify-between ${sizeClass}`}>
      <div>
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-[#2A2E2E] pb-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-st-black dark:text-dark-primary truncate" title={report.name}>{report.name}</h4>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9px] text-st-gray dark:text-gray-400 mt-0.5">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 dark:bg-white/10 text-[9px] font-semibold text-st-black dark:text-dark-primary"
                title={`Attribution model: ${MODELS.find(m => m.key === cfg.model)?.label || cfg.model}. The model determines which touch in the customer journey gets credit for this metric.`}
              >
                {MODELS.find(m => m.key === cfg.model)?.label || cfg.model}
              </span>
              <span>•</span>
              <span className="truncate">{cfg.groupBy}</span>
              {cfg.isRolling && (
                <>
                  <span>•</span>
                  <span className="text-lime-700 font-medium">Rolling ({cfg.rollingDays}d)</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              sessionStorage.setItem('sourcetrack_edit_widget', JSON.stringify({
                id: report.id, name: report.name, ...cfg
              }))
              navigate(`/report-builder?edit=${report.id}`)
            }}
            className="text-[10px] text-st-gray hover:text-st-black dark:hover:text-dark-text font-medium shrink-0"
          >
            Edit
          </button>
        </div>

        {isLoading ? (
          <div className="h-28 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-st-gray dark:text-gray-400" />
          </div>
        ) : isError ? (
          // Gated (422) -> calm Lock + "Temporarily unavailable": a deliberate server deny is
          // not a failure, and retrying it cannot help. Otherwise -> honest generic copy.
          //
          // ANTI-DRIFT: no gated dim/metric list lives here. The server's error_code IS the
          // source; describeQueryError is the only gate-derived helper this file touches.
          // Inline rather than <QueryError> because that component is sized for a full surface
          // (px-6 py-10) and this card is h-28 — same descriptor, compact shell.
          (() => {
            const desc = describeQueryError(error)
            return (
              <div className="h-28 flex flex-col items-center justify-center text-center p-2 gap-0.5">
                {desc.isGated
                  ? <Lock className="w-3.5 h-3.5 text-st-gray dark:text-gray-400" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                <span className={`text-xs font-semibold ${desc.isGated ? 'text-st-black dark:text-dark-primary' : 'text-amber-600 dark:text-amber-400'}`}>
                  {desc.title}
                </span>
                <p className="text-[9px] text-st-gray dark:text-gray-400 leading-normal line-clamp-3">
                  {desc.message}
                </p>
              </div>
            )
          })()
        ) : results.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-st-gray dark:text-gray-400 text-xs text-center p-4">
            {nightlyNotice ? (
              <span>
                <span className="block font-semibold text-amber-600 dark:text-amber-400 mb-1">Nightly calculation pending</span>
                <span className="block text-[10px] leading-snug">This model needs processed attribution data. If your site is new or the nightly job hasn't run yet, this report will populate once it does.</span>
              </span>
            ) : (
              <span>No data for this selection</span>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-st-black dark:text-dark-primary tabular-nums">
                {metricDef.format(total)}
              </span>
              <span className="text-[10px] text-st-gray dark:text-gray-400">{metricDef.label}</span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-gray-100/50 dark:border-[#2A2E2E]/50">
              {results.slice(0, 5).map((r, i) => {
                const mk = cfg.metric || 'revenue'
                const val = r[mk] || r.revenue || r.conversions || r.sessions || 0
                const barW = maxVal > 0 ? (val / maxVal) * 100 : 0
                const label = r.dim_value || '—'
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-st-gray dark:text-gray-400 truncate inline-flex items-center max-w-full" title={label}>
                        <span className="truncate">{label}</span>
                        {isDirectLabel(label) && <DirectInfo />}
                      </span>
                      <div style={{ height: '2px', width: `${barW}%`, background: 'rgba(204,240,63,0.6)', borderRadius: '1px', marginTop: '3px' }} />
                    </div>
                    <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 w-14 text-right flex-shrink-0 tabular-nums">
                      {metricDef.format(val)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
