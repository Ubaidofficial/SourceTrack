// Incident 2026-07-14: BOT_UA_PATTERN (the REPORTING filter) was applied at INGESTION (track.js),
// so a real human in the WhatsApp/Telegram in-app WebView was dropped — /api/track returned 200 and
// the event was deleted forever (no PostHog fallback). Reproduced through the real handler in
// scratchpad/repro-whatsapp-drop.mjs (status=200 filtered=bot).
//
// The fix splits the filter: isIngestionBotUserAgent is PERMISSIVE (drops only headless automation +
// non-browser HTTP libraries, no crawler tokens), while isBotUserAgent stays STRICT for reporting.
// This battery is the guard: EVERY real browser and in-app WebView MUST pass ingestion; known
// automation/HTTP-library UAs MUST still be dropped at ingestion; and the strict reporting filter MUST
// still catch the crawlers ingestion now lets through. A regression that re-adds a human-colliding
// token to the ingestion pattern fails here.

import test from 'node:test'
import assert from 'node:assert'
import { isIngestionBotUserAgent, isBotUserAgent } from '../lib/bot-filter.js'

// Real humans — desktop/mobile browsers AND in-app WebViews. Every one is a genuine conversion source.
const HUMANS = {
  'Chrome desktop':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Safari macOS':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Firefox':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Edge':             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Opera':            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
  'Brave':            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'iPhone Safari':    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Android Chrome':   'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Samsung Internet': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  // In-app WebViews — where real humans tap a link and submit a form:
  'WhatsApp in-app':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.23.20.0',
  'Telegram in-app':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram',
  'Facebook in-app':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/440.0.0.0.0]',
  'Instagram in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0 (iPhone; iOS 17_0)',
  'Messenger in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/MessengerForiOS;FBAV/440.0]',
  'LINE in-app':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/13.19.0',
  'WeChat in-app':    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.42(0x18002a2f) NetType/WIFI',
  'Snapchat in-app':  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Snapchat/12.60.0.40',
  'TikTok in-app':    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 musical_ly_2023 BytedanceWebview/d8a21c6',
  'Twitter/X in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Twitter for iPhone',
  'Pinterest in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Pinterest for iOS/11.40',
  'KakaoTalk in-app': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 10.4.5',
}

// Non-humans that CAN reach /api/track and are safe to drop at ingestion (automation + HTTP libs).
const INGESTION_BOTS = {
  'HeadlessChrome': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  'Puppeteer':      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 puppeteer',
  'Playwright':     'Mozilla/5.0 (X11; Linux x86_64) Playwright/1.40',
  'Selenium':       'Mozilla/5.0 selenium webdriver',
  'curl':           'curl/8.4.0',
  'wget':           'Wget/1.21.4',
  'python-requests':'python-requests/2.31.0',
  'Java HTTP':      'Java/17.0.1',
  'Go http':        'Go-http-client/2.0',
  'scrapy':         'Scrapy/2.11 (+https://scrapy.org)',
  'nuclei':         'Nuclei - Open-source project (github.com/projectdiscovery/nuclei)',
  'empty UA':       '',
}

// JS-RENDERING bots — Googlebot (Web Rendering Service / evergreen Chromium), Bingbot, Applebot.
// They EXECUTE JavaScript, so they run the tracker and DO POST to /api/track. They MUST be dropped at
// ingestion or their renders land in `events` as fake visitors and pollute visitor/session/top-page
// counts. This is the invariant that the "crawlers don't run JS" heuristic got wrong.
const JS_RENDERING_BOTS = {
  'Googlebot': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Bingbot':   'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36',
  'Applebot':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
}

// No-JS crawlers — link-preview unfurlers / SEO fetchers that DON'T run JS, so they never reach
// /api/track. The strict REPORTING filter still catches them (analytics exclusion); ingestion is
// indifferent (they never arrive), so we assert reporting only.
const NO_JS_CRAWLERS = {
  'facebookexternalhit': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'WhatsApp preview':    'WhatsApp/2.23.20.0 A',
  'AhrefsBot':           'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
}

test('INGESTION: every real browser and in-app WebView PASSES (never deleted at /api/track)', () => {
  for (const [name, ua] of Object.entries(HUMANS)) {
    assert.strictEqual(isIngestionBotUserAgent(ua), false, `${name} must NOT be dropped at ingestion — a dropped event is gone forever`)
  }
})

test('INGESTION: headless automation + non-browser HTTP libraries are still dropped', () => {
  for (const [name, ua] of Object.entries(INGESTION_BOTS)) {
    assert.strictEqual(isIngestionBotUserAgent(ua), true, `${name} should be dropped at ingestion`)
  }
})

// The core invariant the founder named: JS-rendering bots DROP at ingestion, every in-app WebView PASSES.
test('INVARIANT: JS-rendering bots (Googlebot/Bingbot/Applebot) are DROPPED at ingestion; in-app WebViews PASS', () => {
  for (const [name, ua] of Object.entries(JS_RENDERING_BOTS)) {
    assert.strictEqual(isIngestionBotUserAgent(ua), true, `${name} renders JS and hits /api/track — must be dropped or it pollutes events as a fake visitor`)
  }
  // Same request shape from a human in-app WebView must NOT be dropped.
  for (const [name, ua] of Object.entries(HUMANS)) {
    assert.strictEqual(isIngestionBotUserAgent(ua), false, `${name} is a real human — must pass`)
  }
})

test('REPORTING (unchanged): the strict filter still catches ALL bots (JS-rendering + no-JS crawlers)', () => {
  for (const [name, ua] of Object.entries({ ...JS_RENDERING_BOTS, ...NO_JS_CRAWLERS })) {
    assert.strictEqual(isBotUserAgent(ua), true, `${name} must still be caught by the reporting filter`)
  }
})

test('the WhatsApp incident is fixed: strict DROPS it, permissive KEEPS it', () => {
  const wa = HUMANS['WhatsApp in-app']
  assert.strictEqual(isBotUserAgent(wa), true, 'reporting filter still classifies the WhatsApp token')
  assert.strictEqual(isIngestionBotUserAgent(wa), false, 'ingestion filter no longer deletes the WhatsApp human')
})
