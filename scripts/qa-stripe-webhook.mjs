import 'dotenv/config'
import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch' // Node built-in fetch or node-fetch package. Wait, package.json does not import node-fetch, but Node 18+ has global fetch! We can use global fetch.
import Stripe from 'stripe'
import { getSupabase } from '../api/lib/supabase.js'
import { stripeWebhookRouter } from '../api/routes/stripe-webhook.js'
import { encryptSecret } from '../api/lib/utils.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'fake_key_for_qa_construct', {
  apiVersion: '2024-06-20'
})

async function runQa() {
  console.log('==================================================')
  console.log('      Stripe Webhook Ingestion E2E QA Test')
  console.log('==================================================\n')

  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    console.log('🔑 Generated temporary ENCRYPTION_KEY for testing.')
  }

  const supabase = getSupabase()

  // 1. Get a valid site to run testing against
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('site_key, encrypted_stripe_webhook_secret')
    .limit(1)
    .maybeSingle()

  if (siteError || !site) {
    console.error('❌ Failed to retrieve a test site from database. Ensure site seeds are present.')
    process.exit(1)
  }

  const { site_key: siteKey, encrypted_stripe_webhook_secret: originalSecret } = site
  console.log(`Using test site: Key=${siteKey}`)

  // 2. Set temporary known secret for webhook verification
  const testSecret = 'whsec_testsecret' + crypto.randomBytes(8).toString('hex')
  const encryptedSecret = encryptSecret(testSecret)

  console.log(`Setting temporary test secret: ${testSecret}`)
  const { error: updateError } = await supabase
    .from('sites')
    .update({ encrypted_stripe_webhook_secret: encryptedSecret })
    .eq('site_key', site.site_key)

  if (updateError) {
    console.error('❌ Failed to update temporary secret in database:', updateError.message)
    process.exit(1)
  }

  // Ensure any cached site details are cleared
  const { siteCache } = await import('../api/middleware/auth.js')
  siteCache.del(siteKey)

  // 3. Spin up mock express server on port 3999
  const app = express()
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter)

  const server = app.listen(3999, async () => {
    console.log('🚀 Temporary test server listening on port 3999')
    let testFailed = false

    try {
      // Create payloads
      const uniqueSessionId = 'cs_test_' + Date.now()
      const uniquePaymentIntentId = 'pi_test_' + Date.now()
      const uniqueEventId = 'evt_test_' + Date.now()

      const payloadObj = {
        id: uniqueEventId,
        object: 'event',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: uniqueSessionId,
            object: 'checkout.session',
            payment_intent: uniquePaymentIntentId,
            amount_total: 15000, // $150.00
            currency: 'usd',
            client_reference_id: 'test_client_ref_id_123',
            metadata: {
              anonymous_id: 'test_anon_id_456'
            }
          }
        }
      }

      const payloadStr = JSON.stringify(payloadObj)

      // Test Case 1: Missing signature header
      console.log('\n--- Test Case 1: Missing signature header ---')
      const res1 = await fetch(`http://localhost:3999/api/webhooks/stripe/${siteKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res2 = await fetch(`http://localhost:3999/api/webhooks/stripe/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=invalidsig'
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
      const sigUnknown = stripe.webhooks.generateTestHeaderString({
        payload: payloadStr,
        secret: testSecret
      })
      const res3 = await fetch(`http://localhost:3999/api/webhooks/stripe/${nonExistentKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sigUnknown
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

      // Test Case 4: Unsupported event type (should return 200 ignored)
      console.log('\n--- Test Case 4: Unsupported event type ---')
      const unsupportedPayloadObj = {
        ...payloadObj,
        id: 'evt_unsupported_' + Date.now(),
        type: 'payment_intent.created'
      }
      const unsupportedPayloadStr = JSON.stringify(unsupportedPayloadObj)
      const sigUnsupported = stripe.webhooks.generateTestHeaderString({
        payload: unsupportedPayloadStr,
        secret: testSecret
      })
      const res4 = await fetch(`http://localhost:3999/api/webhooks/stripe/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sigUnsupported
        },
        body: unsupportedPayloadStr
      })
      console.log(`Response Status: ${res4.status}`)
      const body4 = await res4.json()
      console.log('Response body:', body4)
      if (res4.status === 200 && body4.ignored) {
        console.log('✅ Correctly ignored with 200 status')
      } else {
        console.error('❌ Expected 200 ignored response for unsupported event')
        testFailed = true
      }

      // Test Case 5: Valid checkout.session.completed ingestion (should return 200 success)
      console.log('\n--- Test Case 5: Valid conversion ingestion ---')
      const sigValid = stripe.webhooks.generateTestHeaderString({
        payload: payloadStr,
        secret: testSecret
      })
      const res5 = await fetch(`http://localhost:3999/api/webhooks/stripe/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sigValid
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res5.status}`)
      const body5 = await res5.json()
      console.log('Response body:', body5)
      if (res5.status === 200 && body5.received && !body5.duplicate) {
        console.log('✅ Ingestion succeeded with 200 status')
      } else {
        console.error('❌ Expected 200 success response')
        testFailed = true
      }

      // Test Case 6: Duplicate event (idempotency checks, should return 200 duplicate)
      console.log('\n--- Test Case 6: Duplicate idempotency behavior ---')
      const res6 = await fetch(`http://localhost:3999/api/webhooks/stripe/${siteKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sigValid
        },
        body: payloadStr
      })
      console.log(`Response Status: ${res6.status}`)
      const body6 = await res6.json()
      console.log('Response body:', body6)
      if (res6.status === 200 && body6.received && body6.duplicate) {
        console.log('✅ Correctly flagged duplicate event and returned 200 skipped')
      } else {
        console.error('❌ Expected 200 duplicate skipped response')
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
        .update({ encrypted_stripe_webhook_secret: originalSecret })
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
          console.log('\n❌ QA TEST FAILED')
          process.exit(1)
        } else {
          console.log('\n🎉 ALL QA CHECKS PASSED SUCCESSFULLY!')
          process.exit(0)
        }
      })
    }
  })
}

runQa()
