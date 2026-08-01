import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js'
import { Users, RefreshCw, ArrowRight, Zap, AlertTriangle, Sparkles, LineChart } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import QueryError from '../components/QueryError'
import FilterBar from '../components/FilterBar'
import JourneyModal from '../components/JourneyModal'
import ConversionExplanationModal from '../components/ConversionExplanationModal'
import { SourceChip } from '../components/SourceIcon'
import { safeNumber } from '../utils/numbers'
import { useDashboardData, TIME_RANGES } from '../hooks/useDashboardData'

// AttributionPage renders /app/attribution. It shares EVERY fetch + derived value with
// Dashboard via useDashboardData() (no local recompute -> the two pages cannot drift).
// Redesign order follows design.md §10.9 / the redesign brief: Source Attribution first,
// trend, Landing Page, AI hero (§10.4), Recent Conversions (§10.8), GSC (§5.4).
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// §5.4 — mandatory GSC truth label (verbatim). Folded into the SEO table header, not a banner.
const GSC_TRUTH_LABEL = 'Matched by landing page and date range. Query revenue is estimated.'

export default function AttributionPage() {
  const [journeyLead, setJourneyLead] = useState(null)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [explainModel, setExplainModel] = useState('first_touch')
  const {
    site, navigate, previewMode, timeRange, setTimeRange, liveCount, freshnessLabel, handleExport,
    isLoading, isError, error, refetch,
    hasRevenue, isGscConnected, activeResults, topPagesResults, aiSourceRows, analyticsUnavailable,
    channelTrendResults, channelTrendData, chartOpts, convTooltipRows, recentConversions,
    totalConversions, setupIncomplete,
  } = useDashboardData()

  // §9.1 one-sentence insight — deterministic, cite-the-rows only (NO LLM narration, §26).
  const topSource = activeResults[0]
  const sourceInsight = !topSource ? null : (
    hasRevenue
      ? `${topSource.dim_value || topSource.source || 'Direct'} leads on revenue with $${safeNumber(topSource.revenue, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} across ${activeResults.length} source${activeResults.length === 1 ? '' : 's'}.`
      : `${topSource.dim_value || topSource.source || 'Direct'} leads with ${safeNumber(topSource.conversions, 0).toLocaleString()} conversion${safeNumber(topSource.conversions, 0) === 1 ? '' : 's'} across ${activeResults.length} source${activeResults.length === 1 ? '' : 's'}.`
  )

  // §10.4 AI hero — truthful headline built from real traffic only. No delta/sparkline is
  // shown because no prior-period AI series exists (§26: never fabricate one).
  const aiVisits = aiSourceRows.reduce((s, r) => s + safeNumber(r.visitors, 0), 0)
  const aiTopNames = aiSourceRows.slice(0, 2).map(r => r.name)
  const aiHeadline = aiVisits > 0
    ? `AI engines sent ${aiVisits.toLocaleString()} visit${aiVisits === 1 ? '' : 's'} this period${aiTopNames.length ? `, led by ${aiTopNames.join(' and ')}.` : '.'}`
    : null

  const trendHasData = channelTrendResults.filter(r => safeNumber(r.conversions, 0) > 0).length >= 2
  // Already conversions-only and newest-first from the endpoint; no client-side filter or re-sort.
  const conversionEvents = (recentConversions || []).slice(0, 5)

  return (
    <div className="st-container space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-dark-primary">Attribution</h2>
          {site && <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] text-st-gray dark:text-gray-300 text-xs">
              <Users className="w-3.5 h-3.5" />
              Recent visitors (5m): {liveCount}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1B1811] border border-gray-200 dark:border-[#3D3830] text-st-gray dark:text-gray-300 text-xs">
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
        <div className="space-y-6">
          {/* Onboarding / Installation Alert Banner */}
          {!previewMode && setupIncomplete && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-400">Tracking setup incomplete</h4>
                  <p className="text-amber-700 dark:text-gray-300 mt-0.5">No events received yet. Finish setup to start seeing analytics and attribution.</p>
                </div>
              </div>
              <button onClick={() => navigate('/setup')} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shrink-0 transition-colors self-start sm:self-center">
                Open Setup
              </button>
            </div>
          )}

          {/* ── a. Source Attribution — FIRST, with a one-sentence insight (§9.1) ── */}
          <DashboardCard title="Source Attribution" subtitle="Detailed performance breakdown by model">
            {sourceInsight && (
              <p className="text-sm text-st-black dark:text-dark-primary mb-4">{sourceInsight}</p>
            )}
            {/* :691 static label — NOT a dropdown. The multi-touch read is on a dead store
                and returns 100% Direct; a model selector here would ship a lie. Stays static. */}
            <div className="mb-4">
              <span className="inline-block px-3 py-1.5 border border-gray-200 dark:border-dark-border rounded-lg text-sm bg-gray-50 dark:bg-dark-bg text-st-black dark:text-dark-primary font-semibold">
                First-touch attribution
              </span>
            </div>
            {analyticsUnavailable ? (
              /* A failed read is NOT "no conversions" (§6). The backend flags it; render it
                 honestly instead of an empty state the user would act on. */
              <div className="py-8 text-center">
                <Zap className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-st-gray dark:text-gray-400">Attribution is temporarily unavailable. This is a loading problem on our side, not a gap in your data.</p>
              </div>
            ) : activeResults.length === 0 ? (
              <div className="py-8 text-center">
                <Zap className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-st-gray dark:text-gray-400">No conversions in this date range.</p>
                <button onClick={() => setTimeRange(30)} className="mt-2 text-xs font-semibold text-st-black dark:text-dark-primary hover:underline">Change date range</button>
              </div>
            ) : (
              <DashboardTable
                columns={
                  hasRevenue ? [
                    { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                    { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(2)}` },
                    { key: 'details', label: 'Details', render: () => (
                      <button onClick={() => { setExplainModel('first_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline">
                        View details
                      </button>
                    )}
                  ] : [
                    { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                    { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                    { key: 'cvr', label: 'CVR%', render: (r) => r.cvr > 0 ? `${r.cvr.toFixed(1)}%` : '—' },
                    { key: 'details', label: 'Details', render: () => (
                      <button onClick={() => { setExplainModel('first_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline">
                        View details
                      </button>
                    )}
                  ]
                }
                rows={activeResults}
              />
            )}
          </DashboardCard>

          {/* ── b. Source Performance Trend — §8.10 empty/1-point state, not a bare axis ── */}
          <DashboardCard title="Source Performance Trend" subtitle="Conversions by source over time">
            {trendHasData ? (
              <div className="h-64">
                <Line data={channelTrendData} options={chartOpts('', convTooltipRows)} />
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center">
                <LineChart className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
                <p className="text-sm text-st-gray dark:text-gray-400 max-w-xs">Not enough conversion history to plot a trend yet — this fills in as conversions land across the range.</p>
                <button onClick={() => setTimeRange(30)} className="mt-2 text-xs font-semibold text-st-black dark:text-dark-primary hover:underline">Widen date range</button>
              </div>
            )}
          </DashboardCard>

          {/* ── c. Landing Page Performance — {Page, Views} only ──
              The §10.7 columns (conversions/CVR/revenue/top-source chip/sparkline) need
              per-page conversion data that /dashboard/overview does not return
              (overview.landing_pages: []). This is a WIRING gap, not a missing capability —
              the attribution engine already computes it via
              getFlexibleReport(groupBy:'landing_page') (§16.5). Follow-up PR wires
              landing_pages from the engine into the overview payload. §5.1: the absent money
              columns are HIDDEN entirely, not rendered as a dash on every row. */}
          <DashboardCard title="Landing Page Performance" subtitle="Traffic by landing page">
            {topPagesResults.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="w-8 h-8 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-st-gray dark:text-gray-400">No landing-page traffic in this date range.</p>
              </div>
            ) : (
              <DashboardTable
                columns={[
                  { key: 'path', label: 'Landing Page', render: (r) => <span className="font-mono text-xs">{r.path || '/'}</span> },
                  { key: 'views', label: 'Views', render: (r) => safeNumber(r.views, 0).toLocaleString() }
                ]}
                rows={topPagesResults}
              />
            )}
          </DashboardCard>

          {/* ── d. AI Source Performance — PROMOTED hero (§10.4). Chips + real traffic. No
              fake delta/sparkline/recommendation (§26). Lime is the SIGNAL accent. ── */}
          {aiSourceRows.length > 0 ? (
            <div className="rounded-2xl border border-[#D2EC2A]/40 bg-[#D2EC2A]/[0.06] dark:bg-[#D2EC2A]/[0.04] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-st-black dark:text-dark-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-base font-semibold text-st-black dark:text-dark-primary">AI Source Performance</h3>
                    {aiHeadline && <p className="text-sm text-st-gray dark:text-gray-300 mt-0.5 max-w-xl">{aiHeadline}</p>}
                  </div>
                </div>
                <button onClick={() => navigate('/ai-sources')} className="text-xs font-semibold text-st-black dark:text-dark-primary flex items-center gap-1 shrink-0">
                  View AI sources <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {aiSourceRows.slice(0, 5).map((r) => (
                  <SourceChip key={r.name} source={r.name} />
                ))}
              </div>
              <DashboardTable
                columns={[
                  { key: 'source', label: 'AI Platform', render: (r) => <SourceChip source={r.name} /> },
                  { key: 'visitors', label: 'Traffic', render: (r) => safeNumber(r.visitors, 0).toLocaleString() },
                  { key: 'revenue', label: 'Revenue', render: (r) => r.revenue > 0 ? `$${r.revenue.toFixed(2)}` : '—' }
                ]}
                rows={aiSourceRows}
              />
            </div>
          ) : (
            <DashboardCard title="AI Source Performance" subtitle="Traffic and conversions from AI engines">
              <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No AI referrals detected yet.</p>
            </DashboardCard>
          )}

          {/* ── e. Recent Conversions/Leads — §10.8 (added; was missing on this tab) ── */}
          <DashboardCard
            title="Recent Conversions"
            subtitle={totalConversions > 0 ? `Latest attributed conversions • ${totalConversions} total` : 'Latest attributed conversions'}
            action={
              <button onClick={() => navigate('/leads')} className="text-xs font-semibold text-st-black dark:text-dark-primary flex items-center gap-1">
                View Leads <ArrowRight className="w-3 h-3" />
              </button>
            }
          >
            {conversionEvents.length === 0 ? (
              <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No conversions in the recent window.</p>
            ) : (
              <DashboardTable
                columns={[
                  { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.first_touch_source || 'Direct'} /> },
                  { key: 'event', label: 'Event', render: (r) => r.conversion_type || 'Conversion' },
                  { key: 'value', label: 'Value', render: (r) => safeNumber(r.conversion_value, 0) > 0 ? `$${safeNumber(r.conversion_value, 0).toFixed(2)}` : '—' },
                  { key: 'time', label: 'Time', render: (r) => new Date(r.conversion_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                  { key: 'action', label: '', render: (r) => (
                    r.visitor_id ? (
                      <button onClick={() => setJourneyLead(r)} className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline">
                        View journey
                      </button>
                    ) : (
                      <span className="text-xs text-st-gray">—</span>
                    )
                  )}
                ]}
                rows={conversionEvents}
              />
            )}
          </DashboardCard>

          {/* ── f. GSC — compact SEO surface only when connected. §5.4 label folded into the
              header (verbatim), NOT a standalone blue banner. ── */}
          {isGscConnected && (
            <DashboardCard title="Search Terms / SEO Queries" subtitle={GSC_TRUTH_LABEL}>
              <p className="text-sm text-st-gray dark:text-gray-400 py-4 text-center">No search query data matches in this range.</p>
            </DashboardCard>
          )}
        </div>
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

      <ConversionExplanationModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        siteKey={site?.site_key}
        model={explainModel}
      />
    </div>
  )
}
