// Overview KPI tile selection (dashboard/src/lib/overviewKpis.js).
//
// THE POINT OF THIS FILE: the strip now renders a VARIABLE number of tiles chosen by business
// type and data availability, which means "which tiles appear" is real logic and no longer
// something a reader can verify by eye in Dashboard.jsx. The failure mode it guards is the §6
// one: /dashboard/overview hands the client a literal 0 for avg_value, sql_percent, ai_revenue
// and best_rpv whenever the underlying read found nothing, so a tile gated on the METRIC rather
// than on an existence signal renders a fabricated number. Each assertion below pins a slot to
// the signal that proves the value is real.

import test from 'node:test'
import assert from 'node:assert/strict'

const { selectOverviewKpis, normalizeBusinessType } = await import('../../dashboard/src/lib/overviewKpis.js')

const keys = (tiles) => tiles.map(t => t.key)

// A site with everything populated, used as the baseline the negative cases strip down from.
const rich = (over = {}) => ({
  businessType: 'ecommerce',
  kpis: { ai_revenue: 500, ai_revenue_share: 25, sql_percent: 40, sessions: 1000 },
  totalRevenue: 2000,
  totalConversions: 50,
  totalLeads: 30,
  leadsTracked: true,
  totalCustomers: 20,
  revenueDelta: { pct: 12.5, up: true },
  leadsDelta: { pct: 5, up: true },
  customersDelta: { pct: 3, up: true },
  avgValue: 100,
  leadConvRate: 3,
  customerConvRate: 2,
  revenuePerVisitor: 2,
  activeResults: [
    { dim_value: 'google', revenue: 1200, conversions: 30 },
    { dim_value: 'facebook', revenue: 800, conversions: 20 }
  ],
  aiSourceRows: [{ name: 'ChatGPT', conversions: 8, revenue: 500 }],
  ...over
})

test('business type normalizes to the DB constraint values, including bare "leadgen"', () => {
  // The live column is saas|ecommerce|leadgen (sites_business_type_check). ReportBuilder.jsx's
  // own helper matches 'lead_gen'/'agency' and NEVER 'leadgen', so it returns 'unknown' for
  // every real lead-gen site — this module must not inherit that bug.
  assert.equal(normalizeBusinessType('leadgen'), 'leadgen')
  assert.equal(normalizeBusinessType('lead_gen'), 'leadgen')
  assert.equal(normalizeBusinessType('ecommerce'), 'ecommerce')
  assert.equal(normalizeBusinessType('SaaS'), 'saas')
  // Unknown/absent falls back to the column default rather than emptying the strip.
  assert.equal(normalizeBusinessType(''), 'saas')
  assert.equal(normalizeBusinessType('nonsense'), 'saas')
})

test('MRR and Trial-to-Paid never appear — they are not built (CLAUDE.md §7)', () => {
  const tiles = selectOverviewKpis(rich({ businessType: 'saas' }))
  const labels = tiles.map(t => t.label.toLowerCase()).join(' ')
  assert.ok(!labels.includes('mrr'), 'MRR has no backing field and must not be rendered')
  assert.ok(!labels.includes('trial'), 'Trial-to-Paid has no backing field and must not be rendered')
})

test('cost-gated metrics never appear — the overview payload carries no ad cost at all', () => {
  for (const bt of ['saas', 'ecommerce', 'leadgen']) {
    const labels = selectOverviewKpis(rich({ businessType: bt })).map(t => t.label.toLowerCase()).join(' ')
    for (const banned of ['roas', 'cac', 'cpl']) {
      assert.ok(!labels.includes(banned), `${banned.toUpperCase()} must not render for ${bt} — no cost data exists on this payload`)
    }
  }
})

test('eCommerce shows its full §10.3 row when every slot has real data', () => {
  const tiles = selectOverviewKpis(rich())
  assert.deepEqual(keys(tiles), ['revenue', 'revenue_growth', 'ai_revenue', 'aov', 'top_source', 'customers'])
  assert.equal(tiles.find(t => t.key === 'top_source').value, 'google')   // ranked by revenue
})

