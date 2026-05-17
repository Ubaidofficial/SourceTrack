import { fetchApi } from './api'

const SEED_FLAG_KEY = 'sourcetrack_seeded_v1'

const ECOMMERCE = [
  { name: 'Revenue by Source', desc: 'Which channels drive the most revenue', model: 'last_touch', groupBy: 'source', metric: 'revenue', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Conversion Trend', desc: 'Track conversions over the last 30 days', model: 'last_touch', groupBy: 'date', metric: 'conversions', chartType: 'line', datePreset: 30, filters: {} },
  { name: 'AI Revenue Share', desc: 'What percentage of revenue comes from AI platforms', model: 'ai_platforms', groupBy: 'ai_source', metric: 'ai_revenue_share', chartType: 'pie', datePreset: 30, filters: { has_ai_source: 'true' } },
  { name: 'Top Landing Pages', desc: 'Best-performing entry pages by revenue', model: 'first_touch', groupBy: 'landing_page', metric: 'revenue', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Campaign Revenue', desc: 'Revenue breakdown by marketing campaign', model: 'last_touch', groupBy: 'campaign', metric: 'revenue', chartType: 'bar', datePreset: 90, filters: { min_conversions: '1' } }
]

const SAAS = [
  { name: 'Signups by Source', desc: 'Which channels bring the most signups', model: 'last_touch', groupBy: 'source', metric: 'leads', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Conversion Trend', desc: 'Track conversions over the last 30 days', model: 'last_touch', groupBy: 'date', metric: 'conversions', chartType: 'line', datePreset: 30, filters: {} },
  { name: 'AI-Assisted Signups', desc: 'Signups that came from AI platforms', model: 'ai_platforms', groupBy: 'ai_source', metric: 'ai_conversions', chartType: 'bar', datePreset: 30, filters: { has_ai_source: 'true' } },
  { name: 'Landing Page Performance', desc: 'Conversion rates by landing page', model: 'first_touch', groupBy: 'landing_page', metric: 'conversions', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Campaign Performance', desc: 'Leads by marketing campaign', model: 'last_touch', groupBy: 'campaign', metric: 'leads', chartType: 'bar', datePreset: 90, filters: { min_conversions: '1' } }
]

const LEADGEN = [
  { name: 'Leads by Source', desc: 'Top channels generating leads', model: 'last_touch', groupBy: 'source', metric: 'leads', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Conversion Rate by Source', desc: 'Which sources convert best', model: 'last_touch', groupBy: 'source', metric: 'conversion_rate', chartType: 'bar', datePreset: 30, filters: { min_conversions: '5' } },
  { name: 'AI Source Impact', desc: 'Share of conversions from AI platforms', model: 'ai_platforms', groupBy: 'ai_source', metric: 'ai_conversion_share', chartType: 'pie', datePreset: 30, filters: { has_ai_source: 'true' } },
  { name: 'Landing Page Leads', desc: 'Leads by entry page', model: 'first_touch', groupBy: 'landing_page', metric: 'conversions', chartType: 'bar', datePreset: 30, filters: {} },
  { name: 'Campaign Leads', desc: 'Lead generation by campaign', model: 'last_touch', groupBy: 'campaign', metric: 'leads', chartType: 'bar', datePreset: 90, filters: { min_conversions: '1' } }
]

const SEEDS = { ecommerce: ECOMMERCE, saas: SAAS, leadgen: LEADGEN }

export async function seedReportsForBusiness(businessType, siteKey) {
  try {
    if (!siteKey) return
    if (localStorage.getItem(SEED_FLAG_KEY)) return

    const seeds = SEEDS[businessType]
    if (!seeds || seeds.length === 0) return

    const today = new Date()
    const from = new Date(today)
    from.setDate(from.getDate() - 30)
    const dateTo = today.toISOString().slice(0, 10)
    const dateFrom = from.toISOString().slice(0, 10)

    for (const seed of seeds) {
      try {
        await fetchApi('/reports/saved', {
          method: 'POST',
          body: JSON.stringify({
            site_key: siteKey,
            name: seed.name,
            config: {
              model: seed.model,
              groupBy: seed.groupBy,
              groupBy2: null,
              metric: seed.metric,
              chartType: seed.chartType,
              datePreset: seed.datePreset,
              dateFrom,
              dateTo,
              granularity: 'day',
              attributionWindow: null,
              attributeBy: 'conversion_date',
              filters: seed.filters
            }
          })
        })
      } catch {
        /* individual seed failure — continue with others */
      }
    }

    localStorage.setItem(SEED_FLAG_KEY, '1')
  } catch {
    /* seeding is non-critical */
  }
}
