// Shopify guided install — the first platform to get a real in-wizard flow instead of a
// doc-link. The point of these assertions is that the guided flow REUSES the existing
// verification rail rather than growing a parallel one:
//
//   - detection is the SAME /install/detect-platform call step 6 already makes (the page
//     previously discarded the `platform` field that call already returns; now it reads it),
//   - the not-confirmed state stays the collapsed two-state model from
//     onboarding-step6-truthful-signals.test.js — a Shopify-specific REASON is allowed, a
//     Shopify-specific absence claim is not,
//   - `shopify` is accepted by the server's install_method whitelist, because the wizard
//     persists it on tab select and a rejected value dead-ends the user on a save error.
//
// Static source assertions on the JSX + a direct import of the API validator. This repo has
// no RTL/jsdom; onboarding-steps.test.js and onboarding-step6-truthful-signals.test.js
// establish the convention this file follows.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..', '..')
const PAGE = readFileSync(join(REPO, 'dashboard/src/pages/Onboarding.jsx'), 'utf8')
const ONBOARDING_ROUTE = readFileSync(join(REPO, 'api/routes/onboarding.js'), 'utf8')
// #467 lifted the guide-card list out of the JSX into this module, so the card definitions
// live here now while the RENDER stays in the page. Both are asserted, separately.
const NUDGE = readFileSync(join(REPO, 'dashboard/src/lib/installNudge.js'), 'utf8')

// The script-detection row, isolated so an assertion can't be satisfied by unrelated copy
// elsewhere on the page. Mirrors the window used in onboarding-step6-truthful-signals.test.js,
// widened because the Shopify branch adds a third message to the same block.
function scriptDetectedRow (src) {
  const idx = src.indexOf('>Script detected<')
  assert.ok(idx !== -1, 'the "Script detected" label must exist')
  return src.slice(idx, idx + 1600)
}

// ── The flow exists in the wizard, not as a link out ─────────────────────────

test('🔴 Shopify is a real install method in the wizard, not a docs link', () => {
  const idx = PAGE.indexOf('const INSTALL_METHODS')
  assert.ok(idx !== -1, 'INSTALL_METHODS must exist')
  const block = PAGE.slice(idx, PAGE.indexOf(']', idx))
  assert.match(block, /key:\s*'shopify'/, 'shopify must be a selectable install method (a tab), not only a doc link')
})

test('🔴 the guided flow walks the Shopify theme editor IN the wizard', () => {
  const idx = PAGE.indexOf('const SHOPIFY_STEPS')
  assert.ok(idx !== -1, 'SHOPIFY_STEPS must exist as the single source for the walkthrough')
  const steps = PAGE.slice(idx, PAGE.indexOf(']', idx))

  // The navigation path a merchant actually follows. If Shopify moves the menu, this is the
  // assertion that should fail and force the copy to be re-checked.
  assert.match(steps, /Online Store\s*→\s*Themes/, 'must name the Online Store → Themes path')
  assert.match(steps, /Edit code/, 'must name the Edit code action')
  assert.match(steps, /theme\.liquid/, 'must name the theme.liquid layout file')
  assert.match(steps, /Layout/, 'must name the Layout folder that contains theme.liquid')
  assert.match(steps, /<\/head>/, 'must say the tag goes before the closing </head>')
})

test('🔴 the Shopify guide card is marked as having a guided in-wizard flow', () => {
  const idx = NUDGE.indexOf("label: 'Shopify'")
  assert.ok(idx !== -1, 'the Shopify guide card must exist in INSTALL_GUIDES')
  const entry = NUDGE.slice(idx, NUDGE.indexOf('\n', idx))
  assert.match(entry, /guidedMethod:\s*'shopify'/, 'the Shopify card must carry guidedMethod so the grid opens the tab')
  // #467's install-nudge-gating asserts every card keeps a working `to`, and the nudge maps
  // by platformKey — neither may be dropped in the course of adding the guided flow.
  assert.match(entry, /platformKey:\s*'shopify'/, 'the detector→guide mapping must survive')
  assert.match(entry, /to:\s*'\/docs\/platforms\/shopify'/, 'the canonical doc URL must survive (install-nudge-gating requires every card to keep a link)')
})

test('🔴 the grid RENDERS a guided card as a tab-selecting button, not a docs link', () => {
  const gridIdx = PAGE.indexOf('INSTALL_GUIDES.map')
  assert.ok(gridIdx !== -1, 'the platform guide grid must render from INSTALL_GUIDES')
  const grid = PAGE.slice(gridIdx, gridIdx + 2200)
  assert.match(grid, /p\.guidedMethod\s*\?/, 'the render must branch on guidedMethod')
  assert.match(grid, /handleInstallMethodSelect\(p\.guidedMethod\)/, 'a guided card must select the install-method tab')
  assert.match(grid, /<a key=\{p\.label\} href=\{p\.to\}/, 'non-guided cards must still render as doc links')
  // The nudge from #467 must keep working on both element types.
  assert.match(grid, /Suggested/, 'the suggested badge must survive the guided-card branch')
})

// ── Coverage boundary is stated, not discovered ──────────────────────────────

test('🔴 the guided flow states what it does NOT track (admin + Shopify-hosted checkout)', () => {
  const idx = PAGE.indexOf('What this tracks')
  assert.ok(idx !== -1, 'the coverage-boundary note must exist')
  const note = PAGE.slice(idx, idx + 700)
  assert.match(note, /admin/i, 'must say the Shopify admin is not tracked')
  assert.match(note, /checkout/i, 'must address checkout, which Shopify hosts on its own domain')
  assert.match(note, /webhook/i, 'must point at the webhook as the path that actually captures purchases')
})

