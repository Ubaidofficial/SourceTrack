import assert from 'assert'
import { getTrialInfo, getPlanLabel, isPaidPlan } from '../dashboard/src/lib/billing.js'

console.log('==================================================')
console.log('       Billing Helper E2E unit test runner')
console.log('==================================================\n')

// Test 1: non-trial plan does not show trial countdown or expired badge
console.log('Running Test 1: non-trial plans...')
const freeSite = { plan: 'free', created_at: new Date().toISOString() }
const freeResult = getTrialInfo(freeSite)
assert.strictEqual(freeResult.isTrial, false)
assert.strictEqual(freeResult.daysLeft, null)
assert.strictEqual(freeResult.expired, false)
console.log('✅ Test 1 Passed.')

// Test 2: trial plan with future trial_ends_at is not expired and correct remaining days
console.log('Running Test 2: trial with future trial_ends_at...')
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const futureTrialSite = { plan: 'trial', trial_ends_at: tomorrow }
const futureResult = getTrialInfo(futureTrialSite)
assert.strictEqual(futureResult.isTrial, true)
assert.strictEqual(futureResult.daysLeft, 1)
assert.strictEqual(futureResult.expired, false)
console.log('✅ Test 2 Passed.')

// Test 3: trial plan with past trial_ends_at is expired
console.log('Running Test 3: trial with past trial_ends_at...')
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const expiredTrialSite = { plan: 'trial', trial_ends_at: yesterday }
const expiredResult = getTrialInfo(expiredTrialSite)
assert.strictEqual(expiredResult.isTrial, true)
assert.strictEqual(expiredResult.daysLeft, 0)
assert.strictEqual(expiredResult.expired, true)
console.log('✅ Test 3 Passed.')

// Test 4: trial with missing trial_ends_at falls back to created_at + 14 days
console.log('Running Test 4: trial fallback to created_at + 14 days...')
const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
const fallbackSite = { plan: 'trial', created_at: tenDaysAgo }
const fallbackResult = getTrialInfo(fallbackSite)
assert.strictEqual(fallbackResult.isTrial, true)
// 14 days total, 10 days passed -> 4 days left
assert.strictEqual(fallbackResult.daysLeft, 4)
assert.strictEqual(fallbackResult.expired, false)

const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
const fallbackExpiredSite = { plan: 'trial', created_at: twentyDaysAgo }
const fallbackExpiredResult = getTrialInfo(fallbackExpiredSite)
assert.strictEqual(fallbackExpiredResult.isTrial, true)
assert.strictEqual(fallbackExpiredResult.daysLeft, 0)
assert.strictEqual(fallbackExpiredResult.expired, true)
console.log('✅ Test 4 Passed.')

// Test 5: isPaidPlan returns true for starter, growth, scale and handles pro/agency/business aliases
console.log('Running Test 5: isPaidPlan checks...')
assert.strictEqual(isPaidPlan('free'), false)
assert.strictEqual(isPaidPlan('trial'), false)
assert.strictEqual(isPaidPlan('starter'), true)
assert.strictEqual(isPaidPlan('growth'), true)
assert.strictEqual(isPaidPlan('scale'), true)
assert.strictEqual(isPaidPlan('business'), true)
assert.strictEqual(isPaidPlan('pro'), true)
assert.strictEqual(isPaidPlan('agency'), true)
assert.strictEqual(isPaidPlan('inactive'), false)
assert.strictEqual(isPaidPlan('archived'), false)
console.log('✅ Test 5 Passed.')

// Test 6: plan labels map correctly
console.log('Running Test 6: getPlanLabel mappings...')
assert.strictEqual(getPlanLabel('free'), 'Free')
assert.strictEqual(getPlanLabel('trial'), 'Trial')
assert.strictEqual(getPlanLabel('starter'), 'Starter')
assert.strictEqual(getPlanLabel('growth'), 'Growth')
assert.strictEqual(getPlanLabel('scale'), 'Scale')
assert.strictEqual(getPlanLabel('business'), 'Scale')
assert.strictEqual(getPlanLabel('inactive'), 'Inactive')
assert.strictEqual(getPlanLabel('archived'), 'Archived')
assert.strictEqual(getPlanLabel('pro'), 'Pro')
console.log('✅ Test 6 Passed.')

console.log('\n🎉 ALL BILLING HELPER TESTS PASSED.');
process.exit(0);
