import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion
} from '../lib/conversion-sync.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// The CAPI fan-out reads these columns off `sites`. They MUST all exist on prod —
// selecting a phantom column makes PostgREST error, which nulls capiSite and
// silently kills the whole fan-out (the bug this guards). tiktok_* and
// google_ads_access_token do NOT exist on prod and must never reappear here.
const REAL_CAPI_COLUMNS = new Set([
  'meta_pixel_id', 'meta_capi_token',
  'google_ads_customer_id', 'google_ads_conversion_action_id', 'google_ads_developer_token',
  'microsoft_tag_id', 'microsoft_capi_token',
  'linkedin_partner_id', 'linkedin_capi_token'
])
const FORBIDDEN = ['tiktok_pixel_id', 'tiktok_access_token', 'google_ads_access_token']

// Pull the CAPI `.select('...')` (the one containing meta_capi_token) from a route file.
function capiSelectColumns(relPath) {
  const src = fs.readFileSync(path.join(rootDir, relPath), 'utf8')
  const m = src.match(/\.select\('([^']*meta_capi_token[^']*)'\)/)
  assert.ok(m, `${relPath}: CAPI select not found`)
  return m[1].split(',').map(s => s.trim()).filter(Boolean)
}

for (const file of ['api/routes/conversion.js', 'api/routes/conversion-offline.js']) {
  test(`CAPI select in ${file} references only columns that exist on prod`, () => {
    const cols = capiSelectColumns(file)
    for (const c of cols) {
      assert.ok(REAL_CAPI_COLUMNS.has(c), `${file}: phantom CAPI column in select: "${c}"`)
    }
    for (const bad of FORBIDDEN) {
      assert.ok(!cols.includes(bad), `${file}: forbidden phantom column reintroduced: "${bad}"`)
    }
  })
}

test('CAPI senders no-op cleanly when a site has no tokens (no throw, returns null)', async () => {
  const emptySite = { id: 'site-x' }
  const evt = { conversion_type: 'purchase', conversion_value: 10, gclid: 'g1', email: 'a@b.com' }
  for (const [name, fn] of [
    ['meta', sendMetaCAPI], ['google', sendGoogleConversion],
    ['microsoft', sendMicrosoftConversion], ['linkedin', sendLinkedInConversion]
  ]) {
    const res = await fn(emptySite, evt)
    assert.strictEqual(res, null, `${name} sender should return null with no tokens`)
  }
})
