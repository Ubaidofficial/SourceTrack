import test from 'node:test'
import assert from 'node:assert'
import { classifyConversionType, LEAD_TYPES, CUSTOMER_TYPES } from '../lib/conversion-classifier.js'

test('Conversion Classifier Unit Tests', async (t) => {

  await t.test('All canonical lead types map to lead', () => {
    for (const type of LEAD_TYPES) {
      assert.strictEqual(classifyConversionType(type), 'lead', `Expected '${type}' to map to 'lead'`)
      assert.strictEqual(classifyConversionType(type.toUpperCase()), 'lead', `Expected uppercase '${type}' to map to 'lead'`)
      assert.strictEqual(classifyConversionType(`  ${type}  `), 'lead', `Expected padded '${type}' to map to 'lead'`)
    }
  })

  await t.test('All canonical customer types map to customer', () => {
    for (const type of CUSTOMER_TYPES) {
      assert.strictEqual(classifyConversionType(type), 'customer', `Expected '${type}' to map to 'customer'`)
      assert.strictEqual(classifyConversionType(type.toUpperCase()), 'customer', `Expected uppercase '${type}' to map to 'customer'`)
      assert.strictEqual(classifyConversionType(`  ${type}  `), 'customer', `Expected padded '${type}' to map to 'customer'`)
    }
  })

  await t.test('Untyped, generic, null, undefined, empty, and arbitrary strings map to other', () => {
    const others = [
      'conversion',
      'CONVERSION',
      'other',
      'random_event',
      '',
      '   ',
      null,
      undefined
    ]
    for (const input of others) {
      assert.strictEqual(classifyConversionType(input), 'other', `Expected '${input}' to map to 'other'`)
    }
  })
})
