import test from 'node:test'
import assert from 'node:assert'
import {
  parseVendorRanges,
  fetchBotRanges,
  refreshAllRanges,
  refreshableCrawlers,
  loadRanges
} from '../lib/ai-crawler-ranges.js'
import { run } from '../jobs/ai-crawler-range-refresh.js'
import { isValidCidr, AI_CRAWLERS, RANGE_SOURCE } from '../lib/ai-crawler-detect.js'

// Supabase double: records upserts and job_runs inserts, with injectable errors.
function makeSupabase({ upsertError = null, selectRows = [], selectError = null } = {}) {
  const upserts = []
  const jobRuns = []
  return {
    upserts,
    jobRuns,
    from(table) {
      if (table === 'job_runs') {
        return { insert: (row) => { jobRuns.push(row); return Promise.resolve({ error: null }) } }
      }
      return {
        upsert: (row) => { upserts.push(row); return Promise.resolve({ error: upsertError }) },
        select: () => Promise.resolve({ data: selectRows, error: selectError })
      }
    }
  }
}

const okJson = (payload) => async () => ({ ok: true, status: 200, json: async () => payload })
const GOOGLE_SHAPE = {
  prefixes: [{ ipv4Prefix: '66.249.64.0/27' }, { ipv6Prefix: '2001:4860:4801::/48' }]
}

// ── Parsing ──────────────────────────────────────────────────────────────────

test('parseVendorRanges reads the shape Google/Bing/OpenAI/Anthropic all publish', () => {
  assert.deepStrictEqual(parseVendorRanges(GOOGLE_SHAPE), ['66.249.64.0/27', '2001:4860:4801::/48'])
})

test('parseVendorRanges tolerates a bare array and prefixes-as-strings', () => {
  assert.deepStrictEqual(parseVendorRanges(['1.2.3.0/24']), ['1.2.3.0/24'])
  assert.deepStrictEqual(parseVendorRanges({ prefixes: ['1.2.3.0/24'] }), ['1.2.3.0/24'])
})

test('parseVendorRanges DROPS malformed CIDRs instead of persisting them', () => {
  const parsed = parseVendorRanges({
    prefixes: [
      { ipv4Prefix: '1.2.3.0/24' },
      { ipv4Prefix: '999.1.1.1/24' },   // impossible octet
      { ipv4Prefix: '1.2.3.0/33' },     // prefix wider than the address
      { ipv4Prefix: 'not-an-ip' },
      { ipv4Prefix: '1.2.3.0' },        // no prefix at all
      { somethingElse: '4.4.4.0/24' }   // unknown key
    ]
  })
  assert.deepStrictEqual(parsed, ['1.2.3.0/24'])
})

test('parseVendorRanges de-dupes repeated prefixes', () => {
  assert.deepStrictEqual(
    parseVendorRanges({ prefixes: [{ ipv4Prefix: '1.2.3.0/24' }, { ipv4Prefix: '1.2.3.0/24' }] }),
    ['1.2.3.0/24']
  )
})

test('parseVendorRanges returns [] for junk rather than throwing', () => {
  for (const junk of [null, undefined, 42, 'string', {}, { prefixes: 'nope' }]) {
    assert.deepStrictEqual(parseVendorRanges(junk), [])
  }
})

test('isValidCidr agrees with the parser on the boundary cases', () => {
  assert.ok(isValidCidr('10.0.0.0/8'))
  assert.ok(isValidCidr('2a03:2880::/29'))
  assert.ok(isValidCidr('1.2.3.4/32'))
  assert.ok(!isValidCidr('1.2.3.4'))
  assert.ok(!isValidCidr('1.2.3.4/33'))
  assert.ok(!isValidCidr('2a03:2880::/129'))
  assert.ok(!isValidCidr(''))
})

// ── Fetch-level fail-open ────────────────────────────────────────────────────

