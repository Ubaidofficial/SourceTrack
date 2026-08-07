// V3 CLAIMS ALLOWLIST — a v3 page may not ship a feature string absent from live main.
//
// WHY THIS EXISTS. The v3 design handoff's copy is wrong in at least five verified places:
// pricing.html says Starter gets 1,000,000 pageviews (it is 250,000); it lists "Server-side
// conversions to Google, Meta, LinkedIn" and "CRM sync & MCP server" for Starter, and
// "Client dashboards & scheduled reports" for Growth. All four are absent from live
// pricing.md — checked, 0 occurrences each. Two of them describe things that do not work:
// capi_deliveries has 0 rows all-time, and email-reports-weekly logged 393 clean runs while
// emailing nobody.
//
// With 12 pages of prose sourced from a wrong-copy design, the risk is not one bad claim.
// It is SYSTEMATIC reintroduction of claims that were removed. A human reviewer reading a
// 12-page diff will not catch a plausible-sounding feature bullet.
//
// SCOPE. This checks PLAN FEATURE STRINGS on v3 pricing surfaces — the highest-density,
// highest-consequence claims, and the ones the handoff actually got wrong. It is not a
// general prose linter and does not pretend to be: a guard that claims more coverage than
// it has is the false-pass class this repo keeps finding.
//
// ═══ ⚠️ A CLAIM SCAN MUST RESOLVE COMPUTED VALUES, NOT MATCH STRINGS. ═══════════
// Added 2026-08-06 after a verification error that ran the wrong way — a REAL figure
// was rejected as fabricated, and the page shipped weaker than the truth.
//
// use-cases-ecommerce cited "126 verified conversions in the demo fixture". Checking
// it, I grepped for the literal `126` in marketing/src/lib/homeFixtures.js, found
// nothing, and cut the number as unsourced. But the demo fixture defines
//
//     const TOTALS = { conv: sum('conv'), rev: sum('rev'), ... }
//
// so 126 and $21,430 exist only as the RESULT of summing CHANNELS — never as
// literals anywhere. The number was real the whole time. (The word "verified" was
// still wrong, for an unrelated reason; see that page's header.)
//
// THE RULE: absence of a string is not absence of a value. Before rejecting a
// figure as unsourced, resolve the arithmetic — sums, allocations, percentages,
// re-weightings — not just the source text. Derived data is the normal case in a
// well-built fixture, not the exception: demo-data.jsx derives its totals, allocates
// daily series by largest-remainder so they sum exactly, and redistributes all nine
// attribution models to the same $21,430. A literal-matching scan sees none of it.
//
// This is the same shape as two harness defects fixed in #663 — contrast-audit.mjs
// reading only dist/_astro while Astro inlined the stylesheet, and v3-page-pairs.mjs
// declaring fg/bg it never computed. In all three the check reported cleanly because
// it could not see where the answer lived. It is the fifth instance on this project,
// and it is the first where the blind spot cost us a TRUE claim rather than letting a
// false one through — which is why it is written here rather than only in a report.
// ═══════════════════════════════════════════════════════════════════════════════

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── THE BASELINE. Derived from live main's pricing.md, verified 2026-08-06. ──
// Every string a v3 pricing surface may claim. Adding to this list means the claim
// became true on main FIRST — never the other way round.
export const ALLOWED_PLAN_FEATURES = new Set([
  // Starter — $49/mo
  '250,000 tracked pageviews / mo',
  'Full Multi-Touch Attribution',
  'ChatGPT & AI Search Detection',
  'Cookieless Privacy-First Tracking',
  'Email & Chat Support',
  // Growth — $79/mo
  '1,000,000 tracked pageviews / mo',
  'Search Console SEO Revenue Attribution',
  'Stripe & Shopify Revenue Webhooks',
  'Visitor Journey Timeline Inspector',
  // Founder Annual — $99/yr
  'All Growth Plan Features Included',
  'Locked-in Founder Rate Forever',
  'Priority Founder Support',
  'Direct Founder Discord & Email Channel'
])

// Strings verified ABSENT from live main and present in the handoff. Named rather than
// merely excluded, so the failure message can say WHY a string is barred.
export const KNOWN_FALSE_CLAIMS = new Map([
  ['Server-side conversions to Google, Meta, LinkedIn', 'capi_deliveries has 0 rows all-time, every platform'],
  ['CRM sync & MCP server', 'no CRM sync exists; absent from live pricing.md'],
  ['Client dashboards & scheduled reports', 'email-reports-weekly logged 393 clean runs and emailed nobody'],
  ['Unlimited Pageviews during Beta', 'retired in #659 — caps are enforced at 250k/1M']
])

