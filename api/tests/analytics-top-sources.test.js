import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceFromEvent, topSourcesByVisitor } from '../lib/channel-classifier.js'

// Own-domain matcher stub (per-site in production via buildOwnDomainMatcher).
const isOwnDomain = (host) => host === 'mysite.com' || host === 'www.mysite.com'

// ─── Axis (b): SOURCE/ENGINE classification, NOT channel bucketing ───────────
test('sourceFromEvent: Bing referrer yields the engine host, NOT "Organic Search"', () => {
  const src = sourceFromEvent({ referrer: 'https://www.bing.com/search?q=x' }, { isOwnDomain })
  assert.equal(src, 'bing.com')
  assert.notEqual(src, 'Organic Search') // the bug this PR fixes
})

test('sourceFromEvent: Google referrer normalizes to "google"', () => {
  assert.equal(sourceFromEvent({ referrer: 'https://www.google.com/' }, { isOwnDomain }), 'google')
})

test('sourceFromEvent: own-domain referrer is Direct (internal navigation)', () => {
  assert.equal(sourceFromEvent({ referrer: 'https://mysite.com/pricing' }, { isOwnDomain }), 'Direct')
})

test('sourceFromEvent: ai_source takes precedence and is prefixed', () => {
  assert.equal(sourceFromEvent({ ai_source: 'ChatGPT', referrer: 'https://bing.com' }, { isOwnDomain }), 'AI: ChatGPT')
})

test('sourceFromEvent: utm_source wins over referrer and is lowercased', () => {
  assert.equal(sourceFromEvent({ utm_source: 'Newsletter', referrer: 'https://bing.com' }, { isOwnDomain }), 'newsletter')
})

test('sourceFromEvent: no referrer / utm / ai => Direct', () => {
  assert.equal(sourceFromEvent({}, { isOwnDomain }), 'Direct')
})

// ─── Axis (a): visitor-denominated counting, NOT pageview counting ───────────
test('topSourcesByVisitor: 2 pageviews from ONE visitor on Bing => visits=1, not 2', () => {
  const rows = [
    { referrer: 'https://bing.com/', anonymous_id: 'v1' },
    { referrer: 'https://bing.com/', anonymous_id: 'v1' }, // same visitor, 2nd pageview
  ]
  const out = topSourcesByVisitor(rows, { isOwnDomain })
  const bing = out.find(r => r.source === 'bing.com')
  assert.ok(bing, 'expected a bing.com row')
  assert.equal(bing.visits, 1, 'must count unique visitors (1), not pageviews (2)')
})

test('topSourcesByVisitor: distinct visitors on same source both counted', () => {
  const rows = [
    { referrer: 'https://bing.com/', anonymous_id: 'v1' },
    { referrer: 'https://bing.com/', anonymous_id: 'v2' },
    { referrer: 'https://bing.com/', anonymous_id: 'v2' },
  ]
  const out = topSourcesByVisitor(rows, { isOwnDomain })
  assert.equal(out.find(r => r.source === 'bing.com').visits, 2)
})

test('topSourcesByVisitor: matches observed prod split (Bing engine + Direct), visitor units', () => {
  // techrupt.pk repro: 1 Bing visitor + 1 direct visitor with multiple pageviews.
  const rows = [
    { referrer: 'https://bing.com/', anonymous_id: 'visitorA' },
    { referrer: null, anonymous_id: 'visitorB' },
    { referrer: null, anonymous_id: 'visitorB' },
  ]
  const out = topSourcesByVisitor(rows, { isOwnDomain })
  const byName = Object.fromEntries(out.map(r => [r.source, r.visits]))
  assert.equal(byName['bing.com'], 1)
  assert.equal(byName['Direct'], 1)
  assert.ok(!('Organic Search' in byName), 'must not bucket engines into channels')
})
