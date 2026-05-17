import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js'
import { Bot, DollarSign, TrendingUp, BarChart3, Sparkles, ArrowUpRight, ArrowDownRight, Zap, RefreshCw, AlertTriangle, TrendingDown, Activity } from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com AI', 'Phind', 'Kagi']

const COLORS = [
  'rgba(17, 24, 39, 0.85)',
  'rgba(215, 245, 80, 0.85)',
  'rgba(107, 114, 128, 0.85)',
  'rgba(55, 65, 81, 0.85)',
  'rgba(209, 213, 219, 0.85)',
  'rgba(31, 41, 55, 0.85)',
  'rgba(180, 195, 60, 0.85)'
]

export default function AIAnalytics() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)

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

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['ai-analytics', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return null
      const params = new URLSearchParams({ site_key: site.site_key, days: '30' })
      return fetchApi(`/ai-analytics/overview?${params}`)
    },
    enabled: !!site?.site_key
  })

  const kpis = analytics?.kpis || {}
  const platforms = analytics?.platforms || []
  const trend = analytics?.trend || []
  const hasData = platforms.length > 0

  const trendChartData = {
    labels: trend.map(r => r.dim_value || ''),
    datasets: [{
      label: 'AI Revenue',
      data: trend.map(r => r.ai_revenue || 0),
      borderColor: COLORS[0], backgroundColor: 'rgba(17, 24, 39, 0.06)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2
    }]
  }

  const platformChartData = {
    labels: platforms.map(p => p.platform),
    datasets: [{
      label: 'Revenue',
      data: platforms.map(p => p.revenue),
      backgroundColor: platforms.map((_, i) => COLORS[i % COLORS.length]),
      borderRadius: 4
    }]
  }

  const chartOpts = (prefix = '$') => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v) => `${prefix}${v}`, maxTicksLimit: 5 }, grid: { color: '#f3f4f6' } },
      x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }
    }
  })

  const aovDelta = kpis.ai_aov && kpis.non_ai_aov && kpis.non_ai_aov > 0
    ? { pct: ((kpis.ai_aov - kpis.non_ai_aov) / kpis.non_ai_aov) * 100, up: kpis.ai_aov >= kpis.non_ai_aov }
    : null

  const insights = []
  if (hasData) {
    if (kpis.ai_conversion_rate && kpis.non_ai_conversion_rate && kpis.non_ai_conversion_rate > 0) {
      const crDelta = ((kpis.ai_conversion_rate - kpis.non_ai_conversion_rate) / kpis.non_ai_conversion_rate) * 100
      if (crDelta > 30) {
        insights.push({ title: 'AI converts significantly better', desc: `AI traffic converts at ${kpis.ai_conversion_rate.toFixed(2)}% vs ${kpis.non_ai_conversion_rate.toFixed(2)}% for non-AI — ${crDelta.toFixed(0)}% higher. Consider increasing AI-platform visibility.`, positive: true })
      } else if (crDelta > 5) {
        insights.push({ title: 'AI converts better than non-AI', desc: `AI conversion rate (${kpis.ai_conversion_rate.toFixed(2)}%) is ${crDelta.toFixed(0)}% above non-AI (${kpis.non_ai_conversion_rate.toFixed(2)}%). AI traffic shows stronger intent.`, positive: true })
      }
    }
    if (kpis.ai_aov && kpis.non_ai_aov && kpis.non_ai_aov > 0) {
      const aovPct = ((kpis.ai_aov - kpis.non_ai_aov) / kpis.non_ai_aov) * 100
      if (aovPct > 10) {
        insights.push({ title: 'AI buyers spend more', desc: `Average order value from AI sources ($${kpis.ai_aov.toFixed(2)}) is ${aovPct.toFixed(0)}% higher than non-AI ($${kpis.non_ai_aov.toFixed(2)}). AI-referred customers have higher purchase intent.`, positive: true })
      }
    }
    if (platforms.length >= 2) {
      const top = platforms[0]
      const second = platforms[1]
      if (top.revenue > 0 && second.revenue > 0 && top.revenue > second.revenue * 1.5) {
        const share = kpis.ai_revenue > 0 ? ((top.revenue / kpis.ai_revenue) * 100).toFixed(0) : 0
        insights.push({ title: `${top.platform} dominates AI traffic`, desc: `${top.platform} drives ${share}% of all AI revenue ($${top.revenue.toFixed(0)} vs $${second.revenue.toFixed(0)} from ${second.platform}). Optimize content for ${top.platform} visibility.`, positive: true })
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-st-black">AI Analytics</h2>
        <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Performance from AI platforms — ChatGPT, Claude, Perplexity, Gemini, and more</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
        </div>
      ) : !hasData ? (
        <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#333838] p-12 text-center">
          <Sparkles className="w-12 h-12 text-lime-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-st-black dark:text-white mb-2">No AI traffic detected yet</h3>
          <p className="text-sm text-st-gray dark:text-gray-400 max-w-md mx-auto mb-6">
            AI Analytics shows you which AI platforms (ChatGPT, Claude, Perplexity, etc.) send visitors to your site — and which of those visitors convert.
          </p>
          <div className="space-y-2 text-xs text-st-gray dark:text-gray-400 text-left max-w-sm mx-auto">
            <p className="font-medium text-gray-700">How AI tracking works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>When a visitor clicks a link in ChatGPT, Claude, or another AI tool, the referrer header is detected</li>
              <li>The AI platform name is stored as <code className="bg-gray-100 dark:bg-[#252929] px-1 rounded text-xs">ai_source</code> on every event</li>
              <li>Conversions from AI-sourced traffic are attributed to the specific platform</li>
              <li>This page shows AI revenue, conversions, conversion rates, and trends</li>
            </ul>
            <p className="text-st-gray dark:text-gray-400 mt-3">If your site gets AI traffic but nothing appears here, check the Event Logger for pageview events with ai_source values.</p>
          </div>
          <button onClick={() => window.location.href = '/snippet'}
            className="mt-6 px-4 py-2 bg-st-black text-white rounded-lg text-sm font-medium hover:bg-gray-800">
            Set up tracking
          </button>
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="AI Revenue" value={`$${kpis.ai_revenue.toFixed(0)}`}
              icon={DollarSign} iconBg="bg-lime-100" iconColor="text-lime-700" />
            <MetricTile label="AI Conversions" value={kpis.ai_conversions.toLocaleString()}
              icon={TrendingUp} iconBg="bg-lime-100" iconColor="text-lime-700" />
            <MetricTile label="AI Revenue Share" value={`${kpis.ai_revenue_share.toFixed(1)}%`}
              icon={BarChart3} iconBg="bg-lime-100" iconColor="text-lime-700" />
            <MetricTile label="AI Conversion Rate" value={`${kpis.ai_conversion_rate.toFixed(2)}%`}
              icon={Bot} iconBg="bg-lime-100" iconColor="text-lime-700" />
          </div>

          {/* AI Insights */}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {insights.map((insight, i) => (
                <div key={i} className={`rounded-xl border shadow-sm p-5 ${insight.positive ? 'bg-lime-50 border-lime-200' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-lime-700" />
                    <p className="text-sm font-semibold text-st-black">{insight.title}</p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{insight.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* AI vs Non-AI Comparison */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'AI Revenue', value: `$${kpis.ai_revenue.toFixed(0)}`, color: 'text-lime-700' },
              { label: 'Non-AI Revenue', value: `$${kpis.non_ai_revenue.toFixed(0)}`, color: 'text-gray-600' },
              { label: 'AI Conv Rate', value: `${kpis.ai_conversion_rate.toFixed(2)}%`, color: 'text-lime-700' },
              { label: 'Non-AI Conv Rate', value: `${kpis.non_ai_conversion_rate.toFixed(2)}%`, color: 'text-gray-600' }
            ].map(item => (
              <div key={item.label} className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-4">
                <p className="text-xs text-st-gray">{item.label}</p>
                <p className={`text-xl font-bold ${item.color} mt-0.5`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* AOV Comparison + AI Revenue Share Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-6">
              <h3 className="text-sm font-semibold text-st-black dark:text-white mb-2">AI vs Non-AI Average Order Value</h3>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-xs text-st-gray">AI</p>
                  <p className="text-2xl font-bold text-lime-700">${kpis.ai_aov.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-st-gray">Non-AI</p>
                  <p className="text-2xl font-bold text-gray-600">${kpis.non_ai_aov.toFixed(2)}</p>
                </div>
                {aovDelta && (
                  <div className={`flex items-center gap-1 text-sm font-medium ${aovDelta.up ? 'text-lime-700' : 'text-red-500'}`}>
                    {aovDelta.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(aovDelta.pct).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-3">
                AI-sourced buyers spend {aovDelta?.up ? 'more' : 'less'} than other channels on average.
                Compare with Report Builder for deeper segmentation.
              </p>
            </div>

            <div className="bg-white dark:bg-[#1A1D1D] rounded-xl border border-gray-200 dark:border-[#333838] shadow-sm p-6">
              <h3 className="text-sm font-semibold text-st-black dark:text-white mb-2">About AI Source Tracking</h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                SourceTrack detects AI platform traffic by inspecting the HTTP referrer header when a visitor arrives from an AI chat tool.
                Supported platforms: ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek, and others.
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mt-2">
                AI revenue is calculated from conversions where the visitor's session originated from an AI platform.
                AI conversion rate = AI conversions / AI-sourced sessions.
              </p>
              <p className="text-xs text-st-gray dark:text-gray-400 mt-3">
                These metrics and insights use real detection data and simple rule-based comparisons only — no AI prediction, scoring, or synthetic metrics.
              </p>
            </div>
          </div>

          {/* Top Platforms + Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Top AI Platforms"
              subtitle="By attributed revenue"
            >
              {platforms.length === 0 ? (
                <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No platform data yet.</p>
              ) : (
                <div className="h-64">
                  <Bar data={platformChartData} options={chartOpts('$')} />
                </div>
              )}
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-st-gray">Platform</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-st-gray">Revenue</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-st-gray">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-st-black dark:text-white font-medium flex items-center gap-2">
                        {p.platform}
                        <StatusBadge status="verified" label="AI" />
                      </td>
                      <td className="py-2 px-3 text-right text-st-black">${(p.revenue || 0).toFixed(0)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{p.conversions.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DashboardCard>

            <DashboardCard title="AI Revenue Trend"
              subtitle="Daily AI-attributed revenue"
            >
              {trend.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-st-gray">No trend data yet</div>
              ) : (
                <div className="h-64">
                  <Line data={trendChartData} options={chartOpts('$')} />
                </div>
              )}
              <div className="mt-3 p-3 bg-gray-50 dark:bg-[#111414] rounded-lg">
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">{kpis.ai_revenue_share.toFixed(1)}%</span> of your revenue comes from AI platforms.
                  {kpis.ai_revenue_share > 20
                    ? ' This is a significant channel — AI visibility is driving meaningful revenue.'
                    : kpis.ai_revenue_share > 5
                    ? ' AI traffic is a growing acquisition channel. Track this as AI search adoption increases.'
                    : ' Still emerging — AI-driven traffic is present but not yet a major channel.'}
                </p>
              </div>
            </DashboardCard>
          </div>

          {/* Per-Platform Detail */}
          <DashboardCard title="AI Platform Detail"
            subtitle="Revenue, conversions, and share per platform"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-st-gray">Platform</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Revenue</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Conversions</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-st-gray">Share</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-st-black dark:text-white font-medium">{p.platform}</td>
                    <td className="py-2.5 px-3 text-right text-st-black">${(p.revenue || 0).toFixed(0)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{p.conversions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-st-gray">
                      {kpis.ai_revenue > 0 ? `${((p.revenue / kpis.ai_revenue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardCard>

          {/* T7.2 — Anomaly Detection */}
          <AnomalyCard siteKey={site?.site_key} />

          {/* T7.4 — AI Channel Verdicts */}
          <VerdictCard siteKey={site?.site_key} />

          {/* T7.1 — AI 7-Day Revenue Forecast */}
          <ForecastCard siteKey={site?.site_key} />
        </>
      )}
    </div>
  )
}

// ── Forecast Card Component ────────────────────────────────────────────────
function ForecastCard({ siteKey }) {
  const [loading, setLoading] = useState(false)
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [fetched, setFetched] = useState(false)

  async function runForecast() {
    if (!siteKey) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchApi(`/ai-analytics/forecast?site_key=${siteKey}`)
      setData(result)
    } catch (err) {
      setError(err.message || 'Forecast failed')
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }

  const forecast = data?.data
  const hasForecast = Array.isArray(forecast?.forecast) && forecast.forecast.length > 0
  const insufficient = forecast?.reason === 'insufficient_data'

  // Build combined chart data when forecast available
  const chartData = hasForecast ? (() => {
    const hist = forecast.historical || []
    const fcast = forecast.forecast || []
    const allDates = [...hist.map(r => r.date), ...fcast.map(r => r.date)]
    const histRevenue = [...hist.map(r => r.revenue), ...fcast.map(() => null)]
    const fcastRevenue = [...hist.map(() => null), ...fcast.map(r => r.revenue)]
    // Connect at boundary
    if (hist.length > 0) fcastRevenue[hist.length - 1] = hist[hist.length - 1].revenue
    return {
      labels: allDates,
      datasets: [
        {
          label: 'Historical',
          data: histRevenue,
          borderColor: 'rgba(17,24,39,0.85)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: false,
          spanGaps: false
        },
        {
          label: '7-Day Forecast',
          data: fcastRevenue,
          borderColor: 'rgba(180,195,60,0.9)',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 3,
          pointBackgroundColor: 'rgba(180,195,60,0.9)',
          tension: 0.3,
          fill: false,
          spanGaps: false
        }
      ]
    }
  })() : null

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => ` $${(ctx.raw || 0).toFixed(0)}` } }
    },
    scales: {
      y: { beginAtZero: true, ticks: { callback: v => `$${v}`, maxTicksLimit: 5 }, grid: { color: '#f3f4f6' } },
      x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } }
    }
  }

  const trendBadge = forecast?.trend === 'up'
    ? { label: '↑ Upward trend', cls: 'bg-green-100 text-green-700' }
    : forecast?.trend === 'down'
    ? { label: '↓ Downward trend', cls: 'bg-red-100 text-red-700' }
    : { label: '→ Flat trend', cls: 'bg-gray-100 dark:bg-[#252929] text-st-gray' }

  const confidenceBadge = {
    high:   'bg-green-100 text-green-700',
    medium: 'bg-amber-100 text-amber-700',
    low:    'bg-red-100 text-red-700'
  }[forecast?.confidence_overall] || 'bg-gray-100 dark:bg-[#252929] text-st-gray'

  return (
    <DashboardCard
      title="AI Revenue Forecast"
      subtitle="7-day prediction powered by DeepSeek — based on your last 30 days of data"
      action={fetched && !loading && (
        <button onClick={runForecast} className="flex items-center gap-1 text-xs text-st-gray dark:text-gray-400 hover:text-st-black">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      )}
    >
      {!fetched ? (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="w-12 h-12 rounded-full bg-st-lime/10 dark:bg-st-lime/5 flex items-center justify-center">
            <Zap className="w-6 h-6 text-st-black" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-st-black">Generate 7-Day Forecast</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1">DeepSeek analyzes your revenue trend and predicts the next 7 days</p>
          </div>
          <button
            onClick={runForecast}
            className="px-5 py-2.5 bg-st-black text-white text-sm font-semibold rounded-lg hover:bg-st-black/90"
          >
            Run Forecast
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-st-gray" />
          <p className="text-sm text-st-gray">DeepSeek is analyzing your data…</p>
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={runForecast} className="mt-3 text-xs text-st-black dark:text-white underline">Try again</button>
        </div>
      ) : insufficient ? (
        <div className="py-6 text-center">
          <p className="text-sm text-st-gray">Need at least 14 days of data for a forecast.</p>
          <p className="text-xs text-st-gray dark:text-gray-400 mt-1">{forecast.days_available || 0} days available so far.</p>
        </div>
      ) : hasForecast ? (
        <div className="space-y-4">
          {/* Summary + badges */}
          <div className="flex items-start gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${trendBadge.cls}`}>{trendBadge.label}</span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${confidenceBadge}`}>
              {forecast.confidence_overall} confidence
            </span>
          </div>
          {forecast.summary && (
            <p className="text-sm text-st-gray dark:text-gray-400 italic">"{forecast.summary}"</p>
          )}

          {/* Chart */}
          <div className="h-56">
            <Line data={chartData} options={chartOpts} />
          </div>

          {/* 7-day table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 text-left text-st-gray dark:text-gray-400 font-medium">Date</th>
                  <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Revenue</th>
                  <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Leads</th>
                  <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {forecast.forecast.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-st-black dark:text-white font-mono">{row.date}</td>
                    <td className="py-2 text-right font-semibold text-st-black">${(row.revenue || 0).toFixed(0)}</td>
                    <td className="py-2 text-right text-st-gray">{row.leads || 0}</td>
                    <td className="py-2 text-right">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        row.confidence === 'high' ? 'bg-green-100 text-green-700'
                        : row.confidence === 'low' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                      }`}>{row.confidence}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-st-gray">
            Generated {forecast.generated_at ? new Date(forecast.generated_at).toLocaleString() : '—'} · Rule-based DeepSeek prediction · Not financial advice
          </p>
        </div>
      ) : null}
    </DashboardCard>
  )
}

// ── T7.2 Anomaly Detection Card ────────────────────────────────────────────
function AnomalyCard({ siteKey }) {
  const [loading, setLoading] = useState(false)
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [fetched, setFetched] = useState(false)

  async function run() {
    if (!siteKey) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchApi(`/ai-analytics/anomalies?site_key=${siteKey}`)
      setData(result)
    } catch (err) {
      setError(err.message || 'Detection failed')
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }

  const d         = data?.data
  const anomalies = d?.anomalies || []
  const channels  = d?.channels  || []

  const deltaColor = (pct) => pct === null ? 'text-st-gray'
    : pct >= 20  ? 'text-green-600'
    : pct <= -20 ? 'text-red-500'
    : 'text-st-gray'

  const deltaLabel = (pct) => pct === null ? '—'
    : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`

  const typeIcon = (type) => ({
    spike: '📈', drop: '📉', new: '✨', lost: '⚠️'
  }[type] || '•')

  return (
    <DashboardCard
      title="Weekly Anomaly Detection"
      subtitle="AI spots unusual changes in your channels — week over week"
      action={fetched && !loading && (
        <button onClick={run} className="flex items-center gap-1 text-xs text-st-gray dark:text-gray-400 hover:text-st-black">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      )}
    >
      {!fetched ? (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
            <Activity className="w-6 h-6 text-amber-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-st-black">Detect This Week's Anomalies</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1">DeepSeek compares this week vs last week across all channels</p>
          </div>
          <button onClick={run} className="px-5 py-2.5 bg-st-black text-white text-sm font-semibold rounded-lg hover:bg-st-black/90">
            Run Detection
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-st-gray" />
          <p className="text-sm text-st-gray">Analyzing week-over-week changes…</p>
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={run} className="mt-3 text-xs text-st-black dark:text-white underline">Try again</button>
        </div>
      ) : !d?.has_enough_data ? (
        <div className="py-6 text-center">
          <p className="text-sm text-st-gray">Need at least 2 weeks of data across 2+ channels for anomaly detection.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* AI summary */}
          {d.summary && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 italic">"{d.summary}"</p>
            </div>
          )}

          {/* Anomalies list */}
          {anomalies.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wide">{anomalies.length} anomaly{anomalies.length > 1 ? 'ies' : ''} detected</p>
              {anomalies.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-white dark:bg-[#1A1D1D] border border-gray-100 dark:border-[#2A2E2E] rounded-xl">
                  <span className="text-lg flex-shrink-0">{typeIcon(a.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-st-black">{a.channel}</span>
                      <span className={`text-xs font-bold ${a.delta_pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {a.delta_pct >= 0 ? '+' : ''}{(a.delta_pct || 0).toFixed(0)}% {a.metric}
                      </span>
                    </div>
                    <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{a.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-st-gray">✓ No significant anomalies this week (all channels within 20% of last week)</p>
            </div>
          )}

          {/* Channel WoW table */}
          {channels.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2 text-left text-st-gray dark:text-gray-400 font-medium">Channel</th>
                    <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">This week</th>
                    <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Last week</th>
                    <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Δ Revenue</th>
                    <th className="py-2 text-right text-st-gray dark:text-gray-400 font-medium">Δ Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.slice(0, 8).map((ch, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-st-black dark:text-white font-medium truncate max-w-[120px]">{ch.channel}</td>
                      <td className="py-2 text-right text-st-black">${(ch.this_week_revenue || 0).toFixed(0)}</td>
                      <td className="py-2 text-right text-st-gray">${(ch.last_week_revenue || 0).toFixed(0)}</td>
                      <td className={`py-2 text-right font-semibold ${deltaColor(ch.rev_delta_pct)}`}>{deltaLabel(ch.rev_delta_pct)}</td>
                      <td className={`py-2 text-right ${deltaColor(ch.lead_delta_pct)}`}>{deltaLabel(ch.lead_delta_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-st-gray">
            Generated {d.generated_at ? new Date(d.generated_at).toLocaleString() : '—'} · Anomaly threshold: ±20% week-over-week
          </p>
        </div>
      )}
    </DashboardCard>
  )
}

// ── T7.4 AI Channel Verdicts Card ──────────────────────────────────────────
function VerdictCard({ siteKey }) {
  const [loading, setLoading] = useState(false)
  const [verdicts, setVerdicts] = useState(null)
  const [error, setError]      = useState(null)
  const [fetched, setFetched]  = useState(false)

  async function run() {
    if (!siteKey) return
    setLoading(true)
    setError(null)
    try {
      const today    = new Date().toISOString().slice(0, 10)
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const result = await fetchApi(`/attribution/verdicts?site_key=${siteKey}&date_from=${thirtyAgo}&date_to=${today}`)
      setVerdicts(result?.data || [])
    } catch (err) {
      setError(err.message || 'Verdicts failed')
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }

  const VERDICT_STYLES = {
    SCALE: { bg: 'bg-st-lime',    text: 'text-st-black', icon: '🚀' },
    PAUSE: { bg: 'bg-amber-100',  text: 'text-amber-800', icon: '⏸' },
    KILL:  { bg: 'bg-red-100',    text: 'text-red-700',   icon: '🛑' },
  }

  return (
    <DashboardCard
      title="AI Channel Verdicts"
      subtitle="DeepSeek reviews your top campaigns and recommends Scale, Pause, or Kill"
      action={fetched && !loading && (
        <button onClick={run} className="flex items-center gap-1 text-xs text-st-gray dark:text-gray-400 hover:text-st-black">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      )}
    >
      {!fetched ? (
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="w-12 h-12 rounded-full bg-st-lime/10 dark:bg-st-lime/5 flex items-center justify-center">
            <Zap className="w-6 h-6 text-st-black" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-st-black">Get Campaign Verdicts</p>
            <p className="text-xs text-st-gray dark:text-gray-400 mt-1">DeepSeek scores your last 30 days by revenue, conversions, and trends</p>
          </div>
          <button onClick={run} className="px-5 py-2.5 bg-st-black text-white text-sm font-semibold rounded-lg hover:bg-st-black/90">
            Run Analysis
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-st-gray" />
          <p className="text-sm text-st-gray">DeepSeek is reviewing your campaigns…</p>
        </div>
      ) : error ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={run} className="mt-3 text-xs text-st-black dark:text-white underline">Try again</button>
        </div>
      ) : !verdicts?.length ? (
        <div className="py-6 text-center">
          <p className="text-sm text-st-gray">No campaign data yet. UTM-tagged traffic will appear here after conversions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary counts */}
          <div className="flex gap-3">
            {['SCALE','PAUSE','KILL'].map(v => {
              const count = verdicts.filter(x => x.verdict === v).length
              const s = VERDICT_STYLES[v]
              return (
                <div key={v} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${s.bg}`}>
                  <span className="text-sm">{s.icon}</span>
                  <span className={`text-xs font-bold ${s.text}`}>{count} {v}</span>
                </div>
              )
            })}
          </div>

          {/* Verdict rows */}
          <div className="space-y-2">
            {verdicts.map((v, i) => {
              const s = VERDICT_STYLES[v.verdict] || VERDICT_STYLES.PAUSE
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-white dark:bg-[#1A1D1D] border border-gray-100 dark:border-[#2A2E2E] rounded-xl">
                  <span className="text-lg flex-shrink-0">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-st-black dark:text-white truncate max-w-[160px]">{v.campaign}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{v.verdict}</span>
                    </div>
                    {v.reason && <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">{v.reason}</p>}
                  </div>
                  {v.signal && (
                    <span className="text-[10px] text-st-gray dark:text-gray-400 flex-shrink-0 mt-0.5">{v.signal}</span>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-st-gray">
            Based on last 30 days · SCALE = strong revenue+conversions · PAUSE = low return · KILL = zero activity
          </p>
        </div>
      )}
    </DashboardCard>
  )
}
