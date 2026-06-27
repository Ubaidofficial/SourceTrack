import dotenv from 'dotenv'
dotenv.config()

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'
import { validateCrossDomainSettings } from '../api/lib/cross-domain-validation.js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import vm from 'vm'

console.log('==================================================')
console.log('     QA Verification: Cross-Domain Tracking      ')
console.log('==================================================\n')

const ALLOW_SCHEMA_WARN = process.env.ALLOW_SCHEMA_WARN === '1'

async function runSchemaChecks() {
  console.log('1. Checking sites.cross_domain_domains and sites.cross_domain_cookie_domain columns...')
  const supabase = getSupabase()
  try {
    const { data, error } = await supabase
      .from('sites')
      .select('cross_domain_domains, cross_domain_cookie_domain')
      .limit(1)

    if (error) {
      if (ALLOW_SCHEMA_WARN) {
        console.warn('⚠️  Warning: sites cross-domain columns do not exist yet in database.');
        console.warn('   Make sure to apply the migration SQL in your Supabase SQL Editor.');
        console.warn(`   Error message: ${error.message || error}\n`);
        return;
      } else {
        throw new Error(`Schema check failed: cross_domain columns do not exist in database. Error: ${error.message || error}`);
      }
    }
    console.log('✅ sites cross-domain columns exist in database.\n')
  } catch (err) {
    if (ALLOW_SCHEMA_WARN) {
      console.warn(`⚠️  Warning: Failed to check columns (connection error): ${err.message}. Proceeding...\n`);
    } else {
      throw err;
    }
  }
}

function runBackendValidationTests() {
  console.log('2. Running backend settings PATCH validation checks...')

  // Case A: Valid domains and valid cookie domain matching site domain
  const res1 = validateCrossDomainSettings({
    cross_domain_domains: ['app.example.com', 'CHECKOUT.example.com '],
    cross_domain_cookie_domain: '.example.com'
  }, 'example.com')
  assert.deepStrictEqual(res1.crossDomainDomains, ['app.example.com', 'checkout.example.com'])
  assert.strictEqual(res1.crossDomainCookieDomain, '.example.com')

  // Case B: Valid cookie domain matching subdomain
  const res2 = validateCrossDomainSettings({
    cross_domain_cookie_domain: '.example.com'
  }, 'www.example.com')
  assert.strictEqual(res2.crossDomainCookieDomain, '.example.com')

  // Case C: Reject unrelated cookie domain
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_cookie_domain: '.another.com' }, 'example.com')
  }, /must match the tracked site domain/, 'Should reject unrelated cookie domain')

  // Case D: Reject generic suffix cookie domains
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_cookie_domain: '.com' }, 'example.com')
  }, /is unsafe/, 'Should reject generic public suffix cookie domains')

  // Case E: Reject wildcards in cross-domain domains list
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['*.example.com'] }, 'example.com')
  }, /Wildcards are not supported/, 'Should reject wildcards')

  // Case F: Reject protocols
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['https://example.com'] }, 'example.com')
  }, /must not contain protocols or paths/, 'Should reject protocols')

  // Case G: Reject paths
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['example.com/checkout'] }, 'example.com')
  }, /must not contain protocols or paths/, 'Should reject paths')

  // Case H: Reject localhost unconditionally (not gated on NODE_ENV)
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['local.localhost'] }, 'example.com')
  }, /localhost domain.*not allowed/, 'Should reject localhost in every environment')

  // Case I: Max domains limit
  assert.throws(() => {
    const list = Array.from({ length: 21 }, (_, i) => `domain${i}.com`)
    validateCrossDomainSettings({ cross_domain_domains: list }, 'example.com')
  }, /Maximum of 20 cross-domain domains allowed/, 'Should reject lists with >20 domains')

  // Case J: Reject single-label and unsafe public suffix domains (Blocker #3)
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['com'] }, 'example.com')
  }, /must contain at least one dot/, 'Should reject single label domain "com"')

  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['ai'] }, 'example.com')
  }, /must contain at least one dot/, 'Should reject single label domain "ai"')

  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['co.uk'] }, 'example.com')
  }, /is a public suffix/, 'Should reject "co.uk" public suffix domain')

  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_domains: ['example'] }, 'example.com')
  }, /must contain at least one dot/, 'Should reject single label domain "example"')

  // Case K: Reject unsafe cookie domains (.ai, .app, .com.au) (Blocker #4)
  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_cookie_domain: '.ai' }, 'example.ai')
  }, /cannot be set directly on a top-level domain/, 'Should reject TLD cookie domain ".ai"')

  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_cookie_domain: '.app' }, 'example.app')
  }, /cannot be set directly on a top-level domain/, 'Should reject TLD cookie domain ".app"')

  assert.throws(() => {
    validateCrossDomainSettings({ cross_domain_cookie_domain: '.com.au' }, 'example.com.au')
  }, /is unsafe and cannot be set directly on a public suffix/, 'Should reject public suffix cookie domain ".com.au"')

  console.log('✅ Backend validation tests passed successfully!\n')
}

