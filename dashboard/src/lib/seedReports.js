const SEED_FLAG_KEY = 'sourcetrack_seeded_v1'
const STORAGE_KEY = 'sourcetrack_saved_reports'

function loadSavedReports() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}

function saveToStore(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* quota */ }
}

const ECOMMERCE = [
  {
    id: 'seed_ecom_1',
    name: 'Revenue by Source',
    desc: 'Which channels drive the most revenue',
    model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'revenue',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_ecom_2',
    name: 'Conversion Trend',
    desc: 'Track conversions over the last 30 days',
    model: 'last_touch', groupBy: 'date', groupBy2: null, metric: 'conversions',
    chartType: 'line', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_ecom_3',
    name: 'AI Revenue Share',
    desc: 'What percentage of revenue comes from AI platforms',
    model: 'ai_platforms', groupBy: 'ai_source', groupBy2: null, metric: 'ai_revenue_share',
    chartType: 'pie', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { has_ai_source: 'true' }, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_ecom_4',
    name: 'Top Landing Pages',
    desc: 'Best-performing entry pages by revenue',
    model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'revenue',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_ecom_5',
    name: 'Campaign Revenue',
    desc: 'Revenue breakdown by marketing campaign',
    model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'revenue',
    chartType: 'bar', datePreset: 90, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { min_conversions: '1' }, createdAt: new Date().toISOString()
  }
]

const SAAS = [
  {
    id: 'seed_saas_1',
    name: 'Signups by Source',
    desc: 'Which channels bring the most signups',
    model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'leads',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_saas_2',
    name: 'Conversion Trend',
    desc: 'Track conversions over the last 30 days',
    model: 'last_touch', groupBy: 'date', groupBy2: null, metric: 'conversions',
    chartType: 'line', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_saas_3',
    name: 'AI-Assisted Signups',
    desc: 'Signups that came from AI platforms',
    model: 'ai_platforms', groupBy: 'ai_source', groupBy2: null, metric: 'ai_conversions',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { has_ai_source: 'true' }, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_saas_4',
    name: 'Landing Page Performance',
    desc: 'Conversion rates by landing page',
    model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_saas_5',
    name: 'Campaign Performance',
    desc: 'Leads by marketing campaign',
    model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'leads',
    chartType: 'bar', datePreset: 90, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { min_conversions: '1' }, createdAt: new Date().toISOString()
  }
]

const LEADGEN = [
  {
    id: 'seed_leadgen_1',
    name: 'Leads by Source',
    desc: 'Top channels generating leads',
    model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'leads',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_leadgen_2',
    name: 'Conversion Rate by Source',
    desc: 'Which sources convert best',
    model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'conversion_rate',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { min_conversions: '5' }, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_leadgen_3',
    name: 'AI Source Impact',
    desc: 'Share of conversions from AI platforms',
    model: 'ai_platforms', groupBy: 'ai_source', groupBy2: null, metric: 'ai_conversion_share',
    chartType: 'pie', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { has_ai_source: 'true' }, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_leadgen_4',
    name: 'Landing Page Leads',
    desc: 'Leads by entry page',
    model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions',
    chartType: 'bar', datePreset: 30, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: {}, createdAt: new Date().toISOString()
  },
  {
    id: 'seed_leadgen_5',
    name: 'Campaign Leads',
    desc: 'Lead generation by campaign',
    model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'leads',
    chartType: 'bar', datePreset: 90, dateFrom: '', dateTo: '',
    granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
    filters: { min_conversions: '1' }, createdAt: new Date().toISOString()
  }
]

const SEEDS = {
  ecommerce: ECOMMERCE,
  saas: SAAS,
  leadgen: LEADGEN
}

export function seedReportsForBusiness(businessType) {
  try {
    if (localStorage.getItem(SEED_FLAG_KEY)) return

    const seeds = SEEDS[businessType]
    if (!seeds || seeds.length === 0) return

    const existing = loadSavedReports()
    const existingIds = new Set(existing.map(r => r.id))
    const newReports = seeds.filter(s => !existingIds.has(s.id))

    if (newReports.length === 0) {
      localStorage.setItem(SEED_FLAG_KEY, '1')
      return
    }

    saveToStore([...existing, ...newReports])
    localStorage.setItem(SEED_FLAG_KEY, '1')
  } catch {
    /* localStorage may be unavailable — non-critical */
  }
}
