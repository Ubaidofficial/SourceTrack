// Homepage hero stat callout + the two new §29.3 sections — fixture-only and claim-bounded.
//
// The hero callout is a §6 hazard by nature: it puts a specific number ("42 leads") in the
// most prominent position on the site. That is honest ONLY while it is unmistakably labelled
// as sample data. It becomes a false claim the moment the badge or the disclaimer is dropped
// in a copy edit, or the moment a second sentence RANKS the sources — because a ranking reads
// as a narrated insight about data, which is what §26 (LLM analyzer, fake recommendations)
// and CLAUDE.md §6 (no LLM-narrated attribution numbers, marketing site included) forbid.
//
// A build cannot catch any of that: the page compiles perfectly with or without the badge,
// and compiles perfectly with an added ranking sentence. So these tests pin it in the source,
// the same way direct-rescue-mockup-fixture.test.js pins the Direct-Rescue boundary.
//
// The two new sections carry no numbers at all and so need no fixture label — but they DO
// need their links to resolve, which is the failure mode a homepage card grid actually has.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const MARKETING = join(__dirname, '..', '..', 'marketing', 'src')

const CALLOUT = readFileSync(join(MARKETING, 'layouts', 'components', 'HeroStatCallout.astro'), 'utf8')
const HOW_IT_WORKS = readFileSync(join(MARKETING, 'layouts', 'partials', 'HowItWorksShowcase.astro'), 'utf8')
const USE_CASES = readFileSync(join(MARKETING, 'layouts', 'partials', 'UseCaseCards.astro'), 'utf8')
const INDEX = readFileSync(join(MARKETING, 'pages', 'index.astro'), 'utf8')

// Comments legitimately DISCUSS the forbidden claims (explaining why they are forbidden), so
// claim assertions run against comment-stripped source — otherwise the callout's own header,
// which quotes the §10.4 sentence in order to reject it, would trip the ranking check.
function stripComments (src) {
  return src
    .replace(/^---[\s\S]*?^---/m, '')       // Astro frontmatter (all comments live there)
    .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')   // JSX-style comments in Astro templates
}
const CALLOUT_BODY = stripComments(CALLOUT)

// ── §29.5: static fixture only ───────────────────────────────────────────────
// Deliberately checks the RAW file, comments included: a commented-out data call is a
// half-finished live integration, and it must fail here rather than wait to be uncommented.

test('the hero stat callout performs NO data access — static fixture only (§29.5)', () => {
  for (const forbidden of ['fetch(', 'fetchApi', 'supabase', 'createClient', 'axios', 'useQuery', 'XMLHttpRequest']) {
    assert.ok(
      !CALLOUT.toLowerCase().includes(forbidden.toLowerCase()),
      `HeroStatCallout must not reference ${forbidden} — §29.5 is static fixture data only`
    )
  }
})

test('the two new homepage sections perform no data access either', () => {
  for (const [name, src] of [['HowItWorksShowcase', HOW_IT_WORKS], ['UseCaseCards', USE_CASES]]) {
    for (const forbidden of ['fetch(', 'fetchApi', 'supabase', 'createClient', 'axios', 'useQuery', 'XMLHttpRequest']) {
      assert.ok(
        !src.toLowerCase().includes(forbidden.toLowerCase()),
        `${name} must not reference ${forbidden}`
      )
    }
  }
})

// ── §6: the number must never read as a measurement ──────────────────────────

test('the hero stat carries the not-a-customer disclaimer and NO per-card badge (§29.8)', () => {
  // This assertion is INVERTED from what it originally said. It used to require a
  // "Sample data" badge; §29.8 — codified in #584 from the pattern #581 shipped — bans
  // per-card badges outright, so the badge being ABSENT is now the requirement. Same
  // pair of assertions direct-rescue-mockup-fixture.test.js makes, for the same reason:
  // one muted footer line per page is the whole disclosure.
  assert.ok(
    !CALLOUT_BODY.includes('Sample data'),
    'HeroStatCallout must not carry a per-card "Sample data" badge — §29.8, one footer line per page'
  )
  assert.match(
    CALLOUT_BODY,
    /Illustrative example, not a customer/i,
    'the standing disclaimer must survive copy edits'
  )
})

