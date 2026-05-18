import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Shield, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

const STATUS_ICONS = { ok: CheckCircle, warning: AlertTriangle, critical: XCircle }
const STATUS_COLORS = { ok: 'text-green-500', warning: 'text-amber-500', critical: 'text-red-500' }
const STATUS_BG = { ok: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400', warning: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400', critical: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400' }
const SCORE_MAP = { ok: 100, warning: 60, critical: 0 }

export default function DataQuality() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resolvingId, setResolvingId] = useState(null)

  useEffect(() => { loadSite() }, [user])
  useEffect(() => { if (site) loadData() }, [site])

  async function loadSite() {
    try {
      const { data: member } = await supabase
        .from('company_members').select('company_id')
        .eq('user_id', user.id).maybeSingle()
      const query = supabase.from('sites').select('id, site_key').limit(1)
      if (member?.company_id) query.eq('company_id', member.company_id)
      else query.eq('owner_id', user.id)
      const { data } = await query.maybeSingle()
      setSite(data)
    } catch (_e) { /* silent */ }
  }

  async function loadData() {
    if (!site) return
    setLoading(true)
    try {
      const { data: latest } = await supabase
        .from('data_quality_reports')
        .select('*')
        .eq('site_id', site.id)
        .order('checked_at', { ascending: false })
        .limit(8)

      const { data: activeAlerts } = await supabase
        .from('data_quality_alerts')
        .select('*')
        .eq('site_id', site.id)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })

      setReports(latest || [])
      setAlerts(activeAlerts || [])
    } catch (_e) {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/jobs/data-quality-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        }
      })
      setTimeout(() => loadData(), 5000)
    } catch (_e) {
      setTimeout(() => loadData(), 2000)
    } finally {
      setTimeout(() => setRefreshing(false), 3000)
    }
  }

  async function handleResolve(alertId) {
    setResolvingId(alertId)
    try {
      await supabase
        .from('data_quality_alerts')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', alertId)
      setAlerts(prev => prev.filter(a => a.id !== alertId))
    } catch (_e) {
      /* silent */
    } finally {
      setResolvingId(null)
    }
  }

  const scores = reports.map(r => SCORE_MAP[r.status] ?? 0)
  const healthScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const scoreColor = healthScore >= 80 ? 'text-green-500' : healthScore >= 60 ? 'text-amber-500' : 'text-red-500'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-white">Data Quality</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-1">{reports.length} checks evaluated</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-st-black dark:bg-white text-white dark:text-st-black rounded-lg hover:bg-st-black/90 dark:hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Running…' : 'Refresh'}
        </button>
      </div>

      {/* ── Overall Health Score ──────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl p-6 flex items-center gap-4">
        <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center"
          style={{ borderColor: healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#f59e0b' : '#ef4444' }}>
          <span className={`text-2xl font-bold ${scoreColor}`}>{healthScore}</span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-st-black dark:text-white">Overall Health Score</h3>
          <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
            {healthScore >= 80 ? 'Your data quality is excellent' : healthScore >= 60 ? 'Some metrics need attention' : 'Several issues detected — investigate'}
          </p>
          <div className="flex gap-3 mt-2 text-xs text-st-gray dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> {reports.filter(r => r.status === 'ok').length} OK</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> {reports.filter(r => r.status === 'warning').length} Warning</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {reports.filter(r => r.status === 'critical').length} Critical</span>
          </div>
        </div>
      </section>

      {/* ── Per-Check Table ───────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-bold text-st-black dark:text-white">Quality Checks</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-st-gray dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Check</th>
                <th className="text-left px-4 py-2 font-medium">Value</th>
                <th className="text-left px-4 py-2 font-medium">Threshold</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Message</th>
                <th className="text-left px-4 py-2 font-medium">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-st-gray dark:text-gray-400">
                    No quality checks run yet. Click Refresh to run them.
                  </td>
                </tr>
              ) : reports.map(r => {
                const Icon = STATUS_ICONS[r.status] || CheckCircle
                return (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-medium text-st-black dark:text-white">{r.check_name}</td>
                    <td className="px-4 py-2.5 text-st-gray dark:text-gray-400">
                      {typeof r.value === 'number' ? r.value < 10 ? `${(r.value * 100).toFixed(1)}%` : `${r.value}h` : r.value}
                    </td>
                    <td className="px-4 py-2.5 text-st-gray dark:text-gray-400">
                      {r.threshold !== null ? (r.threshold < 1 ? `${(r.threshold * 100).toFixed(0)}%` : `${r.threshold}h`) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[r.status] || ''}`}>
                        <Icon className="w-3 h-3" />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-st-gray dark:text-gray-400 max-w-xs truncate">{r.message}</td>
                    <td className="px-4 py-2.5 text-st-gray dark:text-gray-400 text-xs">
                      {r.checked_at ? new Date(r.checked_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Active Alerts ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-[#1A1C1C] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-st-gray dark:text-gray-400" />
            <h3 className="text-sm font-bold text-st-black dark:text-white">Active Alerts</h3>
            {alerts.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
                {alerts.length}
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {alerts.length === 0 ? (
            <div className="text-center py-6 text-sm text-st-gray dark:text-gray-400">No active alerts</div>
          ) : alerts.map(a => {
            const Icon = STATUS_ICONS[a.severity] || AlertTriangle
            return (
              <div key={a.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[a.severity] || ''}`}>
                      <Icon className="w-3 h-3" />
                      {a.severity}
                    </span>
                    <span className="text-sm font-medium text-st-black dark:text-white">{a.title}</span>
                  </div>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-1">{a.message}</p>
                </div>
                <button
                  onClick={() => handleResolve(a.id)}
                  disabled={resolvingId === a.id}
                  className="shrink-0 px-3 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-st-gray dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {resolvingId === a.id ? 'Resolving…' : 'Resolve'}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
