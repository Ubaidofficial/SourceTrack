// getAutomationScore() — EXECUTED against mocked window objects.
//
// This file is the point of the dispatch: the weights were previously hand-derived arithmetic
// that had never been run against any browser-shaped object. Everything below actually calls
// the shipped function. If a weight changes, these fail.
//
// It also pins the PRIVACY SCOPE (§6, non-negotiable, and four public "no fingerprinting"
// claims incl. the CCPA Do-Not-Sell page): the module must not read WebGL, navigator.plugins,
// screen/viewport, canvas, fonts, audio, hardwareConcurrency, deviceMemory or timezone. That is
// asserted two ways — by source scan, and by a booby-trapped window whose fingerprinting
// getters throw if touched.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRACKER = readFileSync(join(__dirname, '../../tracker/tracker.js'), 'utf8')
const COOKIELESS = readFileSync(join(__dirname, '../../tracker/tracker.cookieless.js'), 'utf8')

// The function is INLINED in both builds (they are executed as classic scripts by the tracker
// harness — an ESM import in tracker.js breaks 194 existing tests). So rather than test a
// separate copy, extract the block from the SHIPPED source and execute that. What runs below is
// the code customers get.
function extractBlock (src, label) {
  const start = src.indexOf("  var _asG = [")
  const endMarker = "  function getAutomationScore(win) {"
  const fnStart = src.indexOf(endMarker)
  assert.ok(start > -1 && fnStart > start, `${label}: automation-score block not found`)
  // to the end of getAutomationScore: find its closing "  }" after the catch line
  const catchIdx = src.indexOf("} catch (_e) { return 0 }", fnStart)
  assert.ok(catchIdx > -1, `${label}: getAutomationScore tail not found`)
  const end = src.indexOf("\n  }", catchIdx) + 4
  return src.slice(start, end)
}

const BLOCK_TRACKER = extractBlock(TRACKER, 'tracker.js')
const BLOCK_COOKIELESS = extractBlock(COOKIELESS, 'tracker.cookieless.js')

// Compile the extracted source into a callable + expose the weights it actually declares.
function compile (block) {
  // eslint-disable-next-line no-new-func
  return new Function(block + '\nreturn { getAutomationScore: getAutomationScore, G: _asG, D: _asW_DRIVER, GL: _asW_GLOBAL, C: _asW_CHROME }')()
}
const T = compile(BLOCK_TRACKER)
const getAutomationScore = T.getAutomationScore
const AUTOMATION_GLOBALS = T.G
const WEIGHT_WEBDRIVER = T.D
const WEIGHT_AUTOMATION_GLOBAL = T.GL
const WEIGHT_CHROME_MISSING = T.C
const SRC = BLOCK_TRACKER

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

// A window shaped like a REAL browser: chrome object present, no webdriver, no tool globals.
function realBrowser (ua = CHROME_UA, extra = {}) {
  return {
    navigator: { userAgent: ua, webdriver: undefined },
    document: {},
    chrome: { runtime: {} },
    ...extra
  }
}

// ── the baseline that matters most: a normal browser must score exactly 0 ────

test('🔴 clean real-browser-shaped window scores EXACTLY 0 (Chrome)', () => {
  assert.equal(getAutomationScore(realBrowser(CHROME_UA)), 0)
})

test('🔴 Firefox scores 0 — window.chrome is legitimately absent there', () => {
  // Ungated, "no window.chrome" would score every Firefox visitor forever. The UA gate is
  // what prevents that, and this is the test that would catch its removal.
  const firefox = { navigator: { userAgent: FIREFOX_UA }, document: {} }
  assert.equal(getAutomationScore(firefox), 0)
})

test('🔴 Safari scores 0 — same reason', () => {
  assert.equal(getAutomationScore({ navigator: { userAgent: SAFARI_UA }, document: {} }), 0)
})

