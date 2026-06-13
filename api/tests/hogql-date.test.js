import test from 'node:test'
import assert from 'node:assert'
import {
  serializeHogQLDateTime,
  serializeHogQLDateRange,
  buildHogQLTimestampFilter
} from '../lib/hogql-date.js'

test('HogQL Date parameter serialization unit tests', async (t) => {

  await t.test('Valid dates are correctly serialized', () => {
    // Date only
    assert.strictEqual(
      serializeHogQLDateTime('2026-01-01'),
      "toDateTime('2026-01-01T00:00:00.000Z')"
    )

    // Date only with exclusive end boundary option
    assert.strictEqual(
      serializeHogQLDateTime('2026-01-01', { exclusiveEndForDateOnly: true }),
      "toDateTime('2026-01-02T00:00:00.000Z')"
    )

    // DateTime with Z
    assert.strictEqual(
      serializeHogQLDateTime('2026-01-01T12:30:00Z'),
      "toDateTime('2026-01-01T12:30:00.000Z')"
    )

    // DateTime with MS and Z
    assert.strictEqual(
      serializeHogQLDateTime('2026-01-01T12:30:00.000Z'),
      "toDateTime('2026-01-01T12:30:00.000Z')"
    )

    // Date object
    assert.strictEqual(
      serializeHogQLDateTime(new Date('2026-01-01T12:30:00Z')),
      "toDateTime('2026-01-01T12:30:00.000Z')"
    )
  })

  await t.test('Invalid input formats and injections are strictly rejected', () => {
    const invalidInputs = [
      "2026-01-01' OR 1=1 --",
      "2026-01-01); DROP TABLE events; --",
      "now() - INTERVAL 999 DAY",
      "2026-01-01 UNION SELECT",
      "not-a-date",
      "",
      "   ",
      "2026/01/01",
      "01-01-2026",
      "2026-1-1"
    ]

    for (const input of invalidInputs) {
      assert.throws(() => {
        serializeHogQLDateTime(input)
      }, Error, `Expected rejection for: ${input}`)
    }
  })

  await t.test('Invalid calendar dates are strictly rejected', () => {
    const invalidCalendarInputs = [
      '2026-02-30',
      '2026-04-31',
      '2026-13-01',
      '2026-00-01',
      '2026-01-01T25:00:00Z',
      '2026-01-01T12:60:00Z'
    ]

    for (const input of invalidCalendarInputs) {
      assert.throws(() => {
        serializeHogQLDateTime(input)
      }, Error, `Expected calendar rejection for: ${input}`)
    }
  })

  await t.test('Date range checks start <= end', () => {
    // Valid equal range
    const range1 = serializeHogQLDateRange('2026-01-01', '2026-01-01')
    assert.strictEqual(range1.from, "toDateTime('2026-01-01T00:00:00.000Z')")
    assert.strictEqual(range1.to, "toDateTime('2026-01-02T00:00:00.000Z')")

    // Valid range
    const range2 = serializeHogQLDateRange('2026-01-01', '2026-01-05')
    assert.strictEqual(range2.from, "toDateTime('2026-01-01T00:00:00.000Z')")
    assert.strictEqual(range2.to, "toDateTime('2026-01-06T00:00:00.000Z')")

    // Invalid range where start > end
    assert.throws(() => {
      serializeHogQLDateRange('2026-01-05', '2026-01-01')
    }, /Start date must be before or equal to end date/)
  })

  await t.test('HogQL timestamp filter builder outputs safe queries', () => {
    const range = serializeHogQLDateRange('2026-01-01', '2026-01-02')
    const filter = buildHogQLTimestampFilter('e.timestamp', range)
    assert.strictEqual(
      filter,
      "e.timestamp >= toDateTime('2026-01-01T00:00:00.000Z') AND e.timestamp < toDateTime('2026-01-03T00:00:00.000Z')"
    )

    // Reject invalid column names
    assert.throws(() => {
      buildHogQLTimestampFilter('timestamp; DROP TABLE events;', range)
    }, /Invalid column name/)
  })

  await t.test('Query Builder Integration Test: prevents injected date parameters from appearing in generated HogQL', () => {
    // A mock query builder representing production code
    function buildProductionQuery(userDateFrom, userDateTo) {
      const range = serializeHogQLDateRange(userDateFrom, userDateTo)
      const dateFilter = buildHogQLTimestampFilter('timestamp', range)
      return `SELECT count() FROM events WHERE properties.site_id = '123' AND ${dateFilter}`
    }

    // Proving safe execution compiles correctly
    const safeQuery = buildProductionQuery('2026-01-01', '2026-01-15')
    assert.ok(safeQuery.includes("timestamp >= toDateTime('2026-01-01T00:00:00.000Z')"))
    assert.ok(safeQuery.includes("timestamp < toDateTime('2026-01-16T00:00:00.000Z')"))

    // Asserting that no user-supplied strings are interpolated directly:
    // Only 'toDateTime(...)' structures appear.
    const innerSingleQuotes = safeQuery.match(/'[^']+'/g)
    for (const match of innerSingleQuotes) {
      // Must be either '123' (site_id) or 'YYYY-MM-DDTHH:mm:ss.SSSZ'
      if (match !== "'123'") {
        assert.match(match, /^'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z'$/)
      }
    }

    // Proving injection attempts fail immediately and do not generate any SQL
    const maliciousInputs = [
      "2026-01-01' OR 1=1 --",
      "2026-01-01); DROP TABLE events; --",
      "now() - INTERVAL 999 DAY",
      "2026-01-01 UNION SELECT"
    ]

    for (const input of maliciousInputs) {
      assert.throws(() => {
        buildProductionQuery('2026-01-01', input)
      }, /Date input must match/, `Expected query builder rejection for input: ${input}`)
    }
  })
})
