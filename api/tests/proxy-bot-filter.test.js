// The ingestion bot filter must be wired to the BROWSER-FACING metering rails, and
// must NOT be wired to the server-to-server one.
//
// WHY THIS EXISTS. isIngestionBotUserAgent had exactly ONE call site repo-wide
// (track.js:171) while three other routes metered $pageview unfiltered. That was an
// ACCIDENT OF SCOPE, not a decision: proxy.js landed 2026-05-16, and bot-filter.js was
// consolidated 2026-07-07 as an explicitly "pure refactor" of the regex "duplicated
// byte-for-byte in track.js and analytics.js". proxy.js never had a copy to consolidate,
// so the refactor had no reason to look at it.
//
// ⚠️ THE MOST VALUABLE TEST IN THIS FILE IS THE ONE THAT ASSERTS A ROUTE IS *NOT*
// FILTERED. server-events.js is server-to-server — its callers are customer BACKENDS,
// whose User-Agents are HTTP libraries that INGESTION_BOT_UA_PATTERN matches by design.
// Wiring the filter there would drop essentially every legitimate server-side event,
// irreversibly. That is the 2026-07-14 failure mode, and this guard is what stops a
// future reader "completing the set".
//
// SCOPE: these assert the WIRING (which routes call the predicate) and the PREDICATE'S
// DECISION for representative UAs. They deliberately do not boot Express — each route
// needs Supabase, a live site row and a quota RPC before reaching the filter, so an
// end-to-end test would be asserting the DB rather than the filter.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isIngestionBotUserAgent } from '../lib/bot-filter.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(REPO, p), 'utf8')

// ⚠️ STRIP COMMENTS BEFORE ASSERTING ABSENCE. The first version of the
// server-events guard below failed against its own documentation: the comment
// explaining WHY that route is unfiltered names isIngestionBotUserAgent, so a raw
// `doesNotMatch` on the file text fired on prose rather than code. Same defect the
// v3 lift scanner hit when it matched the token names in its own header. A guard
// that cannot tell a call site from a sentence about a call site is not measuring
// what it claims to.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
  .replace(/(^|[^:])\/\/.*$/gm, '$1')    // line comments, without eating https://

const PROXY = read('api/routes/proxy.js')
const SERVER_EVENTS_RAW = read('api/routes/server-events.js')
const SERVER_EVENTS = stripComments(SERVER_EVENTS_RAW)
const TRACK = read('api/routes/track.js')

const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const HEADLESS = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0.0.0 Safari/537.36'
const HUMAN =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36'
const WHATSAPP_HUMAN =
  'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/119.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.24.82 A'
const SERVER_CLIENT = 'axios/1.6.2'

// ── /sp/e ────────────────────────────────────────────────────────────────────────
test('/sp/e — a JS-executing bot UA is rejected', () => {
  assert.equal(isIngestionBotUserAgent(GOOGLEBOT), true, 'googlebot must be dropped')
  assert.equal(isIngestionBotUserAgent(HEADLESS), true, 'headless chrome must be dropped')
})

test('/sp/e — 🔴 POSITIVE CONTROL: a human UA passes', () => {
  // A filter that rejects everything proves nothing. This is the pair that makes the
  // rejection above meaningful.
  assert.equal(isIngestionBotUserAgent(HUMAN), false, 'a real browser must be ingested')
  assert.equal(isIngestionBotUserAgent(WHATSAPP_HUMAN), false,
    'a human in the WhatsApp in-app WebView must be ingested — the token collides, the human is real')
})

test('/sp/e — the route is actually WIRED to the predicate', () => {
  assert.match(PROXY, /import \{[^}]*isIngestionBotUserAgent[^}]*\} from '\.\.\/lib\/bot-filter\.js'/,
    'proxy.js must import isIngestionBotUserAgent')
  assert.match(PROXY, /route=proxy\/e/, 'the /sp/e drop must log with a proxy/e route tag')
})

// ── /sp/pixel ────────────────────────────────────────────────────────────────────
test('/sp/pixel — a JS-executing bot UA is rejected', () => {
  assert.equal(isIngestionBotUserAgent(GOOGLEBOT), true, 'googlebot must be dropped on the pixel rail too')
})

test('/sp/pixel — 🔴 POSITIVE CONTROL: a human UA passes', () => {
  assert.equal(isIngestionBotUserAgent(HUMAN), false, 'a real browser must be ingested')
})

