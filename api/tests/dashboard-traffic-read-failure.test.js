// Traffic-read failure vs. genuine absence (dashboard/src/lib/trafficState.js).
//
// THE BUG THIS PINS: useDashboardData fired three queries but surfaced isError from only ONE
// (/dashboard/overview). /analytics/summary was destructured for `data` alone, so a genuine
// fetch failure produced `undefined`, every derived traffic count fell to 0, and the Dashboard
// rendered "No attribution data yet — Install the tracker on your website" to a customer whose
// traffic we simply failed to read. An error shown as an empty state, blaming the customer's
// setup for our outage — the #278/#413 class, on their own business data.
//
// The invariant: "no traffic" is a POSITIVE CLAIM about the site and requires evidence of
// absence. A failed read is evidence of nothing.

import test from 'node:test'
import assert from 'node:assert/strict'

const { deriveTrafficState } = await import('../../dashboard/src/lib/trafficState.js')

const base = {
  previewMode: false,
  summaryFailed: false,
  trafficPageviews: 0,
  topPagesCount: 0,
  sessions: 0,
  hasConversions: false
}

test('THE BUG: a failed traffic read never renders as "no traffic"', () => {
  const s = deriveTrafficState({ ...base, summaryFailed: true })
  assert.equal(s.trafficUnavailable, true, 'a failed read must surface as an error')
  assert.equal(s.showEmptyState, false, 'and must NOT render the install-the-tracker empty state')
})

test('a genuinely empty site still gets the calm empty state', () => {
  const s = deriveTrafficState({ ...base })
  assert.equal(s.showEmptyState, true)
  assert.equal(s.trafficUnavailable, false)
})

test('a site with real traffic is unaffected by either flag', () => {
  const s = deriveTrafficState({ ...base, trafficPageviews: 1200 })
  assert.equal(s.hasTraffic, true)
  assert.equal(s.showEmptyState, false)
  assert.equal(s.trafficUnavailable, false)
})

test('overview-derived signals survive a summary failure', () => {
  // topPagesCount and sessions ride on /dashboard/overview, NOT on /analytics/summary. When the
  // summary is the read that failed, they are still positive proof — so a single failed read
  // must not escalate to a full-page error over a site we can still see traffic for.
  for (const proof of [{ topPagesCount: 3 }, { sessions: 40 }]) {
    const s = deriveTrafficState({ ...base, summaryFailed: true, ...proof })
    assert.equal(s.hasTraffic, true, `${JSON.stringify(proof)} is independent proof of traffic`)
    assert.equal(s.trafficUnavailable, false, 'no error banner when traffic is provable anyway')
    assert.equal(s.showEmptyState, false)
  }
})

test('conversions suppress the error banner — the page has real content to show', () => {
  const s = deriveTrafficState({ ...base, summaryFailed: true, hasConversions: true })
  assert.equal(s.trafficUnavailable, false, 'an error banner over a page full of real data is the louder lie')
  assert.equal(s.showEmptyState, false)
})

test('LATENT BUG ALSO CLOSED: conversions but no traffic signal is not a fresh install', () => {
  // Reachable with no failure at all: /dashboard/overview leaves kpis.sessions at 0 when its
  // bounce-rate read comes back empty (dashboard.js:377). Under the old `!hasTraffic` gate a
  // site with real conversions then rendered "install the tracker" — false on its face.
  const s = deriveTrafficState({ ...base, hasConversions: true })
  assert.equal(s.showEmptyState, false, 'a site with conversions is demonstrably installed')
})

test('preview mode is driven by conversions and never shows either failure state', () => {
  const withConv = deriveTrafficState({ ...base, previewMode: true, hasConversions: true })
  assert.equal(withConv.hasTraffic, true)
  const without = deriveTrafficState({ ...base, previewMode: true, summaryFailed: true })
  assert.equal(without.hasTraffic, false)
  assert.equal(without.trafficUnavailable, false, 'preview reads a different payload entirely')
  assert.equal(without.showEmptyState, false)
})

test('the two states are mutually exclusive under every combination', () => {
  // If both ever fired, the page would stack an error card on top of an empty state.
  for (const summaryFailed of [true, false]) {
    for (const hasConversions of [true, false]) {
      for (const trafficPageviews of [0, 5]) {
        for (const previewMode of [true, false]) {
          const s = deriveTrafficState({ ...base, summaryFailed, hasConversions, trafficPageviews, previewMode })
          assert.ok(
            !(s.trafficUnavailable && s.showEmptyState),
            `both fired for ${JSON.stringify({ summaryFailed, hasConversions, trafficPageviews, previewMode })}`
          )
        }
      }
    }
  }
})

test('hasTraffic keeps its exact previous meaning — positive proof only', () => {
  // AttributionPage and the cold-start live-feed gate both read hasTraffic. Widening it here
  // would silently change what they render.
  assert.equal(deriveTrafficState({ ...base }).hasTraffic, false)
  assert.equal(deriveTrafficState({ ...base, hasConversions: true }).hasTraffic, false)
  assert.equal(deriveTrafficState({ ...base, summaryFailed: true }).hasTraffic, false)
  assert.equal(deriveTrafficState({ ...base, sessions: 1 }).hasTraffic, true)
})

test('never throws on absent or malformed input', () => {
  // The hook calls this on the first render, before any query has resolved.
  assert.doesNotThrow(() => deriveTrafficState())
  assert.doesNotThrow(() => deriveTrafficState({}))
  assert.doesNotThrow(() => deriveTrafficState({ trafficPageviews: null, sessions: undefined }))
  assert.equal(deriveTrafficState({}).showEmptyState, true)
})
