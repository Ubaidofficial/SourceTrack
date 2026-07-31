// Currency is the UNIT on a money rail — these guard the three places it could be faked or lost.
//
// The incident behind them: a real CA$1,057 Shopify order landed as 753.06/USD. That pair turned
// out to be CORRECT (Shopify documents total_price as shop currency), but chasing it surfaced that
// the unit was thrown away at attribution materialization and re-invented as 'USD' by six ad-platform
// senders. A wrong currency on an ad ledger is not cosmetic: the platform books the amount, bids on
// it, and reports ROAS from it.

// Must be set before conversion-sync is imported (same preamble as capi-delivery.test.js).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)

import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCurrencyCode, hasKnownCurrency } from '../lib/currency.js'
import { dispatchCapi, encryptCapiToken } from '../lib/conversion-sync.js'
import { readShopifyOrderAmount } from '../routes/shopify-webhook.js'
import { PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } from '../lib/attribution-engine.js'

// ── normalizeCurrencyCode ────────────────────────────────────────────────────
test('normalizeCurrencyCode: canonicalizes real codes, rejects everything else', () => {
  assert.equal(normalizeCurrencyCode('usd'), 'USD')
  assert.equal(normalizeCurrencyCode('  cad '), 'CAD')
  assert.equal(normalizeCurrencyCode('EUR'), 'EUR')

  // Anything that is not a well-formed ISO 4217 alpha code is UNKNOWN, never 'USD'.
  for (const bad of [null, undefined, '', '   ', 'US', 'USDD', 'US1', '$', 840, {}, ['USD']]) {
    assert.equal(normalizeCurrencyCode(bad), null, `expected null for ${JSON.stringify(bad)}`)
  }
  assert.equal(hasKnownCurrency('usd'), true)
  assert.equal(hasKnownCurrency(''), false)
})

test('normalizeCurrencyCode agrees with the DB CHECK constraint it feeds', () => {
  // attributed_conversions_currency_format is CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$').
  // Anything this returns non-null must satisfy it, or the nightly write throws mid money rail.
  const constraint = /^[A-Z]{3}$/
  for (const raw of ['usd', 'Cad', ' eur ', 'JPY']) {
    assert.match(normalizeCurrencyCode(raw), constraint)
  }
})

// ── dispatchCapi money-truth gate ────────────────────────────────────────────
function mockSupabase () {
  const inserts = []
  return { inserts, from: () => ({ insert: (row) => { inserts.push(row); return Promise.resolve({ error: null }) } }) }
}

async function withFetch (impl, fn) {
  const original = global.fetch
  global.fetch = impl
  try { return await fn() } finally { global.fetch = original }
}

