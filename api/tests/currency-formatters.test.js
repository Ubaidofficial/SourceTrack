// Currency-aware money formatters (dashboard/src/utils/numbers.js + MetricTile.jsx).
//
// THE POINT OF THIS FILE: formatCurrency / formatCurrencyDecimal / fmtMoney used to hardcode a
// literal '$'. One live prod site bills in EUR and rendered a dollar sign. Making them
// currency-aware is a rewrite of the only code path that renders money, so it carries two
// distinct risks, and this file pins both:
//
//   1. REGRESSION. Every call site today passes no currency. Intl.NumberFormat cannot reproduce
//      what the old string-concat produced (it groups thousands, and it moves the minus sign to
//      the front), so a naive "just use Intl" would have silently changed every existing money
//      string in the dashboard. The byte-identity block asserts the exact legacy strings.
//
//   2. §5.2 EXACTNESS. fmtMoney must never round — "$999.99 is not $1,000". A currency-aware
//      rewrite is exactly the kind of change that reintroduces rounding through a currency's own
//      convention (JPY defaults to 0 decimals). The exactness block asserts min=max=2 survives
//      for every currency, not just USD.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const {
  formatCurrency,
  formatCurrencyDecimal,
  fmtMoney,
  normalizeCurrency
} = await import('../../dashboard/src/utils/numbers.js')

// The values that discriminate the legacy path from Intl: grouping kicks in at 1000, the sign
// moves for negatives, and 999.99 is the §5.2 rounding case.
const VALUES = [0, 999.99, 1234.5, -1234.5, 1000000]

test('byte-identity: no currency argument renders exactly what shipped before', async (t) => {
  await t.test('formatCurrency — 0 decimals, NO thousands separator, sign after the symbol', () => {
    const expected = ['$0', '$1000', '$1235', '$-1235', '$1000000']
    assert.deepEqual(VALUES.map(v => formatCurrency(v)), expected)
  })

  await t.test('formatCurrencyDecimal — 2 decimals, NO thousands separator', () => {
    const expected = ['$0.00', '$999.99', '$1234.50', '$-1234.50', '$1000000.00']
    assert.deepEqual(VALUES.map(v => formatCurrencyDecimal(v)), expected)
  })

  await t.test('fmtMoney — 2 decimals WITH thousands separator', () => {
    const expected = ['$0.00', '$999.99', '$1,234.50', '$-1,234.50', '$1,000,000.00']
    assert.deepEqual(VALUES.map(v => fmtMoney(v)), expected)
  })

  // The guarantee has to survive the follow-up wiring dispatch, which will start passing a real
  // code. A USD site must not shift when that lands, so the branch keys on the CODE, not on
  // "was an argument supplied".
  await t.test('an explicit USD is identical to omitting it', () => {
    assert.deepEqual(VALUES.map(v => formatCurrency(v, 0, 'USD')), VALUES.map(v => formatCurrency(v)))
    assert.deepEqual(VALUES.map(v => formatCurrencyDecimal(v, 2, 0, 'USD')), VALUES.map(v => formatCurrencyDecimal(v)))
    assert.deepEqual(VALUES.map(v => fmtMoney(v, 'USD')), VALUES.map(v => fmtMoney(v)))
  })

  // SEORevenue.jsx calls formatCurrency(x, 0) and LeadDetail.jsx calls
  // formatCurrencyDecimal(x) — the new parameter is appended, so positional args keep meaning.
  await t.test('existing positional arguments keep their meaning', () => {
    assert.equal(formatCurrency(null, 0), '$0')
    assert.equal(formatCurrency(undefined, 42), '$42')
    assert.equal(formatCurrencyDecimal(1.239, 2), '$1.24')
    assert.equal(formatCurrencyDecimal(1.239, 0), '$1')
    assert.equal(formatCurrencyDecimal(null, 2, 7), '$7.00')
  })
})

test('§5.2 exactness survives the currency parameter for EVERY currency', async (t) => {
  // JPY is the trap: its own convention is 0 decimals, so a formatter that defers to the
  // currency's default would render ¥1,000 for 999.99 — the exact §5.2 violation.
  for (const code of ['USD', 'EUR', 'GBP', 'JPY', 'INR']) {
    await t.test(`${code}: 999.99 is not 1,000`, () => {
      const out = fmtMoney(999.99, code)
      assert.ok(out.includes('999.99'), `${code}: expected the exact cents, got ${out}`)
      assert.ok(!out.includes('1,000') && !out.includes('1000'), `${code}: value was rounded up — got ${out}`)
    })

    await t.test(`${code}: always exactly 2 decimals, never fewer`, () => {
      assert.ok(fmtMoney(300, code).includes('300.00'), `${code}: dropped the cents on a whole number`)
      assert.ok(fmtMoney(0.5, code).includes('0.50'), `${code}: dropped a trailing zero`)
    })

    await t.test(`${code}: no rounding at scale`, () => {
      assert.ok(fmtMoney(1234567.891, code).includes('1,234,567.89'), `got ${fmtMoney(1234567.891, code)}`)
    })
  }
})

