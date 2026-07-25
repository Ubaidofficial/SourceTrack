// Onboarding wizard step model — the 6-card → 5-card merge of the two install steps.
// TOKEN-FREE, no network, no DOM: binds to the PURE step module, not the React page.
//
// WHAT MERGED: the wizard split installation across two cards — pick a METHOD (old step 3), then read
// that method's INSTRUCTIONS (old step 4). design.md §12 always described these as ONE step
// ("Step 3 - Install tracking script / Toggle: GTM, Standard HTML" + inline snippet), so the split was
// the drift. Merged into one tabbed card, taking the wizard to the 5 steps the spec specifies.
//
// PRESENTATIONAL MERGE, NOT A RENUMBER — the reason this module exists:
// The internal/persisted step numbers (1..6) are UNCHANGED. Renumbering would have been unsafe,
// because api/routes/onboarding.js:
//   - validates transitions as `targetStep <= currentStep || targetStep === currentStep + 1`, so a
//     renumbered client could emit a transition the server rejects; and
//   - stores `Math.max(targetStep, currentStep)` (furthest progress), so a migrated user's stored
//     value keeps the OLD maximum forever — making a legacy '5' indistinguishable from a genuine new
//     '5' and risking sending someone who reached Verify back to Conversions on reload.
// A true renumber therefore needs a version marker in onboarding_state plus backend cooperation.
// Mapping display positions over stable internal ids needs neither, and it is the pattern the page
// already uses for its 3-phase framing ("Presentational 3-phase framing over the underlying 6 steps
// (no logic change)"). ONE array is the source of truth for BOTH label sets, which is also what
// reconciles the two arrays that used to disagree (STEP_TITLES[3]='Install Script' vs
// STEPPER_LABELS[2]='Install Method'; STEP_TITLES[4]='Installation Instructions' vs
// STEPPER_LABELS[3]='Install Script').

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  ONBOARDING_STEPS,
  DISPLAY_STEP_COUNT,
  STEP_TITLES,
  STEPPER_LABELS,
  displayIndexForStep,
  internalStepForDisplay
} from '../../dashboard/src/lib/onboardingSteps.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PAGE = readFileSync(join(__dirname, '../../dashboard/src/pages/Onboarding.jsx'), 'utf8')

test('🔴 the wizard presents FIVE steps (was six — the two install cards merged)', () => {
  assert.equal(DISPLAY_STEP_COUNT, 5)
  assert.equal(ONBOARDING_STEPS.length, 5)
})

test('🔴 the merged step owns BOTH old install steps, and nothing else moved', () => {
  const install = ONBOARDING_STEPS.find(s => s.steps.length > 1)
  assert.ok(install, 'exactly one display step should cover more than one internal step')
  assert.deepEqual(install.steps, [3, 4], 'the merge is old step 3 (method) + old step 4 (instructions)')
  // Every other display step is 1:1, so no other step changed meaning.
  for (const s of ONBOARDING_STEPS.filter(s => s !== install)) {
    assert.equal(s.steps.length, 1, `${s.title} must still map to exactly one internal step`)
  }
})

test('🔴 internal steps 1..6 are covered exactly once — no orphan, no double-claim', () => {
  const covered = ONBOARDING_STEPS.flatMap(s => s.steps)
  assert.deepEqual(covered.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6],
    'a stored step that maps to no display step would render a blank card')
  assert.equal(new Set(covered).size, covered.length, 'no internal step may be claimed by two display steps')
})

// The persistence contract. These are the values already in the database for users mid-onboarding.
test('🔴 PERSISTENCE: every stored step 1..6 still resolves to the RIGHT card', () => {
  assert.equal(displayIndexForStep(1), 1, 'Connect Domain')
  assert.equal(displayIndexForStep(2), 2, 'Business Type')
  assert.equal(displayIndexForStep(3), 3, 'old "pick a method" -> the merged install card')
  assert.equal(displayIndexForStep(4), 3, 'old "instructions" -> the SAME merged install card')
  assert.equal(displayIndexForStep(5), 4, 'Conversions must NOT shift — a user here must not land on Verify')
  assert.equal(displayIndexForStep(6), 5, 'Verify')
})

test('🔴 out-of-range / malformed stored steps clamp instead of rendering nothing', () => {
  for (const bad of [0, -1, 7, 99, null, undefined, NaN, 'x', '']) {
    const d = displayIndexForStep(bad)
    assert.ok(Number.isInteger(d) && d >= 1 && d <= DISPLAY_STEP_COUNT,
      `displayIndexForStep(${JSON.stringify(bad)}) returned ${d} — must stay in range`)
  }
})

test('🔴 stepper back-navigation lands on a real internal step (round-trips)', () => {
  for (let d = 1; d <= DISPLAY_STEP_COUNT; d++) {
    const internal = internalStepForDisplay(d)
    assert.ok(Number.isInteger(internal) && internal >= 1 && internal <= 6, `display ${d} -> ${internal}`)
    assert.equal(displayIndexForStep(internal), d, `display ${d} must round-trip`)
  }
})

// ── The reconciliation: ONE source of truth for both label sets ──────────────────────────
test('🔴 RECONCILED: titles and stepper labels are derived from one array, same length', () => {
  assert.equal(STEPPER_LABELS.length, DISPLAY_STEP_COUNT)
  assert.equal(Object.keys(STEP_TITLES).length, DISPLAY_STEP_COUNT)
  ONBOARDING_STEPS.forEach((s, i) => {
    assert.equal(STEPPER_LABELS[i], s.label, `stepper label ${i + 1} must come from the same row as its title`)
    assert.equal(STEP_TITLES[i + 1], s.title, `title ${i + 1} must come from the same row as its label`)
  })
})

test('🔴 ANTI-DRIFT: the page must NOT redefine its own step-label arrays', () => {
  assert.doesNotMatch(PAGE, /const STEP_TITLES\s*=/,
    'STEP_TITLES must come from lib/onboardingSteps.js — a local copy is how the two arrays drifted apart')
  assert.doesNotMatch(PAGE, /const STEPPER_LABELS\s*=/,
    'STEPPER_LABELS must come from lib/onboardingSteps.js')
  assert.match(PAGE, /from '\.\.\/lib\/onboardingSteps'/, 'the page must import the shared step model')
})

test('🔴 the hardcoded "of 6" step counter is gone (it would contradict a 5-step wizard)', () => {
  assert.doesNotMatch(PAGE, /of 6/, 'the step counter must be derived from DISPLAY_STEP_COUNT, not hardcoded')
})

// The one mistake this whole design invites: comparing an internal step number against a DISPLAY
// position. Both are small integers, so it type-checks, renders, and is only wrong for internal
// step 4 — where the install dot would silently go unlit. Caught here rather than by eye.
test('🔴 the stepper compares DISPLAY positions, not raw internal step numbers', () => {
  const stepper = PAGE.slice(PAGE.indexOf('STEPPER_LABELS.map'), PAGE.indexOf('</button>', PAGE.indexOf('STEPPER_LABELS.map')))
  assert.ok(stepper.length > 0, 'stepper block not found')
  assert.match(stepper, /isCurrent\s*=\s*stepNum === currentDisplay/,
    'isCurrent must compare against displayIndexForStep(step) — `stepNum === step` leaves the merged install dot unlit at internal step 4')
  assert.match(stepper, /isCompleted\s*=\s*stepNum < currentDisplay/,
    'isCompleted must compare display positions too, or the tick marks drift by one after the merge')
  assert.match(stepper, /setStep\(internalStepForDisplay\(stepNum\)\)/,
    'clicking a stepper dot must map the display position back to a real internal step')
})
