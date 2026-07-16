// Encodes the product rule (design spec §5.1): a query ERROR must never be indistinguishable from
// "no data". describeQueryError ALWAYS yields a real error descriptor (title+message) for any error,
// distinguishing a timeout from a generic failure — so a surface that renders <QueryError> on isError
// can never fall through to an empty/zero state. Pure logic -> node-testable (no React runner exists).
import test from 'node:test'
import assert from 'node:assert'

const { describeQueryError, isGatedError } = await import('../../dashboard/src/lib/queryError.js')

test('query_timeout -> timeout-specific, actionable message', () => {
  const d = describeQueryError({ error_code: 'query_timeout' })
  assert.strictEqual(d.isTimeout, true)
  assert.match(d.title, /timed out/i)
  assert.match(d.message, /narrower date range|timed out/i)
})

test('generic failure -> generic honest message that is explicitly NOT "no data"', () => {
  const d = describeQueryError(new Error('boom'))
  assert.strictEqual(d.isTimeout, false)
  assert.match(d.message, /fetch error|couldn't fetch|try again/i)
})

test('ALWAYS yields a real error descriptor -> an error can never render as empty/zero', () => {
  for (const e of [null, undefined, {}, new Error('x'), { error_code: 'query_failed' }, { error_code: 'query_timeout' },
    { error_code: 'gated_dead_store' }, { error_code: 'unsupported_session_dim' }]) {
    const d = describeQueryError(e)
    assert.ok(d && d.title && d.message, 'title+message present for every error input')
  }
})

// ── GATED shapes: a deliberate server deny, not a failure ────────────────────────────
// The server returns 422 rather than querying a dead store and reporting zeros. Retrying or
// narrowing the range cannot help, so the copy must NOT say "try again / narrower range" and the
// surface must NOT offer Retry (QueryError suppresses it on isGated).
for (const code of ['gated_dead_store', 'unsupported_session_dim']) {
  test(`${code} -> calm "temporarily unavailable", isGated, and NO retry/narrow-range guidance`, () => {
    const d = describeQueryError({ error_code: code, message: 'The "keyword" breakdown is temporarily unavailable while reporting moves to the new analytics store.' })
    assert.strictEqual(d.isGated, true, 'flagged gated so the surface hides Retry')
    assert.strictEqual(d.isTimeout, false)
    assert.match(d.title, /temporarily unavailable/i)
    // the server's SPECIFIC reason wins (it names the dim/metric)
    assert.match(d.message, /keyword/)
    assert.doesNotMatch(d.message, /try again|narrower/i, 'must not tell the user to retry a permanent gate')
    assert.ok(isGatedError({ error_code: code }))
  })
}

test('gated with no server message -> generic honest fallback (still not "no data")', () => {
  const d = describeQueryError({ error_code: 'gated_dead_store' })
  assert.strictEqual(d.isGated, true)
  assert.match(d.message, /temporarily unavailable while reporting moves/i)
})

test('non-gated codes are NOT flagged gated (retry stays available for real failures)', () => {
  for (const e of [{ error_code: 'query_timeout' }, { error_code: 'query_failed' }, new Error('boom'), null]) {
    assert.strictEqual(describeQueryError(e).isGated, false)
    assert.strictEqual(isGatedError(e), false)
  }
})
