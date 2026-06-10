import dotenv from 'dotenv';
dotenv.config();

import { verifySafeEnvironment } from './qa-guard.js';
verifySafeEnvironment();

import crypto from 'crypto';
import { getSupabase } from '../api/lib/supabase.js';
import { encryptSecret, decryptSecret } from '../api/lib/utils.js';
import { claimIdempotencyKeys, logIngestionEvent } from '../api/lib/idempotency.js';

async function runTests() {
  console.log('==================================================');
  console.log('    Revenue Ingestion Foundation Verification');
  console.log('==================================================\n');

  let hasFailures = false;

  // ----------------------------------------------------
  // TEST 1: Encryption / Decryption helpers
  // ----------------------------------------------------
  console.log('--- TEST 1: Encryption & Decryption (aes-256-gcm) ---');
  try {
    // Generate valid 64-char hex key
    const hexKey = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = hexKey;

    const secretText = 'my-super-secret-stripe-webhook-key-1234';
    const encrypted = encryptSecret(secretText);
    console.log('✅ Encrypted format (iv:cipher:tag):', encrypted.split(':').length === 3 ? 'Valid' : 'Invalid');

    const decrypted = decryptSecret(encrypted);
    if (decrypted === secretText) {
      console.log('✅ Decryption round-trip matches input text.');
    } else {
      console.error('❌ Decrypted text does not match! Got:', decrypted);
      hasFailures = true;
    }
  } catch (err) {
    console.error('❌ Encryption/Decryption test failed:', err.message);
    hasFailures = true;
  }

  // Test missing ENCRYPTION_KEY throws
  try {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      encryptSecret('test-no-key');
    } catch (err) {
      console.log('✅ Throws error on missing/invalid ENCRYPTION_KEY when used:', err.message);
    }
    process.env.ENCRYPTION_KEY = originalKey; // restore
  } catch (err) {
    console.error('❌ Missing/invalid key check failed:', err.message);
    hasFailures = true;
  }
  console.log();

  // ----------------------------------------------------
  // TEST 2: Database Schema & Idempotency / Logging
  // ----------------------------------------------------
  console.log('--- TEST 2: Database Idempotency & Ingestion Events ---');
  try {
    const supabase = getSupabase();
    // Get a valid site_key to test with
    const { data: sites, error: siteError } = await supabase.from('sites').select('site_key').limit(1);

    if (siteError || !sites || sites.length === 0) {
      console.error('❌ Could not query sites table to get a valid site key. Database might be down.');
      process.exit(1);
    }

    const siteKey = sites[0].site_key;
    console.log(`Using site key: ${siteKey} for database checks.`);

    const provider = `stripe-qa-${Date.now()}`;
    const testKey1 = { key_type: 'order_id', key_value: `ord_${Date.now()}_1` };
    const testKey2 = { key_type: 'payment_id', key_value: `pay_${Date.now()}_2` };

    // A. First claim (should succeed if database migrations are applied)
    console.log(`Claiming keys first time: ${JSON.stringify([testKey1, testKey2])}`);
    const claim1 = await claimIdempotencyKeys(siteKey, provider, [testKey1, testKey2]);
    
    if (claim1.error && claim1.error.includes('Could not find the function')) {
      console.log('\n⚠️  MIGRATION PENDING: the RPC function claim_revenue_idempotency_keys is not found.');
      console.log('👉 Please apply the migration SQL in your Supabase SQL Editor:');
      console.log('   supabase/migrations/20260606180000_revenue_foundation.sql\n');
      process.exit(1);
    }

    if (claim1.success && !claim1.duplicate) {
      console.log('✅ First claim succeeded as expected.');
    } else {
      console.error('❌ First claim failed:', claim1);
      hasFailures = true;
    }

    // B. Second claim (should register duplicate)
    console.log(`Claiming duplicate keys second time: ${JSON.stringify([testKey1])}`);
    const claim2 = await claimIdempotencyKeys(siteKey, provider, [testKey1]);
    if (!claim2.success && claim2.duplicate) {
      console.log('✅ Duplicate detected: success=false, duplicate=true returned correctly.');
    } else {
      console.error('❌ Second claim did not return duplicate state correctly:', claim2);
      hasFailures = true;
    }

    // C. Atomic rollback test (claim one duplicate and one new key; should roll back all)
    const testKey3 = { key_type: 'order_id', key_value: `ord_${Date.now()}_3` }; // new key
    console.log(`Claiming mixed keys (1 existing, 1 new): ${JSON.stringify([testKey1, testKey3])}`);
    const claim3 = await claimIdempotencyKeys(siteKey, provider, [testKey1, testKey3]);
    if (!claim3.success && claim3.duplicate) {
      console.log('✅ Mixed claim rejected successfully.');
      
      // Verify key3 was not created (it should claim successfully now since it was rolled back)
      console.log(`Verifying rollback of: ${JSON.stringify([testKey3])}`);
      const claim4 = await claimIdempotencyKeys(siteKey, provider, [testKey3]);
      if (claim4.success && !claim4.duplicate) {
        console.log('✅ Key rollback confirmed: new key was not inserted.');
      } else {
        console.error('❌ Key was inserted despite transactional failure!', claim4);
        hasFailures = true;
      }
    } else {
      console.error('❌ Mixed claim was not rejected properly:', claim3);
      hasFailures = true;
    }

    // D. Log Ingestion Event check
    console.log('Logging ingestion success event...');
    const log1 = await logIngestionEvent(siteKey, provider, {
      providerEventId: `evt_${Date.now()}`,
      orderId: testKey1.key_value,
      value: 129.50,
      currency: 'USD',
      status: 'success'
    });
    if (log1.success) {
      console.log('✅ Ingestion event logged successfully.');
    } else {
      console.error('❌ Logging event failed:', log1.error);
      hasFailures = true;
    }

    // E. Log Ingestion Event error constraints
    console.log('Logging ingestion duplicate event with error message...');
    const log2 = await logIngestionEvent(siteKey, provider, {
      providerEventId: `evt_${Date.now()}`,
      orderId: testKey1.key_value,
      value: 129.50,
      currency: 'USD',
      status: 'duplicate',
      errorMessage: 'Duplicate transaction key detected.'
    });
    if (log2.success) {
      console.log('✅ Duplicate ingestion event logged successfully.');
    } else {
      console.error('❌ Logging duplicate event failed:', log2.error);
      hasFailures = true;
    }

  } catch (err) {
    console.error('❌ Database idempotency test failed:', err.message);
    hasFailures = true;
  }
  console.log();

  if (hasFailures) {
    console.log('❌ VERIFICATION FAILED: Some tests failed.');
    process.exit(1);
  } else {
    console.log('🎉 VERIFICATION SUCCESS: All checks passed!');
    process.exit(0);
  }
}

runTests();
