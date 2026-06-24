import test from 'node:test'
import assert from 'node:assert'
import { esc } from '../lib/utils.js'

// Regression guard for the HogQL string-literal escaping helper.
// HogQL/ClickHouse string literals honor C-style backslash escapes, so a value
// containing a backslash before a quote could otherwise escape the closing
// quote and break out of the literal (confirmed cross-tenant injection).

test('esc doubles single quotes (standard literal escaping)', () => {
  assert.strictEqual(esc("a'b"), "a''b")
  assert.strictEqual(esc("x' OR 1=1 --"), "x'' OR 1=1 --")
})

test('esc doubles backslashes (closes the breakout vector)', () => {
  assert.strictEqual(esc('a\\b'), 'a\\\\b')
  assert.strictEqual(esc('\\'), '\\\\')
})

test('esc neutralizes the backslash+quote breakout payload', () => {
  // Attacker payload: \' OR 1=1   (backslash, quote, ...)
  // Must become: \\'' OR 1=1  — the doubled backslash is an escaped literal
  // backslash, so the following doubled quote stays inside the string literal.
  assert.strictEqual(esc("\\' OR 1=1"), "\\\\'' OR 1=1")
})

test('esc preserves legitimate backslash values (round-trip safe)', () => {
  // 'C:\\Users\\x' parsed by ClickHouse collapses each \\ to one \, yielding
  // the original value. We assert the pre-parse escaped form here.
  assert.strictEqual(esc('C:\\Users\\x'), 'C:\\\\Users\\\\x')
})

test('esc invariant: every backslash and quote in the output is doubled', () => {
  // After escaping, removing all "\\" and "''" pairs must leave no lone
  // backslash or quote — i.e. nothing can terminate/escape the enclosing literal.
  for (const input of ["\\", "'", "\\'", "''\\\\", "a\\'b'c\\", "\\\\' OR 1=1"]) {
    const stripped = esc(input).replace(/\\\\/g, '').replace(/''/g, '')
    assert.ok(!stripped.includes('\\'), `lone backslash leaked for input ${JSON.stringify(input)}`)
    assert.ok(!stripped.includes("'"), `lone quote leaked for input ${JSON.stringify(input)}`)
  }
})

test('esc is defensive against non-string input (no crash)', () => {
  // The `value = ''` default only applies to undefined; null/number coerce via
  // String(). Important property: no throw, and output is still escaped.
  assert.strictEqual(esc(undefined), '')
  assert.strictEqual(esc(null), 'null')
  assert.strictEqual(esc(123), '123')
})
