# QA Report — Session 140G-14 — HogQL Date Param Sanitization

## 1. Task Overview
- **Core Goal**: Hardening HogQL date/time parameter usage across the attribution engine and analytics/reporting routes in the SourceTrack / TrackIQ repository to prevent SQL/HogQL injections, calendar date anomalies, and incorrect reporting windows.
- **Constraints**:
  - Do not commit or push.
  - Do not do broad refactors.
  - Reject natural language and expressions (e.g. `now() - INTERVAL 999 DAY`).
  - Accept only three formats: `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ssZ`, `YYYY-MM-DDTHH:mm:ss.SSSZ`.
  - Perform strict calendar validation (e.g. reject `2026-02-30`) via string round-trip checks.
  - Option names must use `exclusiveEndForDateOnly` instead of `endOfDay`.
  - Date-only range queries must use exclusive upper boundaries (`timestamp >= start AND timestamp < end`) by adding 1 day to the end date.
  - Invalid user dates must fail closed and return `400 Bad Request`.

## 2. Audited & Hardened Files

### Central Helper Library
- [api/lib/hogql-date.js](../../api/lib/hogql-date.js) `[NEW]`
  Contains the core date/time validators and sanitizers:
  - `serializeHogQLDateTime(input, options)`: Matches input against regex for `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ssZ`, and `YYYY-MM-DDTHH:mm:ss.SSSZ`. Converts to UTC, parses, and round-trips back to check calendar correctness. Supports the `exclusiveEndForDateOnly` option which shifts `YYYY-MM-DD` inputs by `+1` day.
  - `serializeHogQLDateRange(startInput, endInput, options)`: Ensures `start <= end` and returns serialized bounds.
  - `buildHogQLTimestampFilter(column, range)`: Outputs ready-to-use filter expressions like `column >= toDateTime(...) AND column < toDateTime(...)`.

### Affected API Routes & Logic
- [api/lib/attribution-engine.js](../../api/lib/attribution-engine.js) `[MODIFY]`
  - Replaced manual HogQL date formatting with centralized `serializeHogQLDateRange` and `serializeHogQLDateTime`.
  - Updated date range parameters to use exclusive bounds (`<`) instead of `<=`.
- [api/routes/sessions.js](../../api/routes/sessions.js) `[MODIFY]`
  - Wrapped `date_from`/`date_to` parameters in `serializeHogQLDateRange` with a try/catch block returning a `400 Bad Request` on failure.
- [api/routes/leads-server.js](../../api/routes/leads-server.js) `[MODIFY]`
  - Integrated `serializeHogQLDateRange` and `buildHogQLTimestampFilter` for safe filtering.
- [api/routes/events.js](../../api/routes/events.js) `[MODIFY]`
  - Removed insecure `isValidDate` helper and utilized `serializeHogQLDateTime` for range validation.
- [api/routes/attribution.js](../../api/routes/attribution.js) `[MODIFY]`
  - Implemented strict route-level try/catch with `serializeHogQLDateRange`.
- [api/routes/export.js](../../api/routes/export.js) `[MODIFY]`
  - Added try/catch date range validation to the `/report` export route.

## 3. Safety Classification & Matrix

| File | Function/Route | Date Source | HogQL Usage | Classification | Reason |
|---|---|---|---|---|---|
| [api/lib/attribution-engine.js](../../api/lib/attribution-engine.js) | `getFlexibleReport` / `getAttribution` | Query parameters (`dateFrom`, `dateTo`) | Filter clauses `timestamp >= ... AND timestamp < ...` | **Fixed** | Serialized into safe `toDateTime(...)` calls |
| [api/routes/sessions.js](../../api/routes/sessions.js) | `/api/sessions/overview` | Query parameters (`date_from`, `date_to`) | Filter queries | **Fixed** | Sanitized via `serializeHogQLDateRange` |
| [api/routes/leads-server.js](../../api/routes/leads-server.js) | `/api/leads-server` | Query parameters (`dateFrom`, `dateTo`) | Filter queries | **Fixed** | Sanitized via `serializeHogQLDateRange` |
| [api/routes/events.js](../../api/routes/events.js) | `/api/events/latest` | Query parameters (`date_from`, `date_to`) | Filter queries | **Fixed** | Sanitized via `serializeHogQLDateTime` |
| [api/routes/attribution.js](../../api/routes/attribution.js) | `/api/attribution` | Query parameters (`date_from`, `date_to`) | Input to attribution engine | **Fixed** | Sanitized via `serializeHogQLDateRange` |
| [api/routes/export.js](../../api/routes/export.js) | `/api/export/report` | Query parameters (`date_from`, `date_to`) | Input to report engine | **Fixed** | Sanitized via `serializeHogQLDateRange` |
| [api/jobs/nightly-attribution.js](../../api/jobs/nightly-attribution.js) | Nightly job | DB-sourced conversion timestamps | Internal query calculations | **Future follow-up** | DB-sourced conversion timestamps are not HTTP date parameters, but should be serialized with the same helper in a later hardening pass unless schema/type evidence proves they are safe. |
| [api/routes/dashboard.js](../../api/routes/dashboard.js) | `/api/dashboard/overview` | UTC Date Calculations | Date range padding and alignment | **Already Safe** | Uses server-derived dates generated using strict internal timezones. |

## 4. Test Coverage & Verification

### Unit Tests
A comprehensive test suite [api/tests/hogql-date.test.js](../../api/tests/hogql-date.test.js) was created covering:
1. **Valid Serialization**:
   - `2026-01-01` -> `toDateTime('2026-01-01T00:00:00.000Z')`
   - `2026-01-01` (exclusiveEndForDateOnly = true) -> `toDateTime('2026-01-02T00:00:00.000Z')`
   - `2026-01-01T12:30:00Z` -> `toDateTime('2026-01-01T12:30:00.000Z')`
   - `2026-01-01T12:30:00.000Z` -> `toDateTime('2026-01-01T12:30:00.000Z')`
2. **Invalid Input Format Rejections**:
   - Natural language/expressions (`now() - INTERVAL 999 DAY`), injections, invalid formats (`2026/01/01`, `01-01-2026`, etc.).
3. **Invalid Calendar Date Rejections**:
   - `2026-02-30` (non-existent February date)
   - `2026-04-31` (non-existent April date)
   - `2026-13-01` (invalid month 13)
   - `2026-00-01` (invalid month 00)
   - `2026-01-01T25:00:00Z` (invalid hour 25)
   - `2026-01-01T12:60:00Z` (invalid minute 60)
4. **Range Comparison**:
   - Correctly throws if `start > end`.
5. **HogQL Timestamp Filter Builder**:
   - Correctly generates valid filters and rejects invalid column structures.
6. **Query Builder Integration Test**:
   - Proves a simulated query builder safely encapsulates dates without allowing malicious injections to pollute the generated HogQL string.

### Test Execution Results
All test suites passed cleanly:
- `node --test api/tests/hogql-date.test.js` -> PASS (7 tests)
- `npm run qa:attribution:unit` -> PASS (16 tests)
- `npm run qa:tracker:unit` -> PASS (69 tests)
- `npm run qa:identity:unit` -> PASS (98 tests)
- `npm run qa:static` -> PASS

## 5. Security Summary
Date parameter sanitization has been audited and hardened for identified production query builders. User input is validated against strict ISO schemas and checked for calendar logic before being formatted into safe, quoted, server-generated HogQL literals. Natural language or raw expressions are blocked. All invalid inputs fail closed by returning `400 Bad Request`.
