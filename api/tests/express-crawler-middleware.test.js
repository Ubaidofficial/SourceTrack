import test from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import {
  createCrawlerMiddleware,
  buildPayload,
  safePath,
  clientIpFrom
} from '../../integrations/express-crawler-middleware.js'
import { VERIFICATION } from '../lib/ai-crawler-detect.js'

const GPTBOT_UA = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot'
const HUMAN_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

// Minimal Express doubles. `res` is a real EventEmitter so the middleware's
// `finish` wiring is exercised rather than stubbed.
function makeReq({ ua = GPTBOT_UA, url = '/pricing?utm_source=x', ip = '203.0.113.9', headers = {} } = {}) {
  return { headers: { 'user-agent': ua, ...headers }, originalUrl: url, url, ip }
}
function makeRes(statusCode = 200) {
  const res = new EventEmitter()
  res.statusCode = statusCode
  return res
}
// Drain the setImmediate the middleware defers onto, plus the promise chain.
const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)))

function recordingFetch(impl) {
  const calls = []
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: opts?.body ? JSON.parse(opts.body) : null })
    if (impl) return impl(url, opts)
    return { ok: true, status: 202 }
  }
  fn.calls = calls
  return fn
}

// ── Fire-and-forget ──────────────────────────────────────────────────────────

test('fire-and-forget: next() is called SYNCHRONOUSLY and before any network call', () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })

  let nextCalled = false
  mw(makeReq(), makeRes(), () => { nextCalled = true })

  // Synchronous: true immediately after the call returns, with no await.
  assert.strictEqual(nextCalled, true, 'next() must be synchronous — the request may not wait on us')
  assert.strictEqual(fetchImpl.calls.length, 0, 'no network call may happen in the request path')
})

test('fire-and-forget: nothing is sent until the response has finished', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes(200)

  mw(makeReq(), res, () => {})
  await settle()
  assert.strictEqual(fetchImpl.calls.length, 0, 'must not report before res finished')

  res.emit('finish')
  await settle()
  assert.strictEqual(fetchImpl.calls.length, 1, 'must report once the response is flushed')
})

test('reports the FINAL status code, which is only known at finish time', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes(200)

  mw(makeReq(), res, () => {})
  res.statusCode = 404          // handler decided later, as real handlers do
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls[0].body.status_code, 404)
})

test('a non-crawler user agent produces no report at all', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes()

  mw(makeReq({ ua: HUMAN_UA }), res, () => {})
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls.length, 0)
})

// ── Fail-open ────────────────────────────────────────────────────────────────

test('fail-open: a rejecting fetch never becomes an unhandled rejection', async () => {
  const fetchImpl = recordingFetch(() => { throw new Error('network down') })
  const seen = []
  const mw = createCrawlerMiddleware({
    apiKey: 'k', endpoint: 'https://e/hit', fetchImpl, onError: (e) => seen.push(e)
  })
  const res = makeRes()

  let nextCalled = false
  mw(makeReq(), res, () => { nextCalled = true })
  res.emit('finish')
  await settle()

  assert.strictEqual(nextCalled, true)
  assert.strictEqual(seen.length, 1, 'the error is surfaced to onError, not thrown')
  assert.match(seen[0].message, /network down/)
})

test('fail-open: a throwing onError hook still cannot break the request', async () => {
  const fetchImpl = recordingFetch(() => { throw new Error('boom') })
  const mw = createCrawlerMiddleware({
    apiKey: 'k',
    endpoint: 'https://e/hit',
    fetchImpl,
    onError: () => { throw new Error('the hook itself is broken') }
  })
  const res = makeRes()

  mw(makeReq(), res, () => {})
  res.emit('finish')
  await settle()
  // Reaching here without an unhandled rejection tearing down the test IS the assertion.
  assert.ok(true)
})

test('fail-open: a res with no event API degrades to a pass-through', () => {
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl: recordingFetch() })
  let nextCalled = false
  mw(makeReq(), { statusCode: 200 }, () => { nextCalled = true })
  assert.strictEqual(nextCalled, true)
})

test('fail-open: missing apiKey/endpoint installs a no-op, never a boot throw', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ fetchImpl })   // no credentials at all
  const res = makeRes()

  let nextCalled = false
  mw(makeReq(), res, () => { nextCalled = true })
  res.emit('finish')
  await settle()

  assert.strictEqual(nextCalled, true)
  assert.strictEqual(fetchImpl.calls.length, 0)
})

