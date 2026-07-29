import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bot, ShieldCheck, ShieldAlert, HelpCircle, FileText } from 'lucide-react'
import { fetchApi } from '../lib/api'
import { useActiveSite } from '../hooks/useActiveSite'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import QueryError from '../components/QueryError'

// AI Visibility — which BOTS read this site. Orthogonal to AI referral
// attribution (which is about humans arriving from an AI surface); the two must
// never be added together, so they live on separate pages and share no numbers.
//
// Verification honesty (§6): an ip_verified count and a ua_only count are never
// summed into a single "verified" figure. Every total renders alongside how much
// of it is actually proven, and an ip_mismatch (a spoofed UA) is shown as its own
// column — never inside the bot's hits.

const CATEGORY_LABELS = {
  llm_crawler: 'LLM crawler (training)',
  ai_search: 'AI search / answer',
  ai_assistant: 'AI assistant',
  search_engine: 'Search engine',
  seo_tool: 'SEO tool'
}

const RANGE_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }
]

function isoDay (date) {
  return date.toISOString().split('T')[0]
}

// One shared badge for the verification state so the Agents and Pages views can
// never drift into describing the same evidence differently.
function VerificationBadge ({ verified, uaOnly }) {
  const total = verified + uaOnly
  if (total === 0) return <span className="text-st-gray">—</span>

  if (uaOnly === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <ShieldCheck className="w-3 h-3" /> IP-verified
      </span>
    )
  }
  if (verified === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <HelpCircle className="w-3 h-3" /> UA-only
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <HelpCircle className="w-3 h-3" />
      {verified.toLocaleString()} verified / {uaOnly.toLocaleString()} UA-only
    </span>
  )
}

