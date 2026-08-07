// anon_id_absent — forward instrumentation for the traffic that passes the UA filter.
//
// THE POINT OF THIS FILE: prove the boolean is (a) recorded on the real dual-write path,
// (b) correct in BOTH directions, and (c) inert — nothing branches on it. #682 established
// that the highest-precision bot signal was invisible because api/routes/track.js does
// `req.body.anonymous_id || uuidv4()`: when a client omits anonymous_id the server mints
// one, and the minted uuid is shape-identical to the server-issued visitor_id that the
// legitimate cookieless build fetches (tracker/tracker.cookieless.js:300). This records
// the distinction at the only point it is still visible.
//
// Harness mirrors api/tests/pageview-dualwrite-wiring.test.js — it recovers the ACTUAL
// gzipped dual-write payload, so these assertions are about the row that would really be
// written, not about a source string.

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { track } = await import('../routes/track.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

const UA = 'Mozilla/5.0'
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 }

function recorder () {
  const payloads = []
  return {
    transport: async (payload) => { payloads.push(payload) },
    lines: () => payloads.flatMap(p =>
      gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
}

function reset () {
  setDualWriteTransport(null)
  delete process.env.TINYBIRD_DUAL_WRITE
}

// Returns the single dual-written row for a given request body.
async function rowFor (body) {
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder()
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const status = []
  await track(
    {
      headers: { 'user-agent': UA },
      site: { id: 'site-anon-1', excluded_paths: null, custom_url_params: null, pv_limit: Infinity },
      body
    },
    { status: (c) => { status.push(c); return { json: () => {} } } }
  )
  await __getDualWriteBatcher().flush()
  const lines = rec.lines()
  return { row: lines[0], lines, status }
}

test('anon_id_absent instrumentation', async (t) => {
  t.beforeEach(reset)
  t.afterEach(reset)

  await t.test('TRUE when the request omits anonymous_id (the tracker never ran)', async () => {
    const { row } = await rowFor({ page_url: 'https://example.com/' })
    assert.strictEqual(row.anon_id_absent, true)
    // The minted id is uuid-shaped — this is exactly why the boolean is needed: shape
    // alone cannot tell you the tracker was absent.
    assert.match(row.distinct_id, /^[0-9a-f-]{36}$/)
  })

  await t.test('POSITIVE CONTROL: FALSE when the tracker supplied anonymous_id', async () => {
    // Without this direction the field could be hardcoded true and every test above
    // would still pass. This is the control that makes the true-case meaningful.
    const { row } = await rowFor({ page_url: 'https://example.com/', anonymous_id: 'cl-abc123' })
    assert.strictEqual(row.anon_id_absent, false)
    assert.strictEqual(row.distinct_id, 'cl-abc123')
  })

  await t.test('POSITIVE CONTROL: a server-issued uuid visitor_id also reads FALSE', async () => {
    // The legitimate cookieless build fetches a uuid visitor_id from the server and sends
    // it back as anonymous_id. That traffic is REAL and must not be marked absent — this
    // is the false-positive population the boolean must not capture.
    const legit = '3f2b9c14-7a8e-4d21-9b55-0c6a1e77d4aa'
    const { row } = await rowFor({ page_url: 'https://example.com/', anonymous_id: legit })
    assert.strictEqual(row.anon_id_absent, false, 'a real cookieless visitor must never read as absent')
    assert.strictEqual(row.distinct_id, legit)
  })

  await t.test('an empty-string anonymous_id counts as ABSENT, not present', async () => {
    // `|| uuidv4()` treats '' as falsy and mints — so the boolean must agree with the
    // branch it is documenting, or the two would disagree on the same request.
    const { row } = await rowFor({ page_url: 'https://example.com/', anonymous_id: '' })
    assert.strictEqual(row.anon_id_absent, true)
    assert.match(row.distinct_id, /^[0-9a-f-]{36}$/, 'empty string minted an id, so absent=true is correct')
  })

  await t.test('🔴 INERT: the flag changes nothing — same status, same event, still captured', async () => {
    // The whole risk of this PR is that a measurement quietly becomes a filter.
    const absent = await rowFor({ page_url: 'https://example.com/' })
    const present = await rowFor({ page_url: 'https://example.com/', anonymous_id: 'cl-xyz' })
    assert.strictEqual(absent.lines.length, 1, 'absent -> STILL WRITTEN (no drop)')
    assert.strictEqual(present.lines.length, 1, 'present -> written')
    assert.deepStrictEqual(absent.status, present.status, 'response status identical either way')
    assert.strictEqual(absent.row.event_type, '$pageview')
    assert.strictEqual(present.row.event_type, '$pageview')
  })
})

test('🔴 nothing in track.js BRANCHES on anon_id_absent', () => {
  // Guard against a future edit turning this into a drop. §6/§6.5: an ingestion drop is
  // irreversible and #666 exists because a filter deleted real humans.
  const src = readFileSync(new URL('../routes/track.js', import.meta.url), 'utf8')
  const code = stripComments(src)
  // Exactly three code references and no more: the `const anonIdAbsent =` assignment, the
  // `anon_id_absent:` property key, and the value it reads. A fourth means something new
  // started consuming the flag — which is the thing this test exists to catch.
  const camel = code.split('anonIdAbsent').length - 1
  const snake = code.split('anon_id_absent').length - 1
  assert.strictEqual(camel, 2, 'anonIdAbsent: expected the assignment and the property value only')
  assert.strictEqual(snake, 1, 'anon_id_absent: expected the property key only')
  for (const bad of ['if (anonIdAbsent', 'if (anon_id_absent', '!anonIdAbsent &&', 'anonIdAbsent ?']) {
    assert.ok(!code.includes(bad), `track.js must not branch on the flag — found ${bad}`)
  }
  // CONTROL for the guard: if stripComments returned '' the assertions above would be
  // vacuous. Prove the stripped source is real and still contains the assignment.
  assert.ok(code.includes('const anonIdAbsent = !req.body.anonymous_id'), 'stripComments ate the source')
  assert.ok(code.length > 5000, 'stripped track.js implausibly short — guard would be vacuous')
})

// Strip comments so the guard cannot fire on the explanatory block above the assignment,
// which necessarily names the very identifiers it forbids branching on.
function stripComments (src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}
