// Guards for api/lib/ai-crawler-detect.js.
//
// The load-bearing invariant is HONESTY OF VERIFICATION: a UA is a free-text
// header, so a result may only claim `ip_verified` when an IP was actually
// checked against a published range and matched. Everything else must remain
// visibly weaker. A regression that collapses the three weaker states into one
// "verified-ish" value fails here.
//
// The second trap is MATCH ORDERING. Several tokens are substrings of others
// (Googlebot / Google-InspectionTool; GPTBot / ChatGPT-User). First-match-wins
// means a careless reorder silently misattributes one vendor's traffic to
// another, which is exactly the kind of bug that looks fine in aggregate.

import test from 'node:test'
import assert from 'node:assert'
import {
  detectAiCrawler,
  verificationCoverage,
  ipInCidr,
  AI_CRAWLERS,
  VERIFICATION,
  CATEGORY,
  RANGE_SOURCE
} from '../lib/ai-crawler-detect.js'

// Real-world UA strings as these crawlers actually send them.
const UAS = {
  gptbot:        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
  chatgptUser:   'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  oaiSearch:     'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  claudebot:     'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com',
  perplexity:    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot',
  googlebot:     'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  inspection:    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
  bingbot:       'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ccbot:         'Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)',
  metaExternal:  'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  mistralIndex:  'MistralAI-Index/1.0',
  ahrefs:        'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  chromeHuman:   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
}

test('identifies each vendor crawler by UA token', () => {
  const expected = [
    [UAS.gptbot,       'GPTBot',                'OpenAI',       CATEGORY.LLM_CRAWLER],
    [UAS.chatgptUser,  'ChatGPT-User',          'OpenAI',       CATEGORY.AI_ASSISTANT],
    [UAS.oaiSearch,    'OAI-SearchBot',         'OpenAI',       CATEGORY.AI_SEARCH],
    [UAS.claudebot,    'ClaudeBot',             'Anthropic',    CATEGORY.LLM_CRAWLER],
    [UAS.perplexity,   'PerplexityBot',         'Perplexity',   CATEGORY.AI_SEARCH],
    [UAS.googlebot,    'Googlebot',             'Google',       CATEGORY.SEARCH_ENGINE],
    [UAS.inspection,   'Google-InspectionTool', 'Google',       CATEGORY.SEARCH_ENGINE],
    [UAS.bingbot,      'Bingbot',               'Microsoft',    CATEGORY.SEARCH_ENGINE],
    [UAS.ccbot,        'CCBot',                 'Common Crawl', CATEGORY.LLM_CRAWLER],
    [UAS.metaExternal, 'Meta-ExternalAgent',    'Meta',         CATEGORY.LLM_CRAWLER],
    [UAS.mistralIndex, 'MistralAI-Index',       'Mistral',      CATEGORY.AI_SEARCH],
    [UAS.ahrefs,       'AhrefsBot',             'Ahrefs',       CATEGORY.SEO_TOOL]
  ]
  for (const [ua, name, operator, category] of expected) {
    const got = detectAiCrawler(ua)
    assert.ok(got, `expected a match for ${name}`)
    assert.equal(got.name, name)
    assert.equal(got.operator, operator)
    assert.equal(got.category, category)
  }
})

test('ORDERING: substring tokens do not steal each other\'s traffic', () => {
  // Google-InspectionTool contains neither "Googlebot" nor vice versa, but both
  // begin "Google" — and a naive prefix match would collapse them.
  assert.equal(detectAiCrawler(UAS.inspection).name, 'Google-InspectionTool')
  assert.equal(detectAiCrawler(UAS.googlebot).name, 'Googlebot')
  // "ChatGPT-User" contains "GPT"; GPTBot must not absorb it.
  assert.equal(detectAiCrawler(UAS.chatgptUser).name, 'ChatGPT-User')
  assert.equal(detectAiCrawler(UAS.gptbot).name, 'GPTBot')
})

test('a human browser matches nothing', () => {
  assert.equal(detectAiCrawler(UAS.chromeHuman), null)
})

test('empty / missing UA returns null rather than throwing', () => {
  for (const input of ['', null, undefined, 0, {}]) {
    assert.equal(detectAiCrawler(input), null)
  }
})

// ── Verification honesty ──────────────────────────────────────────────────────

test('no IP supplied never yields ip_verified', () => {
  const got = detectAiCrawler(UAS.gptbot)
  assert.equal(got.verification, VERIFICATION.UA_ONLY)
  assert.equal(got.ipChecked, false)
})

test('ranges supplied but no IP never yields ip_verified', () => {
  const ranges = new Map([['GPTBot', ['20.171.0.0/16']]])
  const got = detectAiCrawler(UAS.gptbot, { ranges })
  assert.equal(got.verification, VERIFICATION.UA_ONLY)
  assert.equal(got.ipChecked, false)
})

test('IP inside a published range verifies', () => {
  const ranges = new Map([['GPTBot', ['20.171.0.0/16', '52.230.152.0/24']]])
  const got = detectAiCrawler(UAS.gptbot, { ip: '20.171.207.15', ranges })
  assert.equal(got.verification, VERIFICATION.IP_VERIFIED)
  assert.equal(got.ipChecked, true)
})