test('a non-USD currency renders its own symbol, never a dollar sign', async (t) => {
  // Exact strings for the symbol currencies (stable across ICU versions — no separator space).
  await t.test('EUR', () => {
    assert.equal(formatCurrency(300, 0, 'EUR'), '€300')
    assert.equal(formatCurrencyDecimal(300, 2, 0, 'EUR'), '€300.00')
    assert.equal(fmtMoney(300, 'EUR'), '€300.00')
  })

  await t.test('GBP', () => {
    assert.equal(formatCurrency(300, 0, 'GBP'), '£300')
    assert.equal(formatCurrencyDecimal(300, 2, 0, 'GBP'), '£300.00')
    assert.equal(fmtMoney(300, 'GBP'), '£300.00')
  })

  // The bug this whole change exists for: the live EUR site was rendering a '$'.
  await t.test('no formatter emits $ for a non-dollar currency', () => {
    for (const code of ['EUR', 'GBP', 'JPY', 'INR']) {
      assert.ok(!formatCurrency(300, 0, code).includes('$'), `formatCurrency leaked $ for ${code}`)
      assert.ok(!formatCurrencyDecimal(300, 2, 0, code).includes('$'), `formatCurrencyDecimal leaked $ for ${code}`)
      assert.ok(!fmtMoney(300, code).includes('$'), `fmtMoney leaked $ for ${code}`)
    }
  })

  // The other dollars are the subtler half of the same bug: AUD/CAD legitimately use '$', so
  // "contains no $" is the wrong assertion for them. What matters is that they are DISAMBIGUATED
  // from USD rather than rendered as a bare '$' — which is precisely what the old hardcode did.
  await t.test('other dollar currencies are disambiguated, not rendered as a bare $', () => {
    for (const code of ['AUD', 'CAD']) {
      const out = fmtMoney(300, code)
      assert.ok(out.includes('$'), `${code} should still use a dollar sign, got ${out}`)
      assert.ok(!out.startsWith('$'), `${code} rendered as a bare USD-style $ — got ${out}`)
    }
  })

  await t.test('lower-case codes are accepted', () => {
    assert.equal(fmtMoney(300, 'eur'), fmtMoney(300, 'EUR'))
  })
})

test('a malformed currency code falls back to USD instead of throwing mid-render', () => {
  // Intl.NumberFormat throws RangeError on a malformed code. Inside a React render that is a
  // white screen, which is strictly worse than any formatting question — so the guard runs
  // before every Intl call.
  for (const bad of [null, undefined, '', 'US', 'DOLLARS', 'US$', 42, {}]) {
    assert.equal(normalizeCurrency(bad), 'USD', `normalizeCurrency(${JSON.stringify(bad)})`)
    assert.doesNotThrow(() => formatCurrency(300, 0, bad))
    assert.equal(fmtMoney(1234.5, bad), '$1,234.50', `bad code ${JSON.stringify(bad)} did not fall back cleanly`)
  }

  // Well-formed but not a real ISO currency: Intl renders the code literally and does NOT throw.
  // That is the honest output — it is not silently relabelled as dollars.
  assert.ok(fmtMoney(300, 'XYZ').startsWith('XYZ'))
  assert.ok(!fmtMoney(300, 'XYZ').includes('$'))
})

// MetricTile is JSX and cannot be imported by node --test, so this is a source assertion — the
// same mechanism other dashboard-component guards in this directory use. It is narrow on
// purpose: it pins that the tile stopped hardcoding USD, which is the thing that can regress.
test('MetricTile threads a currency prop instead of hardcoding USD', () => {
  const src = readFileSync(join(__dirname, '../../dashboard/src/components/MetricTile.jsx'), 'utf8')

  assert.match(src, /currency = 'USD'/, 'MetricTile must accept a currency prop defaulting to USD')
  assert.match(
    src,
    /style: 'currency', currency: currencyCode/,
    "MetricTile's currency case must format with the normalized prop, not a literal 'USD'"
  )
  assert.ok(
    !/currency: 'USD'/.test(src),
    "MetricTile still hardcodes currency: 'USD' somewhere"
  )
  assert.match(
    src,
    /normalizeCurrency/,
    'MetricTile must reuse normalizeCurrency from utils/numbers rather than forking the guard'
  )
})
