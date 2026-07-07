// tinybird-read wire-format regression test — TOKEN-FREE, NO NETWORK.
//
// Pins the Array-param serialization of queryTinybirdPipe: Tinybird's
// {{ Array(...) }} pipe params take ONE comma-joined value
// (?visitor_ids=a,b,c). The repeated-key format this client originally used
// (?visitor_ids=a&visitor_ids=b) is silently truncated to the FIRST element
// by the deployed pipe — verified live 2026-07-03 (see api/lib/tinybird-read.js
// wire-format note). This test stubs global fetch and asserts the constructed
// URL directly, so a regression to repeated keys fails here without needing
// any Tinybird token.

import test from 'node:test'
import assert from 'node:assert/strict'

import { queryTinybirdPipe } from '../lib/tinybird-read.js'

function stubEnvAndFetch(t, capturedUrls) {
  const savedEnv = {
    TINYBIRD_READ_ENABLED: process.env.TINYBIRD_READ_ENABLED,
    TINYBIRD_HOST: process.env.TINYBIRD_HOST,
    TINYBIRD_READ_TOKEN: process.env.TINYBIRD_READ_TOKEN
  }
  process.env.TINYBIRD_READ_ENABLED = 'true'
  process.env.TINYBIRD_HOST = 'https://api.tinybird.example'
  process.env.TINYBIRD_READ_TOKEN = 'mock-read-token-for-tests'

  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    capturedUrls.push(String(url))
    return { ok: true, json: async () => ({ data: [] }) }
  }

  t.after(() => {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

test('Array params serialize as ONE comma-joined query key, never repeated keys', async (t) => {
  const urls = []
  stubEnvAndFetch(t, urls)

  const rows = await queryTinybirdPipe('pageviews_by_visitors', {
    site_id: 'de200000-babe-41d4-a716-446655441111',
    visitor_ids: ['visitor-a', 'visitor-b', 'visitor-c'],
    lookback_from: '2026-05-27 00:00:00',
    date_to: '2026-07-01 00:00:00',
    page_size: 5000,
    page_offset: 0
  })

  assert.notEqual(rows, null, 'stubbed 2xx response must not fall back to null')
  assert.equal(urls.length, 1, 'exactly one pipe request')

  const u = new URL(urls[0])
  // The load-bearing assertions: one key, comma-joined value.
  assert.equal(u.searchParams.getAll('visitor_ids').length, 1,
    'visitor_ids must appear as exactly ONE query key (repeated keys are silently truncated to the first element by Tinybird Array() params)')
  assert.equal(u.searchParams.get('visitor_ids'), 'visitor-a,visitor-b,visitor-c')
  // Belt-and-braces on the raw URL string: a single occurrence of the key.
  assert.equal((urls[0].match(/visitor_ids=/g) || []).length, 1,
    `raw URL must contain visitor_ids= exactly once, got: ${urls[0]}`)

  // Scalar params are untouched by the array fix.
  assert.equal(u.searchParams.get('site_id'), 'de200000-babe-41d4-a716-446655441111')
  assert.equal(u.searchParams.get('page_size'), '5000')
  assert.equal(u.searchParams.get('page_offset'), '0')
})

test('single-element array still serializes as the comma-format (one key, one value)', async (t) => {
  const urls = []
  stubEnvAndFetch(t, urls)

  await queryTinybirdPipe('pageviews_by_visitors', { site_id: 's', visitor_ids: ['only-one'] })

  const u = new URL(urls[0])
  assert.equal(u.searchParams.getAll('visitor_ids').length, 1)
  assert.equal(u.searchParams.get('visitor_ids'), 'only-one')
})