/** Extract `- value: …` feature strings from a pricing content file. */
export function extractPlanFeatures (md) {
  return [...md.matchAll(/^\s*-\s*value:\s*(.+?)\s*$/gm)].map(m => m[1])
}

/** The check itself, exported so the positive control can drive it directly. */
export function findDisallowed (features) {
  return features.filter(f => !ALLOWED_PLAN_FEATURES.has(f))
}

// ── the guard ────────────────────────────────────────────────────────────────
// v3 pricing content does not exist yet (Phase 3). The guard is written now so it lands
// BEFORE the page it protects, not after — a guard added alongside its subject has never
// once caught that subject's first mistake.
const V3_PRICING_CANDIDATES = [
  'marketing/src/content/sections/v3-pricing.md',
  'marketing/src/content/v3/pricing.md'
]

test('v3 pricing surfaces claim only what live main claims', () => {
  const present = V3_PRICING_CANDIDATES.filter(p => existsSync(join(REPO, p)))
  if (!present.length) {
    // Not a skip: assert the guard is WIRED and its baseline is intact, so this test
    // cannot quietly become a no-op that passes forever on an empty file list.
    assert.ok(ALLOWED_PLAN_FEATURES.size === 13, 'baseline must hold 13 verified strings')
    assert.ok(KNOWN_FALSE_CLAIMS.size === 4, 'known-false list must hold 4 verified strings')
    return
  }
  for (const rel of present) {
    const bad = findDisallowed(extractPlanFeatures(readFileSync(join(REPO, rel), 'utf8')))
    assert.deepEqual(bad, [], `${rel} ships plan features absent from live main:\n` +
      bad.map(b => `  - "${b}"${KNOWN_FALSE_CLAIMS.has(b) ? `  <- ${KNOWN_FALSE_CLAIMS.get(b)}` : ''}`).join('\n'))
  }
})

test('🔴 POSITIVE CONTROL — the allowlist detects a known-bad string', () => {
  // A guard that has never failed is indistinguishable from one that cannot fail. Feed it
  // the exact string the handoff ships and require rejection.
  const bad = findDisallowed(['CRM sync & MCP server'])
  assert.deepEqual(bad, ['CRM sync & MCP server'],
    'the allowlist MUST reject a claim absent from live main — it did not, so it is not guarding')

  // And every other verified-false string, so the control covers the real cases.
  for (const [claim] of KNOWN_FALSE_CLAIMS) {
    assert.deepEqual(findDisallowed([claim]), [claim], `must reject: ${claim}`)
  }
})

test('NEGATIVE CONTROL — a real claim is not flagged', () => {
  // A guard that rejects everything is noise, and gets muted. Every baseline string passes.
  assert.deepEqual(findDisallowed([...ALLOWED_PLAN_FEATURES]), [],
    'no baseline string may be flagged — otherwise the guard over-fires and gets ignored')
})

test('the baseline still matches live pricing.md — drift detector', () => {
  // If main's pricing copy changes and this list does not, the guard is enforcing a stale
  // truth. Comparing against the live file is what keeps the baseline honest.
  const live = join(REPO, 'marketing/src/content/sections/pricing.md')
  if (!existsSync(live)) return
  const liveFeatures = extractPlanFeatures(readFileSync(live, 'utf8'))
  const missing = liveFeatures.filter(f => !ALLOWED_PLAN_FEATURES.has(f))
  assert.deepEqual(missing, [],
    'live pricing.md claims strings the v3 baseline does not know about — the baseline is stale:\n' +
    missing.map(m => `  - "${m}"`).join('\n'))
})