// ── Verification reuses the existing rail ────────────────────────────────────

test('🔴 Shopify verification reuses /install/detect-platform — no new endpoint, no new poll', () => {
  // Count real CALL SITES, not mentions — the step-6 comment block names the endpoint too.
  const detectCalls = PAGE.match(/fetchApi\(`\/install\/detect-platform/g) || []
  assert.equal(detectCalls.length, 1, 'there must be exactly ONE detect-platform call site; a Shopify-specific second call would be a parallel verification rail')
  assert.doesNotMatch(PAGE, /install\/detect-shopify|shopify\/verify|verify-shopify/i, 'no Shopify-specific verification endpoint may be introduced')
})

test('🔴 the page reads the `platform` field detect-platform ALREADY returns', () => {
  assert.match(PAGE, /setDetectedPlatform\(/, 'must read platform off the existing detect-platform response')
  assert.match(PAGE, /result\.platform/, 'the platform field is what feeds it')
  assert.match(PAGE, /detectedPlatform/, 'the detected platform must be held in state so the verification copy can use it')
})

// VERIFIED LIVE 2026-07-28 against the real detector:
//   allbirds.com  -> shopify / high   / ["cdn.shopify.com","Shopify"]
//   gymshark.com  -> shopify / high   / ["cdn.shopify.com","Shopify"]
//   github.com    -> shopify / MEDIUM / ["Shopify"]        <-- false positive
// PLATFORM_SIGNALS lists the bare word 'Shopify' as a token and classifyHtml scores one token
// as 'medium', so any page that MENTIONS Shopify is classified as Shopify. Naming a merchant's
// platform off that is a §6 fake-certainty claim, so this consumer requires 'high' (>=2 tokens,
// i.e. cdn.shopify.com actually present). The shared detector/nudge threshold is filed separately.
test('🔴 platform is only named at HIGH confidence — a bare "Shopify" mention must not qualify', () => {
  const idx = PAGE.indexOf('setDetectedPlatform(result')
  assert.ok(idx !== -1, 'the detected-platform assignment must exist')
  const line = PAGE.slice(idx, PAGE.indexOf('\n', idx))
  assert.match(line, /confidence\s*===\s*'high'/, "must gate on high confidence; 'medium' is a single-token match and the Shopify token list includes the bare word 'Shopify'")
})

test('🔴 the Shopify not-confirmed message is a REASON, never an absence claim', () => {
  const row = scriptDetectedRow(PAGE)
  assert.match(row, /theme\.liquid/, 'the Shopify branch must tell the merchant exactly where to look')

  // Same truthfulness contract the GTM branch is held to (§6 / onboarding-step6-truthful-signals):
  // the collapsed two-state model must survive the addition of a third reason string.
  assert.match(row, /Not confirmed yet/, 'the non-positive state must still read "Not confirmed yet"')
  assert.doesNotMatch(row, /\bmissing\b/i, 'must never claim the script is missing')
  assert.doesNotMatch(row, /not (installed|found|present)\b/i, 'must never claim the script is not installed/found/present')
})

test('🔴 the Shopify branch does not regress the GTM branch it sits beside', () => {
  const row = scriptDetectedRow(PAGE)
  assert.match(row, /gtm_present|gtmPresent/, 'the gtm_present signal must still drive the GTM reason')
  assert.match(row, /Google Tag Manager/i, 'the GTM-specific copy must still be reachable')
})

// ── The persisted value must be accepted by the server ───────────────────────

test('🔴 the server accepts install_method "shopify" — the wizard persists it on tab select', () => {
  const idx = ONBOARDING_ROUTE.indexOf('const VALID_INSTALL_METHODS')
  assert.ok(idx !== -1, 'VALID_INSTALL_METHODS must exist')
  const line = ONBOARDING_ROUTE.slice(idx, ONBOARDING_ROUTE.indexOf('\n', idx))
  assert.match(line, /'shopify'/, 'shopify must be whitelisted, or handleInstallMethodSelect 400s and the user dead-ends on a save error')
  // The other two must survive the widening.
  assert.match(line, /'standard'/, 'standard must remain valid')
  assert.match(line, /'gtm'/, 'gtm must remain valid')
})

test('🔴 every wizard install-method key is server-valid (no key can be unpersistable)', () => {
  const methodsIdx = PAGE.indexOf('const INSTALL_METHODS')
  const methodsBlock = PAGE.slice(methodsIdx, PAGE.indexOf(']', methodsIdx))
  const keys = [...methodsBlock.matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1])
  assert.ok(keys.length >= 3, 'expected at least standard/gtm/shopify')

  const validIdx = ONBOARDING_ROUTE.indexOf('const VALID_INSTALL_METHODS')
  const validLine = ONBOARDING_ROUTE.slice(validIdx, ONBOARDING_ROUTE.indexOf('\n', validIdx))
  for (const k of keys) {
    assert.match(validLine, new RegExp(`'${k}'`), `install method '${k}' is offered in the wizard but rejected by the server whitelist`)
  }
})

// ── Scope guard: this pass is Shopify only ───────────────────────────────────

test('🔴 WordPress / Webflow / Framer are untouched — still doc-links this pass', () => {
  for (const label of ['WordPress', 'Webflow', 'Framer']) {
    const idx = NUDGE.indexOf(`label: '${label}'`)
    assert.ok(idx !== -1, `${label} card must still exist`)
    const entry = NUDGE.slice(idx, NUDGE.indexOf('\n', idx))
    assert.doesNotMatch(entry, /guidedMethod/, `${label} must NOT have a guided flow yet — this pass is scoped to Shopify`)
    assert.match(entry, /to:\s*'\/docs\/platforms\//, `${label} must still be a doc link`)
  }
})
