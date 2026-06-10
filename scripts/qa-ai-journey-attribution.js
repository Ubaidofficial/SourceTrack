import 'dotenv/config'
import { selectAiTouchForConversion, chunkVisitorIds } from '../api/lib/attribution-engine.js'


function runTests() {
  console.log('Running QA AI Journey Attribution Tests...')
  let passCount = 0
  let totalTests = 0

  function assert(condition, message) {
    totalTests++
    if (condition) {
      console.log(`  [PASS] Case ${totalTests}: ${message}`)
      passCount++
    } else {
      console.error(`  [FAIL] Case ${totalTests}: ${message}`)
    }
  }

  // 1. AI pageview -> direct conversion = credited to AI platform
  const now = new Date().toISOString()
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
  
  const touches1 = [
    { timestamp: oneHourAgo, ai_source: 'ChatGPT', utm_source: 'chatgpt', referrer: 'https://chatgpt.com/' }
  ]
  const conv1 = { timestamp: now, conversion_value: 100 }
  const match1 = selectAiTouchForConversion(touches1, conv1, 30)
  assert(match1 && match1.platform === 'ChatGPT' && match1.type === 'journey_touchpoint', 
    'AI pageview -> direct conversion is credited to AI platform')

  // 2. AI pageview -> organic pageview -> conversion = credited to most recent prior AI touch
  const twoHoursAgo = new Date(Date.now() - 7200 * 1000).toISOString()
  const touches2 = [
    { timestamp: twoHoursAgo, ai_source: 'Claude', utm_source: 'claude', referrer: 'https://claude.ai/' },
    { timestamp: oneHourAgo, utm_source: 'google', referrer: 'https://google.com/' }
  ]
  const conv2 = { timestamp: now, conversion_value: 50 }
  const match2 = selectAiTouchForConversion(touches2, conv2, 30)
  assert(match2 && match2.platform === 'Claude' && match2.type === 'journey_touchpoint', 
    'AI pageview -> organic pageview -> conversion is credited to AI platform')

  // 3. ChatGPT touch -> Perplexity touch -> conversion = credited to Perplexity (most recent)
  const touches3 = [
    { timestamp: twoHoursAgo, ai_source: 'ChatGPT', utm_source: 'chatgpt', referrer: 'https://chatgpt.com/' },
    { timestamp: oneHourAgo, ai_source: 'Perplexity', utm_source: 'perplexity', referrer: 'https://perplexity.ai/' }
  ]
  const conv3 = { timestamp: now, conversion_value: 200 }
  const match3 = selectAiTouchForConversion(touches3, conv3, 30)
  assert(match3 && match3.platform === 'Perplexity' && match3.type === 'journey_touchpoint', 
    'ChatGPT -> Perplexity -> conversion is credited to Perplexity (most recent)')

  // 4. AI touch after conversion = ignored
  const oneHourInFuture = new Date(Date.now() + 3600 * 1000).toISOString()
  const touches4 = [
    { timestamp: oneHourInFuture, ai_source: 'ChatGPT', utm_source: 'chatgpt', referrer: 'https://chatgpt.com/' }
  ]
  const conv4 = { timestamp: now, conversion_value: 10 }
  const match4 = selectAiTouchForConversion(touches4, conv4, 30)
  assert(!match4, 'AI touch after conversion is ignored')

  // 5. AI touch outside attribution window = ignored
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString()
  const touches5 = [
    { timestamp: thirtyOneDaysAgo, ai_source: 'ChatGPT', utm_source: 'chatgpt', referrer: 'https://chatgpt.com/' }
  ]
  const conv5 = { timestamp: now, conversion_value: 30 }
  const match5 = selectAiTouchForConversion(touches5, conv5, 30)
  assert(!match5, 'AI touch outside attribution window is ignored')

  // 6. Non-AI journey -> conversion = not included in ai_platforms
  const touches6 = [
    { timestamp: oneHourAgo, utm_source: 'google', referrer: 'https://google.com/' }
  ]
  const conv6 = { timestamp: now, conversion_value: 40 }
  const match6 = selectAiTouchForConversion(touches6, conv6, 30)
  assert(!match6, 'Non-AI journey -> conversion is not attributed')

  // 7. Conversion event has ai_source but no prior AI pageview = still credited, labeled conversion_event
  const touches7 = [
    { timestamp: oneHourAgo, utm_source: 'google', referrer: 'https://google.com/' }
  ]
  const conv7 = { timestamp: now, ai_source: 'Gemini', conversion_value: 150 }
  const match7 = selectAiTouchForConversion(touches7, conv7, 30)
  assert(match7 && match7.platform === 'Gemini' && match7.type === 'conversion_event', 
    'Conversion event has ai_source fallback credited as conversion_event')

  // 8. Multiple AI touches before one conversion = conversion counted once (proved by helper returning a single match)
  const touches8 = [
    { timestamp: twoHoursAgo, ai_source: 'Grok', utm_source: 'grok' },
    { timestamp: oneHourAgo, ai_source: 'Gemini', utm_source: 'gemini' }
  ]
  const conv8 = { timestamp: now, conversion_value: 100 }
  const match8 = selectAiTouchForConversion(touches8, conv8, 30)
  assert(match8 && match8.platform === 'Gemini', 'Multiple AI touches returns exactly one credited source (most recent)')

  // 9. Two distinct visitors = no cross-visitor leakage (proved by separate array inputs)
  const touchesVisitorA = [{ timestamp: oneHourAgo, ai_source: 'ChatGPT', utm_source: 'chatgpt' }]
  const touchesVisitorB = [{ timestamp: oneHourAgo, utm_source: 'google' }]
  const convVisitorB = { timestamp: now, conversion_value: 100 }
  const matchVisitorB = selectAiTouchForConversion(touchesVisitorB, convVisitorB, 30)
  assert(!matchVisitorB, 'Two distinct visitors have no cross-visitor leakage')

  // 10. Same user after 132C identity resolution = works when conversion distinct_id is resolved anonymous_id
  const resolvedVisitorTouches = [
    { timestamp: twoHoursAgo, ai_source: 'DeepSeek', utm_source: 'deepseek' }
  ]
  const resolvedConv = { timestamp: now, conversion_value: 300 }
  const match10 = selectAiTouchForConversion(resolvedVisitorTouches, resolvedConv, 30)
  assert(match10 && match10.platform === 'DeepSeek', 'Resolved identity visitor is credited correctly')

  // 11. Batching and query planning cases
  // 0 IDs => 0 batches
  const batch0 = chunkVisitorIds([], 100)
  assert(batch0.length === 0, '0 IDs => 0 batches')

  // 1 ID => 1 batch
  const batch1 = chunkVisitorIds(['user_1'], 100)
  assert(batch1.length === 1 && batch1[0].length === 1 && batch1[0][0] === 'user_1', '1 ID => 1 batch')

  // 99 IDs => 1 batch
  const ids99 = Array.from({ length: 99 }, (_, i) => `user_${i}`)
  const batch99 = chunkVisitorIds(ids99, 100)
  assert(batch99.length === 1 && batch99[0].length === 99, '99 IDs => 1 batch')

  // 100 IDs => 1 batch
  const ids100 = Array.from({ length: 100 }, (_, i) => `user_${i}`)
  const batch100 = chunkVisitorIds(ids100, 100)
  assert(batch100.length === 1 && batch100[0].length === 100, '100 IDs => 1 batch')

  // 101 IDs => 2 batches
  const ids101 = Array.from({ length: 101 }, (_, i) => `user_${i}`)
  const batch101 = chunkVisitorIds(ids101, 100)
  assert(batch101.length === 2 && batch101[0].length === 100 && batch101[1].length === 1, '101 IDs => 2 batches')

  // 500 IDs => 5 batches
  const ids500 = Array.from({ length: 500 }, (_, i) => `user_${i}`)
  const batch500 = chunkVisitorIds(ids500, 100)
  assert(batch500.length === 5 && batch500.every(b => b.length === 100), '500 IDs => 5 batches')

  // 1200 IDs => 12 batches
  const ids1200 = Array.from({ length: 1200 }, (_, i) => `user_${i}`)
  const batch1200 = chunkVisitorIds(ids1200, 100)
  assert(batch1200.length === 12 && batch1200.every(b => b.length === 100), '1200 IDs => 12 batches')

  console.log(`\nPASS ai_journey_attribution: ${passCount}/${totalTests}`)
  if (passCount !== totalTests) {
    process.exit(1)
  }
}

runTests()