test('fetchBotRanges treats a non-200 as failure, not as empty ranges', async () => {
  const res = await fetchBotRanges({ token: 'GPTBot', rangeUrl: 'https://x' }, {
    fetchImpl: async () => ({ ok: false, status: 503 })
  })
  assert.strictEqual(res.ok, false)
  assert.match(res.error, /503/)
})

test('fetchBotRanges treats an EMPTY parse as failure — [] must never be persisted', async () => {
  const res = await fetchBotRanges({ token: 'GPTBot', rangeUrl: 'https://x' }, {
    fetchImpl: okJson({ prefixes: [] })
  })
  assert.strictEqual(res.ok, false)
  assert.match(res.error, /no valid CIDRs/)
})

test('fetchBotRanges converts a thrown network error into a failure result', async () => {
  const res = await fetchBotRanges({ token: 'GPTBot', rangeUrl: 'https://x' }, {
    fetchImpl: async () => { throw new Error('ECONNREFUSED') }
  })
  assert.strictEqual(res.ok, false)
  assert.match(res.error, /ECONNREFUSED/)
})

// ── The fail-open contract: last-known-good is retained ──────────────────────

test('a failing vendor causes NO write for that bot — last-known-good retained', async () => {
  const db = makeSupabase()
  const { updated, failed } = await refreshAllRanges({
    supabase: db,
    fetchImpl: async () => ({ ok: false, status: 500 })
  })

  assert.strictEqual(updated.length, 0)
  assert.ok(failed.length > 0)
  assert.strictEqual(db.upserts.length, 0, 'a failed refresh must not write ANYTHING — not even an empty list')
})

test('one vendor failing does not affect the others', async () => {
  const db = makeSupabase()
  const fetchImpl = async (url) => {
    if (String(url).includes('openai.com')) return { ok: false, status: 500 }
    return { ok: true, status: 200, json: async () => GOOGLE_SHAPE }
  }

  const { attempted, updated, failed } = await refreshAllRanges({ supabase: db, fetchImpl })

  assert.strictEqual(attempted, refreshableCrawlers().length)
  assert.ok(updated.length > 0, 'healthy vendors still refresh')
  assert.ok(failed.length > 0, 'the failing vendor is reported')
  // Every OpenAI bot failed; none of them was written.
  const writtenTokens = db.upserts.map(u => u.bot_token)
  assert.ok(!writtenTokens.includes('GPTBot'))
  assert.ok(writtenTokens.includes('Googlebot'))
})

test('a DB upsert error is also fail-open and reported, never thrown', async () => {
  const db = makeSupabase({ upsertError: { message: 'permission denied' } })
  const { updated, failed } = await refreshAllRanges({ supabase: db, fetchImpl: okJson(GOOGLE_SHAPE) })

  assert.strictEqual(updated.length, 0)
  assert.ok(failed.every(f => /db: permission denied/.test(f.error)))
})

test('a successful refresh writes cidrs, count, source_url and fetched_at', async () => {
  const db = makeSupabase()
  await refreshAllRanges({ supabase: db, fetchImpl: okJson(GOOGLE_SHAPE) })

  const row = db.upserts.find(u => u.bot_token === 'Googlebot')
  assert.deepStrictEqual(row.cidrs, ['66.249.64.0/27', '2001:4860:4801::/48'])
  assert.strictEqual(row.cidr_count, 2)
  assert.ok(row.source_url.startsWith('https://'))
  assert.ok(Date.parse(row.fetched_at) > 0)
})

test('only VENDOR_JSON crawlers are refreshed — NONE-source bots are never fetched', async () => {
  const tokens = refreshableCrawlers().map(b => b.token)
  assert.ok(tokens.includes('GPTBot'))
  assert.ok(!tokens.includes('CCBot'), 'CCBot publishes no ranges and must not be fetched')

  const expected = AI_CRAWLERS.filter(b => b.rangeSource === RANGE_SOURCE.VENDOR_JSON).length
  assert.strictEqual(tokens.length, expected)
  assert.strictEqual(expected, 8, 'the registry advertises 8 IP-verifiable crawlers')
})