// Helper to instantiate sandboxed tracker in Node vm
function createTrackerContext(trackerFile, docAttrs = {}, startUrl = 'https://example.com/', storedAid = null, storedFt = null) {
  const code = fs.readFileSync(trackerFile, 'utf8')

  const parsedUrl = new URL(startUrl)

  const registeredListeners = {}
  const mockAddEventListener = (event, handler) => {
    if (!registeredListeners[event]) {
      registeredListeners[event] = []
    }
    registeredListeners[event].push(handler)
  }

  const triggerEvent = (event, targetElement, extra = {}) => {
    const handlers = registeredListeners[event] || []
    const mockEvent = {
      target: targetElement,
      button: extra.button !== undefined ? extra.button : 0,
      preventDefault: () => { mockEvent.defaultPrevented = true; },
      stopPropagation: () => { mockEvent.propagationStopped = true; },
      defaultPrevented: false,
      propagationStopped: false,
      ...extra
    }
    for (const handler of handlers) {
      handler(mockEvent)
    }
    return mockEvent
  }

  const mockWindow = {
    location: {
      href: startUrl,
      hostname: parsedUrl.hostname,
      search: parsedUrl.search,
      pathname: parsedUrl.pathname,
      hash: parsedUrl.hash
    },
    history: {
      replaceState: (state, title, url) => {
        mockWindow.location.href = new URL(url, mockWindow.location.href).toString()
        const newParsed = new URL(mockWindow.location.href)
        mockWindow.location.search = newParsed.search
        mockWindow.location.pathname = newParsed.pathname
        mockWindow.location.hash = newParsed.hash
      }
    },
    addEventListener: mockAddEventListener,
    Math: Math,
    JSON: JSON,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Date: Date,
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    atob: (str) => Buffer.from(str, 'base64').toString('binary')
  }

  const mockDocument = {
    currentScript: {
      getAttribute: (name) => docAttrs[name] || null
    },
    cookie: '',
    addEventListener: mockAddEventListener,
    querySelector: () => null
  }

  const mockLocalStorage = {
    store: {},
    getItem: (k) => mockLocalStorage.store[k] || null,
    setItem: (k, v) => { mockLocalStorage.store[k] = String(v); }
  }

  if (storedAid) {
    mockLocalStorage.store['st_aid'] = storedAid
  }
  if (storedFt) {
    mockLocalStorage.store['st_ft_src'] = storedFt.s
    mockLocalStorage.store['st_ft_med'] = storedFt.m
    mockLocalStorage.store['st_ft_cmp'] = storedFt.c
  }

  const mockSessionStorage = {
    store: {},
    getItem: (k) => mockSessionStorage.store[k] || null,
    setItem: (k, v) => { mockSessionStorage.store[k] = String(v); }
  }

  const context = {
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    history: mockWindow.history,
    navigator: { doNotTrack: null },
    location: mockWindow.location,
    addEventListener: mockAddEventListener,
    Math: Math,
    JSON: JSON,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Date: Date,
    btoa: mockWindow.btoa,
    atob: mockWindow.atob,
    Blob: class {},
    fetch: () => Promise.resolve()
  }

  vm.runInNewContext(code, context)
  context.registeredListeners = registeredListeners
  context.triggerEvent = triggerEvent
  return context
}

