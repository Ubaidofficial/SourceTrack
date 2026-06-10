import 'dotenv/config'

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import { getSupabase } from '../api/lib/supabase.js'
import { shopifyWebhookRouter } from '../api/routes/shopify-webhook.js'
import { encryptSecret } from '../api/lib/utils.js'

async function runQa() {
  console.log('==================================================')
  console.log('      Shopify Webhook Ingestion E2E QA Test')
  console.log('==================================================\n')

  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    console.log('🔑 Generated temporary ENCRYPTION_KEY for testing.')
  }

  const supabase = getSupabase()

  // 1. Get a valid site to run testing against
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('site_key, encrypted_shopify_shared_secret')
    .limit(1)
    .maybeSingle()

  if (siteError || !site) {
    console.error('❌ Failed to retrieve a test site from database. Ensure site seeds are present.')
    process.exit(1)
  }

  const { site_key: siteKey, encrypted_shopify_shared_secret: originalSecret } = site
  console.log(`Using test site: Key=${siteKey}`)

  // 2. Set temporary known secret for webhook verification
  const testSecret = 'shopify_testsecret_' + crypto.randomBytes(8).toString('hex')
  const encryptedSecret = encryptSecret(testSecret)

  console.log(`Setting temporary test secret: ${testSecret}`)
  const { error: updateError } = await supabase
    .from('sites')
    .update({ encrypted_shopify_shared_secret: encryptedSecret })
    .eq('site_key', siteKey)

  if (updateError) {
    console.error('❌ Failed to update temporary secret in database:', updateError.message)
    process.exit(1)
  }

  // Ensure any cached site details are cleared
  const { siteCache } = await import('../api/middleware/auth.js')
  siteCache.del(siteKey)

  // Helper to generate Shopify HMAC
  function generateShopifyHmac(bodyStr, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(bodyStr, 'utf8')
      .digest('base64')
  }

  // 3. Spin up mock express server on port 3997
  const app = express()
  app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhookRouter)

  const server = app.listen(3997, async () => {
    console.log('🚀 Temporary test server listening on port 3997')
    let testFailed = false

    try {
      // Create test payloads
      const uniqueOrderId = '991' + Date.now().toString().slice(-6)
      const uniqueWebhookId = 'webhook_' + Date.now()

      const payloadObj = {
        id: parseInt(uniqueOrderId),
        name: '#ORD-' + uniqueOrderId,
        total_price: '199.99',
        currency: 'USD',
        financial_status: 'paid',
        processed_at: new Date().toISOString(),
        note_attributes: [
          { name: '_st_aid', value: 'test_stitched_aid_shopify' }
        ],
        customer: {
          id: 771239,
          email: 'customer_pii@example.com',
          first_name: 'Shopify',
          last_name: 'Customer'
        }
      }

      const payloadStr = JSON.stringify(payloadObj)

      // Test Case 1: Missing signature header
      console.log('\n--- Test Case 1: Missing signature header ---')
      const res1 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res1.status}`)
      if (res1.status === 400) {
        console.log('✅ Correctly rejected with 400')
      } else {
        console.error('❌ Expected 400 for missing signature')
        testFailed = true
      }

      // Test Case 2: Invalid signature header
      console.log('\n--- Test Case 2: Invalid signature header ---')
      const res2 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId,
          'X-Shopify-Hmac-Sha256': 'invalidsignaturebase64='
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res2.status}`)
      if (res2.status === 400) {
        console.log('✅ Correctly rejected with 400')
      } else {
        console.error('❌ Expected 400 for invalid signature')
        testFailed = true
      }

      // Test Case 3: Unknown site
      console.log('\n--- Test Case 3: Unknown site ---')
      const nonExistentKey = 'sk_nonexistent_' + crypto.randomBytes(8).toString('hex')
      const sigUnknown = generateShopifyHmac(payloadStr, testSecret)
      const res3 = await fetch(`http://localhost:3997/api/webhooks/shopify/${nonExistentKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId,
          'X-Shopify-Hmac-Sha256': sigUnknown
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res3.status}`)
      if (res3.status === 404) {
        console.log('✅ Correctly rejected with 404 for unknown site')
      } else {
        console.error('❌ Expected 404 for unknown site')
        testFailed = true
      }

      // Test Case 4: Unsupported topic (ignored 200)
      console.log('\n--- Test Case 4: Unsupported topic ---')
      const sigUnsupported = generateShopifyHmac(payloadStr, testSecret)
      const res4 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'customers/redact',
          'X-Shopify-Webhook-Id': uniqueWebhookId,
          'X-Shopify-Hmac-Sha256': sigUnsupported
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res4.status}`)
      const body4 = await res4.json()
      console.log('Response body:', body4)
      if (res4.status === 200 && body4.ignored) {
        console.log('✅ Correctly ignored with 200')
      } else {
        console.error('❌ Expected 200 ignored response')
        testFailed = true
      }

      // Test Case 5: Unpaid order (orders/create and unpaid, ignored 200)
      console.log('\n--- Test Case 5: Unpaid order creation ---')
      const unpaidPayloadObj = {
        ...payloadObj,
        financial_status: 'pending'
      }
      const unpaidPayloadStr = JSON.stringify(unpaidPayloadObj)
      const sigUnpaid = generateShopifyHmac(unpaidPayloadStr, testSecret)
      const res5 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/create',
          'X-Shopify-Webhook-Id': uniqueWebhookId + '_unpaid',
          'X-Shopify-Hmac-Sha256': sigUnpaid
        },
        body: unpaidPayloadStr
      })
      console.log(`Response Status: ${res5.status}`)
      const body5 = await res5.json()
      console.log('Response body:', body5)
      if (res5.status === 200 && body5.ignored) {
        console.log('✅ Correctly ignored unpaid order with 200')
      } else {
        console.error('❌ Expected 200 ignored response for unpaid order')
        testFailed = true
      }

      // Test Case 6: Invalid amount (value < 0, rejected 400)
      console.log('\n--- Test Case 6: Invalid amount ---')
      const invalidAmtPayloadObj = {
        ...payloadObj,
        total_price: '-50.00'
      }
      const invalidAmtPayloadStr = JSON.stringify(invalidAmtPayloadObj)
      const sigInvalidAmt = generateShopifyHmac(invalidAmtPayloadStr, testSecret)
      const res6 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId + '_invalidamt',
          'X-Shopify-Hmac-Sha256': sigInvalidAmt
        },
        body: invalidAmtPayloadStr
      })
      console.log(`Response Status: ${res6.status}`)
      if (res6.status === 400) {
        console.log('✅ Correctly rejected invalid amount with 400')
      } else {
        console.error('❌ Expected 400 for invalid amount')
        testFailed = true
      }

      // Test Case 7: Invalid currency (value > 0 and currency invalid, rejected 400)
      console.log('\n--- Test Case 7: Invalid currency ---')
      const invalidCurPayloadObj = {
        ...payloadObj,
        currency: 'INVALID'
      }
      const invalidCurPayloadStr = JSON.stringify(invalidCurPayloadObj)
      const sigInvalidCur = generateShopifyHmac(invalidCurPayloadStr, testSecret)
      const res7 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId + '_invalidcur',
          'X-Shopify-Hmac-Sha256': sigInvalidCur
        },
        body: invalidCurPayloadStr
      })
      console.log(`Response Status: ${res7.status}`)
      if (res7.status === 400) {
        console.log('✅ Correctly rejected invalid currency with 400')
      } else {
        console.error('❌ Expected 400 for invalid currency')
        testFailed = true
      }

      // Test Case 8: Valid paid order (orders/paid, accepted 200)
      console.log('\n--- Test Case 8: Valid paid order ---')
      const sigValid = generateShopifyHmac(payloadStr, testSecret)
      const res8 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId,
          'X-Shopify-Hmac-Sha256': sigValid
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res8.status}`)
      const body8 = await res8.json()
      console.log('Response body:', body8)
      if (res8.status === 200 && body8.received && !body8.duplicate) {
        console.log('✅ Ingestion succeeded with 200')
      } else {
        console.error('❌ Expected 200 success response')
        testFailed = true
      }

      // Test Case 9: Duplicate order (idempotency checks, duplicate 200)
      console.log('\n--- Test Case 9: Duplicate idempotency behavior ---')
      const res9 = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId,
          'X-Shopify-Hmac-Sha256': sigValid
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res9.status}`)
      const body9 = await res9.json()
      console.log('Response body:', body9)
      if (res9.status === 200 && body9.received && body9.duplicate) {
        console.log('✅ Correctly flagged duplicate event and returned 200 skipped')
      } else {
        console.error('❌ Expected 200 duplicate skipped response')
        testFailed = true
      }

      // Test Case 10: Invalid-then-corrected order succeeds
      console.log('\n--- Test Case 10: Invalid-then-corrected order succeeds ---')
      const uniqueOrderId10 = '992' + Date.now().toString().slice(-6)
      
      // Step 10a: Try sending with invalid currency (should fail 400, but NOT claim keys)
      const step10aObj = {
        ...payloadObj,
        id: parseInt(uniqueOrderId10),
        currency: 'USDD'
      }
      const step10aStr = JSON.stringify(step10aObj)
      const sig10a = generateShopifyHmac(step10aStr, testSecret)
      const res10a = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId + '_step10',
          'X-Shopify-Hmac-Sha256': sig10a
        },
        body: step10aStr
      })
      console.log(`Step 10a Status: ${res10a.status} (Expected: 400)`)

      // Step 10b: Try sending with corrected valid currency (should succeed 200)
      const step10bObj = {
        ...payloadObj,
        id: parseInt(uniqueOrderId10),
        currency: 'USD'
      }
      const step10bStr = JSON.stringify(step10bObj)
      const sig10b = generateShopifyHmac(step10bStr, testSecret)
      const res10b = await fetch(`http://localhost:3997/api/webhooks/shopify/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Topic': 'orders/paid',
          'X-Shopify-Webhook-Id': uniqueWebhookId + '_step10',
          'X-Shopify-Hmac-Sha256': sig10b
        },
        body: step10bStr
      })
      console.log(`Step 10b Status: ${res10b.status} (Expected: 200)`)
      const body10b = await res10b.json()
      if (res10b.status === 200 && body10b.received && !body10b.duplicate) {
        console.log('✅ Correctly allowed ingestion of corrected order after previous validation failure')
      } else {
        console.error('❌ Expected 200 success response for corrected order')
        testFailed = true
      }

    } catch (err) {
      console.error('❌ Exception during QA execution:', err.message)
      testFailed = true
    } finally {
      // 4. Cleanup and restore original site secret
      console.log('\nRestoring original webhook secret...')
      const { error: restoreError } = await supabase
        .from('sites')
        .update({ encrypted_shopify_shared_secret: originalSecret })
        .eq('site_key', site.site_key)

      if (restoreError) {
        console.error('❌ Failed to restore original secret in database:', restoreError.message)
      } else {
        console.log('✅ Original secret restored.')
      }

      // Clear siteCache again
      siteCache.del(siteKey)

      // Stop mock server
      server.close(() => {
        console.log('Server stopped.')
        if (testFailed) {
          console.log('\n❌ QA SHOPIFY WEBHOOK TEST FAILED')
          process.exit(1)
        } else {
          console.log('\n🎉 ALL QA SHOPIFY WEBHOOK CHECKS PASSED SUCCESSFULLY!')
          process.exit(0)
        }
      })
    }
  })
}

runQa()
