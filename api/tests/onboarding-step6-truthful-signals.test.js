// Onboarding step 6 ("Verify Installation") previously showed only one signal
// (the /install/doctor-driven SetupDoctorCard), with no in-UI way to emit a test event —
// a brand-new user's only forward path from a stuck "waiting for first event" was
// "Verify Later (Skip for now)". This asserts three separate, truthful additions:
//
//   1. "Script detected" (item 2/3) is displayed as its own signal, sourced from the
//      EXISTING /install/detect-platform call (now extended to report script_detected),
//      never merged with "first event received" into one combined boolean.
//   2. The 'unknown' state (fetch failed/blocked/SSRF-refused) must render distinctly from
//      'not_detected' — a failed check is not evidence of absence (§6).
//   3. "Verify Later" now passes skipped:true to /onboarding/complete (so the skip is
//      recorded, see onboarding-complete-skip-marker.test.js), and step 6 offers a link to
//      /setup so the dead end has a route onward.
//
// Static source assertions (no RTL/jsdom in this repo — see onboarding-steps.test.js for
// the established convention this file follows).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PAGE = readFileSync(join(__dirname, '../../dashboard/src/pages/Onboarding.jsx'), 'utf8')

// Isolate the step-6 render block so assertions can't be satisfied by unrelated code elsewhere in the file.
function step6Block (src) {
  const start = src.indexOf('case 6:')
  assert.ok(start !== -1, 'step 6 case block not found')
  const end = src.indexOf('function renderInstallInstructions', start)
  assert.ok(end !== -1 && end > start, 'step 6 block end marker not found')
  return src.slice(start, end)
}

test('🔴 step 6 calls the EXISTING /install/detect-platform endpoint for script detection (no new fetch)', () => {
  const block = step6Block(PAGE)
  assert.match(PAGE, /install\/detect-platform/, 'must reuse the existing detect-platform endpoint, not invent a new one')
  // it must be reachable from the step-6 flow — either called directly in the block or via a
  // hook/effect gated on step === 6, so check the whole page for a step-6-scoped effect too.
  assert.match(PAGE, /step\s*(===|!==)\s*6/, 'the detection call must be scoped to step 6, not fired unconditionally')
})

test('🔴 step 6 shows "Script detected" and "First event received" as two DISTINCT labels, never merged', () => {
  const block = step6Block(PAGE)
  assert.match(block, /Script detected/i, 'a labeled "Script detected" signal must exist')
  assert.match(block, /First event received/i, 'a labeled "First event received" signal must exist, separate from script detection')
})

// REVISION 1: given the false-negative profile (GTM near-100% miss, SPAs largely invisible,
// bot-challenge pages indistinguishable from a real page), 'not_detected' and 'unknown' can
// never be honestly told apart from the user's side, and neither is evidence of absence. The
// three internal script_detected states stay (telemetry), but the USER-FACING copy collapses
// to exactly two: "Yes" (positive evidence only) and "Not confirmed yet" (everything else).

test('🔴 script detection collapses to exactly two user-facing states — no fake negative', () => {
  const idx = PAGE.indexOf('>Script detected<')
  assert.ok(idx !== -1, 'the "Script detected" label must exist')
  const window = PAGE.slice(idx, idx + 900)

  assert.match(window, /Not confirmed yet/, 'the non-positive case must read "Not confirmed yet", not an absence claim')
  assert.doesNotMatch(window, /\bNot yet\b/, 'the old "Not yet" wording (implies absence) must be gone from the script-detected row')
  assert.doesNotMatch(window, /Could not check/, 'the old separate "unknown"-only wording must be gone — collapsed into one non-positive state')
  assert.doesNotMatch(window, /text-amber/, 'the old warning-colored "not detected" styling must be gone — a non-positive result is neutral, not a warning')
})

test('🔴 no copy in the script-detection row states or implies the script is missing', () => {
  const idx = PAGE.indexOf('>Script detected<')
  const window = PAGE.slice(idx, idx + 900)
  assert.doesNotMatch(window, /\bmissing\b/i, 'must never claim the script is missing — only that it is not yet confirmed')
  assert.doesNotMatch(window, /not (installed|found|present)\b/i, 'must never claim the script is not installed/found/present')
})

// REVISION 2: /detect-platform already returns gtm_present (confirmed populated end-to-end:
// classifyHtml computes it from the real fetched HTML, detectPlatform spreads it through,
// the route passes it verbatim) — use it instead of a generic message when GTM is the reason
// script detection can't see the tag directly.
test('🔴 the non-positive state uses the REAL gtm_present signal already returned by /detect-platform', () => {
  assert.match(PAGE, /gtm_present/, 'must read the existing gtm_present field, not invent a new signal')
  const idx = PAGE.indexOf('>Script detected<')
  const window = PAGE.slice(idx, idx + 900)
  assert.match(window, /Google Tag Manager/i, 'when gtm_present is true, the reason must name GTM specifically instead of a generic message')
  assert.match(window, /GTM workspace|container/i, 'the GTM-specific copy must say what to check next (open the GTM workspace / confirm the tag is published)')
})

test('🔴 "Verify Later (Skip for now)" now passes skipped:true to /onboarding/complete', () => {
  const skipButtonStart = PAGE.indexOf('Verify Later (Skip for now)')
  assert.ok(skipButtonStart !== -1, 'the Verify Later button text must still exist')
  // walk backward from the button label to its onClick body (the nearest preceding /onboarding/complete call)
  const before = PAGE.slice(0, skipButtonStart)
  const completeCallIdx = before.lastIndexOf('/onboarding/complete')
  assert.ok(completeCallIdx !== -1, '/onboarding/complete call not found before the Verify Later button')
  const callBlock = before.slice(completeCallIdx, completeCallIdx + 400)
  assert.match(callBlock, /skipped\s*:\s*true/, 'the Verify Later completion call must pass skipped:true so the skip is recorded (see onboarding-complete-skip-marker.test.js)')
})

test('🔴 step 6 offers a link onward to /setup (the dead end must not be a true dead end)', () => {
  const block = step6Block(PAGE)
  assert.match(block, /\/setup/, 'step 6 must link to /setup (Setup & Health), which carries the snippet, platform guides, and a Verify installation button')
})