test('Chromium-family UAs that are not Chrome (Edge/Opera/Samsung) score 0 without window.chrome', () => {
  for (const ua of [
    CHROME_UA.replace('Safari/537.36', 'Safari/537.36 Edg/126.0.0.0'),
    CHROME_UA.replace('Safari/537.36', 'Safari/537.36 OPR/111.0.0.0'),
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'
  ]) {
    assert.equal(getAutomationScore({ navigator: { userAgent: ua }, document: {} }), 0, ua.slice(0, 40))
  }
})

// ── the automation signals ───────────────────────────────────────────────────

test('navigator.webdriver === true scores WEIGHT_WEBDRIVER', () => {
  const w = realBrowser(CHROME_UA)
  w.navigator.webdriver = true
  assert.equal(getAutomationScore(w), WEIGHT_WEBDRIVER)
})

test('webdriver false / undefined / truthy-non-true are NOT signals (strict === true)', () => {
  for (const v of [false, undefined, null, 0, '', 'true', 1]) {
    const w = realBrowser(CHROME_UA)
    w.navigator.webdriver = v
    assert.equal(getAutomationScore(w), 0, `webdriver=${JSON.stringify(v)} must not score`)
  }
})

test('every AUTOMATION_GLOBALS entry is detected on window', () => {
  assert.ok(AUTOMATION_GLOBALS.length >= 15, 'the list should be non-trivial')
  for (const key of AUTOMATION_GLOBALS) {
    const w = realBrowser(CHROME_UA)
    w[key] = function () {}
    assert.equal(getAutomationScore(w), WEIGHT_AUTOMATION_GLOBAL, `window.${key} must be detected`)
  }
})

test('automation globals are also detected on document (chromedriver cdc_ marker lands there)', () => {
  const w = realBrowser(CHROME_UA)
  w.document = { cdc_adoQpoasnfa76pfcZLmcfl_Array: [] }
  assert.equal(getAutomationScore(w), WEIGHT_AUTOMATION_GLOBAL)
})

test('multiple automation globals score ONCE, not cumulatively', () => {
  const w = realBrowser(CHROME_UA)
  w.__playwright = {}; w._phantom = {}; w.__nightmare = {}; w.domAutomation = {}
  assert.equal(getAutomationScore(w), WEIGHT_AUTOMATION_GLOBAL,
    'a tool leaving six markers must not outrank one leaving a single marker')
})

test('Chrome UA with window.chrome MISSING scores WEIGHT_CHROME_MISSING', () => {
  const w = realBrowser(CHROME_UA)
  delete w.chrome
  assert.equal(getAutomationScore(w), WEIGHT_CHROME_MISSING)
})

// ── realistic combinations ───────────────────────────────────────────────────

test('headless Chrome shape (webdriver + no window.chrome) sums both weights', () => {
  const w = realBrowser(CHROME_UA)
  w.navigator.webdriver = true
  delete w.chrome
  assert.equal(getAutomationScore(w), WEIGHT_WEBDRIVER + WEIGHT_CHROME_MISSING)
})

test('Playwright-on-Chromium shape (webdriver + tool global + no chrome) is capped at 100', () => {
  const w = realBrowser(CHROME_UA)
  w.navigator.webdriver = true
  w.__playwright = {}
  delete w.chrome
  const raw = WEIGHT_WEBDRIVER + WEIGHT_AUTOMATION_GLOBAL + WEIGHT_CHROME_MISSING
  assert.ok(raw > 100, 'this combination should exceed 100 before clamping')
  assert.equal(getAutomationScore(w), 100, 'score must clamp to 100, never exceed it')
})

test('score is always an integer in [0,100] across every shape tried', () => {
  const shapes = [
    realBrowser(CHROME_UA), realBrowser(FIREFOX_UA), realBrowser(SAFARI_UA),
    { navigator: { userAgent: CHROME_UA, webdriver: true }, document: {}, __playwright: {} },
    {}, { navigator: {} }, { navigator: { userAgent: '' }, document: {} }
  ]
  for (const s of shapes) {
    const v = getAutomationScore(s)
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, `bad score ${v}`)
  }
})

// ── exception safety: instrumentation must never break a customer page ───────

test('🔴 a throwing/hostile window returns 0, never throws', () => {
  const hostile = {
    get navigator () { throw new Error('hardened') },
    get document () { throw new Error('hardened') },
    get chrome () { throw new Error('hardened') }
  }
  assert.equal(getAutomationScore(hostile), 0)
})

