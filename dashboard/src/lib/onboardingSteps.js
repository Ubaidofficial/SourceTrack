// Onboarding wizard step model — the SINGLE source of truth for how the wizard's internal step
// numbers are presented as cards and labels.
//
// WHY THIS MODULE EXISTS (two problems, one fix):
//
// 1. TWO ARRAYS THAT DISAGREED. Onboarding.jsx held STEP_TITLES and STEPPER_LABELS separately, and
//    they named the same steps differently — STEP_TITLES[3]='Install Script' vs
//    STEPPER_LABELS[2]='Install Method', STEP_TITLES[4]='Installation Instructions' vs
//    STEPPER_LABELS[3]='Install Script'. So the card header and the stepper dot could describe the
//    same step with different words. Both label sets are now DERIVED from the one array below, so a
//    row carries its own title and label and they cannot drift apart again.
//
// 2. THE INSTALL SPLIT. Installation was two cards — pick a METHOD, then read that method's
//    INSTRUCTIONS. docs/design/design.md §12 always described these as ONE step ("Step 3 - Install
//    tracking script", "Toggle: GTM / Standard HTML", copyable snippet inline), so the split was the
//    drift, not the spec. Merged into one tabbed card, which also brings the wizard to the 5 steps
//    §12 specifies.
//
// ── PRESENTATIONAL MERGE, NOT A RENUMBER (read before "simplifying" this) ────────────────────────
// The internal/persisted step numbers stay 1..6. `steps: [3, 4]` on the install row is what does the
// merging: both stored values render the same card. This is deliberate, because api/routes/onboarding.js
//   - validates transitions as `targetStep <= currentStep || targetStep === currentStep + 1`, so a
//     renumbered client could emit a transition the server rejects (e.g. 3 -> 5); and
//   - persists `Math.max(targetStep, currentStep)` (furthest progress), so a migrated user's stored
//     value keeps the OLD maximum — making a legacy '5' indistinguishable from a genuine new '5', and
//     risking sending someone who reached Verify back to Conversions on every reload.
// Renumbering therefore needs a version marker in onboarding_state plus backend changes. Mapping
// display positions over stable internal ids needs neither, and mirrors the framing the page already
// uses ("Presentational 3-phase framing over the underlying 6 steps (no logic change)").
//
// Keep this module PURE — no imports, no React, no browser APIs. api/tests reaches into it (the safe
// direction, same as dashboard/src/lib/gate-constants.js).

export const ONBOARDING_STEPS = [
  { title: 'Connect Domain', label: 'Connect Domain', steps: [1] },
  { title: 'Select Business Type', label: 'Business Type', steps: [2] },
  // THE MERGE: 3 = method chosen, 4 = instructions shown. One card, method as tabs.
  { title: 'Install Script', label: 'Install Script', steps: [3, 4] },
  { title: 'Customize Conversions', label: 'Customize', steps: [5] },
  { title: 'Verify Installation', label: 'Run Verification', steps: [6] }
]

export const DISPLAY_STEP_COUNT = ONBOARDING_STEPS.length

// Both label sets derive from the array above — that is the reconciliation.
export const STEP_TITLES = Object.fromEntries(ONBOARDING_STEPS.map((s, i) => [i + 1, s.title]))
export const STEPPER_LABELS = ONBOARDING_STEPS.map((s) => s.label)

/**
 * Internal/persisted step (1..6) -> 1-based display position (1..5).
 * Clamps anything out of range or malformed, so a corrupt stored value renders the first or last
 * card rather than a blank one.
 */
export function displayIndexForStep (step) {
  const n = Number(step)
  if (!Number.isInteger(n)) return 1
  const idx = ONBOARDING_STEPS.findIndex((s) => s.steps.includes(n))
  if (idx !== -1) return idx + 1
  return n < 1 ? 1 : DISPLAY_STEP_COUNT
}

/**
 * Display position (1..5) -> the internal step to navigate to. Returns the FIRST internal step of
 * that card, so clicking the stepper's install dot lands on the method tab rather than mid-flow.
 */
export function internalStepForDisplay (displayIndex) {
  const n = Number(displayIndex)
  const row = ONBOARDING_STEPS[Number.isInteger(n) ? n - 1 : 0] || ONBOARDING_STEPS[0]
  return row.steps[0]
}
