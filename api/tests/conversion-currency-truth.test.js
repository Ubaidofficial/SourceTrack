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

import { normalizeCurrencyCode, hasKnownCurrency, collapseCurrencies, resolveSiteRevenueCurrency } from '../lib/currency.js'
import { dispatchCapi, encryptCapiToken } from '../lib/conversion-sync.js'
import { readShopifyOrderAmount } from '../routes/shopify-webhook.js'
import { PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } from '../lib/attribution-engine.js'
import { buildRefundConversion } from '../lib/stripe-refund.js'
import { buildShopifyRefundConversion } from '../lib/shopify-refund.js'

// ── collapseCurrencies: an undenominated amount must not hide inside an 'ok' ──

test('THE PROD CASE: two USD rows plus one null-currency revenue row is NOT ok', () => {
  // www.techrupt.pk on prod: a 753.06 USD Shopify order alongside a 777.77 row whose
  // conversion_event_id is a UUID — it never passed through revenue_ingestion_events.order_id,
  // so there was no unit to backfill. The old code dropped the null BEFORE checking agreement
  // and reported 'ok'/'USD', confidently labelling a sum containing an amount nobody can
  // denominate. This is the regression guard for exactly that shape.
  const r = collapseCurrencies(['USD', 'USD', null])
  assert.notEqual(r.currency_status, 'ok')
  assert.equal(r.currency_status, 'partial')
  // INVARIANT: a code is handed back ONLY for 'ok'. A client doing `if (currency) render(...)`
  // must not be able to print a symbol over a partially-undenominated total.
  assert.equal(r.currency, null)
})

test('collapseCurrencies: every status, and the invariant that only ok carries a code', () => {
  const cases = [
    [['USD', 'USD'],            'ok',      'USD'],
    [['usd', ' USD '],          'ok',      'USD'],   // normalization still applies
    [['USD', 'EUR'],            'mixed',   null],
    [['USD', null],             'partial', null],
    [['USD', ''],               'partial', null],    // empty string is an absent unit, not a code
    [['USD', 'US'],             'partial', null],    // malformed code is absent, never coerced
    [[null, null],              'unknown', null],
    [[],                        'unknown', null],    // no amounts at all
  ]
  for (const [input, status, currency] of cases) {
    const r = collapseCurrencies(input)
    assert.equal(r.currency_status, status, `${JSON.stringify(input)} → expected ${status}, got ${r.currency_status}`)
    assert.equal(r.currency, currency, `${JSON.stringify(input)} → expected currency ${currency}`)
  }
  // The invariant, stated once more as a property over every case above.
  for (const [input] of cases) {
    const r = collapseCurrencies(input)
    if (r.currency !== null) assert.equal(r.currency_status, 'ok')
  }
})

test('collapseCurrencies: mixed outranks partial', () => {
  // Disagreeing codes make the sum unsummable regardless of what else is missing, and that is
  // the more actionable fact. Both suppress rendering, so this only decides the message.
  assert.equal(collapseCurrencies(['USD', 'EUR', null]).currency_status, 'mixed')
})

test('resolveSiteRevenueCurrency: $0 ingestion rows cannot force partial', () => {
  // On prod every currency-less ingestion event is exactly $0 (6 of them). A zero has no unit
  // to be missing, so letting those rows through would suppress the revenue label for a site
  // that is perfectly healthy. The $0 filter is what prevents that.
  const rows = [
    { currency: 'USD', value: '753.06' },
    { currency: null,  value: '0' },       // $0 lead/trial — no unit to be missing
    { currency: null,  value: 0 },
  ]
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) }) }
  return resolveSiteRevenueCurrency(supabase, 'sk_test').then(r => {
    assert.equal(r.currency_status, 'ok')
    assert.equal(r.currency, 'USD')
  })
})

test('resolveSiteRevenueCurrency: a revenue-bearing row with no unit DOES report partial', () => {
  const rows = [
    { currency: 'USD', value: '753.06' },
    { currency: null,  value: '777.77' },   // real money, no unit — the prod shape
  ]
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) }) }
  return resolveSiteRevenueCurrency(supabase, 'sk_test').then(r => {
    assert.equal(r.currency_status, 'partial')
    assert.equal(r.currency, null)
  })
})