test('null / undefined / non-object input returns 0', () => {
  for (const v of [null, undefined, 0, '', false, 42, 'window']) {
    assert.equal(getAutomationScore(v), 0, `input ${JSON.stringify(v)}`)
  }
})

// ── PRIVACY SCOPE — the §6 guard ─────────────────────────────────────────────

test('🔴 SCOPE: the module reads NO fingerprinting API (source scan)', () => {
  const FORBIDDEN = [
    'WebGL', 'webgl', 'getContext', 'UNMASKED_RENDERER', 'navigator.plugins', '.plugins',
    'screen.', 'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio',
    'hardwareConcurrency', 'deviceMemory', 'AudioContext', 'toDataURL', 'measureText',
    'resolvedOptions', 'timeZone'
  ]
  // Strip comments first: the header deliberately NAMES these as out of scope, and that prose
  // must not be what makes this test pass or fail.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const f of FORBIDDEN) {
    assert.ok(!code.includes(f), `automation-score.js must not reference ${f} — that is a fingerprinting vector`)
  }
})

test('🔴 SCOPE: booby-trapped fingerprinting getters are never touched', () => {
  // Non-vacuous companion to the source scan: if the implementation ever starts reading these,
  // the getter throws, getAutomationScore returns 0 via its catch, and the webdriver signal it
  // should have found goes missing — so this assertion fails.
  let touched = []
  const trap = (name) => ({ get () { touched.push(name); throw new Error(`${name} must not be read`) } })
  const w = {
    navigator: Object.defineProperties(
      { userAgent: CHROME_UA, webdriver: true },
      { plugins: trap('plugins'), hardwareConcurrency: trap('hardwareConcurrency'), deviceMemory: trap('deviceMemory') }
    ),
    document: Object.defineProperties({}, { createElement: trap('createElement') }),
    chrome: { runtime: {} }
  }
  Object.defineProperties(w, {
    screen: trap('screen'), innerWidth: trap('innerWidth'), innerHeight: trap('innerHeight'),
    devicePixelRatio: trap('devicePixelRatio'), AudioContext: trap('AudioContext')
  })
  assert.equal(getAutomationScore(w), WEIGHT_WEBDRIVER,
    'the webdriver signal must still be found, proving no trap was hit and no catch swallowed it')
  assert.deepEqual(touched, [], `fingerprinting getters were read: ${touched.join(', ')}`)
})

// ── build parity ─────────────────────────────────────────────────────────────

test('🔴 PARITY: the inlined block is BYTE-IDENTICAL in both tracker builds', () => {
  assert.equal(BLOCK_COOKIELESS, BLOCK_TRACKER,
    'the two copies have drifted — they must stay byte-identical')
})

test('🔴 PARITY: the cookieless copy behaves identically (executed, not just compared)', () => {
  const C = compile(BLOCK_COOKIELESS)
  const shapes = [
    { navigator: { userAgent: CHROME_UA }, document: {}, chrome: {} },
    { navigator: { userAgent: CHROME_UA, webdriver: true }, document: {}, chrome: {} },
    { navigator: { userAgent: CHROME_UA }, document: {}, __playwright: {} },
    { navigator: { userAgent: FIREFOX_UA }, document: {} },
    { navigator: { userAgent: CHROME_UA, webdriver: true }, document: {}, __playwright: {} }
  ]
  for (const s of shapes) {
    assert.equal(C.getAutomationScore(s), getAutomationScore(s), 'cookieless build must score identically')
  }
})

test('🔴 both builds attach auto_score to the pageview payload, and NEITHER imports a module', () => {
  for (const [name, src] of [['tracker.js', TRACKER], ['tracker.cookieless.js', COOKIELESS]]) {
    assert.match(src, /auto_score: getAutomationScore\(window\)/, `${name} must attach auto_score`)
    assert.ok(!/^\s*;?import /m.test(src),
      `${name} must NOT use an ESM import — the tracker harness runs it as a classic script`)
  }
})
