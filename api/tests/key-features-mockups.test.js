// KeyFeatures homepage mockups — fixture-only, and pinned to the product's own truth.
//
// The three components under test replaced three PowerAI-template stock PNGs. Markup can be
// corrected where pixels could not — but markup can also DRIFT, and a build cannot catch any
// of what matters here: the page compiles perfectly whether or not the sample data is badged,
// whether or not the SEO revenue says it is estimated, and whether or not a model caption
// still matches what the engine actually does. So the boundaries live here.
//
// Same construction and the same reason as api/tests/direct-rescue-mockup-fixture.test.js,
// which pins the neighbouring Direct-Rescue mockup.
//
// The load-bearing one is the MODEL_SUMMARY check. ModelCompareMockup quotes
// dashboard/src/lib/attributionModels.js verbatim rather than writing its own captions, so a
// marketing panel cannot describe an attribution model differently from the app. Nothing else
// in the repo enforces that cross-directory coupling; without this test the two drift silently
// and the homepage ends up explaining a model the engine no longer implements (§6).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const COMPONENTS = join(REPO, 'marketing', 'src', 'layouts', 'components')

const read = (p) => readFileSync(p, 'utf8')

const AI = read(join(COMPONENTS, 'AiSourceLedgerMockup.astro'))
const MODELS = read(join(COMPONENTS, 'ModelCompareMockup.astro'))
const SEO = read(join(COMPONENTS, 'SeoRevenueMockup.astro'))
const SECTION = read(join(REPO, 'marketing', 'src', 'layouts', 'partials', 'KeyFeatures.astro'))
const CONTENT = read(join(REPO, 'marketing', 'src', 'content', 'sections', 'key-features.md'))

const ALL = [
  ['AiSourceLedgerMockup', AI],
  ['ModelCompareMockup', MODELS],
  ['SeoRevenueMockup', SEO],
]

// Comments legitimately DISCUSS what the markup must not claim (explaining why), so body
// assertions run against comment-stripped source — same helper, same reason, as the
// Direct-Rescue test.
function stripComments (src) {
  return src
    .replace(/^---[\s\S]*?^---/m, '')   // Astro frontmatter (all comments live there)
    .replace(/<!--[\s\S]*?-->/g, '')    // HTML comments
}

// ── §29.5: static fixture only ───────────────────────────────────────────────

test('no mockup performs data access — static fixture only (§29.5)', () => {
  for (const [name, src] of ALL) {
    for (const forbidden of ['fetch(', 'fetchApi', 'supabase', 'createClient', 'axios', 'useQuery', 'XMLHttpRequest']) {
      assert.ok(
        !src.toLowerCase().includes(forbidden.toLowerCase()),
        `${name} must not reference ${forbidden} — §29.5 is static fixture data only`
      )
    }
  }
})

test('no mockup carries a sample data badge (§6 Option A)', () => {
  for (const [name, src] of ALL) {
    assert.ok(!stripComments(src).includes('Sample data'), `${name} must not carry a visible "Sample data" badge`)
  }
})

test('footer contains illustrative data disclosure', () => {
  const footer = read(join(REPO, 'marketing', 'src', 'layouts', 'partials', 'Footer.astro'))
  assert.match(footer, /Product visuals shown use illustrative data\./)
})

