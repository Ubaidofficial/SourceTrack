import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import {
  Search, Download, Filter, Pencil, Check,
  UploadCloud, AlertTriangle, HelpCircle, X, Loader2, RefreshCw
} from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import MetricTile from '../components/MetricTile'
import StatusBadge from '../components/StatusBadge'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'
import { safeNumber, formatCurrency, formatCurrencyDecimal, formatNumber, formatMultiplier } from '../utils/numbers'
import { hasFeature } from '../lib/planFeatures'
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

const STATUS_BG_CLASSES = {
  'Active': 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300 border-green-200 dark:border-green-700/70',
  'Paused': 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-200 dark:border-amber-700/70',
  'Archived': 'bg-gray-50 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200 border-gray-200 dark:border-gray-600',
  'Draft / Tracking only': 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
}


// ─── CSV Parsing & Validation Helpers (Frontend equivalents of shared library) ───

function parseCSV(text = '') {
  const lines = []
  let row = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"'
        i++ // Skip next escaped double quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField)
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip CRLF \n
      }
      row.push(currentField)
      if (row.length > 1 || row[0] !== '') {
        lines.push(row)
      }
      row = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  if (row.length > 0 || currentField !== '') {
    row.push(currentField)
    if (row.length > 1 || row[0] !== '') {
      lines.push(row)
    }
  }
  return lines
}

function csvToObjects(lines = []) {
  if (lines.length < 2) return []

  const headers = lines[0].map(h => h.trim().toLowerCase())

  // Find indices based on aliases
  const dateIdx = headers.findIndex(h => ['date', 'period_start', 'day', 'timestamp'].includes(h))
  const platformIdx = headers.findIndex(h => ['source', 'platform', 'medium', 'channel'].includes(h))
  const nameIdx = headers.findIndex(h => ['campaign_name', 'campaign', 'campaign name'].includes(h))
  const idIdx = headers.findIndex(h => ['campaign_id', 'campaign id', 'id'].includes(h))
  const spendIdx = headers.findIndex(h => ['cost', 'spend', 'amount', 'ad spend', 'ad_spend'].includes(h))
  const currencyIdx = headers.findIndex(h => ['currency', 'currency_code', 'currency code'].includes(h))
  const clicksIdx = headers.findIndex(h => ['clicks', 'click_count', 'click count'].includes(h))
  const impressionsIdx = headers.findIndex(h => ['impressions', 'impression_count', 'impression count', 'views'].includes(h))

  const result = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0 || (line.length === 1 && line[0] === '')) continue

    result.push({
      date: dateIdx !== -1 && line[dateIdx] !== undefined ? line[dateIdx] : undefined,
      platform: platformIdx !== -1 && line[platformIdx] !== undefined ? line[platformIdx] : undefined,
      campaign_name: nameIdx !== -1 && line[nameIdx] !== undefined ? line[nameIdx] : undefined,
      campaign_id: idIdx !== -1 && line[idIdx] !== undefined ? line[idIdx] : undefined,
      spend: spendIdx !== -1 && line[spendIdx] !== undefined ? line[spendIdx] : undefined,
      currency: currencyIdx !== -1 && line[currencyIdx] !== undefined ? line[currencyIdx] : undefined,
      clicks: clicksIdx !== -1 && line[clicksIdx] !== undefined ? line[clicksIdx] : undefined,
      impressions: impressionsIdx !== -1 && line[impressionsIdx] !== undefined ? line[impressionsIdx] : undefined
    })
  }

  return result
}

function validateFrontendRow(row) {
  const errors = []

  const dateStr = String(row.date || '').trim()
  if (!dateStr) errors.push('Date is required')
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.push('Date must be YYYY-MM-DD')
  else {
    const dateObj = new Date(dateStr + 'T00:00:00Z')
    if (isNaN(dateObj.getTime())) errors.push('Invalid date value')
    const todayStr = new Date().toISOString().slice(0, 10)
    if (dateStr > todayStr) errors.push('Date cannot be in the future')
  }

  const nameStr = String(row.campaign_name || '').trim()
  if (!nameStr) errors.push('Campaign name is required')
  else if (nameStr.length > 255) errors.push('Campaign name must be 255 characters or less')

  const idStr = String(row.campaign_id || '').trim()
  if (idStr && idStr.length > 255) errors.push('Campaign ID must be 255 characters or less')

  if (row.spend === undefined || row.spend === null || row.spend === '') errors.push('Spend is required')
  else {
    const spendVal = parseFloat(row.spend)
    if (isNaN(spendVal)) errors.push('Spend must be a valid number')
    else if (spendVal < 0) errors.push('Spend cannot be negative')
  }

  const clicksVal = row.clicks !== undefined && row.clicks !== null && row.clicks !== '' ? parseInt(row.clicks, 10) : 0
  if (isNaN(clicksVal) || clicksVal < 0) errors.push('Clicks must be a non-negative integer')

  const impressionsVal = row.impressions !== undefined && row.impressions !== null && row.impressions !== '' ? parseInt(row.impressions, 10) : 0
  if (isNaN(impressionsVal) || impressionsVal < 0) errors.push('Impressions must be a non-negative integer')

  if (impressionsVal > 0 && clicksVal > impressionsVal) errors.push('Clicks cannot be greater than impressions')

  const currencyStr = String(row.currency || 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currencyStr)) errors.push('Currency must be a valid 3-letter code (e.g. USD)')

  const platformStr = String(row.platform || 'manual_csv').trim().toLowerCase()
  if (platformStr) {
    if (!/^[a-z0-9_-]+$/.test(platformStr)) errors.push('Platform must be alphanumeric, underscores, or hyphens')
    else if (platformStr.length > 50) errors.push('Platform must be 50 characters or less')
  }

  return errors.join(', ')
}

