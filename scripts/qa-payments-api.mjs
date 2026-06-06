import 'dotenv/config'
import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import { getSupabase } from '../api/lib/supabase.js'
import { validateSiteKey } from '../api/middleware/auth.js'
import { conversionOffline } from '../api/routes/conversion-offline.js'

async function runQa() {
  console.log('==================================================')
  console.log('       Payments API Hardening E2E QA Test')
  console.log('==================================================\n')

  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
    console.log('🔑 Generated temporary ENCRYPTION_KEY.')
  }

  const supabase = getSupabase()

  // 1. Get a valid site to run testing against
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('site_key')
    .limit(1)
    .maybeSingle()

  if (siteError || !site) {
    console.error('❌ Failed to retrieve a test site from database. Ensure site seeds are present.')
    process.exit(1)
  }

  const { site_key: siteKey } = site
  console.log(`Using test site key: ${siteKey}\n`)

  // 2. Spin up mock express server on port 3998
  const app = express()
  app.use(express.json())
  app.post('/api/conversion/offline', validateSiteKey, conversionOffline)

  const server = app.listen(3998, async () => {
    console.log('🚀 Temporary test server listening on port 3998')
    let testFailed = false

    try {
      // Test Case 1: Valid attributed revenue event
      console.log('\n--- Test Case 1: Valid attributed revenue event ---')
      const orderId1 = 'ord_qa_111_' + Date.now()
      const res1 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 99.99,
          currency: 'USD',
          order_id: orderId1,
          provider: 'custom-gateway',
          properties: {
            email: 'pii_leak@example.com',
            page_url: 'https://example.com/?email=leaked_pii@example.com'
          }
        })
      })
      console.log(`Response Status: ${res1.status}`)
      const body1 = await res1.json()
      console.log('Response Body:', body1)
      if (res1.status === 200 && body1.success && body1.duplicate === false) {
        console.log('✅ Correctly accepted new attributed revenue event')
      } else {
        console.error('❌ Expected 200 success with duplicate=false')
        testFailed = true
      }

      // Test Case 2: Duplicate dedupe key returns duplicate true
      console.log('\n--- Test Case 2: Duplicate dedupe key ---')
      const res2 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 99.99,
          currency: 'USD',
          order_id: orderId1,
          provider: 'custom-gateway'
        })
      })
      console.log(`Response Status: ${res2.status}`)
      const body2 = await res2.json()
      console.log('Response Body:', body2)
      if (res2.status === 200 && body2.success && body2.duplicate === true) {
        console.log('✅ Correctly flagged duplicate transaction and skipped ingestion')
      } else {
        console.error('❌ Expected 200 success with duplicate=true')
        testFailed = true
      }

      // Test Case 3: Valid unattributed revenue event (identity missing, dedupe key present)
      console.log('\n--- Test Case 3: Valid unattributed revenue event ---')
      const paymentId3 = 'pay_qa_222_' + Date.now()
      const res3 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          conversion_value: 149.00,
          currency: 'EUR',
          payment_id: paymentId3,
          provider: 'custom_billing'
        })
      })
      console.log(`Response Status: ${res3.status}`)
      const body3 = await res3.json()
      console.log('Response Body:', body3)
      if (res3.status === 200 && body3.success && body3.duplicate === false) {
        console.log('✅ Correctly accepted unattributed revenue event')
      } else {
        console.error('❌ Expected 200 success with duplicate=false for unattributed revenue')
        testFailed = true
      }

      // Test Case 4: Missing dedupe key rejected for revenue events (value > 0)
      console.log('\n--- Test Case 4: Missing dedupe key for revenue event ---')
      const res4 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 50.00,
          currency: 'USD'
        })
      })
      console.log(`Response Status: ${res4.status}`)
      const body4 = await res4.json()
      console.log('Response Body:', body4)
      if (res4.status === 400 && !body4.success) {
        console.log('✅ Correctly rejected missing dedupe key with 400 Bad Request')
      } else {
        console.error('❌ Expected 400 error for missing dedupe key')
        testFailed = true
      }

      // Test Case 5: Invalid amount rejected
      console.log('\n--- Test Case 5: Invalid amount rejected ---')
      const res5 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: -10.00,
          currency: 'USD',
          order_id: 'ord_qa_333_' + Date.now()
        })
      })
      console.log(`Response Status: ${res5.status}`)
      const body5 = await res5.json()
      console.log('Response Body:', body5)
      if (res5.status === 400 && !body5.success) {
        console.log('✅ Correctly rejected negative amount with 400 Bad Request')
      } else {
        console.error('❌ Expected 400 error for negative amount')
        testFailed = true
      }

      // Test Case 6: Invalid currency rejected
      console.log('\n--- Test Case 6: Invalid currency rejected ---')
      const res6 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 50.00,
          currency: 'US',
          order_id: 'ord_qa_444_' + Date.now()
        })
      })
      console.log(`Response Status: ${res6.status}`)
      const body6 = await res6.json()
      console.log('Response Body:', body6)
      if (res6.status === 400 && !body6.success) {
        console.log('✅ Correctly rejected invalid currency with 400 Bad Request')
      } else {
        console.error('❌ Expected 400 error for invalid currency')
        testFailed = true
      }

      // Test Case 7: Invalid provider characters rejected
      console.log('\n--- Test Case 7: Invalid provider name rejected ---')
      const res7 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 50.00,
          currency: 'USD',
          order_id: 'ord_qa_555_' + Date.now(),
          provider: 'invalid$provider!'
        })
      })
      console.log(`Response Status: ${res7.status}`)
      const body7 = await res7.json()
      console.log('Response Body:', body7)
      if (res7.status === 400 && !body7.success) {
        console.log('✅ Correctly rejected invalid provider format with 400 Bad Request')
      } else {
        console.error('❌ Expected 400 error for invalid provider name')
        testFailed = true
      }

      // Test Case 8: Backward compatibility (non-revenue event with identity, no dedupe keys)
      console.log('\n--- Test Case 8: Backward compatibility check ---')
      const res8 = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 0
        })
      })
      console.log(`Response Status: ${res8.status}`)
      const body8 = await res8.json()
      console.log('Response Body:', body8)
      if (res8.status === 200 && body8.success && body8.duplicate === false) {
        console.log('✅ Correctly accepted non-revenue event without dedupe keys')
      } else {
        console.error('❌ Expected 200 success for non-revenue event')
        testFailed = true
      }

      // Test Case 9: Invalid-then-corrected retry behavior
      console.log('\n--- Test Case 9: Invalid-then-corrected retry behavior ---')
      const orderId9 = 'ord_qa_999_' + Date.now()

      // Step 9a: Send with invalid timestamp (should fail with 400, but NOT claim keys)
      const res9a = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 99.99,
          currency: 'USD',
          order_id: orderId9,
          occurred_at: 'not-a-date'
        })
      })
      console.log(`Step 9a Status: ${res9a.status} (Expected: 400)`)
      const body9a = await res9a.json()
      if (res9a.status === 400 && !body9a.success) {
        console.log('✅ Correctly rejected invalid timestamp with 400')
      } else {
        console.error('❌ Expected 400 bad request for invalid timestamp')
        testFailed = true
      }

      // Step 9b: Retry with same order_id but corrected valid timestamp (should succeed with 200, duplicate: false)
      const res9b = await fetch('http://localhost:3998/api/conversion/offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_key: siteKey,
          user_id: 'user_qa_123',
          conversion_value: 99.99,
          currency: 'USD',
          order_id: orderId9,
          occurred_at: new Date().toISOString()
        })
      })
      console.log(`Step 9b Status: ${res9b.status} (Expected: 200)`)
      const body9b = await res9b.json()
      if (res9b.status === 200 && body9b.success && !body9b.duplicate) {
        console.log('✅ Correctly allowed ingestion of corrected event after previous validation failure')
      } else {
        console.error('❌ Expected 200 success response with duplicate=false for corrected retry')
        testFailed = true
      }

    } catch (err) {
      console.error('❌ Exception during QA execution:', err.message)
      testFailed = true
    } finally {
      // Stop mock server
      server.close(() => {
        console.log('\nServer stopped.')
        if (testFailed) {
          console.log('❌ QA PAYMENTS API TEST FAILED')
          process.exit(1)
        } else {
          console.log('🎉 ALL QA PAYMENTS API CHECKS PASSED SUCCESSFULLY!')
          process.exit(0)
        }
      })
    }
  })
}

runQa()
