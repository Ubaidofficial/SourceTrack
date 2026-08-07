// Tests for api/lib/traffic-quality-signals.js — the log-only aggregate traffic-quality
// signals.
//
// THE POINT OF THIS FILE: a detector that flags everything is not a detector. The clean-set
// controls below (`POSITIVE CONTROL` cases) exist to prove the scorer can come back CLEAN,
// and the dirty-set cases prove it can come back DIRTY on the real observed pattern. A
// check that cannot fail is decoration — so several tests here deliberately assert the
// NEGATIVE (nothing flagged) on traffic that must never be flagged.
//
// Fixtures marked "observed" reproduce the shape measured on prod 2026-08-07 (both sites
// founder-owned: www.techrupt.pk, bookmentions.net).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  burstGroups,
  trafficQualitySignals,
  FALSE_POSITIVE_POPULATIONS,
  NEEDS_INSTRUMENTATION
} from '../lib/traffic-quality-signals.js'

const T0 = Date.parse('2026-08-07T12:00:00.000Z')
const at = ms => new Date(T0 + ms).toISOString()

// A human reading a site: one person, one device, pages minutes apart, referrers present.
function humanSession (id, pages, startMs = 0) {
  return pages.map((url, i) => ({
    event_id: `${id}-${i}`,
    page_url: url,
    distinct_id: id,
    device_type: 'desktop',
    browser_name: 'chrome',
    referrer: 'https://www.google.com/',
    timestamp: at(startMs + i * 90_000) // 90s apart — real reading cadence
  }))
}

// ─── POSITIVE CONTROLS: traffic that MUST come back clean ────────────────────────────

test('POSITIVE CONTROL: genuine human traffic is NOT flagged', () => {
  const rows = [
    ...humanSession('h1', ['/a', '/b', '/c']),
    ...humanSession('h2', ['/a', '/d'], 5_000),
    ...humanSession('h3', ['/b'], 11_000)
  ]
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.burst_events, 0, 'humans reading pages must produce zero burst events')
  assert.equal(signals.bursts.length, 0)
  assert.equal(signals.null_browser_rate, 0)
  assert.equal(signals.zero_referrer_rate, 0)
})

test('POSITIVE CONTROL: many DIFFERENT people on one page at once is not a burst if they share a device class', () => {
  // Shared office wifi: 5 people open the same link within 4 seconds, all on desktop.
  // This is the documented false-positive population for burst_rate, and the
  // device-type requirement is exactly what keeps it clean.
  const rows = [0, 1, 2, 3, 4].map(i => ({
    event_id: `office-${i}`,
    page_url: '/launch',
    distinct_id: `person-${i}`,
    device_type: 'desktop',
    browser_name: 'chrome',
    referrer: 'https://mail.google.com/',
    timestamp: at(i * 1000)
  }))
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.burst_events, 0, 'one device class => not a burst, however many people')
})

test('POSITIVE CONTROL: a privacy-conscious human trips referrer+browser but NOT the burst signal', () => {
  // Hardened browser: no referrer, UA that UAParser cannot resolve. This person is REAL.
  // They must move the soft rates without ever landing in burst_events — which is the
  // whole reason burst is the only signal precise enough to act on.
  const rows = humanSession('privacy', ['/a', '/b']).map(r => ({
    ...r, referrer: '', browser_name: null
  }))
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.zero_referrer_rate, 1, 'soft signal moves...')
  assert.equal(signals.null_browser_rate, 1, '...and so does this one...')
  assert.equal(signals.burst_events, 0, '...but the precise signal stays clean')
})

// ─── The observed prod pattern MUST be flagged ────────────────────────────────────────

test('the observed prod burst (4 hits, 4 ids, 2 device types, 3s) IS flagged', () => {
  // Reproduces api/../techrupt.pk/tcs-tracking/ as measured 2026-08-07.
  const rows = [0, 1, 2, 3].map(i => ({
    event_id: `burst-${i}`,
    page_url: 'https://www.techrupt.pk/tcs-tracking/',
    distinct_id: `uuid-${i}`,
    device_type: i % 2 === 0 ? 'desktop' : 'mobile',
    browser_name: 'chrome',
    referrer: '',
    timestamp: at(i * 1000) // 3s total span
  }))
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.burst_events, 4)
  assert.equal(signals.burst_rate, 1)
  assert.equal(signals.bursts[0].distinct_ids, 4)
  assert.equal(signals.bursts[0].device_types, 2)
  assert.equal(signals.bursts[0].span_sec, 3)
})