function summarizeCurrencyStatus(spendRows = [], trackedCurrency = 'USD') {
  const currencies = [...new Set(spendRows.map(r => r.currency?.toUpperCase()).filter(Boolean))]
  if (currencies.length === 0) {
    return { status: 'ok', spendCurrency: trackedCurrency }
  }
  if (currencies.length > 1) {
    return { status: 'mixed', spendCurrency: 'MIXED' }
  }
  const spendCurrency = currencies[0]
  if (spendCurrency !== trackedCurrency.toUpperCase()) {
    return { status: 'mismatch', spendCurrency }
  }
  return { status: 'ok', spendCurrency }
}

// ─── Warning Tooltip Component ───
function CurrencyWarning({ status, spendCur, trackCur }) {
  const msg = status === 'mixed'
    ? `Campaign has mixed currencies (${spendCur}). ROAS and CPA calculations are suppressed.`
    : `Spend currency (${spendCur}) does not match conversion currency (${trackCur}). ROAS and CPA calculations are suppressed.`

  return (
    <div className="inline-flex items-center gap-1 group relative justify-end">
      <span className="text-gray-300">—</span>
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600 cursor-help" />
      <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg z-30 leading-normal font-normal text-left">
        {msg}
      </div>
    </div>
  )
}

export default function Campaigns() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [spendMap, setSpendMap] = useState({}) // { campaignName: spend }
  const [editingSpend, setEditingSpend] = useState(null)
  const [spendInput, setSpendInput] = useState('')
  const [savingState, setSavingState] = useState({ campaign: null, status: 'idle' }) // 'idle' | 'saving' | 'success' | 'error'
  const [site, setSite] = useState(null)
  const [activeDim, setActiveDim] = useState('source')
  const [dateRange, setDateRange] = useState(30)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedCampaign, setSelectedCampaign] = useState(null)

  // ─── Cost Import Modal States ───
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importTab, setImportTab] = useState('upload') // 'upload' | 'history'
  const [csvText, setCsvText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parsedRows, setParsedRows] = useState([]) // array of { data, error }
  const [importHistory, setImportHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null) // { success: boolean, count: number, error?: string }
  const [currencyStatus, setCurrencyStatus] = useState({ status: 'ok', spendCurrency: 'USD' })

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase
        .from('sites')
        .select('site_key, name, plan')
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('import') === 'true') {
      setImportModalOpen(true)
      params.delete('import')
      const search = params.toString()
      const nextUrl = window.location.pathname + (search ? `?${search}` : '')
      window.history.replaceState({}, document.title, nextUrl)
    }
  }, [])

  const { data: overview, isLoading, isError, error, refetch: refetchOverview } = useQuery({
    queryKey: ['campaigns-overview', site?.site_key, activeDim, dateRange, search, statusFilter],
    queryFn: () => fetchApi(`/campaigns/overview?site_key=${site.site_key}&dimension=${activeDim}&days=${dateRange}&search=${encodeURIComponent(search)}&status=${statusFilter}`),
    enabled: !!site
  })

  const kpis = overview?.kpis
  const rows = overview?.rows || []
  const hasRevenue = (kpis?.total_revenue || 0) > 0
  const hasCost = (kpis?.total_spend || 0) > 0
  const analyticsAvailable = overview?.analytics_available !== false
  const analyticsWarning = overview?.warning?.message || null

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

  const { data: adPlatStatus, refetch: refetchAdPlatStatus } = useQuery({
    queryKey: ['ad-platforms-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ad-platforms/status?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const adPlatformData = adPlatStatus?.data || adPlatStatus || {}
  const googleStatus = adPlatformData.google_ads
  const metaStatus = adPlatformData.meta_ads

  const googleConnected = googleStatus?.connected === true || googleStatus?.status === 'connected'
  const metaConnected = metaStatus?.connected === true || metaStatus?.status === 'connected'
  const anyConnected = googleConnected || metaConnected
  const lastSyncedGoogle = googleStatus?.last_synced_at
  const lastSyncedMeta = metaStatus?.last_synced_at

  const [syncingAll, setSyncingAll] = useState(false)
  const handleSyncAllConnected = async () => {
    setSyncingAll(true)
    try {
      const promises = []
      if (googleConnected) {
        promises.push(fetchApi(`/integrations/ad-platforms/google/sync?site_key=${site.site_key}`, { method: 'POST' }))
      }
      if (metaConnected) {
        promises.push(fetchApi(`/integrations/ad-platforms/meta/sync?site_key=${site.site_key}`, { method: 'POST' }))
      }
      await Promise.all(promises)
      alert('Cost sync started. Check Import History for details.')
      refetchAdPlatStatus()
      loadImportHistory()
    } catch (err) {
      alert(err.message || 'Error triggering syncs')
    } finally {
      setSyncingAll(false)
    }
  }

  const { data: costsData, refetch: refetchCosts } = useQuery({
    queryKey: ['campaign-costs', site?.site_key, dateFrom, dateTo],
    queryFn: async () => {
      if (!site?.site_key) return []
      const res = await fetchApi(`/campaign-costs?site_key=${site.site_key}&date_from=${dateFrom}&date_to=${dateTo}`)
      return res?.data || res || []
    },
    enabled: !!site?.site_key
  })

  useEffect(() => {
    if (costsData) {
      const data = costsData.data || costsData || []
      const map = {}
      if (Array.isArray(data)) {
        data.forEach(c => {
          map[c.campaign_name] = c.spend
        })
      }
      setSpendMap(map)
    }
  }, [costsData])

  async function saveSpend(campaignName) {
    const spend = parseFloat(spendInput) || 0
    setSavingState({ campaign: campaignName, status: 'saving' })
    try {
      await fetchApi('/campaign-costs', {
        method: 'POST',
        body: JSON.stringify({ site_key: site.site_key, campaign_name: campaignName, spend, period_start: dateFrom, period_end: dateTo })
      })
      setSpendMap(prev => ({ ...prev, [campaignName]: spend }))
      setSavingState({ campaign: campaignName, status: 'success' })
      setTimeout(() => {
        setSavingState({ campaign: null, status: 'idle' })
        setEditingSpend(null)
      }, 1000)
      refetchCosts()
      refetchOverview()
    } catch (err) {
      console.error(err)
      setSavingState({ campaign: campaignName, status: 'error' })
      setTimeout(() => {
        setSavingState({ campaign: null, status: 'idle' })
      }, 2000)
    }
  }

  // ─── Cost Import Modal Actions ───

  const handleCsvParse = (text) => {
    try {
      const lines = parseCSV(text)
      if (lines.length < 2) {
        setParsedRows([])
        return
      }
      const objects = csvToObjects(lines)

      const validated = objects.map(obj => {
        const error = validateFrontendRow(obj)
        return {
          data: obj,
          error: error || null
        }
      })

      setParsedRows(validated)

      const spendRows = objects.map(o => ({ currency: o.currency || 'USD' }))
      const trackedCurrency = kpis?.tracked_currency || 'USD'
      const curSummary = summarizeCurrencyStatus(spendRows, trackedCurrency)
      setCurrencyStatus(curSummary)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target.result
        setCsvText(text)
        handleCsvParse(text)
      }
      reader.readAsText(file)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target.result
        setCsvText(text)
        handleCsvParse(text)
      }
      reader.readAsText(file)
    }
  }

  const loadImportHistory = async () => {
    if (!site?.site_key) return
    setLoadingHistory(true)
    try {
      const res = await fetchApi(`/campaign-costs/import-history?site_key=${site.site_key}`)
      setImportHistory(res.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    if (importModalOpen && importTab === 'history') {
      loadImportHistory()
    }
  }, [importModalOpen, importTab, site])

  const executeImport = async () => {
    if (parsedRows.length === 0) return
    const invalidCount = parsedRows.filter(r => r.error).length
    if (invalidCount > 0) {
      alert(`Please fix the ${invalidCount} validation errors before importing.`)
      return
    }

    setImporting(true)
    setImportResult(null)
    try {
      const rowsToSend = parsedRows.map(r => r.data)
      const res = await fetchApi(`/campaign-costs/import?site_key=${site.site_key}`, {
        method: 'POST',
        body: JSON.stringify({ rows: rowsToSend })
      })

      if (res.success) {
        setImportResult({ success: true, count: res.records_synced })
        setCsvText('')
        setParsedRows([])
        refetchOverview()
        refetchCosts()
      } else {
        setImportResult({ success: false, error: res.error || 'Unknown error' })
      }
    } catch (err) {
      setImportResult({ success: false, error: err.message })
    } finally {
      setImporting(false)
    }
  }

  const closeModal = () => {
    setImportModalOpen(false)
    setCsvText('')
    setParsedRows([])
    setImportResult(null)
    setImportTab('upload')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-st-black">Campaigns & Attribution</h2>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 text-[10px] font-semibold text-st-black"
              title="This page uses last-touch attribution. Revenue and conversions are credited to each visit's source at conversion time. To compare other models, open Report Builder."
            >
              Last Touch
            </span>
          </div>
          <p className="text-sm text-st-gray mt-0.5">Performance by marketing channel — credited via last-touch attribution</p>
          {anyConnected && (
            <div className="text-[11px] text-st-gray mt-1 flex items-center gap-1.5 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-[#d7f550] animate-pulse" />
              <span>
                {googleConnected && lastSyncedGoogle && `Google Ads synced: ${new Date(lastSyncedGoogle).toLocaleString()}`}
                {googleConnected && lastSyncedGoogle && metaConnected && lastSyncedMeta && ' · '}
                {metaConnected && lastSyncedMeta && `Meta Ads synced: ${new Date(lastSyncedMeta).toLocaleString()}`}
                {!lastSyncedGoogle && !lastSyncedMeta && 'Not synced yet — click Sync connected accounts'}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {anyConnected && (
            <button onClick={handleSyncAllConnected} disabled={syncingAll}
              className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors font-medium shadow-sm">
              <RefreshCw className={`w-4 h-4 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? 'Syncing...' : 'Sync connected accounts'}
            </button>
          )}
          <button onClick={() => setImportModalOpen(true)}
            className="px-3 py-1.5 text-sm text-st-black bg-[#d7f550] hover:bg-[#c4df45] rounded-lg transition-colors font-medium flex items-center gap-1.5 shadow-sm">
            <UploadCloud className="w-4 h-4" /> Import Costs
          </button>

          <button onClick={() => navigate('/report-builder')}
            className="px-3 py-1.5 text-sm text-gray-500 bg-gray-50 rounded-lg hover:bg-gray-100 font-medium">
            Advanced Report
          </button>

          {hasFeature(site?.plan, 'csv_export') ? (
            <button onClick={() => {
              if (!site) return
              const params = new URLSearchParams({ site_key: site.site_key, model: 'last_touch', days: dateRange, dimension: activeDim, search, status: statusFilter })
              window.open(`/api/campaigns/export?${params}`, '_blank')
            }} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Export
            </button>
          ) : (
            <a href="/billing" title="CSV export available on Starter and above"
              className="px-3 py-1.5 text-sm text-st-gray bg-white border border-gray-300 rounded-lg hover:border-st-lime flex items-center gap-1.5 opacity-70">
              🔒 Export · Upgrade
            </a>
          )}
        </div>
      </div>

      {/* Analytics Warning Banner */}
      {!isLoading && !isError && !analyticsAvailable && analyticsWarning && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span>{analyticsWarning} Imported costs can still be managed.</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white/60 rounded-xl border border-gray-100 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-st-gray" />
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
                  dateRange === dr.days ? 'bg-white text-st-black shadow-sm' : 'text-st-gray hover:text-gray-700'
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
              activeDim === d.key ? 'bg-st-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {d.label}
          </button>
        ))}
      </div>

      {/* KPI Tiles */}
      <div className={`grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-${3 + (hasRevenue ? 1 : 0) + (hasCost ? 1 : 0) + (hasRevenue && hasCost ? 1 : 0)}`}>
        <MetricTile label="Total Visits"    value={kpis?.total_visits} />
        <MetricTile label="Total Leads"     value={kpis?.total_leads} />
        <MetricTile label="Conversions"     value={kpis?.total_conversions} />
        {hasRevenue && <MetricTile label="Total Revenue"   value={kpis?.total_revenue} format="currency" />}
        {hasCost && <MetricTile label="Total Spend"     value={kpis?.total_spend} format="currency" />}
        {hasRevenue && hasCost && (() => {
          const totalSpend = safeNumber(kpis?.total_spend, 0)
          const isOk = kpis?.currency_status === 'ok'
          const roas = totalSpend > 0 && isOk && kpis?.avg_roas !== null ? `${kpis.avg_roas}x` : '—'

          return (
            <MetricTile
              label="Aggregated ROAS"
              value={
                !isOk && totalSpend > 0 ? (
                  <div className="flex items-center gap-1 justify-center">
                    <span>—</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500 cursor-help" title={
                      kpis?.currency_status === 'mixed'
                        ? 'Mixed currencies detected in spend. ROAS calculations suppressed.'
                        : `Spend currency (${kpis?.spend_currency}) does not match tracked currency (${kpis?.tracked_currency}). ROAS calculations suppressed.`
                    } />
                  </div>
                ) : roas
              }
              isEmpty={totalSpend === 0}
            />
          )
        })()}
      </div>

      {/* Campaign Table + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DashboardCard title={DIMENSIONS.find(d => d.key === activeDim)?.label || 'Channels'}
          subtitle={isLoading ? 'Loading...' : `${rows.length} ${activeDim}s`}
          className="lg:col-span-3"
        >
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black mx-auto" />
              <p className="text-xs text-st-gray mt-3">Loading campaign data…</p>
            </div>
          ) : isError ? (
            <div className="py-12 text-center px-4">
              <p className="text-sm text-gray-500">Campaign data is temporarily unavailable.</p>
              <p className="text-xs text-st-gray mt-1">Imported costs can still be managed below.</p>
              <button onClick={() => setImportModalOpen(true)}
                className="mt-4 px-4 py-2 text-sm text-st-black bg-[#d7f550] hover:bg-[#c4df45] rounded-lg transition-colors font-medium inline-flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4" /> Import Costs
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center px-4">
              {search || statusFilter !== 'all' ? (
                <p className="text-sm text-st-gray">No results match your filters.</p>
              ) : (
                <>
                  <p className="text-base font-semibold text-st-black">No campaign data yet</p>
                  <p className="text-sm text-st-gray mt-1">Import ad costs or wait for tracked campaign traffic.</p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button onClick={() => setImportModalOpen(true)}
                      className="px-4 py-2 text-sm text-st-black bg-[#d7f550] hover:bg-[#c4df45] rounded-lg transition-colors font-medium inline-flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4" /> Import Costs
                    </button>
                    <a
                      href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                        "date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions\n2026-06-08,facebook,Summer Sale,12345,45.50,USD,40,1200\n"
                      )}`}
                      download="sourcetrack_ad_spend_template.csv"
                      className="text-xs text-gray-500 hover:text-gray-700 hover:underline font-medium"
                    >
                      Download CSV template
                    </a>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      {DIMENSIONS.find(d => d.key === activeDim)?.label || 'Name'}
                    </th>
                    {activeDim === 'campaign' && (
                      <th className="text-left py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                        Source / Medium
                      </th>
                    )}
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      <div className="flex items-center justify-end gap-1 group relative">
                        <span>Status</span>
                        <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                        <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg z-30 leading-normal font-normal text-left">
                          Campaign status is a SourceTrack label. It does not pause or change ads in external platforms.
                        </div>
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      Visits
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      Leads
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      Conversions
                    </th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      CVR%
                    </th>
                    {hasRevenue && (
                      <>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Revenue
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Avg Value
                        </th>
                      </>
                    )}
                    {hasCost && (
                      <>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Spend
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Clicks
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Impressions
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          CTR
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          CPC
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          CPA
                        </th>
                      </>
                    )}
                    {hasRevenue && hasCost && (
                      <>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          ROAS
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                          Net Profit
                        </th>
                      </>
                    )}
                    <th className="text-right py-3 px-4 text-xs font-medium text-st-gray uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => {
                    const isOk = r.currency_status === 'ok'
                    const cvr = r.visits > 0 ? ((r.conversions / r.visits) * 100).toFixed(1) + '%' : '0.0%'
                    const netProfit = r.revenue - (r.spend || 0)

                    // Read-only status mapping
                    const campaignStatus = r.status === 'active' ? 'Active' :
                                           r.status === 'paused' ? 'Paused' :
                                           r.status === 'archived' ? 'Archived' :
                                           'Draft / Tracking only'

                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-dark-hover/50 transition-colors cursor-pointer" onClick={() => setSelectedCampaign(r)}>
                        <td className="py-3 px-4">
                          <p className="text-st-black dark:text-white font-medium inline-flex items-center">
                            {r.name || 'unknown'}
                            {isDirectLabel(r.name) && <DirectInfo />}
                          </p>
                          {r.platforms && r.platforms.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.platforms.map(plat => (
                                <span key={plat} className="px-1.5 py-0.5 text-[9px] font-bold bg-gray-100 text-gray-500 rounded border border-gray-200 dark:border-dark-border dark:bg-dark-hover uppercase tracking-wider">
                                  {plat}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {activeDim === 'campaign' && (
                          <td className="py-3 px-4 text-xs font-mono text-st-gray">
                            {r.source || 'direct'} / {r.medium || 'none'}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 group relative" onClick={(e) => e.stopPropagation()}>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BG_CLASSES[campaignStatus] || STATUS_BG_CLASSES['Draft / Tracking only']}`}>
                              {campaignStatus}
                            </span>
                            <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[11px] rounded-lg shadow-lg z-30 leading-normal font-normal text-left">
                              Campaign status is a SourceTrack label. It does not pause or change ads in external platforms.
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {safeNumber(r.visits, 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {safeNumber(r.leads, 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {safeNumber(r.conversions, 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-600">
                          {cvr}
                        </td>
                        {hasRevenue && (
                          <>
                            <td className="py-3 px-4 text-right font-semibold text-st-black dark:text-white">
                              {formatCurrency(r.revenue)}
                            </td>
                            <td className="py-3 px-4 text-right text-st-gray">
                              {formatCurrencyDecimal(r.avg_value)}
                            </td>
                          </>
                        )}
                        {hasCost && (
                          <>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              {editingSpend === r.name ? (
                                <div className="flex items-center justify-end gap-1">
                                  {savingState.campaign === r.name && savingState.status === 'saving' ? (
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-st-black" />
                                  ) : savingState.campaign === r.name && savingState.status === 'success' ? (
                                    <span className="text-green-600 text-xs font-medium">✓</span>
                                  ) : savingState.campaign === r.name && savingState.status === 'error' ? (
                                    <span className="text-red-500 text-[10px] font-medium">Error</span>
                                  ) : (
                                    <>
                                      <input
                                        type="number"
                                        className="w-20 text-right border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-gray-900 dark:bg-dark-card dark:text-white"
                                        value={spendInput}
                                        onChange={e => setSpendInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && saveSpend(r.name)}
                                        autoFocus
                                      />
                                      <button onClick={() => saveSpend(r.name)} className="text-green-600 hover:text-green-700">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setEditingSpend(null)} className="text-st-gray hover:text-gray-600">
                                        <span className="text-xs px-1">×</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1 group">
                                  <span className="text-gray-600">{r.spend ? formatCurrency(r.spend) : '—'}</span>
                                  <button onClick={() => { setEditingSpend(r.name); setSpendInput(spendMap[r.name] || '') }} className="opacity-0 group-hover:opacity-100 text-st-gray hover:text-gray-600">
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {r.clicks ? formatNumber(r.clicks) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {r.impressions ? formatNumber(r.impressions) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {r.ctr ? `${r.ctr}%` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {r.cpc ? formatCurrencyDecimal(r.cpc) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {!isOk && r.spend > 0 ? (
                                <CurrencyWarning status={r.currency_status} spendCur={r.spend_currency} trackCur={r.tracked_currency} />
                              ) : (
                                r.cpl ? formatCurrency(r.cpl) : '—'
                              )}
                            </td>
                          </>
                        )}
                        {hasRevenue && hasCost && (
                          <>
                            <td className="py-3 px-4 text-right text-gray-600">
                              {!isOk && r.spend > 0 ? (
                                <CurrencyWarning status={r.currency_status} spendCur={r.spend_currency} trackCur={r.tracked_currency} />
                              ) : (
                                r.roas ? <span className={r.roas >= 1.0 ? 'text-green-600 font-medium' : 'text-red-500'}>{r.roas}x</span> : '—'
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-gray-700 dark:text-gray-300">
                              {formatCurrency(netProfit)}
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedCampaign(r)}
                            className="text-xs text-st-black dark:text-white font-semibold hover:underline"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        {/* Dynamic Chart Container */}
        <div className="lg:col-span-3">
          <DashboardCard title="Revenue Breakdown" subtitle="Top 10 by revenue">
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
              </div>
            ) : isError || !analyticsAvailable ? (
              <div className="h-64 flex items-center justify-center text-sm text-gray-400">
                Revenue chart unavailable
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

      {selectedCampaign && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end animate-fade-in" onClick={() => setSelectedCampaign(null)}>
          <div
            className="bg-white dark:bg-[#1A1D1D] shadow-2xl w-full md:max-w-2xl lg:max-w-3xl h-full overflow-hidden flex flex-col transform transition-transform duration-300 ease-in-out"
            onClick={e => e.stopPropagation()}
          >
            {/* Slide-over Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2A2E2E] flex items-center justify-between flex-shrink-0 bg-gray-50/50 dark:bg-[#151818]/50">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-st-black dark:text-white">Campaign Details</h2>
                  {(() => {
                    const statusText = selectedCampaign.status === 'active' ? 'Active' :
                                       selectedCampaign.status === 'paused' ? 'Paused' :
                                       selectedCampaign.status === 'archived' ? 'Archived' :
                                       'Draft / Tracking only'
                    return (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BG_CLASSES[statusText] || STATUS_BG_CLASSES['Draft / Tracking only']}`}>
                        {statusText}
                      </span>
                    )
                  })()}
                </div>
                <p className="text-xs text-st-gray dark:text-gray-400 font-mono mt-0.5">
                  {selectedCampaign.name} • {selectedCampaign.source || 'direct'} / {selectedCampaign.medium || 'none'}
                </p>
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:text-white rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Slide-over Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* KPI Strip */}
              <div className="grid grid-cols-3 gap-4">
                <MetricTile label="Visits" value={selectedCampaign.visits} />
                <MetricTile label="Leads" value={selectedCampaign.leads} />
                <MetricTile label="Conversions" value={selectedCampaign.conversions} />
                {hasRevenue && <MetricTile label="Revenue" value={selectedCampaign.revenue} format="currency" />}
                {hasCost && <MetricTile label="Spend" value={selectedCampaign.spend} format="currency" />}
                {hasRevenue && hasCost && <MetricTile label="ROAS" value={selectedCampaign.roas ? `${selectedCampaign.roas}x` : '—'} />}
              </div>

              {/* UTM Details */}
              <DashboardCard title="UTM Parameters" subtitle="Captured UTM metadata">
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="p-2 bg-gray-50 dark:bg-[#151818] rounded-lg">
                    <span className="text-st-gray block">utm_source</span>
                    <span className="text-st-black dark:text-white">{selectedCampaign.source || '—'}</span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-[#151818] rounded-lg">
                    <span className="text-st-gray block">utm_medium</span>
                    <span className="text-st-black dark:text-white">{selectedCampaign.medium || '—'}</span>
                  </div>
                  <div className="p-2 bg-gray-50 dark:bg-[#151818] rounded-lg col-span-2">
                    <span className="text-st-gray block">utm_campaign</span>
                    <span className="text-st-black dark:text-white">{selectedCampaign.name}</span>
                  </div>
                </div>
              </DashboardCard>

              {/* Top Landing Pages under Campaign */}
              <DashboardCard title="Top Landing Pages" subtitle="Attributed URLs">
                <CampaignLandingPages siteKey={site?.site_key} campaignName={selectedCampaign.name} dateFrom={dateFrom} dateTo={dateTo} />
              </DashboardCard>

              {/* Recent Leads */}
              <DashboardCard title="Recent Leads" subtitle="Latest conversions under this campaign">
                <CampaignRecentLeads siteKey={site?.site_key} campaignName={selectedCampaign.name} dateFrom={dateFrom} dateTo={dateTo} navigate={navigate} />
              </DashboardCard>
            </div>
          </div>
        </div>
      )}

      {/* ─── Premium Ad Spend Import Modal ─── */}
      {importModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 scale-100">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-lg font-bold text-st-black flex items-center gap-2">
                  <UploadCloud className="w-5 h-5 text-st-black" /> Import Campaign Ad Cost Spend
                </h3>
                <p className="text-xs text-st-gray mt-0.5">Upload a CSV file or paste spend records daily to view matched campaign costs</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-st-gray hover:bg-gray-200 hover:text-st-black transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="px-6 border-b border-gray-100 flex gap-4 bg-white">
              <button
                onClick={() => setImportTab('upload')}
                className={`py-3 text-sm font-semibold border-b-2 transition-colors ${
                  importTab === 'upload' ? 'border-st-black text-st-black' : 'border-transparent text-st-gray hover:text-gray-700'
                }`}
              >
                Upload / Paste Spend
              </button>
              <button
                onClick={() => setImportTab('history')}
                className={`py-3 text-sm font-semibold border-b-2 transition-colors ${
                  importTab === 'history' ? 'border-st-black text-st-black' : 'border-transparent text-st-gray hover:text-gray-700'
                }`}
              >
                Import History
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
              {importTab === 'upload' ? (
                <div className="space-y-4">
                  {/* File Selector and Dropzone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      dragOver ? 'border-[#d7f550] bg-lime-50/20' : 'border-gray-300 hover:border-st-black bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      id="csv-file-picker"
                    />
                    <label htmlFor="csv-file-picker" className="cursor-pointer space-y-2 block">
                      <UploadCloud className="w-10 h-10 text-st-gray mx-auto" />
                      <p className="text-sm font-semibold text-st-black">Drag and drop your CSV file here, or <span className="text-blue-600 hover:underline">browse</span></p>
                      <p className="text-xs text-st-gray">Supports .csv files up to 1000 rows</p>
                    </label>
                  </div>

                  {/* Paste Textarea */}
                  <div>
                    <label className="block text-xs font-semibold text-st-black uppercase tracking-wider mb-1.5">Or Paste CSV Data Directly</label>
                    <textarea
                      className="w-full h-28 p-3 border border-gray-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-gray-900 resize-none placeholder-gray-400"
                      placeholder="date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions&#10;2026-06-08,facebook,Summer Sale,12345,45.50,USD,40,1200"
                      value={csvText}
                      onChange={e => {
                        setCsvText(e.target.value)
                        handleCsvParse(e.target.value)
                      }}
                    />
                  </div>

                  {/* Template download and info */}
                  <div className="flex items-center justify-between">
                    <a
                      href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                        "date,platform,campaign_name,campaign_id,spend,currency,clicks,impressions\n2026-06-08,facebook,Summer Sale,12345,45.50,USD,40,1200\n2026-06-08,google,Brand Search,,12.30,USD,12,180\n"
                      )}`}
                      download="sourcetrack_ad_spend_template.csv"
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-1"
                    >
                      Download CSV Template
                    </a>
                    <span className="text-[11px] text-st-gray flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" /> Column headers map dynamically.
                    </span>
                  </div>

                  {/* Preview Warning Banner */}
                  {parsedRows.length > 0 && currencyStatus.status !== 'ok' && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                      <div>
                        <p className="font-semibold">Currency Warning</p>
                        <p className="mt-0.5 leading-normal">
                          {currencyStatus.status === 'mixed'
                            ? `Mixed currencies detected in the uploaded spend. Aggregate CPA and ROAS values for these rows will be suppressed.`
                            : `The uploaded currency (${currencyStatus.spendCurrency}) differs from your site's conversion currency (${kpis?.tracked_currency || 'USD'}). Aggregate ROAS and CPA values will be suppressed.`
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Validation Error Alert Banner */}
                  {parsedRows.length > 0 && parsedRows.some(r => r.error) && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                      <div>
                        <p className="font-semibold">Validation Errors Found</p>
                        <p className="mt-0.5 leading-normal">
                          Please resolve the highlighted red rows below. Rows with validation errors cannot be imported.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Import Action Result */}
                  {importResult && (
                    <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 ${
                      importResult.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                      <Check className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">{importResult.success ? 'Import Completed Successfully!' : 'Import Execution Failed'}</p>
                        <p className="mt-0.5 leading-normal">
                          {importResult.success
                            ? `Uploaded and upserted ${importResult.count} aggregated campaign spend records.`
                            : importResult.error
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Live Preview Table */}
                  {parsedRows.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-semibold text-st-black uppercase tracking-wider">Preview Ingest Batch ({parsedRows.length} rows)</h4>
                      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                            <tr>
                              <th className="py-2 px-3 font-semibold text-st-gray w-24">Date</th>
                              <th className="py-2 px-3 font-semibold text-st-gray w-20">Platform</th>
                              <th className="py-2 px-3 font-semibold text-st-gray">Campaign</th>
                              <th className="py-2 px-3 font-semibold text-st-gray text-right w-20">Spend</th>
                              <th className="py-2 px-3 font-semibold text-st-gray w-16">Currency</th>
                              <th className="py-2 px-3 font-semibold text-st-gray text-right w-16">Clicks</th>
                              <th className="py-2 px-3 font-semibold text-st-gray text-right w-16">Impressions</th>
                              <th className="py-2 px-3 font-semibold text-st-gray w-32">Validation</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {parsedRows.map((r, idx) => (
                              <tr key={idx} className={r.error ? 'bg-red-50/50 hover:bg-red-50 transition-colors' : 'hover:bg-gray-50 transition-colors'}>
                                <td className="py-2 px-3 font-mono text-[11px]">{r.data.date || '—'}</td>
                                <td className="py-2 px-3 uppercase text-[10px] tracking-wider font-semibold text-gray-500">{r.data.platform || '—'}</td>
                                <td className="py-2 px-3 font-medium text-st-black truncate max-w-[150px]" title={r.data.campaign_name}>{r.data.campaign_name || '—'}</td>
                                <td className="py-2 px-3 text-right font-semibold">{r.data.spend !== undefined ? `$${parseFloat(r.data.spend).toFixed(2)}` : '—'}</td>
                                <td className="py-2 px-3 uppercase text-gray-600">{r.data.currency || 'USD'}</td>
                                <td className="py-2 px-3 text-right text-gray-600">{r.data.clicks || 0}</td>
                                <td className="py-2 px-3 text-right text-gray-600">{r.data.impressions || 0}</td>
                                <td className="py-2 px-3">
                                  {r.error ? (
                                    <span className="text-[10px] font-semibold text-red-600 flex items-center gap-0.5 leading-tight">
                                      <AlertTriangle className="w-3 h-3 shrink-0" /> {r.error}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold text-green-600">Valid</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Import History Log View */
                <div className="space-y-4">
                  {loadingHistory ? (
                    <div className="py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-st-black mx-auto" />
                      <p className="text-xs text-st-gray mt-2">Loading import execution runs...</p>
                    </div>
                  ) : importHistory.length === 0 ? (
                    <div className="py-12 text-center text-xs text-st-gray">
                      No import history found. Run your first cost synchronization above.
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Date / Time</th>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Sync Type</th>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Source</th>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Records Synced</th>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Status</th>
                            <th className="py-2.5 px-4 font-semibold text-st-gray">Logs / Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {importHistory.map((run, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="py-2.5 px-4 font-medium text-st-black">
                                {format(new Date(run.sync_start), 'yyyy-MM-dd HH:mm:ss')}
                              </td>
                              <td className="py-2.5 px-4 capitalize font-semibold text-gray-500">
                                {run.sync_type || 'manual'}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-[11px] text-st-gray">
                                {run.platform === 'manual_csv' ? 'Manual CSV' : run.platform}
                              </td>
                              <td className="py-2.5 px-4 text-center font-bold">
                                {run.records_synced}
                              </td>
                              <td className="py-2.5 px-4">
                                <StatusBadge
                                  status={run.status === 'success' ? 'success' : run.status === 'failed' ? 'inactive' : 'pending'}
                                  label={run.status}
                                />
                              </td>
                              <td className="py-2.5 px-4 text-st-gray truncate max-w-[200px]" title={run.error_message}>
                                {run.error_message || 'Completed cleanly'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={importing}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Close
              </button>
              {importTab === 'upload' && (
                <button
                  onClick={executeImport}
                  disabled={importing || parsedRows.length === 0 || parsedRows.some(r => r.error)}
                  className="px-4 py-2 text-sm font-semibold text-st-black bg-[#d7f550] hover:bg-[#c4df45] rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-st-black" /> Importing...
                    </>
                  ) : (
                    'Confirm Import'
                  )}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

function CampaignLandingPages({ siteKey, campaignName, dateFrom, dateTo }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-lp', siteKey, campaignName, dateFrom, dateTo],
    queryFn: () => fetchApi(`/attribution?site_key=${siteKey}&date_from=${dateFrom}&date_to=${dateTo}&model=last_touch&group_by=landing_page&metric=conversions&filter_campaign=${encodeURIComponent(campaignName)}`),
    enabled: !!siteKey && !!campaignName
  })

  const results = data?.results || []

  if (isLoading) {
    return <div className="text-xs text-st-gray py-4 text-center">Loading landing pages...</div>
  }

  if (results.length === 0) {
    return <div className="text-xs text-st-gray py-4 text-center">No landing pages detected.</div>
  }

  return (
    <div className="overflow-x-auto text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="py-2 px-1 text-st-gray font-medium">Path</th>
            <th className="py-2 px-1 text-right text-st-gray font-medium">Conversions</th>
          </tr>
        </thead>
        <tbody>
          {results.slice(0, 5).map((r, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-2 px-1 font-mono text-st-black dark:text-white truncate max-w-[200px]" title={r.dim_value}>{r.dim_value}</td>
              <td className="py-2 px-1 text-right text-gray-700 dark:text-gray-300">{r.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CampaignRecentLeads({ siteKey, campaignName, dateFrom, dateTo, navigate }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-leads', siteKey, campaignName, dateFrom, dateTo],
    queryFn: () => fetchApi(`/leads?site_key=${siteKey}&date_from=${dateFrom}&date_to=${dateTo}&search=${encodeURIComponent(campaignName)}`),
    enabled: !!siteKey && !!campaignName
  })

  const leads = data?.leads || []

  if (isLoading) {
    return <div className="text-xs text-st-gray py-4 text-center">Loading recent leads...</div>
  }

  if (leads.length === 0) {
    return <div className="text-xs text-st-gray py-4 text-center">No conversions recorded.</div>
  }

  return (
    <div className="overflow-x-auto text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="py-2 px-1 text-st-gray font-medium">Lead ID</th>
            <th className="py-2 px-1 text-right text-st-gray font-medium">Conversions</th>
          </tr>
        </thead>
        <tbody>
          {leads.slice(0, 5).map((l, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-2 px-1">
                <button
                  onClick={() => navigate('/leads')}
                  className="font-mono text-blue-600 hover:underline text-[11px]"
                >
                  {l.id ? l.id.slice(0, 8) : 'unknown'}...
                </button>
              </td>
              <td className="py-2 px-1 text-right text-gray-700 dark:text-gray-300">{l.conversions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