test('SPOOF: GPTBot UA from outside the published range is flagged, not verified', () => {
  const ranges = new Map([['GPTBot', ['20.171.0.0/16']]])
  const got = detectAiCrawler(UAS.gptbot, { ip: '203.0.113.9', ranges })
  assert.equal(got.verification, VERIFICATION.IP_MISMATCH)
  assert.equal(got.ipChecked, true)
  assert.notEqual(got.verification, VERIFICATION.IP_VERIFIED)
})

test('vendors publishing no ranges are labelled distinctly and never verified', () => {
  // Even handed an IP and a bogus range map, a no-ranges vendor cannot be verified.
  const ranges = new Map([['CCBot', ['1.2.3.0/24']]])
  const got = detectAiCrawler(UAS.ccbot, { ip: '1.2.3.4', ranges })
  assert.equal(got.verification, VERIFICATION.UA_ONLY_NO_RANGES_PUBLISHED)
  assert.equal(got.ipChecked, false)
})

test('the four verification states stay distinct', () => {
  const values = new Set(Object.values(VERIFICATION))
  assert.equal(values.size, 4)
  assert.ok(!values.has('verified'), 'no ambiguous catch-all "verified" value')
})

// ── Registry integrity ────────────────────────────────────────────────────────

test('Google-Extended is absent: it is a robots.txt token, not a crawler UA', () => {
  const tokens = AI_CRAWLERS.map((b) => b.token.toLowerCase())
  assert.ok(!tokens.includes('google-extended'))
  // And nothing claiming it should resolve to a Google crawler row.
  assert.equal(detectAiCrawler('Mozilla/5.0 (compatible; Google-Extended)'), null)
})

test('every registry entry carries the fields the data model stores', () => {
  for (const bot of AI_CRAWLERS) {
    assert.ok(bot.token && typeof bot.token === 'string', `${bot.name}: token`)
    assert.ok(bot.name && bot.operator, `${bot.name}: name/operator`)
    assert.ok(Object.values(CATEGORY).includes(bot.category), `${bot.name}: category`)
    assert.equal(typeof bot.executesJs, 'boolean', `${bot.name}: executesJs`)
    assert.ok(Object.values(RANGE_SOURCE).includes(bot.rangeSource), `${bot.name}: rangeSource`)
    // A vendor that publishes JSON ranges must say where.
    if (bot.rangeSource === RANGE_SOURCE.VENDOR_JSON) {
      assert.ok(/^https:\/\//.test(bot.rangeUrl), `${bot.name}: rangeUrl must be https`)
    }
  }
})

test('tokens are unique', () => {
  const tokens = AI_CRAWLERS.map((b) => b.token.toLowerCase())
  assert.equal(new Set(tokens).size, tokens.length)
})

test('coverage report is derived from the registry and marks the ceiling per bot', () => {
  const coverage = verificationCoverage()
  assert.equal(coverage.length, AI_CRAWLERS.length)
  const ccbot = coverage.find((c) => c.name === 'CCBot')
  assert.equal(ccbot.bestPossibleVerification, VERIFICATION.UA_ONLY_NO_RANGES_PUBLISHED)
  const gptbot = coverage.find((c) => c.name === 'GPTBot')
  assert.equal(gptbot.bestPossibleVerification, VERIFICATION.IP_VERIFIED)
})

test('executesJs reflects reality for the JS-rendering search bots', () => {
  // These three are the ONLY entries that can ever reach a JS tracker, and they
  // are precisely the ones bot-filter.js drops at ingestion. This assertion is
  // what makes the collection-path constraint impossible to forget.
  const jsRenderers = AI_CRAWLERS.filter((b) => b.executesJs).map((b) => b.name).sort()
  assert.deepEqual(jsRenderers, ['Bingbot', 'Google-InspectionTool', 'Googlebot'])
})

// ── CIDR matching ─────────────────────────────────────────────────────────────

test('IPv4 CIDR containment', () => {
  assert.ok(ipInCidr('20.171.207.15', '20.171.0.0/16'))
  assert.ok(ipInCidr('192.168.1.1', '192.168.1.1/32'))
  assert.ok(ipInCidr('8.8.8.8', '0.0.0.0/0'))
  assert.ok(!ipInCidr('20.172.0.1', '20.171.0.0/16'))
  assert.ok(!ipInCidr('192.168.1.2', '192.168.1.1/32'))
})

test('IPv6 CIDR containment, including :: compression', () => {
  assert.ok(ipInCidr('2a03:2880:f800::1', '2a03:2880::/29'))
  assert.ok(ipInCidr('2001:4860:4801:10::1', '2001:4860:4801::/48'))
  assert.ok(!ipInCidr('2600:1900::1', '2a03:2880::/29'))
})

test('malformed input returns false instead of throwing', () => {
  const bad = [
    ['not-an-ip', '10.0.0.0/8'],
    ['10.0.0.1', 'garbage'],
    ['10.0.0.1', '10.0.0.0/33'],
    ['10.0.0.1', '10.0.0.0/-1'],
    ['999.1.1.1', '10.0.0.0/8'],
    ['10.0.0.1', ''],
    [null, null],
    // Mixing families must not match.
    ['10.0.0.1', '2a03:2880::/29'],
    ['2a03:2880::1', '10.0.0.0/8']
  ]
  for (const [ip, cidr] of bad) {
    assert.equal(ipInCidr(ip, cidr), false, `${ip} in ${cidr}`)
  }
})