test('the page-level illustrative-data disclosure exists in the footer (§29.8)', () => {
  // The badge removal above is only honest if the page still discloses somewhere. Pinning
  // the footer line here means deleting it cannot silently leave the hero figure unlabelled.
  const footer = readFileSync(join(MARKETING, 'layouts', 'partials', 'Footer.astro'), 'utf8')
  assert.match(footer, /Product visuals shown use illustrative data\./)
})

test('the hero stat does NOT rank or trend its sources (§26, §6)', () => {
  // A count is a fact. A ranking ("strongest", "top", "best performing") or a trend ("up 12%")
  // is an interpretation of data the marketing site does not have — the exact shape §10.4's
  // own example slips into with its second sentence, and the one this component drops.
  for (const banned of ['strongest', 'best performing', 'top source', 'fastest growing', 'outperform']) {
    assert.ok(
      !CALLOUT_BODY.toLowerCase().includes(banned),
      `hero stat must not rank sources ("${banned}") — that reads as a narrated insight`
    )
  }
  assert.ok(!/[+-]\s?\d+(\.\d+)?\s?%/.test(CALLOUT_BODY), 'hero stat must not show a delta or trend percentage')
  // §26: no model version labels anywhere near the AI source chips.
  assert.ok(
    !/\b(gpt-\d|claude-\d|gemini-\d|o\d-(mini|preview)|sonnet|opus|haiku)\b/i.test(CALLOUT_BODY),
    'AI source chips must name products, never model versions (§26)'
  )
})

