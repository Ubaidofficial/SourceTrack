import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { TrendingUp, DollarSign, MousePointerClick, BarChart3, Bot, AlertCircle } from 'lucide-react'

export default function ShareDashboard() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [token])

  async function load() {
    try {
      const res = await fetch(`/api/public/${token}`)
      if (!res.ok) {
        setError('This dashboard link is invalid or has expired.')
        return
      }
      const json = await res.json()
      if (!json?.success || !json?.data) {
        setError('This dashboard link is invalid or has expired.')
        return
      }
      setData(json.data)
    } catch (_e) {
      setError('This dashboard link is invalid or has expired.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-st-black dark:text-white">{error}</h2>
          <p className="text-sm text-st-gray dark:text-gray-400">The owner may have disabled sharing or the link may be incorrect.</p>
          <a href="https://sourcetrack.ai" className="text-sm text-st-black dark:text-white underline">Powered by SourceTrack</a>
        </div>
      </div>
    )
  }

  const { kpis, top_channels, top_sources, date_from, date_to, days } = data
  const totalRevenue = kpis?.total_revenue || 0
  const totalConversions = kpis?.total_conversions || 0
  const channels = top_channels || []
  const sources = top_sources || []

  const topChannel = channels.length > 0 ? channels[0]?.dim_value || 'N/A' : 'N/A'
  const avgCPL = totalConversions > 0 ? totalRevenue / totalConversions : 0

  const aiSources = sources.filter(s => {
    const dim = (s.dim_value || '').toLowerCase()
    return dim.includes('chatgpt') || dim.includes('claude') || dim.includes('gemini') ||
      dim.includes('perplexity') || dim.includes('grok') || dim.includes('copilot') ||
      dim.includes('deepseek') || dim.includes('meta ai') || dim.includes('mistral') ||
      dim.includes('poe') || dim.includes('phind') || dim.includes('kagi')
  })

  const kpiCards = [
    { label: 'Total Revenue', value: `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: DollarSign },
    { label: 'Total Conversions', value: totalConversions.toLocaleString(), icon: MousePointerClick },
    { label: 'Top Channel', value: topChannel, icon: BarChart3 },
    { label: 'Avg CPL', value: `$${avgCPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp }
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Header */}
      <header className="bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-st-black dark:text-white" />
            <h1 className="text-lg font-bold text-st-black dark:text-white">SourceTrack Dashboard</h1>
          </div>
          <span className="text-xs text-st-gray dark:text-gray-400">
            {date_from} — {date_to} ({days}d)
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* KPI Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-st-gray dark:text-gray-400" />
                <span className="text-xs text-st-gray dark:text-gray-400">{label}</span>
              </div>
              <span className="text-xl font-bold text-st-black dark:text-white">{value}</span>
            </div>
          ))}
        </div>

        {/* Attribution Table */}
        <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-bold text-st-black dark:text-white">Attribution</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-st-gray dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Channel</th>
                  <th className="text-right px-4 py-2 font-medium">Conversions</th>
                  <th className="text-right px-4 py-2 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2 font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {channels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-st-gray dark:text-gray-400">No data available</td>
                  </tr>
                ) : channels.slice(0, 10).map((ch, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-medium text-st-black dark:text-white">{ch.dim_value || 'Unknown'}</td>
                    <td className="px-4 py-2.5 text-right text-st-gray dark:text-gray-400">{ch.conversions || 0}</td>
                    <td className="px-4 py-2.5 text-right text-st-gray dark:text-gray-400">${((ch.revenue || 0).toFixed(0))}</td>
                    <td className="px-4 py-2.5 text-right text-st-gray dark:text-gray-400">
                      {totalConversions > 0 ? `${Math.round(((ch.conversions || 0) / totalConversions) * 100)}%` : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* AI Search Section */}
        <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
            <Bot className="w-4 h-4 text-st-gray dark:text-gray-400" />
            <h2 className="text-sm font-bold text-st-black dark:text-white">AI Search Traffic</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-st-gray dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">AI Platform</th>
                  <th className="text-right px-4 py-2 font-medium">Conversions</th>
                  <th className="text-right px-4 py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {aiSources.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-st-gray dark:text-gray-400">
                      No AI traffic detected in this period
                    </td>
                  </tr>
                ) : aiSources.slice(0, 10).map((ai, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-medium text-st-black dark:text-white">{ai.dim_value || 'Unknown'}</td>
                    <td className="px-4 py-2.5 text-right text-st-gray dark:text-gray-400">{ai.conversions || 0}</td>
                    <td className="px-4 py-2.5 text-right text-st-gray dark:text-gray-400">${((ai.revenue || 0).toFixed(0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-dark-border py-4 text-center">
        <a href="https://sourcetrack.ai" className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white transition-colors">
          Powered by SourceTrack
        </a>
      </footer>
    </div>
  )
}