// ── §12 RETRACTION GUARD ──────────────────────────────────────────────────────────────
// NOTE ON THIS FILE'S REACH: the tests above scan V3_PRICING_CANDIDATES — v3 PRICING
// content. They have never read the v3 landing page (now marketing/src/pages/index.astro), so the §11/§12 claims
// on the landing page were unguarded. This section closes that gap for the retracted §12.
//
// §12 ("Same budget. Better spend.") and its "server-side egress is in beta" disclosure
// were cut because the capability has never run: capi_deliveries holds 0 rows ALL-TIME,
// re-verified against PROD Supabase on 2026-08-07 before the cut (the file header's claim
// was checked, not trusted). §12 restated the same ad-platform-egress claim the header
// records as already cut from §11.
//
// A softer rewording is NOT a fix — a quieter phrasing keeps the claim. So this matches the
// CLAIM, not the exact sentence: any reappearance of egress/send-back-to-ad-platforms
// copy on the v3 landing page fails, however it is worded.
// PATH UPDATED AT THE CUTOVER: this page was promoted from /v3 to the site root, so the
// file moved to marketing/src/pages/index.astro. The guard follows the FILE, not the route —
// leaving it pointed at the old path would have made it read a missing file. It did exactly
// that on the first build of the cutover branch and failed loudly, which is the behaviour
// you want from a guard whose subject moves (§10 class-1: a path STRING an import grep misses).
// ── CONCEPT LAYER — added because the phrase layer above is EVASION-PRONE ────────────
// MEASURED, not suspected: 12 of 12 plausible rewordings of the three retracted claims
// walked straight through the patterns above. Every one of them is phrase-bound, so the
// guard only ever caught the exact sentences that were cut. hero-orbit's
// "the value is pushed server-side to every ad platform" is the §12 egress claim in
// different words, and the guard did not see it — the second rewording to slip past in a
// single day.
//
// These match a CLAIM as (subject NEAR predicate) rather than as a sentence, so changing
// the connective tissue does not evade them. They are ADDITIVE: the phrase patterns stay,
// because they catch strings this layer misses (e.g. "server-side egress is in beta",
// which names no destination).
//
// ⚠️ FALSE-POSITIVE COST WAS MEASURED BEFORE SHIPPING, per #692's lesson that an
// over-firing guard gets bypassed as routine. First draft flagged the HONEST MCP copy
// written this morning — "without leaving the chat" sits near "debug the data flow" — so
// the conversational pattern was narrowed to verb FORMS ("chat with", "ask your") rather
// than bare nouns. Final: 14/14 rewordings caught, 0 false positives against the live
// page's 26 copy strings plus every string deliberately kept.
const near = (subject, predicate, win = 90) => (s) => {
  const t = s.toLowerCase()
  for (const m of t.matchAll(subject)) {
    const i = m.index
    if (predicate.test(t.slice(Math.max(0, i - win), i + win))) return true
  }
  return false
}

export const CONCEPT_CLAIMS = [
  {
    id: 'ad-platform-egress',
    why: '§12 — pushing conversions to ad platforms. capi_deliveries has 0 rows all-time AND ad_platform_connections is 0, so the precondition has never existed either.',
    test: near(
      /ad platforms?|ad accounts?|meta|google ads|tiktok|linkedin ads|capi/g,
      /push|sent? |sends|send |forward|deliver|sync|flow(s|ing)? back|server-to-server|server-side/
    )
  },
  {
    id: 'conversational-data-query',
    why: '§11 MCP — the 10 shipped tools are diagnostics plus 2 volume counts; nothing queries the dataset. Verb FORMS only, so "without leaving the chat" is not a claim.',
    test: near(
      /\bask(ing)? (your|it|sourcetrack|anything)|\bchat (with|to)\b|\btalk (to|with)\b|\bquery (your|the)\b|interrogate|in plain (language|english)/g,
      /your data|the data|dataset|attribution|revenue|anything/
    )
  },
  {
    id: 'unsourced-deal-figure',
    why: '§17 — a specific money figure attached to a deal/sale. Any amount, not just $1,480: the point was never that one number.',
    test: near(/\$\s?[\d,]{3,}/g, /deal|contract|account|sale|customer|won|win/, 40)
  }
]

const V3_LANDING = 'marketing/src/pages/index.astro'