test('no remote asset is referenced — brand marks are committed locally', () => {
  // A favicon service would be one third-party request per logo, from a privacy-first
  // product's own homepage. Marks live in marketing/public/images/logos/.
  for (const [name, src] of ALL) {
    assert.ok(!/https?:\/\//.test(stripComments(src)), `${name} must not reference a remote asset`)
  }
})

// ── The model captions are QUOTED from the engine, not written ───────────────

test('ModelCompareMockup captions match attributionModels.js verbatim', () => {
  const lib = read(join(REPO, 'dashboard', 'src', 'lib', 'attributionModels.js'))

  const summaryOf = (key) => {
    const m = lib.match(new RegExp(`\\b${key}:\\s*\\n?\\s*'([^']+)'`))
    assert.ok(m, `MODEL_SUMMARY.${key} not found in attributionModels.js — did the shape change?`)
    return m[1]
  }

  for (const key of ['first_touch', 'last_touch', 'linear']) {
    const summary = summaryOf(key)
    assert.ok(
      MODELS.includes(summary),
      `ModelCompareMockup must quote MODEL_SUMMARY.${key} verbatim.\n` +
      `  engine says: ${summary}\n` +
      'A marketing caption that describes a model differently from the app is a §6 truth defect. ' +
      'Update the mockup to match the lib — do not reword it here.'
    )
  }
})

test('ModelCompareMockup draws Report Builder, NOT the Attribution page', () => {
  // AttributionPage.jsx renders a STATIC "First-touch attribution" label and says why at :119
  // — "the multi-touch read is on a dead store and returns 100% Direct; a model selector here
  // would ship a lie." Drawing a switcher onto that surface would market a control it refuses
  // to have. ReportBuilder.jsx:41-46 is the switcher that is real.
  const body = stripComments(MODELS)
  assert.match(body, /Report Builder/, 'the panel must name the surface that actually has a model selector')
  assert.ok(
    !/Source Attribution/i.test(body),
    'must not depict the Attribution page, whose model selector is deliberately static'
  )
})

test('the six models shown are ReportBuilder\'s real list', () => {
  const builder = read(join(REPO, 'dashboard', 'src', 'pages', 'ReportBuilder.jsx'))
  for (const label of [
    'First Touch',
    'Last Touch',
    'First Touch (Non-Direct)',
    'Last Touch (Non-Direct)',
    'Linear',
    'Time Decay (7-day half-life)',
  ]) {
    assert.ok(builder.includes(`'${label}'`), `${label} is no longer a real ReportBuilder model — update both`)
    assert.ok(MODELS.includes(label), `${label} must appear in the mockup's selector`)
  }
})

// ── §6: estimated revenue must say so ───────────────────────────────────────

test('SeoRevenueMockup labels its revenue as ESTIMATED and discloses the matching method', () => {
  const body = stripComments(SEO)
  assert.match(body, /Est\. revenue/i, 'the column header must not read as exact revenue')
  assert.match(body, /Estimated/, 'the truth label must be present')
  assert.match(
    body,
    /Matched by landing page and date range/i,
    'the panel must disclose HOW revenue is matched — §6 bars implying exact query -> customer attribution'
  )
  assert.match(
    body,
    /aggregate query data/i,
    'the Search Console aggregation caveat must survive copy edits'
  )
})

test('no mockup renders a fake zero or an em-dash stand-in for missing data (§6)', () => {
  for (const [name, src] of ALL) {
    const body = stripComments(src)
    assert.ok(!/>\s*\$0(\.00)?\s*</.test(body), `${name} must not render $0 as a stand-in for no data`)
  }
})

// ── The AI ledger's arithmetic closes ───────────────────────────────────────

test('AiSourceLedgerMockup leads reconcile with the share it claims', () => {
  // The footer says AI referrals drove 21% of conversions. DashboardMockup.astro's
  // Conversions KPI on this same page is 318. If the rows no longer sum to ~21% of that, one
  // of the two panels is lying to anyone who adds them up.
  const leads = [...AI.matchAll(/leads:\s*"([\d,]+)"/g)].map((m) => Number(m[1].replace(/,/g, '')))
  assert.equal(leads.length, 4, 'expected four AI source rows')

  const dashboard = read(join(COMPONENTS, 'DashboardMockup.astro'))
  const totalConversions = Number(dashboard.match(/Conversions<\/div>\s*<div[^>]*>([\d,]+)</)[1].replace(/,/g, ''))

  const claimed = Number(stripComments(AI).match(/>(\d+)%<\/span>\s*of conversions/)[1])
  const actual = (leads.reduce((a, b) => a + b, 0) / totalConversions) * 100

  assert.ok(
    Math.abs(actual - claimed) < 1,
    `ledger rows sum to ${actual.toFixed(1)}% of ${totalConversions} conversions but the footer claims ${claimed}%`
  )
})

test('ChatGPT revenue agrees with DashboardMockup on the same page', () => {
  const dashboard = read(join(COMPONENTS, 'DashboardMockup.astro'))
  const dashChatGpt = dashboard.match(/source:\s*"ChatGPT"[^}]*value:\s*"(\$[\d,]+)"/)[1]
  const ledgerChatGpt = AI.match(/source:\s*"ChatGPT"[^}]*revenue:\s*"(\$[\d,]+)"/)[1]
  assert.equal(
    ledgerChatGpt, dashChatGpt,
    'two panels on one page must not report different ChatGPT revenue'
  )
})

// ── Wiring: content owns the copy, the section owns nothing ──────────────────

test('the section maps mockups by key and holds no copy of its own', () => {
  for (const key of ['ai-sources', 'model-compare', 'seo-revenue']) {
    assert.ok(CONTENT.includes(`mockup: "${key}"`), `key-features.md must name the ${key} mockup`)
    assert.ok(SECTION.includes(`"${key}"`), `KeyFeatures.astro must map the ${key} key to a component`)
  }
  assert.ok(
    !/\/images\/features\//.test(CONTENT + SECTION),
    'the retired template PNGs must not be referenced — they are deleted'
  )
})

test('each mockup is imported by the section that renders it', () => {
  for (const name of ['AiSourceLedgerMockup', 'ModelCompareMockup', 'SeoRevenueMockup']) {
    assert.match(SECTION, new RegExp(`import ${name} from`), `${name} must be imported`)
    assert.match(SECTION, new RegExp(`<${name}\\s*/>`), `${name} must be rendered — an unrendered mockup is dead code`)
  }
})
