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
import { Bot, DollarSign, TrendingUp, BarChart3, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react'
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
      const { data } = await supabase
        .from('sites')
        .select('site_key, name, domain')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
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
        <h2 className="text-2xl font-bold text-gray-900">AI Analytics</h2>
        <p className="text-sm text-gray-500 mt-1">Performance from AI platforms — ChatGPT, Claude, Perplexity, Gemini, and more</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : !hasData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Sparkles className="w-12 h-12 text-lime-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No AI traffic detected yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            AI Analytics shows you which AI platforms (ChatGPT, Claude, Perplexity, etc.) send visitors to your site — and which of those visitors convert.
          </p>
          <div className="space-y-2 text-xs text-gray-500 text-left max-w-sm mx-auto">
            <p className="font-medium text-gray-700">How AI tracking works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>When a visitor clicks a link in ChatGPT, Claude, or another AI tool, the referrer header is detected</li>
              <li>The AI platform name is stored as <code className="bg-gray-100 px-1 rounded text-xs">ai_source</code> on every event</li>
              <li>Conversions from AI-sourced traffic are attributed to the specific platform</li>
              <li>This page shows AI revenue, conversions, conversion rates, and trends</li>
            </ul>
            <p className="text-gray-400 mt-3">If your site gets AI traffic but nothing appears here, check the Event Logger for pageview events with ai_source values.</p>
          </div>
          <button onClick={() => window.location.href = '/snippet'}
            className="mt-6 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">
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
                <div key={i} className={`rounded-xl border shadow-sm p-5 ${insight.positive ? 'bg-lime-50 border-lime-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-lime-700" />
                    <p className="text-sm font-semibold text-gray-900">{insight.title}</p>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{insight.desc}</p>
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
              <div key={item.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className={`text-xl font-bold ${item.color} mt-0.5`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* AOV Comparison + AI Revenue Share Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">AI vs Non-AI Average Order Value</h3>
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-xs text-gray-400">AI</p>
                  <p className="text-2xl font-bold text-lime-700">${kpis.ai_aov.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Non-AI</p>
                  <p className="text-2xl font-bold text-gray-600">${kpis.non_ai_aov.toFixed(2)}</p>
                </div>
                {aovDelta && (
                  <div className={`flex items-center gap-1 text-sm font-medium ${aovDelta.up ? 'text-lime-700' : 'text-red-500'}`}>
                    {aovDelta.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    {Math.abs(aovDelta.pct).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                AI-sourced buyers spend {aovDelta?.up ? 'more' : 'less'} than other channels on average.
                Compare with Report Builder for deeper segmentation.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">About AI Source Tracking</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                SourceTrack detects AI platform traffic by inspecting the HTTP referrer header when a visitor arrives from an AI chat tool.
                Supported platforms: ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek, and others.
              </p>
              <p className="text-xs text-gray-600 leading-relaxed mt-2">
                AI revenue is calculated from conversions where the visitor's session originated from an AI platform.
                AI conversion rate = AI conversions / AI-sourced sessions.
              </p>
              <p className="text-xs text-gray-400 mt-3">
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
                <p className="text-sm text-gray-400 py-6 text-center">No platform data yet.</p>
              ) : (
                <div className="h-64">
                  <Bar data={platformChartData} options={chartOpts('$')} />
                </div>
              )}
              <table className="w-full text-sm mt-4">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">Platform</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">Conversions</th>
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900 font-medium flex items-center gap-2">
                        {p.platform}
                        <StatusBadge status="verified" label="AI" />
                      </td>
                      <td className="py-2 px-3 text-right text-gray-900">${(p.revenue || 0).toFixed(0)}</td>
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
                <div className="h-64 flex items-center justify-center text-sm text-gray-400">No trend data yet</div>
              ) : (
                <div className="h-64">
                  <Line data={trendChartData} options={chartOpts('$')} />
                </div>
              )}
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
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
                  <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Platform</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Conversions</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Share</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-900 font-medium">{p.platform}</td>
                    <td className="py-2.5 px-3 text-right text-gray-900">${(p.revenue || 0).toFixed(0)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{p.conversions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">
                      {kpis.ai_revenue > 0 ? `${((p.revenue / kpis.ai_revenue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardCard>
        </>
      )}
    </div>
  )
}