export default function AIVisibility () {
  const { site } = useActiveSite()
  const [view, setView] = useState('agents')
  const [days, setDays] = useState(30)
  const [category, setCategory] = useState('')

  const range = useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    return { from: isoDay(from), to: isoDay(to) }
  }, [days])

  const agentsQuery = useQuery({
    queryKey: ['ai-visibility-agents', site?.site_key, range.from, range.to],
    queryFn: () => fetchApi(
      `/ai-visibility/agents?site_key=${site.site_key}&from=${range.from}&to=${range.to}`
    ),
    enabled: !!site?.site_key && view === 'agents'
  })

  const pagesQuery = useQuery({
    queryKey: ['ai-visibility-pages', site?.site_key, range.from, range.to, category],
    queryFn: () => fetchApi(
      `/ai-visibility/pages?site_key=${site.site_key}&from=${range.from}&to=${range.to}` +
      (category ? `&category=${encodeURIComponent(category)}` : '')
    ),
    enabled: !!site?.site_key && view === 'pages'
  })

  const active = view === 'agents' ? agentsQuery : pagesQuery
  const agents = agentsQuery.data?.data?.agents || []
  const pages = pagesQuery.data?.data?.pages || []

  const agentColumns = [
    {
      label: 'Crawler',
      key: 'bot_name',
      render: (row) => (
        <span className="font-medium text-st-black dark:text-dark-primary">{row.bot_name}</span>
      )
    },
    { label: 'Operator', key: 'operator' },
    {
      label: 'Category',
      key: 'category',
      render: (row) => CATEGORY_LABELS[row.category] || row.category
    },
    {
      label: 'Fetches',
      key: 'hits',
      render: (row) => row.hits.toLocaleString()
    },
    {
      label: 'Evidence',
      key: 'evidence',
      render: (row) => (
        <VerificationBadge verified={row.hits_ip_verified} uaOnly={row.hits_ua_only} />
      )
    },
    {
      label: 'Spoofed',
      key: 'hits_ip_mismatch',
      render: (row) => row.hits_ip_mismatch > 0
        ? (
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-3 h-3" /> {row.hits_ip_mismatch.toLocaleString()}
          </span>
          )
        : <span className="text-st-gray">—</span>
    },
    { label: 'Pages', key: 'unique_paths', render: (row) => row.unique_paths.toLocaleString() }
  ]

  const pageColumns = [
    {
      label: 'Path',
      key: 'path',
      render: (row) => (
        <span className="font-mono text-st-black dark:text-dark-primary">{row.path}</span>
      )
    },
    { label: 'Fetches', key: 'hits', render: (row) => row.hits.toLocaleString() },
    {
      label: 'Evidence',
      key: 'evidence',
      render: (row) => (
        <VerificationBadge verified={row.hits_ip_verified} uaOnly={row.hits_ua_only} />
      )
    },
    { label: 'Crawlers', key: 'unique_bots', render: (row) => row.unique_bots.toLocaleString() },
    {
      label: 'LLM training',
      key: 'llm',
      render: (row) => row.by_category.llm_crawler.toLocaleString()
    },
    {
      label: 'AI search',
      key: 'ai_search',
      render: (row) => row.by_category.ai_search.toLocaleString()
    }
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-st-black dark:text-dark-primary flex items-center gap-2">
            <Bot className="w-5 h-5" /> AI Visibility
          </h1>
          <p className="text-xs text-st-gray dark:text-gray-400 mt-1 max-w-2xl">
            Which AI and search crawlers read this site. This is bot traffic, detected by
            User-Agent — separate from AI referrals, which are humans arriving from an AI
            surface. The two are never combined.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            {['agents', 'pages'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  view === v
                    ? 'bg-st-black text-white dark:bg-dark-primary dark:text-dark-bg'
                    : 'text-st-gray hover:bg-gray-50 dark:hover:bg-dark-hover'
                }`}
              >
                {v === 'agents' ? 'Agents' : 'Pages'}
              </button>
            ))}
          </div>

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-xs border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1.5 bg-white dark:bg-dark-card text-st-black dark:text-dark-primary"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>Last {o.label}</option>
            ))}
          </select>

          {view === 'pages' && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-xs border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1.5 bg-white dark:bg-dark-card text-st-black dark:text-dark-primary"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <DashboardCard title={view === 'agents' ? 'Crawlers' : 'Pages fetched'}>
        {/* An error is not a zero (§6) — checked BEFORE the empty branch. */}
        <QueryError isError={active.isError} error={active.error} onRetry={active.refetch} />

        {!active.isError && active.isLoading && (
          <p className="py-8 text-center text-sm text-st-gray">Loading…</p>
        )}

        {!active.isError && !active.isLoading && (
          view === 'agents'
            ? (
              <DashboardTable
                columns={agentColumns}
                rows={agents}
                emptyMessage="No crawler activity recorded for this range."
              />
              )
            : (
              <DashboardTable
                columns={pageColumns}
                rows={pages}
                emptyMessage="No crawler activity recorded for this range."
              />
              )
        )}
      </DashboardCard>

      {/* Verification ceiling per operator, straight from the detection registry
          so this legend cannot drift from what the detector can actually prove. */}
      {view === 'agents' && agentsQuery.data?.data?.coverage?.length > 0 && (
        <DashboardCard title="How each crawler is verified">
          <div className="px-4 py-3">
            <p className="text-xs text-st-gray dark:text-gray-400 mb-3">
              A User-Agent can be forged. Where an operator publishes its crawler IP ranges we
              check the source IP before counting the fetch. Where it publishes none, a
              User-Agent match is the strongest evidence that exists — those rows stay labelled
              UA-only and are never presented as verified.
            </p>
            <DashboardTable
              columns={[
                { label: 'Crawler', key: 'name' },
                { label: 'Operator', key: 'operator' },
                {
                  label: 'Best possible evidence',
                  key: 'bestPossibleVerification',
                  render: (row) => row.bestPossibleVerification === 'ip_verified'
                    ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="w-3 h-3" /> IP-verifiable
                      </span>
                      )
                    : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <HelpCircle className="w-3 h-3" /> UA-only (no ranges published)
                      </span>
                      )
                },
                {
                  label: 'Reaches a JS tracker',
                  key: 'executesJs',
                  render: (row) => row.executesJs
                    ? 'Yes — renders JS'
                    : <span className="text-st-gray">No — server-side fetch only</span>
                }
              ]}
              rows={agentsQuery.data.data.coverage}
              emptyMessage="Registry unavailable."
            />
          </div>
        </DashboardCard>
      )}

      <p className="flex items-start gap-2 text-[11px] text-st-gray dark:text-gray-400 px-1">
        <FileText className="w-3 h-3 mt-0.5 shrink-0" />
        Crawler fetches are recorded separately from visits and are never counted as visitors,
        sessions, or revenue.
      </p>
    </div>
  )
}