test('lead gen ranks its top source by CONVERSIONS, not revenue', () => {
  const tiles = selectOverviewKpis(rich({
    businessType: 'leadgen',
    activeResults: [
      { dim_value: 'high-revenue-low-volume', revenue: 9999, conversions: 2 },
      { dim_value: 'the-real-lead-source', revenue: 10, conversions: 80 }
    ]
  }))
  const top = tiles.find(t => t.key === 'top_source')
  assert.equal(top.label, 'Top Lead Source')
  assert.equal(top.value, 'the-real-lead-source')
})

// ── §6: every slot disappears rather than rendering a server-side default zero ──

test('AOV is absent when avg_value is the server default 0', () => {
  const tiles = selectOverviewKpis(rich({ avgValue: 0 }))
  assert.ok(!keys(tiles).includes('aov'))
})

test('AI tiles are absent when there is no AI revenue or AI conversion', () => {
  const ecom = selectOverviewKpis(rich({ kpis: { ai_revenue: 0 } }))
  assert.ok(!keys(ecom).includes('ai_revenue'))
  const lead = selectOverviewKpis(rich({ businessType: 'leadgen', aiSourceRows: [{ name: 'ChatGPT', conversions: 0 }] }))
  assert.ok(!keys(lead).includes('ai_leads'))
})

test('growth tiles are absent when the prior period gives nothing to compare against', () => {
  // useDashboardData.formatDeltaVal returns null whenever previous is 0 — that null is the
  // difference between a measured change and no baseline, and must not become "0.0%".
  const tiles = selectOverviewKpis(rich({ revenueDelta: null }))
  assert.ok(!keys(tiles).includes('revenue_growth'))
  assert.equal(tiles.find(t => t.key === 'revenue').trend, null)
})

test('Sales Qualified is absent with no conversions, but a REAL 0% does show', () => {
  // dashboard.js:350 returns a literal 0 when totalConversions is 0 — a placeholder, not a rate.
  const noConversions = selectOverviewKpis(rich({ businessType: 'leadgen', totalConversions: 0, kpis: { sql_percent: 0 } }))
  assert.ok(!keys(noConversions).includes('sql_percent'), '0% off zero conversions is a fake zero')

  // Conversions exist and none are SQL: 0.0% is a genuine measurement and must be shown.
  const realZero = selectOverviewKpis(rich({ businessType: 'leadgen', totalConversions: 50, kpis: { sql_percent: 0 } }))
  const tile = realZero.find(t => t.key === 'sql_percent')
  assert.ok(tile, 'a measured 0% must render — hiding it would be its own dishonesty')
  assert.equal(tile.value, 0)
})

test('the Sales Qualified label does not overstate what sql_percent measures', () => {
  // The backing field counts ONLY status === 'sql', not the wider qualified/mql set the Journey
  // status dropdown offers, so the tile must not be labelled a general "Qualified %".
  const tile = selectOverviewKpis(rich({ businessType: 'leadgen' })).find(t => t.key === 'sql_percent')
  assert.equal(tile.label, 'Sales Qualified')
})

test('top source rejects zero-value rows and the server\'s "—" placeholder', () => {
  const allZero = selectOverviewKpis(rich({ activeResults: [{ dim_value: 'google', revenue: 0, conversions: 0 }] }))
  assert.ok(!keys(allZero).includes('top_source'), 'a source with no value is not a "top" source')

  const placeholder = selectOverviewKpis(rich({ activeResults: [{ dim_value: '—', revenue: 100, conversions: 5 }] }))
  assert.ok(!keys(placeholder).includes('top_source'), '"—" is dashboard.js\'s no-data marker, not a source name')

  assert.ok(!keys(selectOverviewKpis(rich({ activeResults: [] }))).includes('top_source'))
})

test('a revenue-less site shows no revenue tile', () => {
  const tiles = selectOverviewKpis(rich({ businessType: 'saas', totalRevenue: 0 }))
  assert.ok(!keys(tiles).includes('revenue'))
})

test('lead gen with untracked leads shows no leads tile', () => {
  const tiles = selectOverviewKpis(rich({ businessType: 'leadgen', leadsTracked: false }))
  assert.ok(!keys(tiles).includes('leads'))
})

test('the strip never renders a placeholder value — every emitted tile carries a real one', () => {
  for (const bt of ['saas', 'ecommerce', 'leadgen']) {
    for (const tile of selectOverviewKpis(rich({ businessType: bt }))) {
      assert.ok(tile.value !== null && tile.value !== undefined, `${bt}/${tile.key} emitted a null value`)
      assert.notEqual(tile.value, '—', `${bt}/${tile.key} emitted a dash placeholder`)
      if (typeof tile.value === 'number') {
        assert.ok(Number.isFinite(tile.value), `${bt}/${tile.key} emitted a non-finite number`)
      }
    }
  }
})

