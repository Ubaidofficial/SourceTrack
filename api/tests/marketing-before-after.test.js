import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { comparisonDemoData } from '../../dashboard/src/lib/marketingDemoData.js'

test('Marketing Before/After — comparisonDemoData structure & empty Before state', () => {
  assert.ok(comparisonDemoData, 'comparisonDemoData must be exported')
  assert.ok(comparisonDemoData.default, 'Must export default preset')
  assert.ok(comparisonDemoData.ecommerce, 'Must export ecommerce preset')

  // Check default preset structure: Before card MUST have empty touchpoints
  const { before, after } = comparisonDemoData.default
  assert.strictEqual(before.badge, 'Without SourceTrack')
  assert.strictEqual(before.source, '(direct) / (none)')
  assert.ok(Array.isArray(before.touchpoints))
  assert.strictEqual(before.touchpoints.length, 0, 'Before card touchpoints must be empty array (absence vs presence)')
  assert.ok(before.emptyMessage, 'Before card must have emptyMessage')

  // After card has full multi-step touchpoint chain
  assert.strictEqual(after.badge, 'With SourceTrack')
  assert.strictEqual(after.source, 'ChatGPT (AI Search)')
  assert.ok(Array.isArray(after.touchpoints))
  assert.ok(after.touchpoints.length >= 3, 'After journey must include multi-touchpoint chain')
  assert.strictEqual(after.utmSource, 'chatgpt')
})

test('Marketing Before/After — design tokens & no glassmorphism', () => {
  const componentPath = path.resolve('dashboard/src/components/MarketingBeforeAfter.jsx')
  assert.ok(fs.existsSync(componentPath), 'MarketingBeforeAfter.jsx must exist')

  const content = fs.readFileSync(componentPath, 'utf8')
  assert.ok(content.includes('export default function MarketingBeforeAfter'), 'Must export default React component')

  // DESIGN SYSTEM REGRESSION CHECKS: No glassmorphism or background glows!
  assert.strictEqual(content.includes('backdrop-blur'), false, 'Glassmorphism backdrop-blur is prohibited')
  assert.strictEqual(content.includes('backdrop-filter'), false, 'Glassmorphism backdrop-filter is prohibited')
  assert.strictEqual(content.includes('shadow-[0_0_'), false, 'Lime background glow effect is prohibited')
})
