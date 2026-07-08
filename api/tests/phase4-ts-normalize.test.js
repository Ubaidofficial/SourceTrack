// Phase-9 harness regression guard for the cross-store timestamp TZ bug.
//
// The FIRST live phase4 diff returned pass:false. Root cause (confirmed): the
// harness parsed Tinybird's zoneless DateTime64 rows ('2026-06-28 01:29:28.976')
// with bare `new Date(...)`, which reads them as the RUNNER's LOCAL time — a
// constant TZ offset (the observed 7,200,339ms = 2h + PostHog's 339ms ingest
// offset on a UTC+2 runner). That corrupted the timestamp component of the
// cross-store comparison KEY, producing spurious touchpoint/conversion
// mismatches — NOT model divergence. The fix is `toUtcSafeTs` in
// tinybird/tools/phase4_touchpoint_diff.js (normalize zoneless -> UTC before
// every tsMs() compare).
//
// The committed offline snapshots (phase4_replay_verify.mjs) carry Z-suffixed
// timestamps, so `toUtcSafeTs` is a no-op on them and the replay does NOT cover
// this path. This is the direct, credential-free regression test for the fix:
// it must be RUNNER-TIMEZONE-INDEPENDENT (asserts absolute UTC instants).

import test from 'node:test'
import assert from 'node:assert'

// phase4_touchpoint_diff.js imports posthog.js, which builds its capture client
// at module load and throws on a falsy key — stub it (the tool never uses it
// here; same stub the replay verifier uses).
process.env.NODE_ENV = 'test'
if (!process.env.POSTHOG_API_KEY) process.env.POSTHOG_API_KEY = 'mock-unused-by-ts-normalize-test'

const { toUtcSafeTs } = await import('../../tinybird/tools/phase4_touchpoint_diff.js')

test('toUtcSafeTs — zoneless Tinybird DateTime64 gets space->T and a trailing Z', () => {
  assert.strictEqual(toUtcSafeTs('2026-06-28 01:29:28.976'), '2026-06-28T01:29:28.976Z')
  // 6-decimal micros (the exact shape the deployed pipes return).
  assert.strictEqual(toUtcSafeTs('2026-06-27 21:55:51.182000'), '2026-06-27T21:55:51.182000Z')
  // no fractional seconds.
  assert.strictEqual(toUtcSafeTs('2026-06-28 01:29:28'), '2026-06-28T01:29:28Z')
})

test('toUtcSafeTs — zone-carrying strings pass through untouched (HogQL leg is never altered)', () => {
  assert.strictEqual(toUtcSafeTs('2026-06-28T01:29:28.976Z'), '2026-06-28T01:29:28.976Z')
  assert.strictEqual(toUtcSafeTs('2026-06-28T01:29:28+02:00'), '2026-06-28T01:29:28+02:00')
  assert.strictEqual(toUtcSafeTs('2026-06-28T01:29:28-0500'), '2026-06-28T01:29:28-0500')
})

test('toUtcSafeTs — non-string input is returned as-is (never throws)', () => {
  assert.strictEqual(toUtcSafeTs(null), null)
  assert.strictEqual(toUtcSafeTs(undefined), undefined)
  const n = 1712345678000
  assert.strictEqual(toUtcSafeTs(n), n)
})

test('toUtcSafeTs — RUNNER-TZ-INDEPENDENT: normalized instant equals the true UTC instant (the bug guard)', () => {
  // The bug: bare new Date('2026-06-28 01:29:28.976') is parsed as LOCAL time,
  // so on any non-UTC runner it drifts by the runner offset. After the fix, the
  // instant must equal the absolute UTC value on EVERY runner.
  const zoneless = '2026-06-28 01:29:28.976'
  assert.strictEqual(Date.parse(toUtcSafeTs(zoneless)), Date.UTC(2026, 5, 28, 1, 29, 28, 976))

  // And it must parse to the SAME instant as the equivalent Z-form (which is how
  // the HogQL leg arrives) — i.e. the two legs align regardless of runner TZ.
  assert.strictEqual(
    Date.parse(toUtcSafeTs('2026-06-27 21:55:51.182000')),
    Date.parse('2026-06-27T21:55:51.182000Z')
  )
})

test('toUtcSafeTs — cross-store legs collapse to a zero delta (no phantom offset)', () => {
  // Tinybird leg (zoneless) vs HogQL leg (Z) for the same wall-clock instant.
  const tinybirdLeg = toUtcSafeTs('2026-06-28 01:29:28.976')
  const hogqlLeg = toUtcSafeTs('2026-06-28T01:29:28.976Z')
  assert.strictEqual(Date.parse(tinybirdLeg) - Date.parse(hogqlLeg), 0,
    'a zero delta is what the fix guarantees; the pre-fix bug produced a constant ~7,200,000ms offset')
})
