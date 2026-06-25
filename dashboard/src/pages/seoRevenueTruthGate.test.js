import test from 'node:test'
import assert from 'node:assert'

import { hasRevenueData } from './seoRevenueTruthGate.js'

test('hasRevenueData — SEO revenue truth-gate', async (t) => {
  await t.test('(a) no revenue at all → false (empty-state shown, not $0)', () => {
    assert.strictEqual(hasRevenueData({ organic_revenue: 0 }, []), false)
  })

  await t.test('summary missing / null → false (no fake $0)', () => {
    assert.strictEqual(hasRevenueData(undefined, undefined), false)
    assert.strictEqual(hasRevenueData(null, null), false)
  })

  await t.test('(b) revenue present in summary → true (render figure)', () => {
    assert.strictEqual(hasRevenueData({ organic_revenue: 1234 }, []), true)
  })

  await t.test('guardrail: per-page $0 while another page has revenue → true (do not hide)', () => {
    assert.strictEqual(
      hasRevenueData({ organic_revenue: 500 }, [{ revenue: 0 }, { revenue: 500 }]),
      true
    )
  })

  await t.test('revenue only in a landing page (summary 0) → true', () => {
    assert.strictEqual(hasRevenueData({ organic_revenue: 0 }, [{ revenue: 42 }]), true)
  })

  await t.test('all landing pages $0 and summary 0 → false', () => {
    assert.strictEqual(hasRevenueData({ organic_revenue: 0 }, [{ revenue: 0 }, { revenue: 0 }]), false)
  })
})
