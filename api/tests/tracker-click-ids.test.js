import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeClickIds } from '../lib/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

test('Click ID Normalization Helper Unit Tests', async (t) => {
  await t.test('returns all 14 click ID fields with null fallbacks when empty', () => {
    const res = normalizeClickIds({})
    assert.strictEqual(res.gclid, null)
    assert.strictEqual(res.gbraid, null)
    assert.strictEqual(res.wbraid, null)
    assert.strictEqual(res.fbclid, null)
    assert.strictEqual(res.msclkid, null)
    assert.strictEqual(res.ttclid, null)
    assert.strictEqual(res.li_fat_id, null)
    assert.strictEqual(res.li_fatid, null)
    assert.strictEqual(res.twclid, null)
    assert.strictEqual(res.dclid, null)
    assert.strictEqual(res.snapclid, null)
    assert.strictEqual(res.pclid, null)
    assert.strictEqual(res.sccid, null)
    assert.strictEqual(res.ko_click_id, null)
  })

  await t.test('correctly maps and trims valid click IDs', () => {
    const input = {
      gclid: ' g-123 ',
      gbraid: 'gbr-456',
      wbraid: 'wbr-789',
      fbclid: 'fb-abc',
      msclkid: 'ms-def',
      ttclid: 'tt-ghi',
      twclid: 'tw-jkl',
      dclid: 'dc-mno',
      snapclid: 'snap-pqr',
      pclid: 'pc-stu',
      sccid: 'snap-xyz',
      ko_click_id: 'ko-123'
    }
    const res = normalizeClickIds(input)
    assert.strictEqual(res.gclid, 'g-123')
    assert.strictEqual(res.gbraid, 'gbr-456')
    assert.strictEqual(res.wbraid, 'wbr-789')
    assert.strictEqual(res.fbclid, 'fb-abc')
    assert.strictEqual(res.msclkid, 'ms-def')
    assert.strictEqual(res.ttclid, 'tt-ghi')
    assert.strictEqual(res.twclid, 'tw-jkl')
    assert.strictEqual(res.dclid, 'dc-mno')
    assert.strictEqual(res.snapclid, 'snap-pqr')
    assert.strictEqual(res.pclid, 'pc-stu')
    assert.strictEqual(res.sccid, 'snap-xyz')
    assert.strictEqual(res.ko_click_id, 'ko-123')
  })

  await t.test('normalizes LinkedIn aliases preferring li_fat_id', () => {
    // Scenario A: Only li_fatid is passed
    const resA = normalizeClickIds({ li_fatid: 'alias-val' })
    assert.strictEqual(resA.li_fat_id, 'alias-val')
    assert.strictEqual(resA.li_fatid, 'alias-val')

    // Scenario B: Only li_fat_id is passed
    const resB = normalizeClickIds({ li_fat_id: 'canonical-val' })
    assert.strictEqual(resB.li_fat_id, 'canonical-val')
    assert.strictEqual(resB.li_fatid, null)

    // Scenario C: Both passed (canonical takes precedence)
    const resC = normalizeClickIds({ li_fat_id: 'canonical-val', li_fatid: 'alias-val' })
    assert.strictEqual(resC.li_fat_id, 'canonical-val')
    assert.strictEqual(resC.li_fatid, 'alias-val')
  })

  await t.test('handles non-string types gracefully by falling back to null', () => {
    const res = normalizeClickIds({
      gclid: 12345,
      fbclid: true,
      msclkid: {}
    })
    assert.strictEqual(res.gclid, null)
    assert.strictEqual(res.fbclid, null)
    assert.strictEqual(res.msclkid, null)
  })
})