test('MUTATION CONTROL: the burst detector CAN fail — widen the span and it goes clean', () => {
  // Same four requests, but spread over 5 minutes instead of 3 seconds. If this still
  // flagged, the detector would be reacting to "4 ids on a url" rather than to cadence,
  // and would flag any popular page. Proves the time window is load-bearing.
  const rows = [0, 1, 2, 3].map(i => ({
    event_id: `slow-${i}`,
    page_url: '/popular',
    distinct_id: `uuid-${i}`,
    device_type: i % 2 === 0 ? 'desktop' : 'mobile',
    browser_name: 'chrome',
    referrer: '',
    timestamp: at(i * 75_000)
  }))
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.burst_events, 0, 'spread out in time => not a burst')
})

test('MUTATION CONTROL: dropping below the id threshold goes clean', () => {
  // 2 ids, 2 device types, 1s apart. Below BURST_MIN_IDS. A couple sharing a link.
  const rows = [0, 1].map(i => ({
    event_id: `pair-${i}`,
    page_url: '/shared',
    distinct_id: `uuid-${i}`,
    device_type: i === 0 ? 'desktop' : 'mobile',
    browser_name: 'chrome',
    referrer: '',
    timestamp: at(i * 1000)
  }))
  const { signals } = trafficQualitySignals(rows)
  assert.equal(signals.burst_events, 0)
})

// ─── Structural / no-fake-zeros guarantees ────────────────────────────────────────────

test('an empty window returns null signals, never a fake zero (§6)', () => {
  const out = trafficQualitySignals([])
  assert.equal(out.total, 0)
  assert.equal(out.signals, null, 'no data must not render as 0% — it must render as nothing')
})

test('every computed signal has a documented false-positive population', () => {
  const rows = humanSession('h', ['/a'])
  const { signals } = trafficQualitySignals(rows)
  const rateKeys = Object.keys(signals).filter(k => k.endsWith('_rate') || k.endsWith('_share'))
  for (const k of rateKeys) {
    assert.ok(
      FALSE_POSITIVE_POPULATIONS[k],
      `signal ${k} has no documented false-positive population — add one before it ships`
    )
    assert.ok(FALSE_POSITIVE_POPULATIONS[k].length > 80, `${k}'s FP note is too thin to be useful`)
  }
})

test('the module names what it CANNOT compute, and why', () => {
  assert.ok(NEEDS_INSTRUMENTATION.anon_id_absent.includes('track.js:426'))
  assert.ok(NEEDS_INSTRUMENTATION.geo_locale_mismatch)
})

test('🔴 NOTHING in this module drops, filters, or meters — measurement only', () => {
  // Guard against a future edit wiring a threshold in. §6/§6.5: an ingestion drop is
  // irreversible and #666 exists because a filter deleted real humans.
  const src = readFileSync(new URL('../lib/traffic-quality-signals.js', import.meta.url), 'utf8')
  const code = stripComments(src)
  for (const forbidden of ['res.status', 'filtered:', 'return res', 'DROP', 'shouldDrop']) {
    assert.ok(
      !code.includes(forbidden),
      `traffic-quality-signals.js must not reference ${forbidden} — this module is measurement only`
    )
  }
  // CONTROL for the guard above: stripComments must not have eaten the file. If it
  // returned '' the loop would vacuously pass and this test would be decoration.
  assert.ok(code.includes('export function trafficQualitySignals'), 'stripComments ate the source')
  assert.ok(code.length > 500, 'stripped source implausibly short — the guard would be vacuous')
})

import { readFileSync } from 'node:fs'

// Strip block and line comments so the guard above cannot fire on its own documentation —
// this file's header explains the very tokens it forbids.
function stripComments (src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
