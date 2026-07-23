import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useActiveSite } from '../hooks/useActiveSite'
import { ArrowRight, Search, Download, AlertTriangle } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import QueryError from '../components/QueryError'
import MetricTile from '../components/MetricTile'
import JourneyModal from '../components/JourneyModal'
import { SourceChip } from '../components/SourceIcon'
import { safeNumber, formatCurrency } from '../utils/numbers'
import { hasFeature } from '../lib/planFeatures'

const CONVERSION_TYPE_BADGE = {
  purchase: { bg: 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200/30 dark:border-green-900/30', label: 'Purchase' },
  trial: { bg: 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-200/30 dark:border-blue-900/30', label: 'Trial' },
  lead: { bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/30 dark:border-amber-900/30', label: 'Lead Form' },
  signup: { bg: 'bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-200/30 dark:border-purple-900/30', label: 'Sign Up' },
  meeting: { bg: 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400 border border-sky-200/30 dark:border-sky-900/30', label: 'Meeting' },
  booking: { bg: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border border-indigo-200/30 dark:border-indigo-900/30', label: 'Booking' }
}

// Same preset set + control as Campaigns.jsx (the app's existing date-range pattern — reused, not
// rebuilt). Default is 30 days so existing behavior is unchanged.
const DATE_RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 }
]

export default function Leads() {
  const { site } = useActiveSite()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterAI, setFilterAI] = useState('all')
  const [attributionModel, setAttributionModel] = useState('first_touch')
  const [journeyLead, setJourneyLead] = useState(null)
  const [statusMap, setStatusMap] = useState({})
  const [selectedLeads, setSelectedLeads] = useState(new Set())
  const [dateRange, setDateRange] = useState(30)

  // Both dates already flow to /leads, which forwards date_from_ts/date_to_ts to the leads_list +
  // leads_count pipes (backend already supports the window). Default 30 keeps existing behavior.
  const dateFrom = format(subDays(new Date(), dateRange), 'yyyy-MM-dd')
  const dateTo = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data: leadsData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['leads-page', site?.site_key, debouncedSearch, filterAI, attributionModel, dateFrom, dateTo],
    queryFn: async () => {
      if (!site?.site_key) return null
      const params = new URLSearchParams({
        site_key: site.site_key,
        date_from: dateFrom,
        date_to: dateTo,
        attribution_model: attributionModel,
        limit: '100'
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (filterAI !== 'all') params.set('ai', filterAI)
      return fetchApi(`/leads?${params}`)
    },
    enabled: !!site?.site_key
  })

  const [sortField, setSortField] = useState('last_seen')
  const [sortOrder, setSortOrder] = useState('desc')

  const leads = leadsData?.leads || []
  const totalRevenue = safeNumber(leadsData?.total_revenue, 0)
  const totalConversions = safeNumber(leadsData?.total_conversions, 0)
  const totalLeads = safeNumber(leadsData?.total, leads.length)

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortedLeads = [...leads].sort((a, b) => {
    let aVal, bVal

    if (sortField === 'visitor') {
      aVal = a.id || ''
      bVal = b.id || ''
    } else if (sortField === 'source') {
      aVal = a.ai_source || a.source || 'direct'
      bVal = b.ai_source || b.source || 'direct'
    } else if (sortField === 'event_type') {
      aVal = a.last_conversion_type || ''
      bVal = b.last_conversion_type || ''
    } else if (sortField === 'conversions') {
      aVal = safeNumber(a.conversions, 0)
      bVal = safeNumber(b.conversions, 0)
    } else if (sortField === 'revenue') {
      aVal = safeNumber(a.revenue, 0)
      bVal = safeNumber(b.revenue, 0)
    } else if (sortField === 'last_seen') {
      aVal = a.last_seen ? new Date(a.last_seen).getTime() : 0
      bVal = b.last_seen ? new Date(b.last_seen).getTime() : 0
    } else if (sortField === 'status') {
      aVal = statusMap[a.id] || a.status || 'lead'
      bVal = statusMap[b.id] || b.status || 'lead'
    } else if (sortField === 'country') {
      aVal = a.country || ''
      bVal = b.country || ''
    } else {
      return 0
    }

    if (aVal === bVal) return 0

    const comparison = typeof aVal === 'string'
      ? aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
      : aVal - bVal

    return sortOrder === 'asc' ? comparison : -comparison
  })

  const renderHeader = (field, label, alignRight = false) => {
    const isSorted = sortField === field
    const arrow = isSorted ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''
    return (
      <th
        onClick={() => handleSort(field)}
        className={`${alignRight ? 'text-right' : 'text-left'} py-3 px-3 text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100/70 dark:hover:bg-dark-hover/40 transition-colors`}
      >
        {label}
        {isSorted && <span className="text-[10px] font-bold text-st-lime whitespace-pre">{arrow}</span>}
      </th>
    )
  }
  const journeyVisitorId = journeyLead?.id || journeyLead?.visitor_id || journeyLead?.anonymous_id || null

  function openJourney(lead) {
    if (!lead) return
    const visitorId = lead.id || lead.visitor_id || lead.anonymous_id
    if (!visitorId) return
    setJourneyLead({ ...lead, id: visitorId })
  }

  const handleBulkStatusChange = async (newStatus) => {
    try {
      await Promise.all(
        Array.from(selectedLeads).map(leadId =>
          fetchApi(`/leads/${leadId}/qualify?site_key=${site.site_key}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
          })
        )
      )
      setStatusMap(prev => {
        const next = { ...prev }
        selectedLeads.forEach(leadId => { next[leadId] = newStatus })
        return next
      })
      setSelectedLeads(new Set())
    } catch (err) {
      console.error('Bulk status change failed', err)
    }
  }

  const handleExportSelected = () => {
    const selectedObjects = leads.filter(l => selectedLeads.has(l.id))
    const headers = ['Visitor ID', 'Source', 'Medium', 'Campaign', 'AI Source', 'Conversions', 'Revenue', 'Last Seen', 'Country']
    const csvRows = [
      headers.join(','),
      ...selectedObjects.map(l => [
        l.id,
        l.source || 'direct',
        l.medium || 'none',
        l.campaign || '',
        l.ai_source || '',
        l.conversions || 0,
        l.revenue || 0,
        l.last_seen ? new Date(l.last_seen).toISOString() : '',
        l.country || ''
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'selected_leads.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Canonical 4-state status vocabulary (matches lead_qualifications.status + the
  // CHECK constraint). `lead` is the null/unmarked fallback (curStatus || 'lead').
  const STATUS_CHIP = {
    lead:        { bg: 'bg-gray-50 text-gray-500 dark:bg-[#181B1B]/40 dark:text-gray-400 border border-gray-200 dark:border-dark-border', label: 'Unqualified' },
    unqualified: { bg: 'bg-gray-50 text-gray-500 dark:bg-[#181B1B]/40 dark:text-gray-400 border border-gray-200 dark:border-dark-border', label: 'Unqualified' },
    qualified:   { bg: 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30', label: 'Qualified' },
    mql:         { bg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30',  label: 'MQL' },
    sql:         { bg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30', label: 'SQL' }
  }

  const hasRevenue = totalRevenue > 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-dark-primary">Leads</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">Individual visitors who have converted or engaged with your site</p>
        </div>
        {hasFeature(site?.plan, 'csv_export') ? (
          <button onClick={() => {
            if (!site) return
            const params = new URLSearchParams({ site_key: site.site_key, model: 'first_touch', date_from: dateFrom, date_to: dateTo, group_by: 'source', metric: 'revenue' })
            window.open(`/api/export/report?${params}`, '_blank')
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

      {!hasRevenue && !isLoading && (
        <div className="p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 leading-normal flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-semibold">No revenue in this period</p>
            <p className="mt-0.5">Revenue appears after Stripe, Shopify, or a conversion event sends a purchase value. <a href="/app/integrations" className="underline hover:text-amber-700">Open Integrations</a> to connect revenue tracking.</p>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${hasRevenue ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <MetricTile label="Total Leads" value={totalLeads} />
        <MetricTile label="Total Conversions" value={totalConversions} />
        {hasRevenue && <MetricTile label="Total Revenue" value={totalRevenue} format="currency" />}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-st-gray dark:text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by visitor ID, source, or campaign..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-dark-border-strong bg-white dark:bg-[#181B1B]/40 rounded-lg text-sm outline-none text-st-black dark:text-dark-primary focus:ring-2 focus:ring-gray-900 dark:focus:ring-st-lime"
          />
        </div>
        <select value={filterAI} onChange={e => setFilterAI(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-dark-border-strong bg-white dark:bg-[#181B1B]/40 rounded-lg text-sm outline-none text-st-black dark:text-dark-primary focus:ring-2 focus:ring-gray-900 dark:focus:ring-st-lime">
          <option value="all">All Sources</option>
          <option value="ai">AI Sources</option>
          <option value="non-ai">Non-AI Sources</option>
        </select>
        <select value={attributionModel} onChange={e => setAttributionModel(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-dark-border-strong bg-white dark:bg-[#181B1B]/40 rounded-lg text-sm outline-none text-st-black dark:text-dark-primary focus:ring-2 focus:ring-gray-900 dark:focus:ring-st-lime">
          <option value="first_touch">First Touch</option>
          <option value="last_touch">Last Touch</option>
        </select>
        <div className="flex bg-gray-100 dark:bg-[#181B1B] rounded-lg p-1">
          {DATE_RANGES.map(dr => (
            <button key={dr.label} onClick={() => setDateRange(dr.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                dateRange === dr.days ? 'bg-white dark:bg-[#252929] text-st-black dark:text-dark-primary shadow-sm' : 'text-st-gray dark:text-gray-400 hover:text-gray-700 dark:hover:text-dark-text'
              }`}>
              {dr.label}
            </button>
          ))}
        </div>
      </div>

      <DashboardCard title="All Leads" subtitle={leads.length >= 100 ? 'Showing the 100 most recent' : `${leads.length} shown`}>
        {isLoading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black mx-auto" />
          </div>
        ) : isError ? (
          <QueryError isError={isError} error={error} onRetry={refetch} />
        ) : leads.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            {search ? (
              <div className="space-y-1">
                <p className="text-sm text-st-gray dark:text-gray-400">No matches for "{search}" in the leads loaded for this range.</p>
                <p className="text-xs text-st-gray dark:text-gray-500">Search currently covers the leads loaded for the selected date range, not your full history — widen the date range to surface older visitors.</p>
              </div>
            ) : filterAI !== 'all' ? (
              <p className="text-sm text-st-gray dark:text-gray-400">No leads match this filter in the range shown.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-st-black dark:text-dark-primary">No leads yet</p>
                <p className="text-xs text-st-gray dark:text-gray-400 max-w-xs mx-auto">Leads appear after visitors submit a form, book a meeting, or trigger a conversion event.</p>
                <div className="flex items-center justify-center gap-4 mt-3">
                  <a href="/setup" className="text-xs text-st-black dark:text-dark-primary underline underline-offset-2 hover:opacity-70">View install guide</a>
                  <a href="/docs/conversions" className="text-xs text-st-black dark:text-dark-primary underline underline-offset-2 hover:opacity-70">Open conversion docs</a>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-dark-card/50">
                  <th className="py-3 px-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-card text-st-black focus:ring-st-black cursor-pointer"
                      checked={leads.length > 0 && selectedLeads.size === leads.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedLeads(new Set(leads.map(l => l.id)))
                        else setSelectedLeads(new Set())
                      }}
                    />
                  </th>
                  {renderHeader('visitor', 'Visitor')}
                  <th className="text-left py-3 px-3 text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Contact</th>
                  {renderHeader('source', 'Source')}
                  <th className="text-left py-3 px-3 text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">AI Source</th>
                  {renderHeader('event_type', 'Event Type')}
                  {renderHeader('conversions', 'Conversions', true)}
                  {hasRevenue && renderHeader('revenue', 'Revenue', true)}
                  {renderHeader('last_seen', 'Last seen')}
                  {renderHeader('status', 'Status')}
                  {renderHeader('country', 'Country', true)}
                  <th className="text-right py-3 px-3 text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead, i) => {
                  const shortId = lead.id ? lead.id.slice(0, 8) : 'unknown'
                  const isSelected = selectedLeads.has(lead.id)
                  const curStatus = statusMap[lead.id] || lead.status || 'lead'
                  const statusStyle = STATUS_CHIP[curStatus] || STATUS_CHIP.lead
                  return (
                    <tr
                      key={i}
                      onClick={() => openJourney(lead)}
                      className={`border-b border-gray-100/80 dark:border-dark-border hover:bg-gray-50/50 dark:hover:bg-dark-hover/40 transition-colors cursor-pointer${isSelected ? ' bg-st-lime/5 dark:bg-[#1E2318]' : ''}`}
                    >
                      <td className="py-3 px-3 w-8" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-dark-card text-st-black focus:ring-st-black cursor-pointer"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedLeads(prev => {
                              const next = new Set(prev)
                              if (next.has(lead.id)) next.delete(lead.id)
                              else next.add(lead.id)
                              return next
                            })
                          }}
                        />
                      </td>
                      <td className="py-3 px-3 text-st-black dark:text-gray-300 font-mono text-xs">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openJourney(lead) }}
                          className="font-mono text-xs text-st-black dark:text-gray-300 hover:underline underline-offset-2"
                          title="Open journey"
                        >
                          {shortId}...
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        {(lead.name || lead.email) ? (
                          <div className="flex flex-col gap-0.5 max-w-[200px]">
                            {lead.name && (
                              <span className="text-xs font-medium text-st-black dark:text-gray-200 truncate" title={lead.name}>{lead.name}</span>
                            )}
                            {lead.email && (
                              <span className="text-[11px] text-st-gray dark:text-gray-400 truncate" title={lead.email}>{lead.email}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-st-gray dark:text-gray-500" title="This visitor has not volunteered contact details.">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5">
                          <SourceChip source={lead.ai_source || lead.source || 'direct'} />
                          {lead.campaign && lead.campaign !== 'none' && (
                            <span className="text-[10px] text-st-gray dark:text-gray-400 truncate max-w-[140px]">{lead.campaign}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {lead.ai_influenced_source ? (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 text-[10px] font-medium truncate max-w-[140px]"
                            title="Conversion arrived as Direct traffic; a prior AI session was detected."
                          >
                            {lead.ai_influenced_source}
                          </span>
                        ) : (
                          <span className="text-st-gray dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {lead.last_conversion_type ? (() => {
                          const key = String(lead.last_conversion_type).toLowerCase()
                          const style = CONVERSION_TYPE_BADGE[key] || {
                            bg: 'bg-gray-50 text-gray-500 border border-gray-200 dark:border-gray-800',
                            label: lead.last_conversion_type
                          }
                          return (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.bg}`}>
                              {style.label}
                            </span>
                          )
                        })() : (
                          <span className="text-xs text-st-gray dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 dark:text-gray-400 tabular-nums">{lead.conversions}</td>
                      {hasRevenue && (
                        <td className="py-3 px-3 text-right font-semibold text-st-black dark:text-dark-primary tabular-nums">
                          {lead.revenue != null ? formatCurrency(lead.revenue) : '—'}
                        </td>
                      )}
                      <td className="py-3 px-3 text-xs text-st-gray dark:text-gray-400 tabular-nums">
                        {lead.last_seen ? new Date(lead.last_seen).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${statusStyle.bg}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-st-gray dark:text-gray-400 text-xs tabular-nums">
                        {lead.country || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/leads/${encodeURIComponent(lead.id)}`) }}
                            className="text-xs text-gray-600 dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text font-medium"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openJourney(lead) }}
                            className="text-xs text-st-black dark:text-dark-primary hover:text-gray-700 dark:hover:text-gray-300 font-medium flex items-center gap-1"
                          >
                            Journey <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      {selectedLeads.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-st-black text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 text-xs font-medium">
          <span>{selectedLeads.size} selected</span>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={() => handleBulkStatusChange('qualified')} className="hover:text-st-lime transition-colors">Mark Qualified</button>
          <button onClick={() => handleBulkStatusChange('mql')} className="hover:text-st-lime transition-colors">Mark MQL</button>
          <button onClick={() => handleBulkStatusChange('sql')} className="hover:text-st-lime transition-colors">Mark SQL</button>
          <button onClick={() => handleBulkStatusChange('unqualified')} className="hover:text-st-lime transition-colors">Mark Unqualified</button>
          <div className="w-px h-4 bg-gray-700" />
          <button onClick={handleExportSelected} className="text-st-lime hover:underline">Export CSV</button>
        </div>
      )}

      {journeyVisitorId && (
        <JourneyModal
          visitorId={journeyVisitorId}
          siteKey={site?.site_key}
          leadSummary={journeyLead}
          onClose={() => setJourneyLead(null)}
          onQualified={(newStatus) => {
            if (journeyLead?.id && newStatus) {
              setStatusMap(prev => ({ ...prev, [journeyLead.id]: newStatus }))
            }
            refetch()
          }}
        />
      )}
    </div>
  )
}
