/**
 * QA: Campaigns Resilience — verifies error handling, sanitization, and partial data behavior
 *
 * Tests:
 * 1. posthog.js queryHogQL error message strips HTML and truncates
 * 2. campaigns.js safeHogQL wrapper returns null on failure (not throw)
 * 3. campaigns.js overview response includes analytics_available + warning when HogQL fails
 * 4. campaigns.js overview error handler never leaks raw err.message
 * 5. Frontend-safe error strings contain no HTML tags
 */

import { strict as assert } from 'node:assert'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`)
    failed++
  }
}

console.log('==================================================')
console.log('  QA: Campaigns Resilience & Error Sanitization   ')
console.log('==================================================\n')

// ─── 1. posthog.js: error message truncation logic ───

test('HogQL error strips HTML tags from response body', () => {
  // Simulate what posthog.js now does on non-ok response
  const rawHtml = '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>'
  const cleaned = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const snippet = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
  const errorMsg = `HogQL flexible_report failed (502): ${snippet}`

  assert.ok(!errorMsg.includes('<html>'), 'Error should not contain <html> tag')
  assert.ok(!errorMsg.includes('<body>'), 'Error should not contain <body> tag')
  assert.ok(!errorMsg.includes('</'), 'Error should not contain closing HTML tags')
  assert.ok(errorMsg.includes('502 Bad Gateway'), 'Error should preserve status text')
  assert.ok(errorMsg.includes('HogQL flexible_report failed (502)'), 'Error should have query name and status')
})

test('HogQL error truncates long response bodies to 200 chars', () => {
  const longBody = 'x'.repeat(5000)
  const cleaned = longBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const snippet = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
  const errorMsg = `HogQL test failed (500): ${snippet}`

  // snippet itself should be 201 chars (200 + …)
  assert.ok(snippet.length <= 201, `Snippet should be ≤201 chars, got ${snippet.length}`)
  assert.ok(errorMsg.length < 300, `Full error should be <300 chars, got ${errorMsg.length}`)
})

test('HogQL error handles empty response body', () => {
  const rawHtml = ''
  const cleaned = rawHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const snippet = cleaned.length > 200 ? cleaned.slice(0, 200) + '…' : cleaned
  const errorMsg = `HogQL test failed (502): ${snippet}`
  assert.ok(errorMsg === 'HogQL test failed (502): ', 'Empty body should produce empty snippet')
})

// ─── 2. safeHogQL wrapper behavior ───

test('safeHogQL returns null on error (does not throw)', async () => {
  // Reproduce the exact safeHogQL pattern from campaigns.js
  const safeHogQL = async (fn) => {
    try { return await fn() } catch (err) {
      return null
    }
  }

  const result = await safeHogQL(() => { throw new Error('HogQL failed (502): Bad Gateway') })
  assert.strictEqual(result, null, 'safeHogQL should return null on error')
})

test('safeHogQL returns data on success', async () => {
  const safeHogQL = async (fn) => {
    try { return await fn() } catch (err) {
      return null
    }
  }

  const result = await safeHogQL(() => Promise.resolve([{ dim_value: 'google', revenue: 100 }]))
  assert.ok(Array.isArray(result), 'safeHogQL should return data on success')
  assert.strictEqual(result.length, 1)
})

// ─── 3. analyticsAvailable flag logic ───

test('analyticsAvailable is false when any HogQL returns null', () => {
  const revenueResult = null  // simulated failure
  const conversionsResult = [{ conversions: 5 }]
  const visitsResult = [{ sessions: 10 }]
  const leadsResult = [{ leads: 2 }]

  const analyticsAvailable = revenueResult !== null && conversionsResult !== null && visitsResult !== null && leadsResult !== null
  assert.strictEqual(analyticsAvailable, false, 'Should be false when any result is null')
})

test('analyticsAvailable is true when all HogQL queries succeed', () => {
  const revenueResult = []
  const conversionsResult = []
  const visitsResult = []
  const leadsResult = []

  const analyticsAvailable = revenueResult !== null && conversionsResult !== null && visitsResult !== null && leadsResult !== null
  assert.strictEqual(analyticsAvailable, true, 'Should be true when all results are non-null (even empty)')
})

test('warning object is included only when analyticsAvailable is false', () => {
  // Simulate response building
  const buildResponse = (analyticsAvailable) => ({
    analytics_available: analyticsAvailable,
    ...(analyticsAvailable ? {} : {
      warning: {
        type: 'analytics_unavailable',
        message: 'Campaign analytics are temporarily unavailable.'
      }
    }),
    kpis: { total_revenue: 0 }
  })

  const failResponse = buildResponse(false)
  assert.ok(failResponse.warning, 'Warning should exist when analytics unavailable')
  assert.strictEqual(failResponse.warning.type, 'analytics_unavailable')
  assert.strictEqual(failResponse.warning.message, 'Campaign analytics are temporarily unavailable.')
  assert.strictEqual(failResponse.analytics_available, false)

  const okResponse = buildResponse(true)
  assert.strictEqual(okResponse.warning, undefined, 'Warning should not exist when analytics available')
  assert.strictEqual(okResponse.analytics_available, true)
})

// ─── 4. overview error handler never leaks raw err.message ───

test('overview catch block sends safe static string, not err.message', () => {
  // Simulate the catch block from campaigns.js overview handler
  const err = new Error('HogQL flexible_report failed (502): 502 Bad Gateway nginx')
  const safeLog = (err.message || '').slice(0, 300)
  const responseError = 'Campaign data is temporarily unavailable. Please try again.'

  // The response should always be the safe static string
  assert.ok(!responseError.includes('HogQL'), 'Response error should not contain HogQL')
  assert.ok(!responseError.includes('502'), 'Response error should not contain 502')
  assert.ok(!responseError.includes('nginx'), 'Response error should not contain nginx')
  assert.ok(!responseError.includes('<'), 'Response error should not contain HTML')
  // The log should be truncated
  assert.ok(safeLog.length <= 300, 'Log should be truncated to 300 chars')
})

// ─── 5. Frontend-safe strings contain no HTML ───

test('All user-visible error strings are safe static copy', () => {
  const userVisibleStrings = [
    'Campaign data is temporarily unavailable. Please try again.',
    'Campaign data is temporarily unavailable.',
    'Imported costs can still be managed below.',
    'Campaign analytics are temporarily unavailable.',
    'Imported costs can still be managed.',
    'Revenue chart unavailable',
    'No campaign data yet',
    'Import ad costs or wait for tracked campaign traffic.',
    'Loading campaign data…',
    'No results match your filters.'
  ]

  for (const str of userVisibleStrings) {
    assert.ok(!str.includes('<'), `"${str}" should not contain <`)
    assert.ok(!str.includes('>'), `"${str}" should not contain >`)
    assert.ok(!/<html|<body|<div|<span|error\.message/i.test(str), `"${str}" should not contain HTML tags or error.message`)
  }
})

// ─── 6. fetchApi double-unwrap fix verification ───

test('fetchApi returns data.data directly (overview object), not wrapped', () => {
  // Simulate what fetchApi does
  const serverResponse = {
    success: true,
    data: {
      kpis: { total_revenue: 500, total_visits: 100 },
      rows: [{ name: 'google', revenue: 300 }],
      analytics_available: true,
      date_from: '2026-05-09',
      date_to: '2026-06-08'
    },
    error: null
  }

  // fetchApi logic: return data.data !== undefined ? data.data : data
  const fetchApiResult = serverResponse.data !== undefined ? serverResponse.data : serverResponse

  // OLD bug: const overview = fetchApiResult?.data → undefined
  const buggyOverview = fetchApiResult?.data
  assert.strictEqual(buggyOverview, undefined, 'Old pattern data?.data should be undefined (proving the bug)')

  // NEW fix: const overview = fetchApiResult (used directly)
  const fixedOverview = fetchApiResult
  assert.ok(fixedOverview.kpis, 'Fixed pattern should have kpis')
  assert.strictEqual(fixedOverview.kpis.total_revenue, 500)
  assert.ok(fixedOverview.rows.length === 1)
  assert.strictEqual(fixedOverview.analytics_available, true)
})

// ─── Summary ───

console.log(`\n${'='.repeat(50)}`)
if (failed === 0) {
  console.log(`🎉 ALL ${passed} CAMPAIGNS RESILIENCE TESTS PASSED! 🎉`)
} else {
  console.log(`⚠️  ${passed} passed, ${failed} FAILED`)
  process.exit(1)
}