test('/sp/pixel — the route is actually WIRED to the predicate', () => {
  assert.match(PROXY, /route=proxy\/pixel/, 'the /sp/pixel drop must log with a proxy/pixel route tag')
  // Both rails must gate, not just one — two call sites, not one.
  const calls = (PROXY.match(/isIngestionBotUserAgent\(ua\)/g) || []).length
  assert.equal(calls, 2, `expected the predicate to gate BOTH proxy rails, found ${calls} call site(s)`)
})

// ── the filter must not be $pageview-gated ───────────────────────────────────────
test('the proxy filter drops EVERY bot event, not only $pageview', () => {
  // track.js:171 drops all bot events; only its METER (track.js:400) is $pageview-gated.
  // If the proxy filter were gated too, a bot's custom event would pass /sp/e while
  // /api/track rejects it — two policies instead of one, which is the defect this change
  // exists to remove, reintroduced one layer down.
  const guard = PROXY.match(/if \(isIngestionBotUserAgent\(ua\)\) \{/g) || []
  assert.equal(guard.length, 2, 'both guards must be unconditional `if (isIngestionBotUserAgent(ua))`')
  assert.doesNotMatch(PROXY, /event === '\$pageview'[\s\S]{0,120}isIngestionBotUserAgent/,
    'the bot filter must NOT sit inside a $pageview branch')
  // And the reference implementation genuinely is ungated, so this mirrors it rather
  // than inventing a shape.
  assert.doesNotMatch(TRACK, /\$pageview'[\s\S]{0,80}isIngestionBotUserAgent\(ua\)/,
    "track.js's filter is not $pageview-gated either — if this fails, the reference moved")
})

// ── 🔴 THE REGRESSION GUARD — the most valuable test here ────────────────────────
test('🔴 server-events.js must NOT filter — an axios/1.6 UA must be INGESTED', () => {
  // The predicate itself DOES match this UA — that is the whole hazard.
  assert.equal(isIngestionBotUserAgent(SERVER_CLIENT), true,
    'sanity: the ingestion pattern does match axios/, which is exactly why this route must not use it')

  // ...so the route must not call it. A customer backend posting with axios, python-requests,
  // okhttp, curl or go-http is a LEGITIMATE server-to-server event, and dropping it would be
  // silent and irreversible (§6).
  assert.doesNotMatch(SERVER_EVENTS, /isIngestionBotUserAgent/,
    'server-events.js must NOT import or call the ingestion bot filter — its callers are ' +
    'customer BACKENDS, whose UAs are HTTP libraries the pattern matches by design. ' +
    'Wiring it here would drop essentially every legitimate server-side event. ' +
    'If you added it to "complete the set", the filter is the bug, not this test.')
  assert.doesNotMatch(SERVER_EVENTS, /isBotUserAgent/,
    'and not the reporting predicate either')
})

test('server-events.js records WHY it is unfiltered, so the omission is a decision', () => {
  // An unexplained absence invites completion. The comment is what turns it into a
  // stated decision — which is the entire lesson of the premise check that found it.
  assert.match(SERVER_EVENTS_RAW, /DO NOT "COMPLETE THE SET"/,
    'the deliberate-exclusion comment must be present at the metering gate')
  assert.match(SERVER_EVENTS_RAW, /SERVER-TO-SERVER/, 'and must name the reason')
})

test('🔴 CONTROL — the comment-stripper actually strips, and does not over-strip', () => {
  // Without this, stripComments could return '' and every doesNotMatch above would pass
  // vacuously — a guard that cannot fail, which is the class this repo keeps finding.
  assert.doesNotMatch(stripComments('// isIngestionBotUserAgent in a comment'), /isIngestionBotUserAgent/,
    'a commented mention must be stripped')
  assert.match(stripComments('if (isIngestionBotUserAgent(ua)) return'), /isIngestionBotUserAgent/,
    'a REAL call site must survive stripping — otherwise the guard passes on everything')
  assert.match(stripComments("const u = 'https://x.example/y'"), /https:\/\/x\.example/,
    'a URL must not be eaten as a line comment')
  assert.ok(SERVER_EVENTS.length > 500,
    'the stripped file must still have substance — an empty string would pass every absence check')
})