test('the hero stat renders 3-5 AI source chips, per §10.4', () => {
  const arr = CALLOUT.match(/const AI_SOURCES = \[([^\]]*)\]/)
  assert.ok(arr, 'AI_SOURCES fixture array not found')
  const count = (arr[1].match(/"/g) || []).length / 2
  assert.ok(count >= 3 && count <= 5, `§10.4 specifies 3-5 source chips, found ${count}`)
})

// ── Wiring: a section nobody renders is not shipped ──────────────────────────

test('the callout is rendered above the hero mockup, on the page that ships', () => {
  // MOVED, NOT DELETED — the subject moved, the rule did not. This asserted against
  // Hero.astro, which the v3 cutover orphaned: nothing renders it, so the assertion was
  // reading a file that no longer reaches a visitor. Passing against dead code is worse
  // than not checking, because it reads as coverage.
  //
  // Re-anchored on marketing/src/pages/index.astro — the live homepage, which now renders
  // both directly. The ordering rule is unchanged: the callout sits above the mockup.
  //
  // Its earlier note is kept because the lesson recurs: this same assertion once compared
  // against <DashboardMockup after the hero swapped to JourneyMockup (#571/#581), so
  // indexOf returned -1 and it passed for the wrong reason. Hardcoding a component name
  // is how that happened; the max() below tolerates either mockup for the same reason.
  assert.ok(INDEX.includes('<HeroStatCallout'), 'the live homepage must render the callout')
  const mockupIdx = Math.max(INDEX.indexOf('<JourneyMockup'), INDEX.indexOf('<DashboardMockup'))
  assert.ok(mockupIdx > -1, 'the live homepage must render a hero mockup — neither JourneyMockup nor DashboardMockup found')
  assert.ok(
    INDEX.indexOf('<HeroStatCallout') < mockupIdx,
    'the callout belongs above the mockup, not below it'
  )
})

test('🔴 §29.4: the live homepage renders at least one product VISUAL, not a caption', () => {
  // The measurable symptom of the §29.4 violation this PR closes: before it, the homepage
  // carried zero <img>, <svg> and <canvas> — every product surface was a <p> describing
  // what a visual would show. This asserts the rendered OUTPUT, not the source, because a
  // component reference in source proves nothing about what reaches the page.
  const dist = join(REPO_ROOT, 'marketing', 'dist', 'index.html')
  if (!existsSync(dist)) return   // built-output check only runs after a build
  const html = readFileSync(dist, 'utf8')
  const visuals = (html.match(/<svg|<img|<canvas/g) || []).length
  assert.ok(visuals > 0, '§29.4: the homepage must SHOW an attribution story — found no <svg>, <img> or <canvas>')
})

test('both new sections are rendered on the homepage in §29.3 order', () => {
  // REPOINTED AT THE V3 CUTOVER. The homepage is now the promoted v3 page, so the anchors
  // this test ordered against changed — but the RULE did not, and neither did the subject:
  // docs/design/design.md:2946-2954 still mandates how-it-works (3) then use-case cards (4),
  // between the product preview (2) and pricing (5). Both components are ported onto the v3
  // page rather than dropped, so this guard survives with a new anchor set.
  //
  // The old '<DirectRescueShowcase' anchor is GONE, not weakened: §29.3 never required that
  // section, v3 covers the same claim in its FAQ and comparison table, and the component was
  // retired with its test. Substituting a softer ordering assertion to keep the line would
  // have been the wrong repair — an anchor that no longer exists cannot order anything.
  const howIdx = INDEX.indexOf('<HowItWorksShowcase')
  const useIdx = INDEX.indexOf('<UseCaseCards')
  const priceIdx = INDEX.indexOf('eyebrow="Pricing"')
  const previewIdx = INDEX.indexOf('eyebrow="Product tour"')
  assert.ok(howIdx > -1, 'HowItWorksShowcase must be rendered on the homepage')
  assert.ok(useIdx > -1, 'UseCaseCards must be rendered on the homepage')
  assert.ok(previewIdx > -1, 'the §29.3 product-preview section must exist to order against')
  assert.ok(priceIdx > -1, 'the §29.3 pricing section must exist to order against')
  // §29.3: product preview (2) -> how it works (3) -> use-case cards (4) -> pricing (5).
  assert.ok(previewIdx < howIdx, 'how-it-works belongs after the product-preview cluster')
  assert.ok(howIdx < useIdx, 'use-case cards belong after how-it-works')
  assert.ok(useIdx < priceIdx, 'use-case cards belong above pricing')
})

test('🔴 CONTROL: the §29.3 order check CAN fail', () => {
  // Every ok() above passes trivially if indexOf returns -1 for the anchors AND the
  // comparison happens to hold. Feed the same logic a homepage with the sections in the
  // WRONG order and require it to be detected — otherwise this is four assertions that
  // cannot distinguish a correct page from a missing one.
  const scrambled = 'eyebrow="Pricing"  <UseCaseCards />  <HowItWorksShowcase />  eyebrow="Product tour"'
  const how = scrambled.indexOf('<HowItWorksShowcase')
  const use = scrambled.indexOf('<UseCaseCards')
  const price = scrambled.indexOf('eyebrow="Pricing"')
  assert.ok(!(how < use && use < price), 'the ordering logic must reject a scrambled homepage')
})

// ── The failure mode a card grid actually has: a link to nowhere ─────────────

test('every use-case card links to a solutions page that exists', () => {
  const hrefs = [...USE_CASES.matchAll(/href:\s*"(\/solutions\/[a-z-]+)"/g)].map(m => m[1])
  assert.ok(hrefs.length >= 5, `expected the five solutions destinations, found ${hrefs.length}`)
  for (const href of hrefs) {
    const slug = href.replace('/solutions/', '')
    assert.ok(
      existsSync(join(MARKETING, 'pages', 'solutions', `${slug}.astro`)),
      `use-case card links to ${href}, but marketing/src/pages/solutions/${slug}.astro does not exist`
    )
  }
})

test('the three steps are design.md\'s own Track -> Connect -> Know', () => {
  const titles = [...HOW_IT_WORKS.matchAll(/title:\s*"([^"]+)"/g)].map(m => m[1])
  assert.deepStrictEqual(titles, ['Track', 'Connect', 'Know'], '§29.3 names these steps explicitly')
})