const RETRACTED_V3_CLAIMS = [
  { pattern: /same budget\.?\s*better spend/i,        why: '§12 heading — ad-platform egress, capi_deliveries has 0 rows all-time' },
  { pattern: /server-side egress/i,                    why: '§12 disclosure — beta claim for a capability that has never delivered' },
  { pattern: /send (it |them )?back to (your )?ad platforms?/i, why: '§12 claim, reworded — egress is egress however it is phrased' },

  // §11 MCP card. The MCP server IS built, mounted (api/index.js:73, transport at :414) and
  // documented at a PUBLISHED /docs/mcp — so "we have MCP" is true. What is NOT true is what
  // the card claimed. All 10 tools are diagnostics plus two volume counts: detect_platform,
  // get_install_snippet, verify_installation, get_workspace_context, get_site_health,
  // get_data_quality, debug_data_flow, verify_events, get_leads_volume, get_campaign_volume
  // (docs/mcp_tool_policy.md:22 — "5 diagnostic + 2 volume"). There is NO attribution,
  // revenue-by-source or model-comparison tool; that is the V1.1 attribution MCP. The card
  // also contradicted the published doc's own wording, "setup diagnostics, read-only".
  { pattern: /interrogate the dataset/i,          why: '§11 MCP — no tool queries the dataset; 10 tools are diagnostics + 2 volume counts' },
  { pattern: /ask your attribution data/i,        why: '§11 MCP — there is no attribution tool at all (V1.1)' },
  { pattern: /query (your )?attribution (data|dataset)/i, why: '§11 MCP, reworded — same unsupported claim' },

  // §17. An unsourced dollar figure: 1480 appears NOWHERE else in the repo — not in
  // scripts/, api/, marketing/src/content/ or dashboard/src/. Same class as the "$2,388 ARR"
  // #665 cut, though weaker: it sat inside a quoted question rather than asserting an
  // outcome. Removed anyway — a specific figure in a heading reads as real, and the question
  // works without it. Matches ANY invented-looking deal figure in that heading shape, not
  // just the one string, so the next draft cannot reintroduce a different number.
  { pattern: /\$\s?1,?480/,                        why: '§17 — unsourced deal figure, zero occurrences anywhere else in the repo' },
  { pattern: /where did this \$[\d,]+ deal/i,       why: '§17, reworded — any dollar figure in this heading is unsourced' },
]

test('the retracted §12 egress claim cannot return to the v3 landing page', () => {
  const src = readFileSync(join(REPO, V3_LANDING), 'utf8')
  const returned = RETRACTED_V3_CLAIMS.filter(c => c.pattern.test(src))
  assert.deepEqual(
    returned.map(c => c.why), [],
    `retracted §12 copy is back on ${V3_LANDING}:\n` +
    returned.map(c => `  - ${c.pattern} <- ${c.why}`).join('\n')
  )
})

test('🔴 POSITIVE CONTROL — the §12 guard fires on the exact copy that was cut', () => {
  // Fed the real removed strings. If this passes silently the guard above is decoration.
  const wasCut = [
    'heading="Same budget. Better spend."',
    'Server-side egress is in beta for Stripe and Shopify sources.',
    'Send it back to your ad platforms',   // the softer rewording the ruling forbids
    '<h3>Ask your attribution data in plain language</h3>',
    'Connect SourceTrack to your AI assistant and interrogate the dataset instead of building another chart nobody opens.',
    'heading="“Where did this $1,480 deal actually come from?”"',
    'Where did this $9,999 deal actually come from?',   // a DIFFERENT figure must also fail
  ]
  for (const line of wasCut) {
    assert.ok(
      RETRACTED_V3_CLAIMS.some(c => c.pattern.test(line)),
      `the guard MUST reject this retracted claim and did not: ${line}`
    )
  }
})

test('NEGATIVE CONTROL — surviving §11 copy is not flagged', () => {
  // A guard that rejects the page's real copy would be reverted the first time it fired.
  const kept = [
    'Server-side ingest carries the source',
    'Revenue that lands outside the browser — a Stripe charge, a CRM update, an offline conversion — still arrives with its click IDs and source attached.',
    'Check your setup from your AI assistant',
    "Connect Claude or ChatGPT to SourceTrack's read-only diagnostics — verify the install, debug the data flow, and pull lead and campaign volume without leaving the chat.",
    '“Where did this deal actually come from?”',
  ]
  for (const line of kept) {
    assert.ok(
      !RETRACTED_V3_CLAIMS.some(c => c.pattern.test(line)),
      `the guard over-fires on surviving copy: ${line}`
    )
  }
})