test('fail-open: a malformed request object cannot strand the request', () => {
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl: recordingFetch() })
  let nextCalled = false
  mw(null, makeRes(), () => { nextCalled = true })
  assert.strictEqual(nextCalled, true)
})

// ── No PII in the payload ────────────────────────────────────────────────────

test('payload carries the verdict only — no IP, UA, query, headers or cookies', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes(200)

  mw(makeReq({ url: '/checkout?utm_source=google&email=someone@example.com' }), res, () => {})
  res.emit('finish')
  await settle()

  const body = fetchImpl.calls[0].body
  assert.deepStrictEqual(
    Object.keys(body).sort(),
    ['bot_name', 'category', 'collection_source', 'operator', 'path', 'status_code', 'timestamp', 'verification']
  )

  // Belt and braces: no value anywhere in the payload leaks the query string,
  // the IP, or the UA — this is the test that fails if someone adds a field.
  const serialized = JSON.stringify(body)
  assert.ok(!serialized.includes('utm_source'), 'query string must be stripped')
  assert.ok(!serialized.includes('example.com'), 'query values must never ride along')
  assert.ok(!serialized.includes('203.0.113.9'), 'raw IP must never be transmitted')
  assert.ok(!serialized.includes('GPTBot/1.2'), 'raw User-Agent must never be transmitted')
  assert.strictEqual(body.path, '/checkout')
})

test('safePath strips query and fragment, and bounds length', () => {
  assert.strictEqual(safePath('/a/b?x=1'), '/a/b')
  assert.strictEqual(safePath('/a/b#frag'), '/a/b')
  assert.strictEqual(safePath(''), '/')
  assert.strictEqual(safePath(`/${'x'.repeat(900)}`).length, 512)
})

test('clientIpFrom prefers the left-most x-forwarded-for entry', () => {
  assert.strictEqual(
    clientIpFrom({ headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, ip: '10.0.0.1' }),
    '198.51.100.7'
  )
  assert.strictEqual(clientIpFrom({ headers: {}, ip: '10.0.0.5' }), '10.0.0.5')
})

// ── Verification is passed through, never upgraded ───────────────────────────

test('without ranges the verdict is ua_only — never an optimistic ip_verified', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'k', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes()

  mw(makeReq(), res, () => {})           // GPTBot, a VENDOR_JSON bot, no ranges supplied
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls[0].body.verification, VERIFICATION.UA_ONLY)
})

test('with matching ranges the verdict becomes ip_verified', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({
    apiKey: 'k',
    endpoint: 'https://e/hit',
    fetchImpl,
    ranges: new Map([['GPTBot', ['203.0.113.0/24']]])
  })
  const res = makeRes()

  mw(makeReq({ ip: '203.0.113.9' }), res, () => {})
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls[0].body.verification, VERIFICATION.IP_VERIFIED)
})

test('a UA claiming GPTBot from outside the published range reports ip_mismatch', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({
    apiKey: 'k',
    endpoint: 'https://e/hit',
    fetchImpl,
    ranges: new Map([['GPTBot', ['203.0.113.0/24']]])
  })
  const res = makeRes()

  mw(makeReq({ ip: '198.51.100.200' }), res, () => {})
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls[0].body.verification, VERIFICATION.IP_MISMATCH)
})

test('buildPayload coerces a missing status code to 0 rather than emitting NaN', () => {
  const payload = buildPayload({
    hit: { name: 'GPTBot', operator: 'OpenAI', category: 'llm_crawler', verification: 'ua_only' },
    path: '/x',
    statusCode: undefined,
    collectionSource: 'server_api'
  })
  assert.strictEqual(payload.status_code, 0)
})

test('the Authorization header carries the API key as a bearer token', async () => {
  const fetchImpl = recordingFetch()
  const mw = createCrawlerMiddleware({ apiKey: 'secret-key', endpoint: 'https://e/hit', fetchImpl })
  const res = makeRes()

  mw(makeReq(), res, () => {})
  res.emit('finish')
  await settle()

  assert.strictEqual(fetchImpl.calls[0].opts.headers.Authorization, 'Bearer secret-key')
  assert.strictEqual(fetchImpl.calls[0].opts.method, 'POST')
})
