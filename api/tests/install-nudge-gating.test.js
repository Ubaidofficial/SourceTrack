// Install-guide nudge gating (dashboard/src/lib/installNudge.js).
//
// The nudge is ADVISORY. The failure that matters is not "we missed a nudge" — that is
// invisible. It is "we confidently sent a WordPress user to the Shopify guide", because they
// trust it precisely because we said it. So the bias is hard toward null, and the bulk of
// these tests are false-positive and no-signal cases rather than the happy path.
//
// The detection itself is NOT new: api/lib/platform-detector.js has shipped for a while and
// GET /install/detect-platform already served `platform` to the onboarding page, which threw
// it away. These tests cover the mapping that was missing, and are written against the REAL
// shapes that detector emits (see ERROR_RESULT and classifyHtml there).

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INSTALL_GUIDES,
  DETECTED_WITHOUT_GUIDE,
  suggestedGuideFor
} from '../../dashboard/src/lib/installNudge.js'

// The exact shape classifyHtml() returns for a successful match.
const detected = (platform, confidence = 'high') => ({
  platform, confidence, gtm_present: false, signals: ['x'], script_detected: 'not_detected'
})

// ── no signal: the nudge must stay silent ────────────────────────────────────

test('no detection at all -> no suggestion', () => {
  for (const input of [null, undefined, {}, '', 0, [], 'wordpress']) {
    assert.equal(suggestedGuideFor(input), null, `${JSON.stringify(input)} must not produce a nudge`)
  }
})

test("error:true -> no suggestion (a fetch that never ran is not evidence)", () => {
  // This is api/lib/platform-detector.js's ERROR_RESULT verbatim — bad domain, timeout,
  // SSRF-rejected, non-200. It must never be read as "this site has no platform".
  const ERROR_RESULT = {
    platform: 'unknown', confidence: 'low', gtm_present: false,
    signals: [], error: true, script_detected: 'unknown'
  }
  assert.equal(suggestedGuideFor(ERROR_RESULT), null)
})

test("error:true with a REAL platform name -> still no suggestion", () => {
  // Defensive: if a future code path ever sets error alongside a platform, error wins.
  assert.equal(suggestedGuideFor({ ...detected('shopify'), error: true }), null)
})

test("'unknown' and 'custom' -> no suggestion", () => {
  // 'custom' means the fetch SUCCEEDED and matched nothing known. A real answer, but it
  // points at no guide, so we say nothing rather than defaulting to one.
  assert.equal(suggestedGuideFor({ platform: 'custom', confidence: 'low' }), null)
  assert.equal(suggestedGuideFor({ platform: 'unknown', confidence: 'low' }), null)
  assert.equal(suggestedGuideFor({ platform: '', confidence: 'high' }), null)
})

// ── false positives: detected, but we must NOT point at a guide ──────────────

test('🔴 a platform we detect but have NO guide for -> no suggestion, never a near-miss', () => {
  // Wix and Squarespace are in the detector's signal table but have no card. The wrong
  // behaviour would be falling through to the first guide, or to Framer/GTM as a "default".
  for (const platform of DETECTED_WITHOUT_GUIDE) {
    assert.equal(suggestedGuideFor(detected(platform)), null,
      `${platform} is detectable but has no guide — suggesting any other card would be a lie`)
  }
})

test('🔴 an UNRECOGNISED platform string -> no suggestion', () => {
  // The detector learning a new platform before this list does must degrade to silence,
  // not to whichever card happens to sort first.
  for (const platform of ['ghost', 'drupal', 'magento', 'bigcommerce', 'nextjs']) {
    assert.equal(suggestedGuideFor(detected(platform)), null)
  }
})

test('🔴 low confidence -> no suggestion even when the platform names a real guide', () => {
  assert.equal(suggestedGuideFor({ platform: 'shopify', confidence: 'low' }), null)
  assert.equal(suggestedGuideFor({ platform: 'wordpress', confidence: '' }), null)
  assert.equal(suggestedGuideFor({ platform: 'webflow' }), null, 'missing confidence is not confidence')
})

test('🔴 Framer and GTM are never auto-suggested — we have no signal for either', () => {
  // Both have guides and both are reachable by hand. The detector cannot see them, so no
  // detection result may ever select them.
  const undetectable = INSTALL_GUIDES.filter(g => g.platformKey === null).map(g => g.label)
  assert.deepEqual(undetectable.sort(), ['Framer', 'Google Tag Manager'])
  for (const platform of ['framer', 'gtm', 'google tag manager', 'googletagmanager']) {
    assert.equal(suggestedGuideFor(detected(platform)), null)
  }
})

test('gtm_present alone does NOT select the GTM guide', () => {
  // A WordPress site with GTM installed is still a WordPress install job. gtm_present drives
  // separate step-6 copy; it is deliberately not a guide selector.
  assert.equal(suggestedGuideFor({ platform: 'custom', confidence: 'low', gtm_present: true }), null)
  assert.equal(suggestedGuideFor({ ...detected('wordpress'), gtm_present: true }).label, 'WordPress')
})

// ── the happy path, and only then ────────────────────────────────────────────

test('a confident detection maps to its guide', () => {
  assert.equal(suggestedGuideFor(detected('shopify')).label, 'Shopify')
  assert.equal(suggestedGuideFor(detected('wordpress')).label, 'WordPress')
  assert.equal(suggestedGuideFor(detected('webflow')).label, 'Webflow')
})

test("'medium' confidence (a single matched token) still nudges", () => {
  // classifyHtml returns medium for exactly one signal — a normal, usable outcome.
  assert.equal(suggestedGuideFor(detected('wordpress', 'medium')).label, 'WordPress')
})

test('platform casing/whitespace from the wire is tolerated', () => {
  assert.equal(suggestedGuideFor(detected('  Shopify  ')).label, 'Shopify')
  assert.equal(suggestedGuideFor(detected('WORDPRESS')).label, 'WordPress')
})

// ── structural guards ────────────────────────────────────────────────────────

test('🔴 every guide still renders — the nudge highlights, it never filters', () => {
  // The nudge must never shorten the list. If a future change makes suggestedGuideFor the
  // source of what renders, this is the test that should stop it.
  assert.equal(INSTALL_GUIDES.length, 5)
  assert.deepEqual(
    INSTALL_GUIDES.map(g => g.label),
    ['WordPress', 'Shopify', 'Webflow', 'Framer', 'Google Tag Manager'],
    'order and membership are fixed; detection reorders nothing'
  )
  assert.ok(INSTALL_GUIDES.every(g => g.to && g.desc), 'every card keeps a working link and description')
})

test('🔴 a suggestion is always an object FROM the list, never a synthesized card', () => {
  const s = suggestedGuideFor(detected('shopify'))
  assert.ok(INSTALL_GUIDES.includes(s), 'must be the same object, so the link can never diverge')
})

test('every platformKey in the list is one the detector can actually emit', () => {
  // Guards the other drift direction: a card claiming a platformKey the detector never
  // reports would be dead config that silently never fires.
  const DETECTOR_PLATFORMS = new Set(['shopify', 'wordpress', 'wix', 'squarespace', 'webflow'])
  for (const g of INSTALL_GUIDES) {
    if (g.platformKey === null) continue
    assert.ok(DETECTOR_PLATFORMS.has(g.platformKey),
      `${g.label} maps to "${g.platformKey}", which api/lib/platform-detector.js never emits`)
  }
})
