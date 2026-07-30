// AttributionCoverageCard's coverage ring — invariant guard.
//
// The ring lives in JSX, which node --test cannot import, so this is a source guard in the
// style of no-posthog-dashboard-import.test.js / url-normalizer-drift-guard.test.js rather
// than a render test. It pins the four things that would be silently wrong if someone
// "improved" this component later.
//
// SCOPE, STATED HONESTLY: this does NOT test that the animation runs, eases, or stops —
// those are properties of dashboard/src/utils/useCountUp.js, which has NO test of its own
// (verified). This card is its second consumer. What is asserted here is that the card
// DELEGATES to that primitive instead of hand-rolling a timer, which is the part a
// regression would change.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARD = join(__dirname, '..', '..', 'dashboard', 'src', 'components', 'AttributionCoverageCard.jsx')
const src = readFileSync(CARD, 'utf8')

// ── 1. §6: a site with no conversions must never paint a 0% ring ──────────────────────
// The has_data===false branch returns the calm empty state. If the gauge were ever moved
// above that guard, a site with zero conversions would render a full-width "0%" ring —
// a fabricated zero, and the exact failure /api/analytics/coverage's has_data flag exists
// to prevent.
test('🔴 the has_data===false empty state still returns BEFORE the ring is rendered', () => {
  const guardIdx = src.indexOf('stat.has_data === false')
  const ringIdx = src.indexOf('<CoverageRing')
  assert.ok(guardIdx > -1, 'the has_data===false guard is gone — a no-data site could render a 0% ring')
  assert.ok(ringIdx > -1, 'the coverage ring is no longer rendered')
  assert.ok(
    guardIdx < ringIdx,
    'the ring is rendered before the has_data guard — a site with no conversions would paint a fabricated 0%'
  )
})

// ── 2. The ring must delegate its motion, not hand-roll it ───────────────────────────
test('🔴 the card drives the ring from useCountUp and starts no timer of its own', () => {
  assert.match(src, /useCountUp/, 'the card no longer uses the shared count-up primitive')
  for (const banned of ['setInterval(', 'setTimeout(', 'requestAnimationFrame(']) {
    assert.ok(
      !src.includes(banned),
      `${banned} appeared in the card — motion must stay in useCountUp, which already handles once-per-target + prefers-reduced-motion`
    )
  }
})

// ── 3. No idle / infinite animation ─────────────────────────────────────────────────
// design.md §29.2 and §35 both rule out heavy animation. A one-shot reveal of a real value
// is the borrow; a perpetually moving ring is decoration. `animate-spin` is legitimate in
// the loading state's RefreshCw icon, so this checks the ring's own classes only.
test('🔴 the ring itself carries no looping animation class', () => {
  const ringStart = src.indexOf('function CoverageRing')
  const ringEnd = src.indexOf('export default function AttributionCoverageCard')
  assert.ok(ringStart > -1 && ringEnd > ringStart, 'CoverageRing is no longer a distinct component')
  const ringSrc = src.slice(ringStart, ringEnd)
  for (const banned of ['animate-spin', 'animate-pulse', 'animate-bounce', 'animate-ping', 'infinite']) {
    assert.ok(!ringSrc.includes(banned), `the ring uses ${banned} — it must animate once on mount, not idle`)
  }
})

// ── 4. a11y: the ring must not be an unlabelled graphic ─────────────────────────────
// The percentage is already text next to the ring, so the ring is presentation for a value
// already in the accessible tree. Either aria-hidden (correct) or a real label would pass a
// checker; a bare <svg> would not.
test('🔴 the ring svg is aria-hidden (its value is already exposed as text)', () => {
  const ringSrc = src.slice(src.indexOf('function CoverageRing'), src.indexOf('export default function'))
  const svgTag = ringSrc.slice(ringSrc.indexOf('<svg'), ringSrc.indexOf('>', ringSrc.indexOf('<svg')) + 1)
  assert.match(
    svgTag,
    /aria-hidden="true"|aria-label=/,
    'the ring svg is neither aria-hidden nor labelled — it would announce as an unlabelled graphic'
  )
})

// ── 5. The arc and the digits must come from ONE value ───────────────────────────────
// If the ring were fed stat.coverage_pct while the number was fed the interpolated value
// (or vice versa), the two would disagree for the length of the animation — a moving number
// beside a static full ring reads as a rendering bug.
test('🔴 the ring and the number are driven by the same interpolated value', () => {
  assert.match(src, /const livePct\s*=/, 'the single interpolated source (livePct) is gone')
  assert.match(src, /const ringPct\s*=\s*livePct/, 'the ring is no longer fed from livePct')
  assert.match(src, /const displayPct\s*=\s*Math\.round\(livePct/, 'the displayed number is no longer fed from livePct')
})
