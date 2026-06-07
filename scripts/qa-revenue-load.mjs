import 'dotenv/config'
import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import Stripe from 'stripe'
import { getSupabase } from '../api/lib/supabase.js'
import { stripeWebhookRouter } from '../api/routes/stripe-webhook.js'
import { shopifyWebhookRouter } from '../api/routes/shopify-webhook.js'
import { validateSiteKey } from '../api/middleware/auth.js'
import { conversionOffline } from '../api/routes/conversion-offline.js'
import { encryptSecret } from '../api/lib/utils.js'

async function runLoadTest() {
  console.log('==================================================')
  console.log('       Revenue Ingestion High-Concurrency Load QA')
  console.log('==================================================\n')

  // Guardrail check: Do not run against production unless explicitly approved
  const isProduction = process.env.NODE_ENV === 'production'
  const isStaging = process.env.NODE_ENV === 'staging' || process.env.SUPABASE_URL?.includes('staging')
  const allowed = process.env.ALLOW_PROD_LOAD_TEST === 'true'

  if (isProduction && !allowed) {
    console.error('❌ FATAL: Running load test against production is NOT allowed without ALLOW_PROD_LOAD_TEST=true')
    process.exit(1)
  }

  // Determine concurrency
  let concurrency = 25
  if (process.env.QA_LOAD_CONCURRENCY) {
    const val = parseInt(process.env.QA_LOAD_CONCURRENCY, 10)
    if (!isNaN(val) && val > 0) {
      concurrency = Math.min(val, 100) // Hard cap at 100
    }
  }
  console.log(`🚀 Concurrency level: ${concurrency} concurrent requests (Hard cap: 100)`)

  let tempEncryptionKeySet = false
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    tempEncryptionKeySet = true
    console.log('🔑 Generated temporary ENCRYPTION_KEY for testing.')
  }

  const supabase = getSupabase()

  // 1. Get a valid site to run testing against
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('site_key, encrypted_stripe_webhook_secret, encrypted_shopify_shared_secret')
    .limit(1)
    .maybeSingle()

  if (siteError || !site) {
    console.error('❌ Failed to retrieve a test site from database. Ensure site seeds are present.')
    process.exit(1)
  }

  const {
    site_key: siteKey,
    encrypted_stripe_webhook_secret: originalStripeSecret,
    encrypted_shopify_shared_secret: originalShopifySecret
  } = site
  console.log(`Using test site: Key=${siteKey}`)

  // 2. Set temporary known secrets for webhook verification
  const stripeTestSecret = 'whsec_loadtest_secret_' + crypto.randomBytes(8).toString('hex')
  const shopifyTestSecret = 'shopify_loadtest_secret_' + crypto.randomBytes(8).toString('hex')

  const stripeEncrypted = encryptSecret(stripeTestSecret)
  const shopifyEncrypted = encryptSecret(shopifyTestSecret)

  console.log('Setting temporary Stripe and Shopify secrets in database...')
  const { error: updateError } = await supabase
    .from('sites')
    .update({
      encrypted_stripe_webhook_secret: stripeEncrypted,
      encrypted_shopify_shared_secret: shopifyEncrypted
    })
    .eq('site_key', siteKey)

  if (updateError) {
    console.error('❌ Failed to update temporary secrets in database:', updateError.message)
    process.exit(1)
  }

  // Clear site key cache to make sure the app grabs new secrets from database
  const { siteCache } = await import('../api/middleware/auth.js')
  siteCache.del(siteKey)

  // 3. Spin up mock express server on port 3996
  const app = express()
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter)
  app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhookRouter)
  app.post('/api/conversion/offline', express.json(), validateSiteKey, conversionOffline)

  const server = app.listen(3996, async () => {
    console.log('🚀 Temporary test server listening on port 3996')
    let testFailed = false

    try {
      // ----------------------------------------------------
      // TEST A: Payments API duplicate storm
      // ----------------------------------------------------
      console.log('\n--- Test A: Payments API duplicate storm ---')
      // Send concurrent requests with the same order_id, payment_id, idempotency_key
      const orderIdA = `qa_load_order_A_${Date.now()}`
      const paymentIdA = `qa_load_payment_A_${Date.now()}`
      const idemKeyA = `qa_load_idem_A_${Date.now()}`

      const promisesA = []
      for (let i = 0; i < concurrency; i++) {
        promisesA.push(fetch('http://localhost:3996/api/conversion/offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_key: siteKey,
            user_id: 'user_qa_load',
            conversion_value: 100.0,
            currency: 'USD',
            order_id: orderIdA,
            payment_id: paymentIdA,
            idempotency_key: idemKeyA,
            provider: 'payments_api'
          })
        }))
      }

      const responsesA = await Promise.all(promisesA)
      let duplicateFalsesA = 0
      let duplicateTruesA = 0
      let status200sA = 0
      for (const res of responsesA) {
        if (res.status === 200) status200sA++
        const body = await res.json()
        if (body.success) {
          if (body.duplicate === false) duplicateFalsesA++
          if (body.duplicate === true) duplicateTruesA++
        }
      }
      console.log(`Results: Status 200s=${status200sA}, duplicate=false count=${duplicateFalsesA}, duplicate=true count=${duplicateTruesA}`)
      if (duplicateFalsesA === 1 && duplicateTruesA === concurrency - 1 && status200sA === concurrency) {
        console.log('✅ Test A Passed: Exactly one accepted (duplicate=false), the rest are flagged as duplicates (duplicate=true).')
      } else {
        console.error(`❌ Test A Failed! Expected 1 accepted and ${concurrency - 1} duplicates.`)
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST B: Payments API unique burst
      // ----------------------------------------------------
      console.log('\n--- Test B: Payments API unique burst ---')
      // Send concurrent requests with unique order/payment/idempotency keys
      const promisesB = []
      for (let i = 0; i < concurrency; i++) {
        const uniqueId = `qa_load_B_${i}_${Date.now()}`
        promisesB.push(fetch('http://localhost:3996/api/conversion/offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_key: siteKey,
            user_id: 'user_qa_load',
            conversion_value: 50.0,
            currency: 'USD',
            order_id: `qa_load_order_B_${uniqueId}`,
            payment_id: `qa_load_payment_B_${uniqueId}`,
            idempotency_key: `qa_load_idem_B_${uniqueId}`,
            provider: 'payments_api'
          })
        }))
      }

      const responsesB = await Promise.all(promisesB)
      let successCountB = 0
      let duplicateFalseCountB = 0
      for (const res of responsesB) {
        if (res.status === 200) {
          const body = await res.json()
          if (body.success) {
            successCountB++
            if (body.duplicate === false) duplicateFalseCountB++
          }
        }
      }
      console.log(`Results: 200s=${successCountB}, duplicate=false count=${duplicateFalseCountB}`)
      if (successCountB === concurrency && duplicateFalseCountB === concurrency) {
        console.log('✅ Test B Passed: All unique requests accepted and none marked duplicate.')
      } else {
        console.error('❌ Test B Failed!')
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST C: Invalid-then-corrected replay
      // ----------------------------------------------------
      console.log('\n--- Test C: Invalid-then-corrected replay ---')
      // Send concurrent invalid timestamp requests with same keys
      const orderIdC = `qa_load_order_C_${Date.now()}`
      const paymentIdC = `qa_load_payment_C_${Date.now()}`
      const idemKeyC = `qa_load_idem_C_${Date.now()}`

      const promisesC1 = []
      for (let i = 0; i < concurrency; i++) {
        promisesC1.push(fetch('http://localhost:3996/api/conversion/offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            site_key: siteKey,
            user_id: 'user_qa_load',
            conversion_value: 75.0,
            currency: 'USD',
            order_id: orderIdC,
            payment_id: paymentIdC,
            idempotency_key: idemKeyC,
            occurred_at: 'invalid-date-format-load',
            provider: 'payments_api'
          })
        }))
      }

      const responsesC1 = await Promise.all(promisesC1)
      let status400sC1 = 0
      for (const res of responsesC1) {
        if (res.status === 400) status400sC1++
      }
      console.log(`Step C1 (Invalid Timestamp): status 400 count=${status400sC1} (Expected: ${concurrency})`)

      // Step C2: Corrected retry with same key
      const resC2 = await fetch('http://localhost:3996/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_load',
          conversion_value: 75.0,
          currency: 'USD',
          order_id: orderIdC,
          payment_id: paymentIdC,
          idempotency_key: idemKeyC,
          occurred_at: new Date().toISOString(),
          provider: 'payments_api'
        })
      })

      const bodyC2 = await resC2.json()
      console.log(`Step C2 (Corrected): Status=${resC2.status}, success=${bodyC2.success}, duplicate=${bodyC2.duplicate}`)
      if (status400sC1 === concurrency && resC2.status === 200 && bodyC2.success && bodyC2.duplicate === false) {
        console.log('✅ Test C Passed: Invalid requests rejected, corrected retry succeeded (idempotency key not burned).')
      } else {
        console.error('❌ Test C Failed!')
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST D: Stripe duplicate webhook storm
      // ----------------------------------------------------
      console.log('\n--- Test D: Stripe duplicate webhook storm ---')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'fake_key', { apiVersion: '2024-06-20' })
      const eventIdD = `qa_load_stripe_evt_${Date.now()}`
      const sessionIdD = `qa_load_stripe_session_${Date.now()}`
      const paymentIntentIdD = `qa_load_stripe_pi_${Date.now()}`

      const payloadObjD = {
        id: eventIdD,
        object: 'event',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: sessionIdD,
            object: 'checkout.session',
            payment_intent: paymentIntentIdD,
            amount_total: 25000, // $250.00
            currency: 'usd',
            client_reference_id: 'qa_load_user_ref_D'
          }
        }
      }
      const payloadStrD = JSON.stringify(payloadObjD)
      const sigD = stripe.webhooks.generateTestHeaderString({
        payload: payloadStrD,
        secret: stripeTestSecret
      })

      const promisesD = []
      for (let i = 0; i < concurrency; i++) {
        promisesD.push(fetch(`http://localhost:3996/api/webhooks/stripe/${siteKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': sigD
          },
          body: payloadStrD
        }))
      }

      const responsesD = await Promise.all(promisesD)
      let status200sD = 0
      let acceptedD = 0
      let duplicateD = 0
      for (const res of responsesD) {
        if (res.status === 200) status200sD++
        const body = await res.json()
        if (body.received) {
          if (!body.duplicate) acceptedD++
          if (body.duplicate) duplicateD++
        }
      }
      console.log(`Results: Status 200s=${status200sD}, accepted=${acceptedD}, duplicate=${duplicateD}`)
      if (status200sD === concurrency && acceptedD === 1 && duplicateD === concurrency - 1) {
        console.log('✅ Test D Passed: Exactly one Stripe webhook accepted, rest flagged duplicate.')
      } else {
        console.error('❌ Test D Failed!')
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST E: Shopify duplicate webhook storm
      // ----------------------------------------------------
      console.log('\n--- Test E: Shopify duplicate webhook storm ---')
      const orderIdE = `qa_load_shopify_ord_${Date.now()}`
      const webhookIdE = `qa_load_shopify_webhook_${Date.now()}`

      function generateShopifyHmac(bodyStr, secret) {
        return crypto
          .createHmac('sha256', secret)
          .update(bodyStr, 'utf8')
          .digest('base64')
      }

      const payloadObjE = {
        id: parseInt(orderIdE.replace(/\D/g, '').slice(-9)) || 98765432,
        name: '#ORD-' + orderIdE,
        total_price: '299.99',
        currency: 'USD',
        financial_status: 'paid',
        processed_at: new Date().toISOString()
      }
      const payloadStrE = JSON.stringify(payloadObjE)
      const hmacE = generateShopifyHmac(payloadStrE, shopifyTestSecret)

      const promisesE = []
      for (let i = 0; i < concurrency; i++) {
        promisesE.push(fetch(`http://localhost:3996/api/webhooks/shopify/${siteKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Topic': 'orders/paid',
            'X-Shopify-Webhook-Id': webhookIdE,
            'X-Shopify-Hmac-Sha256': hmacE
          },
          body: payloadStrE
        }))
      }

      const responsesE = await Promise.all(promisesE)
      let status200sE = 0
      let acceptedE = 0
      let duplicateE = 0
      for (const res of responsesE) {
        if (res.status === 200) status200sE++
        const body = await res.json()
        if (body.received) {
          if (!body.duplicate) acceptedE++
          if (body.duplicate) duplicateE++
        }
      }
      console.log(`Results: Status 200s=${status200sE}, accepted=${acceptedE}, duplicate=${duplicateE}`)
      if (status200sE === concurrency && acceptedE === 1 && duplicateE === concurrency - 1) {
        console.log('✅ Test E Passed: Exactly one Shopify webhook accepted, rest flagged duplicate.')
      } else {
        console.error('❌ Test E Failed!')
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST F: Bad signature pressure
      // ----------------------------------------------------
      console.log('\n--- Test F: Bad signature pressure ---')
      const promisesFStripe = []
      const promisesFShopify = []
      for (let i = 0; i < concurrency; i++) {
        promisesFStripe.push(fetch(`http://localhost:3996/api/webhooks/stripe/${siteKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': 't=123,v1=bad_signature_value'
          },
          body: payloadStrD
        }))
        promisesFShopify.push(fetch(`http://localhost:3996/api/webhooks/shopify/${siteKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Topic': 'orders/paid',
            'X-Shopify-Webhook-Id': webhookIdE + `_bad_${i}`,
            'X-Shopify-Hmac-Sha256': 'bad_hmac_signature'
          },
          body: payloadStrE
        }))
      }

      const responsesFStripe = await Promise.all(promisesFStripe)
      const responsesFShopify = await Promise.all(promisesFShopify)

      let badStripe400s = 0
      let badShopify400s = 0
      for (const res of responsesFStripe) {
        if (res.status === 400) badStripe400s++
      }
      for (const res of responsesFShopify) {
        if (res.status === 400) badShopify400s++
      }

      console.log(`Results: Bad Stripe 400s=${badStripe400s}/${concurrency}, Bad Shopify 400s=${badShopify400s}/${concurrency}`)
      if (badStripe400s === concurrency && badShopify400s === concurrency) {
        console.log('✅ Test F Passed: All bad signature/HMAC requests correctly rejected with 400.')
      } else {
        console.error('❌ Test F Failed!')
        testFailed = true
      }

      // ----------------------------------------------------
      // TEST G: Mixed valid/invalid traffic & Provider Scoping
      // ----------------------------------------------------
      console.log('\n--- Test G: Mixed traffic with provider scoping check ---')
      const scopedOrderId = `qa_load_scoped_order_${Date.now()}`
      const stripeEventIdG = `qa_load_stripe_evt_G_${Date.now()}`
      const shopifyWebhookIdG = `qa_load_shopify_webhook_G_${Date.now()}`

      const shopifyPayloadStrG = JSON.stringify({
        id: parseInt(scopedOrderId.replace(/\D/g, '').slice(-9)) || 12345678,
        name: '#ORD-' + scopedOrderId,
        total_price: '100.00',
        currency: 'USD',
        financial_status: 'paid',
        processed_at: new Date().toISOString()
      })

      const batch1 = [
        {
          type: 'payments_api_valid',
          url: 'http://localhost:3996/api/conversion/offline',
          options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_key: siteKey,
              user_id: 'user_qa_load_G',
              conversion_value: 100.0,
              currency: 'USD',
              order_id: scopedOrderId,
              provider: 'payments_api'
            })
          },
          expectedStatus: 200,
          expectedDuplicate: false
        },
        {
          type: 'payments_api_invalid',
          url: 'http://localhost:3996/api/conversion/offline',
          options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_key: siteKey,
              user_id: 'user_qa_load_G',
              conversion_value: -100.0,
              currency: 'USD',
              order_id: scopedOrderId,
              provider: 'payments_api'
            })
          },
          expectedStatus: 400
        },
        {
          type: 'stripe_valid',
          url: `http://localhost:3996/api/webhooks/stripe/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'stripe-signature': stripe.webhooks.generateTestHeaderString({
                payload: JSON.stringify({
                  id: stripeEventIdG,
                  object: 'event',
                  type: 'checkout.session.completed',
                  created: Math.floor(Date.now() / 1000),
                  data: {
                    object: {
                      id: scopedOrderId,
                      object: 'checkout.session',
                      amount_total: 10000,
                      currency: 'usd',
                      client_reference_id: 'qa_load_user_ref_G'
                    }
                  }
                }),
                secret: stripeTestSecret
              })
            },
            body: JSON.stringify({
              id: stripeEventIdG,
              object: 'event',
              type: 'checkout.session.completed',
              created: Math.floor(Date.now() / 1000),
              data: {
                object: {
                  id: scopedOrderId,
                  object: 'checkout.session',
                  amount_total: 10000,
                  currency: 'usd',
                  client_reference_id: 'qa_load_user_ref_G'
                }
              }
            })
          },
          expectedStatus: 200,
          expectedDuplicate: false
        },
        {
          type: 'stripe_invalid_signature',
          url: `http://localhost:3996/api/webhooks/stripe/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'stripe-signature': 't=123,v1=invalid_G'
            },
            body: payloadStrD
          },
          expectedStatus: 400
        },
        {
          type: 'shopify_valid',
          url: `http://localhost:3996/api/webhooks/shopify/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Topic': 'orders/paid',
              'X-Shopify-Webhook-Id': shopifyWebhookIdG,
              'X-Shopify-Hmac-Sha256': generateShopifyHmac(shopifyPayloadStrG, shopifyTestSecret)
            },
            body: shopifyPayloadStrG
          },
          expectedStatus: 200,
          expectedDuplicate: false
        },
        {
          type: 'shopify_invalid_hmac',
          url: `http://localhost:3996/api/webhooks/shopify/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Topic': 'orders/paid',
              'X-Shopify-Webhook-Id': `qa_load_shopify_webhook_G_bad_${Date.now()}`,
              'X-Shopify-Hmac-Sha256': 'invalid_hmac_G'
            },
            body: payloadStrE
          },
          expectedStatus: 400
        }
      ]

      console.log('Sending Batch 1 (valid & invalid concurrent requests)...')
      const responsesB1 = await Promise.all(batch1.map(p => fetch(p.url, p.options)))

      let mixedAllPass = true
      for (let i = 0; i < batch1.length; i++) {
        const item = batch1[i]
        const res = responsesB1[i]
        console.log(`Mixed Test [${item.type}]: status=${res.status} (Expected: ${item.expectedStatus})`)
        if (res.status !== item.expectedStatus) {
          console.error(`❌ Mixed Test [${item.type}] unexpected status: got ${res.status}, expected ${item.expectedStatus}`)
          mixedAllPass = false
        } else if (res.status === 200) {
          const body = await res.json()
          const duplicate = body.duplicate || false
          const expectedDuplicate = item.expectedDuplicate || false
          console.log(`Mixed Test [${item.type}]: duplicate=${duplicate} (Expected: ${expectedDuplicate})`)
          if (duplicate !== expectedDuplicate) {
            console.error(`❌ Mixed Test [${item.type}] unexpected duplicate field: got ${duplicate}, expected ${expectedDuplicate}`)
            mixedAllPass = false
          }
        }
      }

      // Batch 2: duplicates of the successful ones
      const batch2 = [
        {
          type: 'payments_api_duplicate',
          url: 'http://localhost:3996/api/conversion/offline',
          options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_key: siteKey,
              user_id: 'user_qa_load_G',
              conversion_value: 100.0,
              currency: 'USD',
              order_id: scopedOrderId,
              provider: 'payments_api'
            })
          },
          expectedStatus: 200,
          expectedDuplicate: true
        },
        {
          type: 'stripe_duplicate',
          url: `http://localhost:3996/api/webhooks/stripe/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'stripe-signature': stripe.webhooks.generateTestHeaderString({
                payload: JSON.stringify({
                  id: stripeEventIdG,
                  object: 'event',
                  type: 'checkout.session.completed',
                  created: Math.floor(Date.now() / 1000),
                  data: {
                    object: {
                      id: scopedOrderId,
                      object: 'checkout.session',
                      amount_total: 10000,
                      currency: 'usd',
                      client_reference_id: 'qa_load_user_ref_G'
                    }
                  }
                }),
                secret: stripeTestSecret
              })
            },
            body: JSON.stringify({
              id: stripeEventIdG,
              object: 'event',
              type: 'checkout.session.completed',
              created: Math.floor(Date.now() / 1000),
              data: {
                object: {
                  id: scopedOrderId,
                  object: 'checkout.session',
                  amount_total: 10000,
                  currency: 'usd',
                  client_reference_id: 'qa_load_user_ref_G'
                }
              }
            })
          },
          expectedStatus: 200,
          expectedDuplicate: true
        },
        {
          type: 'shopify_duplicate',
          url: `http://localhost:3996/api/webhooks/shopify/${siteKey}`,
          options: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Topic': 'orders/paid',
              'X-Shopify-Webhook-Id': shopifyWebhookIdG,
              'X-Shopify-Hmac-Sha256': generateShopifyHmac(shopifyPayloadStrG, shopifyTestSecret)
            },
            body: shopifyPayloadStrG
          },
          expectedStatus: 200,
          expectedDuplicate: true
        }
      ]

      console.log('\nSending Batch 2 (duplicate concurrent requests)...')
      const responsesB2 = await Promise.all(batch2.map(p => fetch(p.url, p.options)))

      for (let i = 0; i < batch2.length; i++) {
        const item = batch2[i]
        const res = responsesB2[i]
        console.log(`Mixed Test [${item.type}]: status=${res.status} (Expected: ${item.expectedStatus})`)
        if (res.status !== item.expectedStatus) {
          console.error(`❌ Mixed Test [${item.type}] unexpected status: got ${res.status}, expected ${item.expectedStatus}`)
          mixedAllPass = false
        } else if (res.status === 200) {
          const body = await res.json()
          const duplicate = body.duplicate || false
          const expectedDuplicate = item.expectedDuplicate || false
          console.log(`Mixed Test [${item.type}]: duplicate=${duplicate} (Expected: ${expectedDuplicate})`)
          if (duplicate !== expectedDuplicate) {
            console.error(`❌ Mixed Test [${item.type}] unexpected duplicate field: got ${duplicate}, expected ${expectedDuplicate}`)
            mixedAllPass = false
          }
        }
      }

      if (mixedAllPass) {
        console.log('✅ Test G Passed: Scoped providers did not collide and responses matched expected.')
      } else {
        console.error('❌ Test G Failed!')
        testFailed = true
      }

    } catch (err) {
      console.error('❌ Exception during QA execution:', err.message)
      testFailed = true
    } finally {
      // 4. Restore original site secrets in database
      console.log('\nRestoring original webhook secrets in database...')
      const { error: restoreError } = await supabase
        .from('sites')
        .update({
          encrypted_stripe_webhook_secret: originalStripeSecret,
          encrypted_shopify_shared_secret: originalShopifySecret
        })
        .eq('site_key', siteKey)

      if (restoreError) {
        console.error('❌ Failed to restore original secrets in database:', restoreError.message)
      } else {
        console.log('✅ Original secrets restored.')
      }

      // Clear siteCache again
      siteCache.del(siteKey)

      if (tempEncryptionKeySet) {
        delete process.env.ENCRYPTION_KEY
      }

      // Stop mock server
      server.close(() => {
        console.log('Server stopped.')
        if (testFailed) {
          console.log('\n❌ QA REVENUE LOAD TEST FAILED')
          process.exit(1)
        } else {
          console.log('\n🎉 ALL QA REVENUE LOAD TEST CHECKS PASSED SUCCESSFULLY!')
          process.exit(0)
        }
      })
    }
  })
}

runLoadTest()
