const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const DATE_TIME_MS_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * Validates and serializes a date/time input into a safe HogQL toDateTime(...) call.
 *
 * @param {string|Date} input
 * @param {object} [options]
 * @param {boolean} [options.exclusiveEndForDateOnly] - If true and input is date-only YYYY-MM-DD, shifts date by +1 day (exclusive range boundary).
 * @returns {string} - e.g., "toDateTime('2026-05-31T00:00:00.000Z')"
 */
export function serializeHogQLDateTime(input, options = {}) {
  if (input === null || input === undefined) {
    throw new Error('Date input is required')
  }

  let str
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new Error('Invalid Date object')
    }
    str = input.toISOString()
  } else if (typeof input === 'string') {
    str = input.trim()
  } else {
    throw new Error('Invalid date input type')
  }

  if (!str) {
    throw new Error('Date input cannot be empty')
  }

  if (str.length > 50) {
    throw new Error('Date input too long')
  }

  const isDateOnly = DATE_ONLY_RE.test(str)
  const isDateTime = DATE_TIME_Z_RE.test(str)
  const isDateTimeMs = DATE_TIME_MS_Z_RE.test(str)

  if (!isDateOnly && !isDateTime && !isDateTimeMs) {
    throw new Error('Date input must match YYYY-MM-DD, YYYY-MM-DDTHH:mm:ssZ, or YYYY-MM-DDTHH:mm:ss.SSSZ')
  }

  const d = new Date(str)
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date value')
  }

  const year = d.getUTCFullYear()
  if (year < 2000 || year > 2100) {
    throw new Error('Date year must be between 2000 and 2100')
  }

  // Round-trip calendar validation
  const actualIso = d.toISOString()
  if (isDateOnly) {
    if (actualIso.slice(0, 10) !== str) {
      throw new Error(`Invalid calendar date: ${str}`)
    }
  } else if (isDateTime) {
    if (actualIso !== str.replace('Z', '.000Z')) {
      throw new Error(`Invalid calendar datetime: ${str}`)
    }
  } else if (isDateTimeMs) {
    if (actualIso !== str) {
      throw new Error(`Invalid calendar datetime: ${str}`)
    }
  }

  if (isDateOnly && options.exclusiveEndForDateOnly) {
    d.setUTCDate(d.getUTCDate() + 1)
  }

  const iso = d.toISOString()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
    throw new Error('Internal serialization format error')
  }

  return `toDateTime('${iso}')`
}

/**
 * Validates and serializes a start and end date range, enforcing start <= end.
 *
 * @param {string|Date} startInput
 * @param {string|Date} endInput
 * @param {object} [options]
 * @param {boolean} [options.exclusiveEnd] - Defaults to true. If true, date-only end date is shifted by +1 day.
 * @returns {{ from: string, to: string }}
 */
export function serializeHogQLDateRange(startInput, endInput, options = {}) {
  const exclusiveEnd = options.exclusiveEnd !== false
  const from = serializeHogQLDateTime(startInput, { exclusiveEndForDateOnly: false })
  const to = serializeHogQLDateTime(endInput, { exclusiveEndForDateOnly: exclusiveEnd })

  const fromIso = from.match(/'([^']+)'/)[1]
  const toIso = to.match(/'([^']+)'/)[1]

  if (new Date(fromIso).getTime() > new Date(toIso).getTime()) {
    throw new Error('Start date must be before or equal to end date')
  }

  return { from, to }
}

/**
 * Builds a HogQL timestamp range filter.
 *
 * @param {string} column - e.g. "timestamp"
 * @param {{ from: string, to: string }} range - Serialized HogQL expressions
 * @returns {string}
 */
export function buildHogQLTimestampFilter(column, range) {
  if (typeof column !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(column)) {
    throw new Error('Invalid column name')
  }
  return `${column} >= ${range.from} AND ${column} < ${range.to}`
}
