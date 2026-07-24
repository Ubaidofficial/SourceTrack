// Adblock transport guard — proves the tracker's collection transport survives the
// default adblock filter set (uBlock/ABP/Brave), and would go RED if anyone reverts
// the tracker to sendBeacon-first (the money-rail regression this PR fixes).
//
// TWO complementary halves:
//   PART 1 (network) — match our real prod URLs against the four default lists with
//     @ghostery/adblocker. Proves the ENVIRONMENT: a third-party `ping` (sendBeacon)
//     to /api/track is blocked, while an `xmlhttprequest` (keepalive fetch) is not.
//   PART 2 (offline) — read the two SHIPPED tracker sources + their built .min.js and
//     assert keepalive-first. Proves OUR CODE uses the transport PART 1 shows is clear.
//     This is the half that "only passes once STEP 2 lands" — the list-matching half is
//     about the filter lists, not our code, so it alone cannot catch a sendBeacon revert.
//
// HONEST DEVIATION from the brief: the brief asked to assert /api/track is NOT blocked
// "for script/xhr AND ping". That is impossible for `ping`: EasyPrivacy carries the
// blanket rule `$ping,third-party`, so EVERY third-party beacon is blocked regardless of
// host — asserting "ping not blocked" would require an allowlist entry that defeats the
// guard. Inverted to assert `ping` IS blocked: that is the hazard, and it is the reason
// STEP 2 replaced sendBeacon with keepalive fetch. (Verified empirically, not assumed.)
//
// NETWORK DEPENDENCY: PART 1 fetches the four lists at runtime. If they are unreachable
// (CI offline) the tests SKIP EXPLICITLY with a reason — they never pass silently. The
// CONTROL assertion (google-analytics.com MUST be blocked) fails loudly if the lists load
// but parse empty, so a silently-broken list set can never report all-clear.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRACKER_DIR = join(__dirname, '..', '..', 'tracker')

// The four default lists the orchestrator verified against (EasyPrivacy carries the
// `$ping,third-party` rule via easyprivacy_trackingservers.txt; the published .txt is
// the fully-assembled list, so no !#include resolution is needed).
const LISTS = [
  ['EasyPrivacy', 'https://easylist.to/easylist/easyprivacy.txt'],
  ['EasyList', 'https://easylist.to/easylist/easylist.txt'],
  ['uBO-privacy', 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt'],
  ["Peter Lowe's", 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext']
]

// Our real production collection host + tracker script (per CLAUDE.md §5). A default
// third-party install: the merchant page and the collector are different registrable
// domains, so third-party rules apply — which is exactly the risk surface.
const MERCHANT = 'https://shop.example-merchant.com/checkout'
const TRACKER_SCRIPT = 'https://api.srctk.com/tracker/tracker.min.js'
const TRACK_ENDPOINT = 'https://api.srctk.com/api/track'
// No allowlist entries: every one of our own URLs below MUST be clear on its own merit.
// If one ever needs exempting, add it here WITH a one-line reason (pipe-refund-guard
// convention) — never silently.

let engine = null
let skipReason = null
let matchFn = null

try {
  const { FiltersEngine, Request } = await import('@ghostery/adblocker')
  const texts = await Promise.all(LISTS.map(async ([name, url]) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) })
    if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`)
    const body = await res.text()
    // A truncated / HTML error body would parse to ~0 rules and silently report all-clear.
    // Treat a suspiciously short list as a load failure (→ skip), not a passing run.
    if (body.length < 5000) throw new Error(`${name} suspiciously short (${body.length} bytes)`)
    return body
  }))
  engine = FiltersEngine.parse(texts.join('\n'))
  matchFn = (url, type) => engine.match(Request.fromRawDetails({ url, type, sourceUrl: MERCHANT })).match
} catch (err) {
  skipReason = `adblock filter lists unreachable (${err.message}) — CI offline? SKIPPING explicitly (NOT passing).`
}

// ── PART 1 — network: match real URLs against the real lists ──────────────────────────

test('CONTROL: google-analytics.com/analytics.js IS blocked (proves the lists loaded)', (t) => {
  if (!engine) return t.skip(skipReason)
  assert.equal(
    matchFn('https://www.google-analytics.com/analytics.js', 'script'), true,
    'CONTROL FAILED: GA analytics.js is not blocked → the filter lists did not load/parse. ' +
    'Without this tripping, the guard would report all-clear forever (the timezone-reconciliation no-op).'
  )
})

test('tracker.min.js (script) is NOT blocked by the default lists', (t) => {
  if (!engine) return t.skip(skipReason)
  assert.equal(
    matchFn(TRACKER_SCRIPT, 'script'), false,
    `${TRACKER_SCRIPT} is on a default filter list — the tracker script itself would fail to load for adblock users.`
  )
})

test('/api/track via fetch keepalive (xmlhttprequest) is NOT blocked — the STEP 2 transport survives', (t) => {
  if (!engine) return t.skip(skipReason)
  assert.equal(
    matchFn(TRACK_ENDPOINT, 'xmlhttprequest'), false,
    `${TRACK_ENDPOINT} is blocked as xmlhttprequest — the keepalive-fetch transport does not survive; the fix is void.`
  )
})

test('/api/track via ping (sendBeacon) IS blocked — the hazard STEP 2 exists to avoid', (t) => {
  if (!engine) return t.skip(skipReason)
  assert.equal(
    matchFn(TRACK_ENDPOINT, 'ping'), true,
    'A third-party sendBeacon ping to /api/track is NOT blocked here. If EasyPrivacy ever drops ' +
    '`$ping,third-party`, sendBeacon would be safe again — but do NOT revert: keepalive fetch is strictly ' +
    'broader (survives unload AND adblock). This assertion documents why the tracker must not use sendBeacon.'
  )
})

// ── PART 2 — offline: our shipped code uses the clear transport (ties the guard to STEP 2) ──

const BUILT = [
  ['tracker.js', 'tracker.min.js'],
  ['tracker.cookieless.js', 'tracker.cookieless.min.js']
]

for (const [src, min] of BUILT) {
  test(`${src}: send() is keepalive-first, sendBeacon only as fallback`, () => {
    const code = readFileSync(join(TRACKER_DIR, src), 'utf8')
    assert.match(code, /supportsKeepalive/, `${src} lost the keepalive feature-detect`)
    assert.match(code, /'keepalive' in new Request\(''\)/, `${src} lost the keepalive feature-detect body`)
    const gate = code.indexOf('if (supportsKeepalive)')
    const beacon = code.indexOf('navigator.sendBeacon')
    assert.ok(gate !== -1, `${src}: the keepalive-first branch is gone`)
    assert.ok(
      beacon === -1 || beacon > gate,
      `${src}: navigator.sendBeacon appears BEFORE the keepalive branch — sendBeacon-first regression (the money-rail bug).`
    )
  })

  test(`${min}: rebuilt from source (contains keepalive, not sendBeacon-first)`, () => {
    const code = readFileSync(join(TRACKER_DIR, min), 'utf8')
    assert.match(code, /keepalive/, `${min} has no keepalive — stale build; run "npm run build:tracker" after editing ${src}.`)
    assert.match(code, /new Request\(""\)/, `${min} lacks the feature-detect — stale build of ${src}.`)
  })
}
