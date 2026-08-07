// /api/analytics/collect must use the INGESTION bot filter, not the REPORTING one.
//
// THE DEFECT THIS PINS. analytics.js:226 called isBotUserAgent — the REPORTING
// predicate over BOT_UA_PATTERN — and dropped on it at INGESTION. bot-filter.js:47
// says exactly why that is wrong:
//
//   "BOT_UA_PATTERN above is the REPORTING filter; applying it at INGESTION deleted
//    real humans. ... these tokens must NOT gate ingestion — keeping them DELETES
//    human events (200, gone forever, no PostHog fallback). Systematic loss on a
//    WhatsApp-dominant .pk site."
//
// So the route contradicted the module it imported from. A WRONG-FUNCTION bug, not a
// threshold choice — the correct function already existed for this purpose.
//
// ⚠️ THERE IS DELIBERATELY NO TEST PINNING THE OLD BEHAVIOUR. A test asserting that a
// whatsapp UA is dropped would have enshrined the defect and made the fix look like a
// regression. The absence is the point.
//
// WHY THIS FILE TESTS THE PREDICATES RATHER THAN BOOTING THE ROUTE: /api/analytics/collect
// needs Supabase, a live site row and a quota RPC before it reaches the filter, so an
// end-to-end test would assert the DB, not the filter. The filter is a pure function of the
// UA string and the route's only decision point is `if (<predicate>(ua)) return`. So the
// contract under test is: which predicate does the route import, and what does it decide.
// Both halves are checked — the wiring by reading the source, the decision by calling it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isIngestionBotUserAgent, isBotUserAgent } from '../lib/bot-filter.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROUTE = readFileSync(join(REPO, 'api/routes/analytics.js'), 'utf8')

// Real UA of a human opening a link inside the WhatsApp in-app WebView. This person
// runs the tracker, is a genuine visitor, and was being discarded.
const WHATSAPP_HUMAN =
  'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/119.0.0.0 Mobile Safari/537.36 WhatsApp/2.23.24.82 A'
const TELEGRAM_HUMAN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.1 Mobile/15E148 Safari/604.1 TelegramBot (like TwitterBot)'
// A JS-executing crawler that really does run the tracker and pollute events.
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const PLAIN_HUMAN =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36'

test('THE POINT — a WhatsApp in-app-WebView human is now INGESTED, not dropped', () => {
  assert.equal(isIngestionBotUserAgent(WHATSAPP_HUMAN), false,
    'a human inside the WhatsApp WebView must NOT be treated as a bot at ingestion — ' +
    'this is the event class the route was silently deleting')
  assert.equal(isIngestionBotUserAgent(TELEGRAM_HUMAN), false,
    'same for Telegram: the token collides with a real in-app browser')
})

test('🔴 POSITIVE CONTROL — the OLD predicate really did drop those humans', () => {
  // Without this, "the fix works" is unfalsifiable: if both predicates behaved the same,
  // the swap would be a no-op and the test above would pass for the wrong reason.
  assert.equal(isBotUserAgent(WHATSAPP_HUMAN), true,
    'isBotUserAgent MUST reject this UA — if it does not, the defect described in this ' +
    'file never existed and the fix needs re-justifying')
  assert.equal(isBotUserAgent(TELEGRAM_HUMAN), true, 'same for Telegram')
})

test('a JS-executing crawler IS dropped — the filter still filters', () => {
  assert.equal(isIngestionBotUserAgent(GOOGLEBOT), true,
    'Googlebot renders JS and does reach ingestion, so it must be dropped — otherwise ' +
    'the swap traded one failure mode for another')
})

test('googlebot was dropped BEFORE the swap too — the crawler side is unchanged', () => {
  // ⚠️ WRITTEN THE OTHER WAY ROUND FIRST, AND THE CONTROL CAUGHT IT. The original
  // assertion claimed the old predicate missed Googlebot, so dropping it was "new".
  // False: BOT_UA_PATTERN contains a generic `bot` token, which matches the substring
  // "Googlebot" — so the reporting filter dropped it all along, by accident of a broad
  // token rather than by naming the agent.
  //
  // This matters for how the change is described. The swap is NOT "we started blocking
  // crawlers". It is "we stopped deleting humans", and the crawler outcome is unchanged
  // for the well-known ones. Overstating the delta would have been a false claim in a
  // commit message — the same class this project keeps catching in marketing copy.
  assert.equal(isBotUserAgent(GOOGLEBOT), true, 'the reporting pattern matched it via `bot`')
  assert.equal(isIngestionBotUserAgent(GOOGLEBOT), true, 'the ingestion pattern names it explicitly')
})

test('what IS genuinely newly dropped: HTTP libraries and scanners', () => {
  // These carry no `bot`/`crawl`/`spider` substring, so the reporting pattern missed them
  // entirely. They are the real behaviour delta on the drop side, and they are all
  // non-JS-executing clients that cannot be a browser running the tracker.
  for (const ua of ['okhttp/4.12.0',
                    'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
                    'Nuclei - Open-source project (github.com/projectdiscovery/nuclei)']) {
    assert.equal(isBotUserAgent(ua), false, `reporting pattern missed: ${ua}`)
    assert.equal(isIngestionBotUserAgent(ua), true, `ingestion pattern must catch: ${ua}`)
  }
})

test('NEGATIVE CONTROL — an ordinary human passes both', () => {
  // A filter that rejects everything is not a filter. Guards against a future edit
  // making the predicate over-fire.
  assert.equal(isIngestionBotUserAgent(PLAIN_HUMAN), false, 'a plain Chrome UA must be ingested')
  assert.equal(isBotUserAgent(PLAIN_HUMAN), false, 'and must not be a reporting bot either')
})

test('the route is WIRED to the ingestion predicate, not the reporting one', () => {
  // The predicates above could be perfect while the route calls the wrong one — which is
  // precisely the bug this file exists for. Assert the wiring, not just the behaviour.
  assert.match(ROUTE, /import \{[^}]*isIngestionBotUserAgent[^}]*\} from '\.\.\/lib\/bot-filter\.js'/,
    'analytics.js must import isIngestionBotUserAgent')
  assert.match(ROUTE, /if \(isIngestionBotUserAgent\(ua\)\) return res\.json\(\{ ok: true \}\)/,
    'the collect handler must gate on isIngestionBotUserAgent')
  assert.doesNotMatch(ROUTE, /if \(isBotUserAgent\(ua\)\)/,
    'analytics.js must not gate ingestion on the REPORTING predicate — see bot-filter.js:47')
})