test('Tracker Source Files Static Checks', async (t) => {
  const clickIdKeys = [
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
    'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id'
  ]

  const checkTrackerFile = (fileName) => {
    const filePath = path.join(rootDir, 'tracker', fileName)
    assert.ok(fs.existsSync(filePath), `${fileName} must exist`)
    const code = fs.readFileSync(filePath, 'utf8')

    // 1. Verify _pk array split definition has all 12 click IDs
    const pkMatch = code.match(/var _pk = '([^']*)'/)
    assert.ok(pkMatch, `Could not find _pk array in ${fileName}`)
    const pkKeys = pkMatch[1].split(',')

    for (const key of clickIdKeys) {
      assert.ok(pkKeys.includes(key), `${fileName} _pk list must contain "${key}"`)
    }

    // 2. Verify utmFields returns all 12 click IDs
    for (const key of clickIdKeys) {
      const regex = new RegExp(`\\b${key}:\\s*p\\.${key}\\b`)
      assert.ok(regex.test(code), `${fileName} utmFields must map "${key}: p.${key}"`)
    }
  }

  await t.test('standard tracker.js has all parameters', () => {
    checkTrackerFile('tracker.js')
  })

  await t.test('cookieless tracker.cookieless.js has all parameters', () => {
    checkTrackerFile('tracker.cookieless.js')
  })
})

test('Setup Diagnostics & UI Consistency Checks', async (t) => {
  const clickIdKeys = [
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
    'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id'
  ]

  await t.test('setup-doctor.js clickIdTypes has all 14 click IDs', () => {
    const filePath = path.join(rootDir, 'api/lib/setup-doctor.js')
    const code = fs.readFileSync(filePath, 'utf8')
    const match = code.match(/const clickIdTypes = \[(.*?)\]/)
    assert.ok(match, 'Could not find clickIdTypes in setup-doctor.js')
    const types = match[1].replace(/['"\s]/g, '').split(',')
    for (const key of clickIdKeys) {
      assert.ok(types.includes(key), `setup-doctor.js clickIdTypes must contain "${key}"`)
    }
  })

  await t.test('EventDebugger.jsx contains references to all 14 click IDs', () => {
    const filePath = path.join(rootDir, 'dashboard/src/pages/EventDebugger.jsx')
    const code = fs.readFileSync(filePath, 'utf8')
    for (const key of clickIdKeys) {
      // Check that it's in the preview list
      assert.ok(code.includes(`e.${key}`), `EventDebugger.jsx must reference "e.${key}"`)
      // Check that it's in the details sidebar (matching case)
      const detailsKey = key === 'li_fat_id' ? 'li_fat_id' : key
      assert.ok(code.includes(`selectedEvent.${detailsKey}`), `EventDebugger.jsx details sidebar must reference "selectedEvent.${detailsKey}"`)
    }
  })
})

test('Tracker Client Context Helper Static Checks', async (t) => {
  const clickIdKeys = [
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
    'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id'
  ]

  const checkGetContext = (fileName) => {
    const filePath = path.join(rootDir, 'tracker', fileName)
    assert.ok(fs.existsSync(filePath), `${fileName} must exist`)
    const code = fs.readFileSync(filePath, 'utf8')

    // 1. Verify getContext is defined
    assert.ok(code.includes('getContext: function'), `${fileName} must implement getContext`)

    // 2. Verify all click IDs are referenced inside getContext
    const getContextStart = code.indexOf('getContext: function')
    const getContextBody = code.slice(getContextStart, getContextStart + 3000)

    for (const key of clickIdKeys) {
      assert.ok(getContextBody.includes(key), `${fileName} getContext must contain reference to "${key}"`)
    }

    // 3. Verify no obvious PII fields are exposed in getContext
    const piiKeys = ['email', 'phone', 'name', 'address']
    for (const pii of piiKeys) {
      const regex = new RegExp(`\\b${pii}\\s*:`)
      assert.ok(!regex.test(getContextBody), `${fileName} getContext must NOT expose PII key "${pii}"`)
    }
  }

  await t.test('standard tracker.js has getContext method and respects non-PII rules', () => {
    checkGetContext('tracker.js')
  })

  await t.test('cookieless tracker.cookieless.js has getContext method and respects non-PII rules', () => {
    checkGetContext('tracker.cookieless.js')
  })
})
