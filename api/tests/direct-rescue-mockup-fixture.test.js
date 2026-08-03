// Direct-Rescue homepage mockup — fixture-only and claim-bounded.
//
// This component is a §6 hazard by nature: it shows a lead's source changing from
// "Direct / Unknown" to "ChatGPT". That is honest ONLY as a statement about SourceTrack's
// own reporting, which is true today. It becomes a false live-behaviour claim the moment it
// implies the OTHER half of GTM §4 Tier 1 — injecting a synthetic `utm_source=chatgpt` into
// a hidden form field so the customer's CRM record is rewritten. That half is NOT BUILT
// (it needs tracker + form-layer work with DNT/GPC gating), so any copy promising it would
// be marketing a capability that does not exist.
//
// A build cannot catch that: the page compiles perfectly with either wording. So these
// tests pin the boundary in the source itself.
//
// Two more rules enforced here:
//   · §29.5 "static fixture data only" — no fetch/API/Supabase in a marketing mockup.
//   · design.md §35.3 — no competitor names in the comparison. The "before" card is a
//     category statement ("Most analytics tools"), which is defensible; a named tool's UI
//     or brand is not ours to draw.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MARKETING = join(__dirname, '..', '..', 'marketing', 'src')

const MOCKUP = readFileSync(join(MARKETING, 'layouts', 'components', 'DirectRescueMockup.astro'), 'utf8')
const SHOWCASE = readFileSync(join(MARKETING, 'layouts', 'partials', 'DirectRescueShowcase.astro'), 'utf8')
const INDEX = readFileSync(join(MARKETING, 'pages', 'index.astro'), 'utf8')

// Comments legitimately DISCUSS the forbidden claims (explaining why they are forbidden), so
// claim assertions run against comment-stripped source. Otherwise the header comment that
// says "does NOT depict ... CRM" would itself trip the CRM check.
function stripComments (src) {
  return src
    .replace(/^---[\s\S]*?^---/m, '')       // Astro frontmatter (all comments live there)
    .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
}
const MOCKUP_BODY = stripComments(MOCKUP)
const SHOWCASE_BODY = stripComments(SHOWCASE)
const BOTH_BODIES = MOCKUP_BODY + '\n' + SHOWCASE_BODY

// ── §29.5: static fixture only ───────────────────────────────────────────────

test('the mockup performs NO data access — static fixture only (§29.5)', () => {
  for (const forbidden of ['fetch(', 'fetchApi', 'supabase', 'createClient', 'axios', 'useQuery', 'XMLHttpRequest']) {
    assert.ok(
      !MOCKUP.toLowerCase().includes(forbidden.toLowerCase()),
      `DirectRescueMockup must not reference ${forbidden} — §29.5 is static fixture data only`
    )
  }
})

test('the section wrapper performs no data access either', () => {
  for (const forbidden of ['fetch(', 'fetchApi', 'supabase', 'useQuery']) {
    assert.ok(
      !SHOWCASE.toLowerCase().includes(forbidden.toLowerCase()),
      `DirectRescueShowcase must not reference ${forbidden}`
    )
  }
})

test('the fixture carries no sample data badges (§6 Option A)', () => {
  assert.ok(!MOCKUP_BODY.includes('Sample data'), 'DirectRescueMockup must not carry any "Sample data" badge')
})

test('the mockup carries an explicit not-a-customer disclaimer', () => {
  assert.match(
    MOCKUP_BODY,
    /Illustrative example, not a customer/i,
    'the standing disclaimer must survive copy edits'
  )
})

// ── The claim boundary: reporting, NOT CRM injection ─────────────────────────

test('NOTHING claims a CRM record or hidden form field is rewritten — that half is unbuilt', () => {
  // GTM §4 Tier 1's second half. Marketing it before it exists is the §6 violation.
  const forbidden = [
    'crm',
    'hidden field',
    'hidden form',
    'utm_source=chatgpt',
    'synthetic utm',
    'salesforce',
    'hubspot'
  ]
  for (const phrase of forbidden) {
    assert.ok(
      !BOTH_BODIES.toLowerCase().includes(phrase),
      `customer-facing copy must not mention "${phrase}" — the synthetic-UTM/CRM capability ` +
      'is NOT built, so referencing it would market a capability that does not exist'
    )
  }
})

test('copy frames this as what SourceTrack REPORTS, not as something done to your leads', () => {
  // The line the brief drew: "here's the difference this makes" is fine; "this is what
  // happens to YOUR leads today" is not.
  const forbidden = ['your leads today', 'your crm', 'we rewrite', 'we inject', 'will show up in']
  for (const phrase of forbidden) {
    assert.ok(
      !BOTH_BODIES.toLowerCase().includes(phrase),
      `"${phrase}" reads as a live-behaviour claim about the visitor's own data`
    )
  }
  // And the honest framing is present.
  assert.match(
    SHOWCASE_BODY,
    /reports it as the channel/i,
    'the lede must say SourceTrack REPORTS the channel — the true, shipped claim'
  )
})

// ── design.md §35.3: no competitor brand in the comparison ──────────────────

test('the before/after names NO competitor — category statement only (§35.3)', () => {
  for (const competitor of ['sourceloop', 'cometly', 'datafast', 'usermaven', 'piqo', 'anytrack', 'sleek', 'orchly', 'plausible', 'getsleek']) {
    assert.ok(
      !BOTH_BODIES.toLowerCase().includes(competitor),
      `"${competitor}" must not appear — §35.3 bars competitor brand in our own comparison UI`
    )
  }
})

test('the "before" card is a category statement, so the contrast is defensible', () => {
  assert.match(MOCKUP_BODY, /Most analytics tools/i)
})

test('no external image is embedded — a competitor screenshot could only arrive that way', () => {
  assert.ok(!/<img\b/i.test(MOCKUP_BODY), 'the mockup is markup, not a raster screenshot')
  assert.ok(!/https?:\/\//.test(MOCKUP_BODY), 'no remote asset may be referenced from the mockup body')
})

// ── wiring ──────────────────────────────────────────────────────────────────

test('the section is actually rendered on the homepage', () => {
  assert.match(INDEX, /import DirectRescueShowcase/, 'must be imported')
  assert.match(INDEX, /<DirectRescueShowcase\s*\/>/, 'must be rendered — an unrendered section is dead code')
})