test('resolveSiteRevenueCurrency: a failed read is unknown, never a guessed USD', () => {
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) }
  return resolveSiteRevenueCurrency(supabase, 'sk_test').then(r => {
    assert.equal(r.currency_status, 'unknown')
    assert.equal(r.currency, null)
  })
})

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

// ── refunds: the last two ?? 'USD' defaults ──────────────────────────────────
// #529 and #532 removed the manufactured-USD default from every money rail EXCEPT the two
// refund builders — shopify-refund.js (flagged in #529's own PR body) and stripe-refund.js.
// A refund is a SIGNED NEGATIVE conversion, so a fake unit here is worse than on a purchase:
// it nets a made-up-denomination amount against a real one.
const REFUND_SITE = { id: 'site-refund-1', site_key: 'sk_refund_1' }

const stripeRefundEvent = (over = {}) => ({
  id: 'evt_r_1', type: 'refund.created', created: 1_780_000_000,
  data: { object: { id: 're_1', object: 'refund', amount: 5000, payment_intent: 'pi_1', ...over } }
})

const shopifyRefundPayload = (over = {}) => ({
  id: 999, order_id: 555, processed_at: '2026-07-24T00:00:00Z',
  transactions: [{ kind: 'refund', status: 'success', amount: '25.00' }], ...over
})

test('stripe refund: an absent currency is null, never a manufactured USD', () => {
  // Stripe types `currency` as required and non-nullable on the Refund object, so this
  // default effectively never fired in production — but a malformed/synthetic payload is
  // exactly where inventing a unit misleads most. Restoring `: 'USD'` fails this.
  const { properties, currency } = buildRefundConversion(stripeRefundEvent(), REFUND_SITE)
  assert.equal(properties.currency, null)
  assert.notEqual(properties.currency, 'USD')
  // The RETURNED currency matters independently: stripe-webhook.js hands it to
  // logIngestionEvent, whose `currency || null` puts it in revenue_ingestion_events.currency.
  // A fake 'USD' there would make collapseCurrencies() report a confident 'ok' for the site.
  assert.equal(currency, null)
})

test('stripe refund: a real currency still normalizes to uppercase ISO', () => {
  const { properties, currency } = buildRefundConversion(
    stripeRefundEvent({ currency: 'eur' }), REFUND_SITE
  )
  assert.equal(properties.currency, 'EUR')
  assert.equal(currency, 'EUR')
})

test('shopify refund: an absent currency is null, never a manufactured USD', () => {
  const { properties, currency } = buildShopifyRefundConversion(
    shopifyRefundPayload(), REFUND_SITE, 'visitor-1'
  )
  assert.equal(properties.currency, null)
  assert.notEqual(properties.currency, 'USD')
  assert.equal(currency, null)
  // The refund is still WRITTEN — an unknown unit suppresses the label, never the money.
  assert.equal(properties.conversion_value, -25)
})

test('shopify refund: a malformed code is unknown, not passed through', () => {
  // The old `(payload.currency || '').trim().toUpperCase() || 'USD'` chain never checked the
  // ISO shape, so 'US' rode through as a bogus unit. normalizeCurrencyCode agrees with the
  // attributed_conversions_currency_format CHECK constraint the nightly writes against.
  const { properties } = buildShopifyRefundConversion(
    shopifyRefundPayload({ currency: 'US' }), REFUND_SITE, 'visitor-1'
  )
  assert.equal(properties.currency, null)
})

test('shopify refund: a real currency still normalizes to uppercase ISO', () => {
  const { properties, currency } = buildShopifyRefundConversion(
    shopifyRefundPayload({ currency: 'usd' }), REFUND_SITE, 'visitor-1'
  )
  assert.equal(properties.currency, 'USD')
  assert.equal(currency, 'USD')
})

test('a null-unit refund makes the site partial, not a confident ok', () => {
  // The end-to-end consequence, using the real collapse: a refund whose unit was invented as
  // 'USD' silently agreed with the USD purchases around it. As null it surfaces as 'partial' —
  // the site stops printing a symbol until the unit is real. That is the point of #532.
  const { currency } = buildShopifyRefundConversion(shopifyRefundPayload(), REFUND_SITE, 'v1')
  assert.equal(collapseCurrencies(['USD', 'USD', currency]).currency_status, 'partial')
})
