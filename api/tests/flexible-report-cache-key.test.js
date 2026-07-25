// getFlexibleReport cache key — the shared-builder de-duplication.
// TOKEN-FREE, NO network, no DB (pipe reads via __setAttributionReadDeps).
//
// THE HAZARD: getFlexibleReport and __evictFlexibleReportCache built their key from TWO
// hand-written string templates that had to stay byte-identical — the comment there used to say
// "Key reconstruction MUST match below", a rule to remember rather than a structure that enforces
// itself. Every discriminator added to the report has to reach BOTH sites, and the seam failing
// silently is the bad outcome: an evict that misses just returns the STALE cached report, with no
// error. Exactly the trap #407 removed from getSessionReport via sessionCacheKey().
//
// Nothing had broken yet, so flexibleReportCacheKey() is pure de-duplication of an
// already-correct-today shape. These tests prove the shared builder actually DISCRIMINATES and that
// both consumers agree on it — not merely that it compiles.
//
//   PART 1  two key variants are distinct entries; evicting ONE spares the OTHER
//           (the #407 PART 3 shape — a drifted seam would silently no-op)
//   PART 2  same for a second discriminator, so the proof isn't specific to one argument
//   PART 3  ANTI-DRIFT: neither site open-codes the template any more

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  getFlexibleReport, __evictFlexibleReportCache,
  __setAttributionReadDeps, __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')

const SITE = 'site-flexkey'
const MODEL = 'last_touch'
const FROM = '2026-07-01'
const TO = '2026-07-31'

// provider = a Class-A conversion-property dim, so the pipe dispatches for a touch model with OR
// without an attribution window and regardless of granularity. That is what lets these tests vary a
// KEY discriminator while holding the DISPATCH constant — the cache is the only thing under test.
const DIM = 'provider'
const METRIC = 'conversions'

// Arg tail after (siteId, model, dateFrom, dateTo, groupBy, metric):
//   filters, groupBy2, granularity, attributionWindow, attributeBy
const tail = ({ granularity = 'day', attributionWindow = null } = {}) =>
  [{}, null, granularity, attributionWindow, 'conversion_date']

const call = (over) => getFlexibleReport(SITE, MODEL, FROM, TO, DIM, METRIC, ...tail(over))
const evict = (over) => __evictFlexibleReportCache(SITE, MODEL, FROM, TO, DIM, METRIC, ...tail(over))

const rowsFor = (n) => [{ dim_value: 'stripe', metric_value: n }]
const depsFor = (n) => ({
  queryTinybird: async (pipe) => (pipe === 'flexible_report_provider_by_site' ? rowsFor(n) : null),
  queryHog: async () => { throw new Error('HogQL must not be called — the pipe path serves this') }
})
const valueOf = (res) => (Array.isArray(res) ? res : res.results).find(r => r.dim_value === 'stripe')[METRIC]

// One evict-one-spares-the-other proof, parameterised over which discriminator differs.
// A = the variant we evict, B = the variant that must survive untouched.
async function evictOneSparesOther (A, B, label) {
  evict(A); evict(B)                                    // clean slate for both variants
  __setAttributionReadDeps(depsFor(1))
  try {
    assert.equal(valueOf(await call(A)), 1, `${label}: A computed`)
    assert.equal(valueOf(await call(B)), 1, `${label}: B computed`)

    // Change the underlying data. BOTH variants are cached, so neither may move yet.
    __setAttributionReadDeps(depsFor(2))
    assert.equal(valueOf(await call(A)), 1, `${label}: A still cached`)
    assert.equal(valueOf(await call(B)), 1, `${label}: B still cached`)

    // Evict ONLY A. If the seam built a different key than the read path wrote, this silently
    // no-ops and A stays stale at 1 — the drift this test exists to catch.
    evict(A)
    assert.equal(valueOf(await call(A)), 2,
      `${label}: A RECOMPUTED — the seam hit the same key the read path wrote`)
    assert.equal(valueOf(await call(B)), 1,
      `${label}: B untouched — evicting one variant must not clear another`)
  } finally { __resetAttributionReadDeps() }
}

test('🔴 PART 1: granularity variants are distinct entries; evict(day) spares month', async () => {
  await evictOneSparesOther({ granularity: 'day' }, { granularity: 'month' }, 'granularity')
})

test('🔴 PART 2: attributionWindow variants are distinct entries; evict(null) spares 30', async () => {
  await evictOneSparesOther({ attributionWindow: null }, { attributionWindow: '30' }, 'attributionWindow')
})

// PART 3 — ANTI-DRIFT. The whole point of the change is that the template exists in ONE place.
const ENGINE_SRC = readFileSync(join(ROOT, 'api/lib/attribution-engine.js'), 'utf8')

test('🔴 PART 3: the flexible-report key template exists in exactly ONE place', () => {
  const templates = [...ENGINE_SRC.matchAll(
    /JSON\.stringify\(filters\) \+ groupBy2 \+ granularity \+ attributionWindow \+ attributeBy/g
  )].length
  assert.equal(templates, 1,
    'the filterKey concatenation must live only in flexibleReportCacheKey() — ' +
    're-inlining it at a call site is the drift this change removed')
  const keyExprs = [...ENGINE_SRC.matchAll(/cacheKey\(`\$\{model\}:\$\{groupBy\}:\$\{metric\}:/g)].length
  assert.equal(keyExprs, 1, 'the cacheKey() expression must live only in flexibleReportCacheKey()')
})

test('🔴 PART 3b: both consumers call the shared builder', () => {
  const calls = [...ENGINE_SRC.matchAll(/flexibleReportCacheKey\(siteId, model, dateFrom, dateTo, groupBy, metric,/g)].length
  assert.equal(calls, 2, 'expected exactly 2 consumers: getFlexibleReport and __evictFlexibleReportCache')
})