// ── loadRanges ───────────────────────────────────────────────────────────────

test('loadRanges builds the token -> CIDR[] Map detectAiCrawler consumes', async () => {
  const db = makeSupabase({ selectRows: [{ bot_token: 'GPTBot', cidrs: ['1.2.3.0/24'] }] })
  const map = await loadRanges(db)
  assert.deepStrictEqual(map.get('GPTBot'), ['1.2.3.0/24'])
})

test('loadRanges returns an EMPTY Map on a DB error — degrades to ua_only, never fabricates', async () => {
  const db = makeSupabase({ selectError: { message: 'down' } })
  const map = await loadRanges(db)
  assert.strictEqual(map.size, 0)
})

test('loadRanges skips rows with empty ranges so they cannot mask as verifiable', async () => {
  const db = makeSupabase({ selectRows: [{ bot_token: 'GPTBot', cidrs: [] }] })
  const map = await loadRanges(db)
  assert.strictEqual(map.has('GPTBot'), false)
})

// ── job_runs (KI-46) ─────────────────────────────────────────────────────────

test('job writes a SUCCESS job_runs row when every bot refreshes', async () => {
  const db = makeSupabase()
  await run({ supabase: db, fetchImpl: okJson(GOOGLE_SHAPE) })

  assert.strictEqual(db.jobRuns.length, 1)
  assert.strictEqual(db.jobRuns[0].job_name, 'ai-crawler-range-refresh')
  assert.strictEqual(db.jobRuns[0].status, 'success')
  assert.ok(typeof db.jobRuns[0].duration_ms === 'number')
})

test('job writes a WARNING row on partial failure and names the retained bots', async () => {
  const db = makeSupabase()
  const fetchImpl = async (url) => {
    if (String(url).includes('openai.com')) return { ok: false, status: 500 }
    return { ok: true, status: 200, json: async () => GOOGLE_SHAPE }
  }

  await run({ supabase: db, fetchImpl })

  assert.strictEqual(db.jobRuns[0].status, 'warning')
  assert.match(db.jobRuns[0].error_message, /kept last-known-good/)
  assert.match(db.jobRuns[0].error_message, /GPTBot/)
})

test('job writes a FAILED row when every bot fails', async () => {
  const db = makeSupabase()
  await run({ supabase: db, fetchImpl: async () => ({ ok: false, status: 500 }) })
  assert.strictEqual(db.jobRuns[0].status, 'failed')
})

test('KI-46: a THROWING job still writes a job_runs row before it exits', async () => {
  const db = makeSupabase()
  // Break the table writer so refreshAllRanges throws rather than returning.
  db.from = (table) => {
    if (table === 'job_runs') {
      return { insert: (row) => { db.jobRuns.push(row); return Promise.resolve({ error: null }) } }
    }
    throw new Error('supabase exploded')
  }

  await assert.rejects(() => run({ supabase: db, fetchImpl: okJson(GOOGLE_SHAPE) }), /supabase exploded/)

  assert.strictEqual(db.jobRuns.length, 1, 'a crash must still leave a trace — this is KI-46 verbatim')
  assert.strictEqual(db.jobRuns[0].status, 'failed')
  assert.match(db.jobRuns[0].error_message, /supabase exploded/)
})

test('job_runs rows only ever use real columns (writeJobRun would throw otherwise)', async () => {
  const db = makeSupabase()
  await run({ supabase: db, fetchImpl: okJson(GOOGLE_SHAPE) })
  const allowed = ['job_name', 'status', 'conversions_processed', 'error_message', 'duration_ms', 'ran_at']
  for (const key of Object.keys(db.jobRuns[0])) {
    assert.ok(allowed.includes(key), `unexpected job_runs column: ${key}`)
  }
})
