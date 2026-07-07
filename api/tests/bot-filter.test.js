import test from 'node:test'
import assert from 'node:assert'

import {
  BOT_UA_PATTERN,
  isBotUserAgent,
  isBotRequest,
  coarseUaHash,
  logWouldDropBot
} from '../lib/bot-filter.js'

// Helper — build a minimal Express-like req from a UA + optional headers.
function reqOf(ua, headers = {}) {
  return { headers: { ...(ua != null ? { 'user-agent': ua } : {}), ...headers } }
}

// Real-browser header set (Accept + Accept-Language always present).
const BROWSER_HEADERS = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br'
}

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const OLD_FIREFOX_UA = 'Mozilla/5.0 (Windows NT 6.1; rv:52.0) Gecko/20100101 Firefox/52.0'

test('bot-filter — 8 orchestrator smoke cases', async (t) => {
  await t.test('1. curl → bot (ua_pattern)', () => {
    const r = isBotRequest(reqOf('curl/8.4.0'))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'ua_pattern')
  })

  await t.test('2. empty UA → bot (ua_empty)', () => {
    const r = isBotRequest(reqOf(''))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'ua_empty')
  })

  await t.test('3. Googlebot → bot (ua_pattern)', () => {
    const r = isBotRequest(reqOf('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'ua_pattern')
  })

  await t.test('4. GPTBot → bot (ua_pattern)', () => {
    const r = isBotRequest(reqOf('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot'))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'ua_pattern')
  })

  await t.test('5. scrapy → bot (ua_extra, NEW signal)', () => {
    const r = isBotRequest(reqOf('Scrapy/2.11.0 (+https://scrapy.org)'))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'ua_extra')
  })

  await t.test('6. real Chrome with headers → human', () => {
    const r = isBotRequest(reqOf(CHROME_UA, BROWSER_HEADERS))
    assert.strictEqual(r.bot, false)
    assert.strictEqual(r.reason, null)
  })

  await t.test('7. spoofed browser UA, no headers → bot (header_shape, NEW signal)', () => {
    const r = isBotRequest(reqOf(CHROME_UA))
    assert.strictEqual(r.bot, true)
    assert.strictEqual(r.reason, 'header_shape')
  })

  await t.test('8. older Firefox with headers → human', () => {
    const r = isBotRequest(reqOf(OLD_FIREFOX_UA, BROWSER_HEADERS))
    assert.strictEqual(r.bot, false)
    assert.strictEqual(r.reason, null)
  })
})

test('bot-filter — UA-layer refactor is behavior-identical', async (t) => {
  // isBotUserAgent must exactly reproduce the old `!ua || BOT_UA_PATTERN.test(ua)`
  // condition used by track.js and analytics.js.
  await t.test('empty / missing UA drops', () => {
    assert.strictEqual(isBotUserAgent(''), true)
    assert.strictEqual(isBotUserAgent(undefined), true)
  })
  await t.test('known crawler drops', () => {
    assert.strictEqual(isBotUserAgent('curl/8.4.0'), true)
    assert.strictEqual(isBotUserAgent('Googlebot/2.1'), true)
  })
  await t.test('real browser passes', () => {
    assert.strictEqual(isBotUserAgent(CHROME_UA), false)
    assert.strictEqual(isBotUserAgent(OLD_FIREFOX_UA), false)
  })
  await t.test('scrapy is NOT in the UA drop layer (log-only via isBotRequest)', () => {
    // ua_extra is a NEW, unvalidated signal — it must not affect the drop layer.
    assert.strictEqual(isBotUserAgent('Scrapy/2.11.0'), false)
  })
})

test('bot-filter — BOT_UA_PATTERN kept byte-identical to production regex', () => {
  const EXPECTED_SOURCE = 'bot|crawl|spider|slurp|mediapartners|adsbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|bingpreview|googleweblight|lighthouse|pagespeed|headlesschrome|phantomjs|selenium|puppeteer|playwright|wget|curl\\/|python-requests|axios\\/|go-http|java\\/|ruby\\/|php\\/|google-extended|headless'
  assert.strictEqual(BOT_UA_PATTERN.source, EXPECTED_SOURCE)
  assert.strictEqual(BOT_UA_PATTERN.flags, 'i')
})

test('bot-filter — coarse UA hash is stable, non-empty, and not the raw UA', () => {
  const h1 = coarseUaHash(CHROME_UA)
  const h2 = coarseUaHash(CHROME_UA)
  assert.strictEqual(h1, h2)
  assert.strictEqual(h1.length, 12)
  assert.notStrictEqual(h1, CHROME_UA)
  // Different UAs bucket to different hashes.
  assert.notStrictEqual(coarseUaHash(CHROME_UA), coarseUaHash(OLD_FIREFOX_UA))
})

test('bot-filter — fail-open, never throws on malformed input', () => {
  // Missing/empty request → safe classification, no throw. (Not the catch path:
  // optional chaining yields an empty UA, which reads as ua_empty.)
  assert.deepStrictEqual(isBotRequest(null), { bot: true, reason: 'ua_empty' })
  assert.deepStrictEqual(isBotRequest({}), { bot: true, reason: 'ua_empty' })

  // A req whose header access THROWS must fail open (never drop/flag).
  const throwing = { get headers() { throw new Error('boom') } }
  assert.deepStrictEqual(isBotRequest(throwing), { bot: false, reason: null })
  assert.deepStrictEqual(logWouldDropBot('track', throwing), { bot: false, reason: null })
})

test('bot-filter — logWouldDropBot only logs NEW signals, never drops', () => {
  const logs = []
  const orig = console.log
  console.log = (...args) => logs.push(args.join(' '))
  try {
    // NEW signal → one log line, classification returned.
    const extra = logWouldDropBot('track', reqOf('Scrapy/2.11.0'))
    assert.strictEqual(extra.reason, 'ua_extra')

    // Already-dropped-today signals must NOT be logged by the measurement wiring.
    logWouldDropBot('track', reqOf('curl/8.4.0'))
    logWouldDropBot('track', reqOf(''))

    // Human traffic → no log.
    logWouldDropBot('track', reqOf(CHROME_UA, BROWSER_HEADERS))
  } finally {
    console.log = orig
  }
  const wouldDrop = logs.filter(l => l.includes('[bot-filter][would-drop]'))
  assert.strictEqual(wouldDrop.length, 1)
  assert.ok(wouldDrop[0].includes('ua_extra'))
  assert.ok(wouldDrop[0].includes('"route":"track"'))
  assert.ok(wouldDrop[0].includes('ua_hash'))
})
