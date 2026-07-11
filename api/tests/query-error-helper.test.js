// Encodes the product rule (design spec §5.1): a query ERROR must never be indistinguishable from
// "no data". describeQueryError ALWAYS yields a real error descriptor (title+message) for any error,
// distinguishing a timeout from a generic failure — so a surface that renders <QueryError> on isError
// can never fall through to an empty/zero state. Pure logic -> node-testable (no React runner exists).
import test from 'node:test'
import assert from 'node:assert'

const { describeQueryError } = await import('../../dashboard/src/lib/queryError.js')

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
  for (const e of [null, undefined, {}, new Error('x'), { error_code: 'query_failed' }, { error_code: 'query_timeout' }]) {
    const d = describeQueryError(e)
    assert.ok(d && d.title && d.message, 'title+message present for every error input')
  }
})