const META_SITE = () => ({ id: 's1', meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') })

test('dispatchCapi: a REVENUE event with no currency uploads to nobody', async () => {
  const sb = mockSupabase()
  let fetched = false
  await withFetch(async () => { fetched = true; return new Response('{}', { status: 200 }) }, async () => {
    await dispatchCapi(sb, META_SITE(), { conversion_type: 'purchase', conversion_value: 10, external_event_id: 'evt1' })
  })
  // No HTTP at all — the amount is unknowable, so asserting any unit for it would be a fabrication.
  assert.equal(fetched, false)
  // And no invented delivery rows for platforms this site never configured.
  assert.equal(sb.inserts.length, 0)
})

test('dispatchCapi: a revenue event WITH a currency still uploads normally', async () => {
  const sb = mockSupabase()
  let body
  await withFetch(async (_url, opts) => { body = JSON.parse(opts.body); return new Response('{}', { status: 200 }) }, async () => {
    await dispatchCapi(sb, META_SITE(), { conversion_type: 'purchase', conversion_value: 10, currency: 'eur', external_event_id: 'evt1' })
  })
  assert.equal(body.data[0].custom_data.currency, 'EUR')   // normalized, and NOT defaulted to USD
  assert.equal(sb.inserts.length, 1)
  assert.equal(sb.inserts[0].status, 'success')
})

test('dispatchCapi: a ZERO-value event with no currency is NOT suppressed', async () => {
  // Measured on prod 2026-07-31: every event missing a currency is $0, and every revenue-bearing
  // event has one. Gating on currency alone would have silently killed CAPI for those $0 lead
  // conversions, where there is no amount to denominate and nothing to get wrong.
  const sb = mockSupabase()
  let body
  await withFetch(async (_url, opts) => { body = JSON.parse(opts.body); return new Response('{}', { status: 200 }) }, async () => {
    await dispatchCapi(sb, META_SITE(), { conversion_type: 'lead', conversion_value: 0, external_event_id: 'evt0' })
  })
  assert.equal(sb.inserts.length, 1)
  assert.equal(sb.inserts[0].status, 'success')
  // The currency key is OMITTED rather than sent as a made-up 'USD'.
  assert.equal('currency' in body.data[0].custom_data, false)
})

// ── Shopify: value and currency read as a pair ───────────────────────────────
test('readShopifyOrderAmount: presentment_currency is never paired with a shop-currency amount', () => {
  // The latent mispairing: no flat `currency`, but presentment_currency present. Reading them
  // independently would have labelled a USD amount as CAD.
  const { rawValue, rawCurrency } = readShopifyOrderAmount({
    total_price: '753.06', presentment_currency: 'CAD'
  })
  assert.equal(rawValue, '753.06')
  assert.notEqual(rawCurrency, 'CAD')
  assert.equal(rawCurrency, undefined)   // unknown → the caller's 3-letter guard rejects it
})

test('readShopifyOrderAmount: money bags supply amount and unit from ONE object', () => {
  const real = {
    total_price: '753.06',
    currency: 'USD',
    total_price_set: {
      shop_money: { amount: '753.06', currency_code: 'USD' },
      presentment_money: { amount: '1057.00', currency_code: 'CAD' }
    }
  }
  assert.deepEqual(readShopifyOrderAmount(real), { rawValue: '753.06', rawCurrency: 'USD' })

  // presentment_money is never the captured value, even though it is the bigger number and the
  // one the buyer recognizes. Mixed presentment currencies do not sum.
  assert.notEqual(readShopifyOrderAmount(real).rawValue, '1057.00')
})

test('readShopifyOrderAmount: falls back bag → flat, and keeps the flat pair together', () => {
  assert.deepEqual(
    readShopifyOrderAmount({ current_total_price_set: { shop_money: { amount: '99.00', currency_code: 'EUR' } } }),
    { rawValue: '99.00', rawCurrency: 'EUR' }
  )
  // Single-currency store, no bags at all — the common case must not regress.
  assert.deepEqual(
    readShopifyOrderAmount({ total_price: '149.95', currency: 'USD' }),
    { rawValue: '149.95', rawCurrency: 'USD' }
  )
  // total_price absent → current_total_price, still paired with the shop currency.
  assert.deepEqual(
    readShopifyOrderAmount({ current_total_price: '99.00', currency: 'GBP' }),
    { rawValue: '99.00', rawCurrency: 'GBP' }
  )
})

// ── currency is a unit, not a metric ─────────────────────────────────────────
test('currency and currency_status are not selectable/sortable metrics', () => {
  // These live on the shaped row, and the metric sets are DERIVED from that row's keys. Left in,
  // `metric='currency'` would pass the reader's own guard and then sort by (b.currency - a.currency).
  for (const key of ['currency', 'currency_status']) {
    assert.equal(PREAGG_CONVERSION_METRICS.has(key), false, `${key} must not be a preagg metric`)
    assert.equal(PREAGG_MULTITOUCH_METRICS.has(key), false, `${key} must not be a multitouch metric`)
  }
  // The real metrics are still there — the filter must not have over-matched.
  assert.equal(PREAGG_CONVERSION_METRICS.has('revenue'), true)
  assert.equal(PREAGG_CONVERSION_METRICS.has('avg_conversion_value'), true)
})