function runTrackerRuntimeTests() {
  console.log('3. Running tracker runtime VM sandbox checks...')

  // Test Case A: Fresh initialization generates new anonymous ID & writes cookie if valid
  const ctxA = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123',
    'data-cookie-domain': '.example.com'
  }, 'https://example.com/landing')

  const generatedAid = ctxA.localStorage.getItem('st_aid')
  assert.ok(generatedAid, 'Should generate st_aid in localStorage')
  assert.ok(ctxA.document.cookie.includes('st_aid='), 'Should write st_aid to cookies')
  assert.ok(ctxA.document.cookie.includes('domain=.example.com'), 'Should write cookie with domain')

  // Test Case B: Identity restoration from URL parameters (when no local identity exists)
  const incomingId = 'restored-visitor-xyz'
  const ctxB = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, `https://example.com/landing?__st_id=${incomingId}`)

  assert.strictEqual(ctxB.localStorage.getItem('st_aid'), incomingId, 'Should restore st_aid from URL param')
  assert.ok(!ctxB.window.location.href.includes('__st_id='), 'Should strip __st_id from history/address bar')

  // Test Case C: No Identity override (precedence rule)
  const localId = 'my-old-local-identity'
  const ctxC = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, `https://example.com/landing?__st_id=intruder-id-999`, localId)

  assert.strictEqual(ctxC.localStorage.getItem('st_aid'), localId, 'Should not override existing local ID')

  // Test Case D: First-Touch restoration
  const ftPayload = {
    s: 'ad_network',
    m: 'ppc',
    c: 'summer_promo'
  }
  const base64urlPayload = Buffer.from(JSON.stringify(ftPayload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const ctxD = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, `https://example.com/landing?__st_ft=${base64urlPayload}`)

  assert.strictEqual(ctxD.localStorage.getItem('st_ft_src'), 'ad_network', 'Should restore first touch source')
  assert.strictEqual(ctxD.localStorage.getItem('st_ft_med'), 'ppc', 'Should restore first touch medium')
  assert.strictEqual(ctxD.localStorage.getItem('st_ft_cmp'), 'summer_promo', 'Should restore first touch campaign')
  assert.ok(!ctxD.window.location.href.includes('__st_ft='), 'Should strip first touch from address bar')

  // Test Case E: First-Touch no override precedence
  const ctxE = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, `https://example.com/landing?__st_ft=${base64urlPayload}`, 'local-user-id', { s: 'organic', m: 'none', c: '' })

  assert.strictEqual(ctxE.localStorage.getItem('st_ft_src'), 'organic', 'Should retain existing first-touch source')

  // Test Case F: Link decoration
  const ctxF = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, 'https://example.com/landing', 'visitor-123', { s: 'google', m: 'cpc', c: 'brand' })

  const originalUrl = 'https://app.example.com/login'
  const decorated = ctxF.window.sourcetrack.decorateUrl(originalUrl)
  const decUrl = new URL(decorated)
  assert.strictEqual(decUrl.searchParams.get('__st_id'), 'visitor-123', 'Should append __st_id')

  const encodedFt = decUrl.searchParams.get('__st_ft')
  assert.ok(encodedFt, 'Should append __st_ft')
  const decodedB64 = encodedFt.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (encodedFt.length % 4)) % 4)
  const decodedObj = JSON.parse(Buffer.from(decodedB64, 'base64').toString('utf8'))
  assert.deepStrictEqual(decodedObj, { s: 'google', m: 'cpc', c: 'brand' }, 'Should encode first-touch details accurately')

  // Test Case G: Auto-decoration validation via event listeners (Blocker #3)
  const ctxG = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123',
    'data-cross-domains': 'app.example.com,checkout.example.com'
  }, 'https://example.com/landing', 'visitor-456', { s: 'facebook', m: 'cpc', c: 'retargeting' })

  // Ensure listeners are registered
  assert.ok(ctxG.registeredListeners['mousedown'] && ctxG.registeredListeners['mousedown'].length > 0, 'Should register mousedown listener')
  assert.ok(ctxG.registeredListeners['touchstart'] && ctxG.registeredListeners['touchstart'].length > 0, 'Should register touchstart listener')

  // Helper to create a fake anchor element
  const createFakeAnchor = (href, attributes = {}) => {
    return {
      nodeName: 'A',
      attributes: { href, ...attributes },
      getAttribute: function(name) { return this.attributes[name] || null; },
      setAttribute: function(name, val) { this.attributes[name] = val; },
      hasAttribute: function(name) { return name in this.attributes; }
    }
  }

  // 1. Allowlisted link decoration
  const anchorAllow = createFakeAnchor('https://app.example.com/billing')
  const ev1 = ctxG.triggerEvent('mousedown', anchorAllow)
  assert.ok(!ev1.defaultPrevented, 'Should not call preventDefault')
  assert.ok(!ev1.propagationStopped, 'Should not stop propagation')
  assert.ok(anchorAllow.getAttribute('href').includes('__st_id=visitor-456'), 'Should decorate allowlisted link href with ID')
  assert.ok(anchorAllow.getAttribute('href').includes('__st_ft='), 'Should decorate allowlisted link href with first-touch')

  // 2. Non-allowlisted link must NOT be decorated
  const anchorDeny = createFakeAnchor('https://another-domain.com/landing')
  const ev2 = ctxG.triggerEvent('mousedown', anchorDeny)
  assert.strictEqual(anchorDeny.getAttribute('href'), 'https://another-domain.com/landing', 'Should not decorate non-allowlisted link')

  // 3. Same-origin link must NOT be decorated
  const anchorSame = createFakeAnchor('https://example.com/about')
  const ev3 = ctxG.triggerEvent('mousedown', anchorSame)
  assert.strictEqual(anchorSame.getAttribute('href'), 'https://example.com/about', 'Should not decorate same-origin link')

  // 4. Hash link must NOT be decorated
  const anchorHash = createFakeAnchor('#section-header')
  const ev4 = ctxG.triggerEvent('mousedown', anchorHash)
  assert.strictEqual(anchorHash.getAttribute('href'), '#section-header', 'Should not decorate hash link')

  // 5. Download link (download attribute present) must NOT be decorated
  const anchorDownload = createFakeAnchor('https://app.example.com/report.pdf', { download: '' })
  const ev5 = ctxG.triggerEvent('mousedown', anchorDownload)
  assert.strictEqual(anchorDownload.getAttribute('href'), 'https://app.example.com/report.pdf', 'Should not decorate links with download attribute')

  // 6. Pre-decorated link must NOT be decorated again (no repeated append)
  const anchorPreDec = createFakeAnchor('https://app.example.com/login?__st_id=old-id')
  const ev6 = ctxG.triggerEvent('mousedown', anchorPreDec)
  assert.strictEqual(anchorPreDec.getAttribute('href'), 'https://app.example.com/login?__st_id=old-id', 'Should not decorate pre-decorated link')

  // 7. Download extension in path (no attribute, but file extension) must NOT be decorated
  const anchorZip = createFakeAnchor('https://app.example.com/bundle.zip')
  const evZip = ctxG.triggerEvent('mousedown', anchorZip)
  assert.strictEqual(anchorZip.getAttribute('href'), 'https://app.example.com/bundle.zip', 'Should not decorate links with download file extension')

  // 8. target="_blank" links preserve normal behavior (only mutate href and do not cancel/prevent default)
  const anchorBlank = createFakeAnchor('https://checkout.example.com/pay', { target: '_blank' })
  const ev7 = ctxG.triggerEvent('mousedown', anchorBlank)
  assert.ok(!ev7.defaultPrevented, 'Should not prevent default for target="_blank"')
  assert.ok(anchorBlank.getAttribute('href').includes('__st_id=visitor-456'), 'Should still decorate target="_blank" link href')

  // 9. Nested element clicked (span inside anchor)
  const anchorNested = createFakeAnchor('https://app.example.com/billing')
  const childSpan = {
    nodeName: 'SPAN',
    parentNode: anchorNested
  }
  const ev8 = ctxG.triggerEvent('mousedown', childSpan)
  assert.ok(anchorNested.getAttribute('href').includes('__st_id=visitor-456'), 'Should find parent anchor and decorate it')

  // 10. Same-origin link must NOT be decorated even when data-cross-domains mistakenly includes it (Blocker #5)
  const ctxGSame = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123',
    'data-cross-domains': 'example.com,app.example.com'
  }, 'https://example.com/landing', 'visitor-456')
  const anchorSameMistake = createFakeAnchor('https://example.com/about')
  ctxGSame.triggerEvent('mousedown', anchorSameMistake)
  assert.strictEqual(anchorSameMistake.getAttribute('href'), 'https://example.com/about', 'Should not decorate same-origin link even if listed in data-cross-domains')

  // Test Case H: Cookie domain absent or invalid (Blocker #2)
  const ctxH1 = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, 'https://example.com/landing')

  assert.ok(ctxH1.localStorage.getItem('st_aid'), 'Should generate st_aid in localStorage')
  assert.strictEqual(ctxH1.document.cookie, '', 'Should NOT write st_aid to cookies when data-cookie-domain is absent')

  const ctxH2 = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123',
    'data-cookie-domain': '.another.com'
  }, 'https://example.com/landing')

  assert.ok(ctxH2.localStorage.getItem('st_aid'), 'Should generate st_aid in localStorage')
  assert.strictEqual(ctxH2.document.cookie, '', 'Should NOT write st_aid to cookies when data-cookie-domain is invalid for current host')

  // Test Case I: Outbound first-touch sanitization (Blocker #6)
  const longVal = 'a'.repeat(200)
  const ctxI1 = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, 'https://example.com/landing', 'visitor-123', {
    s: 'google' + '\n\x00' + 'utm',
    m: longVal,
    c: 'campaign'
  })

  const dec1 = ctxI1.window.sourcetrack.decorateUrl('https://app.example.com/login')
  const decUrl1 = new URL(dec1)
  const encodedFt1 = decUrl1.searchParams.get('__st_ft')
  assert.ok(encodedFt1, 'Should generate st_ft')
  assert.ok(encodedFt1.length <= 300, 'st_ft must be <= 300 chars')

  const decodedB64_1 = encodedFt1.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (encodedFt1.length % 4)) % 4)
  const decodedObj1 = JSON.parse(Buffer.from(decodedB64_1, 'base64').toString('utf8'))
  assert.strictEqual(decodedObj1.s, 'googleutm', 'Should strip control characters')
  assert.strictEqual(decodedObj1.m, 'a'.repeat(100), 'Should truncate to 100 chars')

  // If payload is too long (>300 encoded chars), it must be skipped
  const superLongVal = 'b'.repeat(300)
  const ctxI2 = createTrackerContext('tracker/tracker.js', {
    'data-site-key': 'st-123'
  }, 'https://example.com/landing', 'visitor-123', {
    s: superLongVal,
    m: superLongVal,
    c: superLongVal
  })
  const dec2 = ctxI2.window.sourcetrack.decorateUrl('https://app.example.com/login')
  const decUrl2 = new URL(dec2)
  assert.ok(!decUrl2.searchParams.has('__st_ft'), 'Should skip __st_ft entirely if the encoded string exceeds 300 characters')

  console.log('✅ Tracker runtime checks passed successfully!\n')
}

