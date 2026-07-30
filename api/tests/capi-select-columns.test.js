import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  sendMetaCAPI, sendGoogleConversion, sendMicrosoftConversion, sendLinkedInConversion,
  sendGA4Conversion, sendTikTokConversion
} from '../lib/conversion-sync.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// The CAPI fan-out reads these columns off `sites`. They MUST all exist on prod —
// selecting a phantom column makes PostgREST error, which nulls capiSite and
// silently kills the whole fan-out (the bug this guards).
//
// ⚠️ APPLY-THEN-MERGE (§8): the ga4_* and tiktok_* entries below depend on
// supabase/migrations/20260729000000_capi_ga4_tiktok_columns.sql being applied to
// the target database FIRST. Until the founder applies it, those four columns are
// phantom on prod and the fan-out would break exactly as this guard describes.
//
// google_ads_access_token does NOT exist on prod and must never reappear here.
// tiktok_pixel_id / tiktok_access_token are the names from the earlier abandoned
// attempt and stay FORBIDDEN — the real columns are tiktok_pixel_code /
// tiktok_capi_token (the Events API wants the Pixel Code, not the advertiser id).
const REAL_CAPI_COLUMNS = new Set([
  'id',
  'meta_pixel_id', 'meta_capi_token',
  'google_ads_customer_id', 'google_ads_conversion_action_id', 'google_ads_developer_token',
  'microsoft_tag_id', 'microsoft_capi_token',
  'linkedin_partner_id', 'linkedin_capi_token',
  'ga4_measurement_id', 'ga4_api_secret',
  'tiktok_pixel_code', 'tiktok_capi_token'
])
const FORBIDDEN = ['tiktok_pixel_id', 'tiktok_access_token', 'google_ads_access_token', 'tiktok_advertiser_id']

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
    ['microsoft', sendMicrosoftConversion], ['linkedin', sendLinkedInConversion],
    ['ga4', sendGA4Conversion], ['tiktok', sendTikTokConversion]
  ]) {
    const res = await fn(emptySite, evt)
    assert.strictEqual(res, null, `${name} sender should return null with no tokens`)
  }
})

// ── The 7-touchpoint checklist, made executable ──────────────────────────────
// Microsoft + LinkedIn shipped as live-looking code that could never fire because
// a platform was added to some touchpoints but not others. This asserts the three
// touchpoints that a config-exposed platform CANNOT be missing, so the next
// platform fails CI instead of failing silently in production.
//
// Text-based (same idiom as capiSelectColumns above) rather than importing the
// route module, which would pull in the Supabase client at load time.
function readSrc(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8')
}