// ── 🔴 THE CEILING — what this guard CANNOT do ────────────────────────────────────────
// This section exists because the guard's limit was invisible, and an invisible limit
// reads as coverage. It pins the blind spot so a future reader meets it as a measurement
// rather than rediscovering it the way hero-orbit did.
//
// MEASURED 2026-08-07: 12 of 12 plausible rewordings of the three retracted claims walked
// straight through RETRACTED_V3_CLAIMS. Every pattern there is phrase-bound — it catches
// the sentence that was cut, not the claim it made. hero-orbit's "the value is pushed
// server-side to every ad platform" is §12's egress claim verbatim in meaning and matched
// nothing.
//
// WHY THE OBVIOUS FIX WAS BUILT, MEASURED, AND THEN NOT SHIPPED. CONCEPT_CLAIMS above
// matches (subject NEAR predicate) instead of a sentence. Against isolated copy strings it
// scored 14/14 rewordings caught with 0 false positives. Against the REAL FILE it produced
// six matches, every one legitimate:
//   · index.astro's own header comment describing the §12 cut — the guard firing on its
//     own documentation, the same trap stripComments() was added for elsewhere;
//   · "the numbers your ad platform will never show you" — surviving capture-card copy;
//   · "AI referrals are the channel ad platforms can't see" — surviving bento copy;
//   · SyncList's "Google Ads"/"Salesforce" integration labels, shipped in PR 2;
//   · "the ad platforms all answer 'me.'" — surviving §17 copy.
//
// ⚠️ THE MECHANISM, MEASURED RATHER THAN REASONED. A first draft of this note claimed the
// cause was that a claim and its negation share tokens. The control below REFUTED that:
// every one of those strings is CLEAN when tested in isolation. The real cause is that a
// proximity window scanned over a whole SOURCE FILE bleeds across unrelated content —
// "Google Ads" in a SyncList label lands within 90 characters of "Live"/"send" in a
// neighbouring component, and the file's own explanatory comments name the very claims
// they document. The claim/negation problem is real in principle; it is NOT what these six
// matches were.
//
// That distinction matters for anyone trying again: the fix is not a smarter vocabulary,
// it is scanning RENDERED COPY rather than source — and even then the window has to be
// small enough not to cross component boundaries. Widening the pattern only moves the
// error from false-negative to false-positive — and
// #692 measured what an over-firing guard becomes: bypassed as routine, which converts a
// known gap into a false sense of coverage.
//
// SO: this guard catches PHRASINGS. It is a regression check for exact strings that were
// cut, not a semantic claims check. Claim-level review is a human step at PR time; this
// file is the backstop for a specific string coming back, and nothing more.
test('🔴 CEILING: the phrase layer does NOT catch rewordings — pinned, not assumed', () => {
  const REWORDINGS = [
    'the value is pushed server-side to every ad platform',   // hero-orbit, the live instance
    'conversions flow back into Meta, Google and TikTok automatically',
    'we forward every conversion to your ad accounts',
    'chat with your attribution data',
    'ask SourceTrack anything about your revenue',
    'Where did this $12,400 contract actually come from?'
  ]
  const caught = REWORDINGS.filter(s => RETRACTED_V3_CLAIMS.some(c => c.pattern.test(s)))
  assert.deepEqual(
    caught, [],
    'A rewording is now CAUGHT by the phrase layer. That is good news, but this test pins ' +
    'the measured ceiling — update it deliberately and re-measure the false-positive cost ' +
    'against the real file, not against isolated strings. See CONCEPT_CLAIMS above for why ' +
    'the whole-file scan is where broadened patterns fail.'
  )
})

test('🔴 CONTROL: the concept layer DOES catch what the phrase layer misses', () => {
  // Without this, the ceiling test above proves only that the patterns are narrow — not
  // that a broader shape was actually built and evaluated. This is the evidence behind the
  // "not a tuning problem" claim.
  for (const s of ['the value is pushed server-side to every ad platform',
                   'chat with your attribution data',
                   'Where did this $12,400 contract actually come from?']) {
    assert.ok(CONCEPT_CLAIMS.some(c => c.test(s)), `concept layer must catch: ${s}`)
  }
  // ...and it is CLEAN on those same strings in isolation, which is exactly the point:
  // the over-firing is a property of scanning a whole FILE, not of the strings themselves.
  for (const s of ["AI referrals are the channel ad platforms can't see.",
                   'the numbers your ad platform will never show you']) {
    assert.ok(!CONCEPT_CLAIMS.some(c => c.test(s)), `clean in isolation: ${s}`)
  }
  // The over-fire is reproduced against the real file below.
  const landing = readFileSync(join(REPO, V3_LANDING), 'utf8')
  const fired = CONCEPT_CLAIMS.filter(c => c.test(landing)).map(c => c.id)
  assert.ok(
    fired.length > 0,
    'the concept layer must over-fire on the real file — that measurement is the whole ' +
    'reason it is not wired into the blocking guard. If this ever passes cleanly, re-run ' +
    'the false-positive count and reconsider wiring it in.'
  )
})