function runCookielessTrackerTests() {
  console.log('4. Running cookieless tracker constraints checks...')

  const ctxCookieless = createTrackerContext('tracker/tracker.cookieless.js', {
    'data-site-key': 'st-123'
  }, 'https://example.com/landing?__st_id=ignored-id')

  // Cookieless tracker shouldn't write to storage
  assert.strictEqual(ctxCookieless.localStorage.getItem('st_aid'), null, 'Cookieless must not write to localStorage')
  assert.strictEqual(ctxCookieless.document.cookie, '', 'Cookieless must not write cookies')

  // Prior to server ID resolving, decorateUrl returns original URL
  const original = 'https://app.example.com/login'
  const decoratedBefore = ctxCookieless.window.sourcetrack.decorateUrl(original)
  assert.strictEqual(decoratedBefore, original, 'Should return original URL when AID is not resolved')

  console.log('✅ Cookieless tracker constraints checks passed!\n')
}

function runStaticComplianceChecks() {
  console.log('5. Checking minified tracker outputs for forbidden strings...')

  const minifiedTracker = fs.readFileSync('tracker/tracker.min.js', 'utf8')
  const minifiedCookieless = fs.readFileSync('tracker/tracker.cookieless.min.js', 'utf8')

  const forbiddenStrings = [
    '__tq_id',
    '__tq_ft',
    'window.trackiq',
    'getCrossDomainUrl'
  ]

  for (const f of forbiddenStrings) {
    assert.ok(!minifiedTracker.includes(f), `tracker.min.js must not contain forbidden string: ${f}`)
    assert.ok(!minifiedCookieless.includes(f), `tracker.cookieless.min.js must not contain forbidden string: ${f}`)
  }

  // Ensure decorateUrl is present
  assert.ok(minifiedTracker.includes('decorateUrl'), 'tracker.min.js must expose decorateUrl')
  assert.ok(minifiedCookieless.includes('decorateUrl'), 'tracker.cookieless.min.js must expose decorateUrl')

  console.log('✅ Static compliance checks passed successfully!\n')
}

async function start() {
  try {
    await runSchemaChecks()
    runBackendValidationTests()
    runTrackerRuntimeTests()
    runCookielessTrackerTests()
    runStaticComplianceChecks()
    console.log('🎉 ALL CROSS-DOMAIN ATTRIBUTION TESTS PASSED SUCCESSFULLY! 🎉')
  } catch (err) {
    console.error('❌ QA Test failed:', err.stack || err.message)
    process.exit(1)
  }
}

start()