test('every configurable CAPI platform is wired through dispatch + both SELECT lists', () => {
  const capiSrc = readSrc('api/routes/capi.js')
  const platformBlock = capiSrc.match(/export const CAPI_PLATFORMS = \{([\s\S]*?)\n\}/)
  assert.ok(platformBlock, 'CAPI_PLATFORMS block not found in api/routes/capi.js')

  // Platform keys + the columns each one declares (tokenCol + every idCol).
  // An EXTERNAL platform (credential held in another table, e.g. google -> the OAuth row in
  // ad_platform_connections) declares no sites columns at all. Its quoted strings are a
  // table name and a platform enum value, NOT columns, so they must not be fed to the
  // SELECT-list assertion — doing so would demand `ad_platform_connections` be a column of
  // `sites`. It is checked against its own table instead, below.
  const platforms = [...platformBlock[1].matchAll(/^\s*(\w+):\s*\{(.*)$/gm)].map(m => ({
    key: m[1],
    external: /external:/.test(m[2]),
    columns: /external:/.test(m[2]) ? [] : [...m[2].matchAll(/'([a-z0-9_]+)'/g)].map(c => c[1])
  }))
  assert.ok(platforms.length >= 4, `expected >=4 configurable platforms, got ${platforms.length}`)

  // Anchor on the closing bracket at the array's own indentation — a lazy `\]`
  // would stop at the first inner `['meta', …]` pair and match only one platform.
  const sendersBlock = readSrc('api/lib/conversion-sync.js').match(/const senders = \[([\s\S]*?)\n {2}\]/)
  assert.ok(sendersBlock, 'dispatchCapi senders array not found')

  for (const { key, columns } of platforms) {
    // Touchpoint 6 — registered in the dispatchCapi fan-out.
    assert.ok(
      new RegExp(`\\['${key}',`).test(sendersBlock[1]),
      `platform "${key}" is configurable but NOT registered in dispatchCapi — stillborn sender`
    )
    // Touchpoints 4 + 5 — present in BOTH hardcoded SELECT lists (separate files).
    // Vacuous for an external platform (columns === []), which is correct: it has no
    // sites columns to select. Its equivalent touchpoint is asserted separately below.
    for (const file of ['api/routes/conversion.js', 'api/routes/conversion-offline.js']) {
      const cols = capiSelectColumns(file)
      for (const col of columns) {
        assert.ok(cols.includes(col), `${file}: platform "${key}" column "${col}" missing from CAPI select`)
      }
    }
    // Touchpoint 3 — a config card exists in the dashboard.
    assert.ok(
      new RegExp(`key: '${key}'`).test(readSrc('dashboard/src/components/CapiSettings.jsx')),
      `platform "${key}" has no config card in CapiSettings.jsx — token can never be set`
    )
  }
})

// ── External-platform touchpoint (google) ────────────────────────────────────
// An external platform swaps the "column in both SELECT lists" touchpoint for a different
// one: the connection must be PRE-LOADED onto `site` by both conversion routes before
// dispatchCapi runs, because senders take (site, evt) and do no I/O. Miss that in one route
// and the platform silently no-ops on exactly one ingestion path — the same stillborn-sender
// failure the checklist above exists to prevent, just relocated.
test('external CAPI platforms are pre-loaded by BOTH conversion routes before dispatch', () => {
  const capiSrc = readSrc('api/routes/capi.js')
  const block = capiSrc.match(/export const CAPI_PLATFORMS = \{([\s\S]*?)\n\}/)
  assert.ok(block, 'CAPI_PLATFORMS block not found')
  const externals = [...block[1].matchAll(/^\s*(\w+):\s*\{[^}]*external:/gm)].map(m => m[1])
  assert.ok(externals.includes('google'), 'google is expected to be an external platform')

  for (const file of ['api/routes/conversion.js', 'api/routes/conversion-offline.js']) {
    const src = readSrc(file)
    assert.ok(
      src.includes('attachGoogleAdsConnection'),
      `${file}: external platform connection is never pre-loaded — Google would always no-op here`
    )
    // Ordering matters: loading AFTER dispatch would be a no-op with no error.
    assert.ok(
      src.indexOf('attachGoogleAdsConnection(') < src.indexOf('dispatchCapi(getCapiSupabase()'),
      `${file}: connection must be pre-loaded BEFORE dispatchCapi`
    )
  }
})

// The dead sites columns stay in place (dropped by a separate later migration), but nothing
// may READ them for Google auth again — that is what made the platform unusable.
test('sendGoogleConversion no longer reads any per-site Google credential column', () => {
  const src = readSrc('api/lib/conversion-sync.js')
  const fn = src.slice(src.indexOf('export async function sendGoogleConversion'))
  const body = fn.slice(0, fn.indexOf('\n}\n'))
  for (const dead of ['site.google_ads_developer_token', 'site.google_ads_access_token', 'site.google_ads_customer_id', 'site.google_ads_conversion_action_id']) {
    assert.ok(!body.includes(dead), `sendGoogleConversion must not read ${dead}`)
  }
  assert.ok(body.includes('process.env.GOOGLE_ADS_DEVELOPER_TOKEN'), 'developer token must come from the shared app-level env var')
  assert.ok(body.includes('refreshAccessToken('), 'must mint an access token via the shared OAuth refresh')
})
