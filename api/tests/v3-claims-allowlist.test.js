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