test('an all-empty site falls back to a real conversion count, never an empty strip', () => {
  const tiles = selectOverviewKpis({
    businessType: 'leadgen', kpis: {}, totalConversions: 7,
    leadsTracked: false, activeResults: [], aiSourceRows: []
  })
  assert.deepEqual(keys(tiles), ['conversions'])
  assert.equal(tiles[0].value, 7)
})

test('with genuinely nothing to show, the strip is empty rather than invented', () => {
  const tiles = selectOverviewKpis({
    businessType: 'saas', kpis: {}, totalConversions: 0,
    leadsTracked: false, activeResults: [], aiSourceRows: []
  })
  assert.deepEqual(tiles, [])
})

test('selection never throws on a malformed or absent payload', () => {
  // The hook hands over {} before the first response lands; a crash here blanks the page.
  assert.doesNotThrow(() => selectOverviewKpis())
  assert.doesNotThrow(() => selectOverviewKpis({}))
  assert.doesNotThrow(() => selectOverviewKpis({ activeResults: null, aiSourceRows: null, kpis: null }))
})

// ── design.md §2.4 hierarchy: exactly one headline tile, chosen by business type ──────────
//
// "When available, revenue and conversions visually dominate." Before this flag every tile
// rendered at one size, so Revenue and Sessions were typographically identical. MetricTile
// steps the value size up for primary:true — so what these pin is that the flag lands on the
// right tile per business type, and on NOTHING when the headline metric is gated off. The
// wrong behaviour to guard is a secondary metric being promoted into the big slot just
// because it happens to sort first.

test('🔴 exactly one tile is primary, for every business type', () => {
  for (const businessType of ['saas', 'ecommerce', 'leadgen']) {
    const tiles = selectOverviewKpis(rich({ businessType }))
    const primaries = tiles.filter(t => t.primary === true)
    assert.equal(primaries.length, 1,
      `${businessType} produced ${primaries.length} primary tiles: ${JSON.stringify(primaries.map(t => t.key))}`)
  }
})

test('the primary tile is the type-appropriate headline number', () => {
  assert.equal(selectOverviewKpis(rich({ businessType: 'saas' })).find(t => t.primary)?.key, 'revenue')
  assert.equal(selectOverviewKpis(rich({ businessType: 'ecommerce' })).find(t => t.primary)?.key, 'revenue')
  // Lead gen leads with Total Leads, not Revenue — the whole reason primacy is decided here
  // and not hardcoded to "Revenue" in the component.
  assert.equal(selectOverviewKpis(rich({ businessType: 'leadgen' })).find(t => t.primary)?.key, 'leads')
})

test('the primary tile is always slot 1 — the first tile rendered', () => {
  for (const businessType of ['saas', 'ecommerce', 'leadgen']) {
    const tiles = selectOverviewKpis(rich({ businessType }))
    assert.equal(tiles[0].primary, true, `${businessType}: primary is not the first tile`)
  }
})

test('🔴 no revenue -> NO primary tile; a secondary metric is never promoted', () => {
  // §2.4 says revenue/conversions dominate "when available". With slot 1 gated off there is no
  // headline, and the next tile in the list must stay at its normal size.
  const tiles = selectOverviewKpis(rich({ businessType: 'saas', totalRevenue: 0 }))
  assert.ok(!keys(tiles).includes('revenue'), 'revenue tile should be gated off')
  assert.equal(tiles.filter(t => t.primary === true).length, 0,
    'a secondary tile was promoted into the headline slot')
})

test('🔴 lead gen with leads untracked -> NO primary tile', () => {
  const tiles = selectOverviewKpis(rich({ businessType: 'leadgen', leadsTracked: false }))
  assert.ok(!keys(tiles).includes('leads'))
  assert.equal(tiles.filter(t => t.primary === true).length, 0)
})

test('secondary tiles never carry the primary flag', () => {
  const tiles = selectOverviewKpis(rich({ businessType: 'ecommerce' }))
  for (const t of tiles.slice(1)) {
    assert.notEqual(t.primary, true, `${t.key} should not be primary`)
  }
})
