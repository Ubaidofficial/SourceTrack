import test from 'node:test'
import assert from 'node:assert'
import { getSupabase } from '../lib/supabase.js'
import { handlePrivacySuppression, trackerSiteCache } from '../lib/privacy-suppression.js'

// Setup env variables for the library module
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-gpc.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_HOST = 'https://api.europe-west3.gcp.tinybird.co'
process.env.TINYBIRD_APPEND_TOKEN = 'mock-append-token'

// Setup global fetch interceptor to capture Tinybird append calls
const originalFetch = globalThis.fetch
const tinybirdCalls = []

globalThis.fetch = async (url, options) => {
  if (url.includes('/v0/events?name=privacy_signals')) {
    tinybirdCalls.push({ url, options })
    return { ok: true, text: async () => 'ok' }
  }
  return originalFetch(url, options)
}

// Mock Supabase sites query builder chain
const client = getSupabase()
let mockSites = []

client.from = (table) => {
  if (table === 'sites') {
    return {
      select: (fields) => {
        return {
          or: async (clause) => {
            // clause format: "domain.eq.techrupt.pk,domain.eq.www.techrupt.pk"
            const parts = clause.split(',')
            const domainVal1 = parts[0].split('.eq.')[1]
            const domainVal2 = parts[1].split('.eq.')[1]

            const matches = mockSites.filter(
              (s) => s.domain === domainVal1 || s.domain === domainVal2
            )
            return { data: matches, error: null }
          }
        }
      }
    }
  }
  return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }
}

test('GPC/DNT domain lookup matches both root and www domains correctly', async (t) => {
  mockSites = [
    { id: 'site-techrupt', site_key: 'sk-techrupt', domain: 'www.techrupt.pk' },
    { id: 'site-testsite', site_key: 'sk-testsite', domain: 'testsite.com' }
  ]

  t.afterEach(() => {
    tinybirdCalls.length = 0
    trackerSiteCache.flushAll()
  })

  await t.test('matches root domain referer to www database entry', async () => {
    const req = {
      headers: {
        'sec-gpc': '1',
        'referer': 'https://techrupt.pk/blog/gpc-post'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 1, 'Should trigger Tinybird write')
    const payload = JSON.parse(tinybirdCalls[0].options.body.trim())
    assert.strictEqual(payload.site_id, 'site-techrupt', 'Should match techrupt site id')
    assert.strictEqual(payload.reason, 'gpc')
  })

  await t.test('matches www domain referer to www database entry', async () => {
    const req = {
      headers: {
        'sec-gpc': '1',
        'referer': 'https://www.techrupt.pk/about'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 1, 'Should trigger Tinybird write')
    const payload = JSON.parse(tinybirdCalls[0].options.body.trim())
    assert.strictEqual(payload.site_id, 'site-techrupt')
  })

  await t.test('matches root domain referer to root database entry', async () => {
    const req = {
      headers: {
        'dnt': '1',
        'referer': 'https://testsite.com/contact'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 1, 'Should trigger Tinybird write')
    const payload = JSON.parse(tinybirdCalls[0].options.body.trim())
    assert.strictEqual(payload.site_id, 'site-testsite')
    assert.strictEqual(payload.reason, 'dnt')
  })

  await t.test('gracefully skips lookup on unknown domains', async () => {
    const req = {
      headers: {
        'sec-gpc': '1',
        'referer': 'https://unknown-domain.com/'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 0, 'Should not trigger Tinybird write')
  })

  await t.test('gracefully skips when no GPC/DNT privacy headers present', async () => {
    const req = {
      headers: {
        'referer': 'https://techrupt.pk/about'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 0, 'Should not trigger Tinybird write')
  })

  await t.test('gracefully skips when no referer header present', async () => {
    const req = {
      headers: {
        'sec-gpc': '1'
      }
    }

    await handlePrivacySuppression(req)

    assert.strictEqual(tinybirdCalls.length, 0, 'Should not trigger Tinybird write')
  })

  // Cleanup global fetch mock
  globalThis.fetch = originalFetch
})
