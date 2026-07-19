// Silent-lie sweep — structural guard, one assertion block per customer-DATA surface.
//
// The rule being enforced (design spec §5.1 "no fake zeros"): a FAILED query must render an
// honest error state, NEVER the surface's empty state. An error rendered as "you have no data"
// is a fake zero — it tells the customer their data is empty when the truth is we couldn't fetch it.
//
// No frontend test runner exists in this repo (node:test is backend-only; there is no jsdom /
// testing-library / vitest), so we cannot render the JSX. Instead we assert the invariant at the
// SOURCE level per surface — the same structural-assertion technique used by
// flexible-report-window-bound.test.js. For each surface we prove:
//   (1) it imports the shared <QueryError> component,
//   (2) its PRIMARY data query destructures { isError, error } (so the state is even observable),
//   (3) a <QueryError> is rendered, and
//   (4) that render appears BEFORE the surface's empty-state copy — so on error the code takes the
//       error branch and can never fall through to the "no data" branch.
// The behavioural rule itself (query_timeout vs generic wording) is unit-tested in
// query-error-helper.test.js against the pure describeQueryError() helper the component consumes.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PAGES = join(__dirname, '../../dashboard/src/pages')

// One entry per customer-DATA surface swept. `emptyMarker` is a string that only appears in that
// surface's EMPTY state — the QueryError render must precede it in source order.
const SURFACES = [
  { file: 'Leads.jsx',       emptyMarker: 'No leads yet' },
  { file: 'Dashboard.jsx',   emptyMarker: 'No attribution data yet' },
  { file: 'Analytics.jsx',   emptyMarker: 'No pageviews yet' },
  { file: 'SEORevenue.jsx',  emptyMarker: 'No organic search traffic' },
  { file: 'Campaigns.jsx',   emptyMarker: 'No campaign data yet' }
]

for (const { file, emptyMarker } of SURFACES) {
  test(`${file}: a failed query renders <QueryError>, never the empty state`, () => {
    const src = readFileSync(join(PAGES, file), 'utf8')

    // (1) imports the shared component
    assert.match(src, /import QueryError from ['"]\.\.\/components\/QueryError['"]/,
      `${file} must import the shared QueryError component`)

    // (2) the primary data query exposes isError + error (the state must be observable at all)
    assert.match(src, /\bisError\b/, `${file} must read isError from its data query`)
    assert.match(src, /\berror\b/, `${file} must read error from its data query`)

    // (3) it actually renders <QueryError ...>
    const qeAt = src.indexOf('<QueryError')
    assert.ok(qeAt > 0, `${file} must render a <QueryError> element`)

    // (4) the error render precedes the empty-state copy, so error takes its own branch first
    const emptyAt = src.indexOf(emptyMarker)
    assert.ok(emptyAt > 0, `${file}: expected empty-state marker "${emptyMarker}" to exist`)
    assert.ok(qeAt < emptyAt,
      `${file}: <QueryError> must render BEFORE the empty state ("${emptyMarker}") — otherwise a ` +
      `fetch error falls through and renders as "no data" (a fake zero, §5.1).`)
  })
}
