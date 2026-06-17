import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

// ─── VM harness with configurable DOM for handoff tests ──────────────────────
function runHandoffTracker(code, opts = {}) {
  const capturedValues = {}
  const createdInputs  = []

  const href     = opts.href     !== undefined ? opts.href     : 'https://example.com/pricing?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=shoes&utm_content=banner&gclid=gclid-abc'
  const pathname = opts.pathname !== undefined ? opts.pathname : '/pricing'
  const search   = opts.search   !== undefined ? opts.search   : '?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=shoes&utm_content=banner&gclid=gclid-abc'
  const referrer = opts.referrer !== undefined ? opts.referrer : 'https://referrer.example.com/blog?q=123'

  const locationMock = { href, pathname, search, origin: 'https://example.com' }

  // Build pre-existing hidden inputs map from opts.hiddenFields (array of names)
  const hiddenInputs = (opts.hiddenFields || []).map(name => {
    let _v = ''
    return {
      type: 'hidden',
      name,
      get value() { return _v },
      set value(v) { _v = v; capturedValues[name] = v }
    }
  })

  const formMock = {
    querySelector(sel) {
      const m = sel.match(/input\[type=hidden\]\[name="([^"]+)"\]/)
      if (!m) return null
      return hiddenInputs.find(i => i.name === m[1]) || null
    },
    appendChild(child) {
      createdInputs.push(child)
      let _v = ''
      Object.defineProperty(child, 'value', {
        configurable: true,
        get() { return _v },
        set(v) { _v = v; capturedValues[child.name] = v }
      })
    }
  }

  const documentMock = {
    referrer,
    cookie: '',
    currentScript: {
      getAttribute: (name) => name === 'data-site-key' ? 'sk-test' : null,
      src: 'https://api.example.com/tracker.min.js'
    },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === 'form' || sel === opts.formSelector) ? [formMock] : [],
    createElement: (tag) => ({ type: '', name: '', value: '' }),
    addEventListener: () => {}
  }

  const storage = {}
  const localStorageMock = {
    getItem:    (k)    => storage[k] || null,
    setItem:    (k, v) => { storage[k] = String(v) },
    removeItem: (k)    => { delete storage[k] }
  }

  const windowMock = {
    location: locationMock,
    document: documentMock,
    navigator: {
      doNotTrack: opts.doNotTrack || null,
      globalPrivacyControl: null,
      sendBeacon: () => true
    },
    history: { pushState: () => {}, replaceState: () => {} },
    fetch: async (url) => {
      if (url.includes('/api/tracker/id')) {
        return { ok: true, json: async () => ({ visitor_id: 'cl-handoff-visitor', session_id: 'cl-handoff-session' }) }
      }
      return { ok: true, json: async () => ({}) }
    },
    addEventListener: () => {}
  }

  const context = vm.createContext({
    window:        windowMock,
    document:      documentMock,
    location:      locationMock,
    navigator:     windowMock.navigator,
    history:       windowMock.history,
    addEventListener: () => {},
    fetch:         windowMock.fetch,
    localStorage:  localStorageMock,
    sessionStorage: localStorageMock,
    setTimeout:    (fn, d) => setTimeout(fn, d),
    clearTimeout:  (id)    => clearTimeout(id),
    WeakMap:       globalThis.WeakMap,
    URL:           globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    Blob:          class { constructor(p, o) { this.parts = p; this.opts = o } },
    console:       { warn: () => {}, error: () => {}, log: () => {} }
  })

  vm.runInContext(code, context)

  return { window: context.window, capturedValues, createdInputs }
}

// ─── 1. getContext() extended fields — standard tracker ───────────────────────
test('getContext() extended fields — standard tracker', async (t) => {
  await t.test('includes utm_source, utm_medium, utm_campaign from URL params', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.utm_source,   'google')
    assert.strictEqual(ctx.utm_medium,   'cpc')
    assert.strictEqual(ctx.utm_campaign, 'spring')
  })

  await t.test('includes utm_term and utm_content from URL params', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.utm_term,    'shoes')
    assert.strictEqual(ctx.utm_content, 'banner')
  })

  await t.test('includes raw referrer from document.referrer', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.referrer, 'https://referrer.example.com/blog?q=123')
  })

  await t.test('referrer_host is hostname only — no path, no query string', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.referrer_host, 'referrer.example.com')
    assert.ok(!ctx.referrer_host.includes('/'))
    assert.ok(!ctx.referrer_host.includes('?'))
  })

  await t.test('referrer_host is null when no referrer', () => {
    const { window } = runHandoffTracker(trackerCode, { referrer: '' })
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.referrer,      null)
    assert.strictEqual(ctx.referrer_host, null)
  })

  await t.test('landing_page_path is pathname only — no query string, no hash', () => {
    const { window } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/pricing?foo=bar#section',
      pathname: '/pricing',
      search: '?foo=bar'
    })
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.landing_page_path, '/pricing')
    assert.ok(!ctx.landing_page_path.includes('?'))
    assert.ok(!ctx.landing_page_path.includes('#'))
    assert.ok(!ctx.landing_page_path.includes('foo'))
  })

  await t.test('includes last_touch_source, last_touch_medium, last_touch_campaign', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.ok('last_touch_source'   in ctx)
    assert.ok('last_touch_medium'   in ctx)
    assert.ok('last_touch_campaign' in ctx)
    assert.strictEqual(ctx.last_touch_source,   ctx.current_source)
    assert.strictEqual(ctx.last_touch_medium,   ctx.current_medium)
    assert.strictEqual(ctx.last_touch_campaign, ctx.current_campaign)
  })

  await t.test('utm_source is null when absent from URL', () => {
    const { window } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/page', pathname: '/page', search: ''
    })
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.utm_source,  null)
    assert.strictEqual(ctx.utm_term,    null)
    assert.strictEqual(ctx.utm_content, null)
  })

  await t.test('existing fields are preserved unchanged', () => {
    const { window } = runHandoffTracker(trackerCode)
    const ctx = window.sourcetrack.getContext()
    assert.ok('anonymous_id'           in ctx)
    assert.ok('session_id'             in ctx)
    assert.ok('first_touch_source'     in ctx)
    assert.ok('first_touch_medium'     in ctx)
    assert.ok('first_touch_campaign'   in ctx)
    assert.ok('current_source'         in ctx)
    assert.ok('current_medium'         in ctx)
    assert.ok('current_campaign'       in ctx)
    assert.ok('click_ids'              in ctx)
    assert.ok('gclid' in ctx.click_ids)
  })
})

// ─── 2. getContext() extended fields — cookieless tracker ────────────────────
test('getContext() extended fields — cookieless tracker', async (t) => {
  await t.test('includes utm_source, utm_medium, utm_campaign, utm_term, utm_content', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.utm_source,   'google')
    assert.strictEqual(ctx.utm_medium,   'cpc')
    assert.strictEqual(ctx.utm_campaign, 'spring')
    assert.strictEqual(ctx.utm_term,     'shoes')
    assert.strictEqual(ctx.utm_content,  'banner')
  })

  await t.test('landing_page_path is pathname only', () => {
    const { window } = runHandoffTracker(cookielessCode, {
      href: 'https://example.com/demo?a=1#h', pathname: '/demo', search: '?a=1'
    })
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.landing_page_path, '/demo')
    assert.ok(!ctx.landing_page_path.includes('?'))
    assert.ok(!ctx.landing_page_path.includes('#'))
  })

  await t.test('includes last_touch aliases', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const ctx = window.sourcetrack.getContext()
    assert.ok('last_touch_source'   in ctx)
    assert.ok('last_touch_medium'   in ctx)
    assert.ok('last_touch_campaign' in ctx)
  })

  await t.test('anonymous_id is null before server ID resolves', () => {
    const { window } = runHandoffTracker(cookielessCode)
    // Immediately after init, AID is null (async server call not yet resolved)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.anonymous_id, null)
  })

  await t.test('includes raw referrer and referrer_host (hostname only)', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.referrer,      'https://referrer.example.com/blog?q=123')
    assert.strictEqual(ctx.referrer_host, 'referrer.example.com')
  })

  await t.test('referrer_host is null when no referrer', () => {
    const { window } = runHandoffTracker(cookielessCode, { referrer: '' })
    const ctx = window.sourcetrack.getContext()
    assert.strictEqual(ctx.referrer,      null)
    assert.strictEqual(ctx.referrer_host, null)
  })
})

// ─── 3. getHandoffParams() — standard tracker ────────────────────────────────
test('getHandoffParams() — standard tracker', async (t) => {
  await t.test('returns flat object with default st_ prefix', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(typeof params, 'object')
    assert.ok('st_utm_source'   in params)
    assert.ok('st_utm_medium'   in params)
    assert.ok('st_utm_campaign' in params)
    assert.strictEqual(params.st_utm_source,   'google')
    assert.strictEqual(params.st_utm_medium,   'cpc')
    assert.strictEqual(params.st_utm_campaign, 'spring')
    assert.strictEqual(params.st_utm_term,     'shoes')
    assert.strictEqual(params.st_utm_content,  'banner')
  })

  await t.test('supports custom prefix', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams({ prefix: 'sourcetrack_' })
    assert.ok('sourcetrack_utm_source' in params)
    assert.ok(!('st_utm_source' in params))
    assert.strictEqual(params.sourcetrack_utm_source, 'google')
  })

  await t.test('supports empty prefix', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams({ prefix: '' })
    assert.ok('utm_source' in params)
    assert.ok(!('st_utm_source' in params))
  })

  await t.test('omits null/undefined values', () => {
    const { window } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/page', pathname: '/page', search: ''
    })
    const params = window.sourcetrack.getHandoffParams()
    // utm_source is null when absent — should not appear in output
    assert.ok(!('st_utm_source' in params))
    assert.ok(!('st_utm_term'   in params))
    assert.ok(!('st_utm_content' in params))
  })

  await t.test('includes non-null click IDs', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(params.st_gclid, 'gclid-abc')
  })

  await t.test('includes landing_page_path', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(params.st_landing_page_path, '/pricing')
  })

  await t.test('landing_page_path has no query string; no href/search keys', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    const keys = Object.keys(params)
    for (const k of keys) {
      assert.ok(!k.includes('href'),   `Key ${k} contains "href"`)
      assert.ok(!k.includes('search'), `Key ${k} contains "search"`)
    }
    assert.ok(!params.st_landing_page_path.includes('?'),
      `landing_page_path "${params.st_landing_page_path}" must not contain query string`)
  })

  await t.test('includes referrer_host (hostname only) by default', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(params.st_referrer_host, 'referrer.example.com')
    assert.ok(!params.st_referrer_host.includes('?'))
    assert.ok(!params.st_referrer_host.includes('/'))
  })

  await t.test('does NOT include raw st_referrer by default', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.ok(!('st_referrer' in params), 'st_referrer must be absent by default')
  })

  await t.test('includes raw st_referrer when includeReferrer: true', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams({ includeReferrer: true })
    assert.ok('st_referrer' in params, 'st_referrer must be present with includeReferrer: true')
    assert.strictEqual(params.st_referrer, 'https://referrer.example.com/blog?q=123')
  })

  await t.test('referrer_host absent when no referrer', () => {
    const { window } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/page', pathname: '/page', search: '', referrer: ''
    })
    const params = window.sourcetrack.getHandoffParams()
    assert.ok(!('st_referrer_host' in params))
    assert.ok(!('st_referrer'      in params))
  })

  await t.test('includeReferrer: true absent too when no referrer', () => {
    const { window } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/page', pathname: '/page', search: '', referrer: ''
    })
    const params = window.sourcetrack.getHandoffParams({ includeReferrer: true })
    assert.ok(!('st_referrer' in params))
  })

  await t.test('includes first_touch and last_touch fields', () => {
    const { window } = runHandoffTracker(trackerCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.ok('st_first_touch_source'   in params)
    assert.ok('st_last_touch_source'    in params)
    assert.ok('st_last_touch_medium'    in params)
    assert.ok('st_last_touch_campaign'  in params)
  })
})

// ─── 4. getHandoffParams() — cookieless tracker ──────────────────────────────
test('getHandoffParams() — cookieless tracker parity', async (t) => {
  await t.test('same shape as standard tracker (minus anonymous_id which is null async)', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(typeof params, 'object')
    assert.strictEqual(params.st_utm_source,   'google')
    assert.strictEqual(params.st_landing_page_path, '/pricing')
    assert.ok(!('st_anonymous_id' in params))
  })

  await t.test('includes referrer_host, not raw st_referrer', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const params = window.sourcetrack.getHandoffParams()
    assert.strictEqual(params.st_referrer_host, 'referrer.example.com')
    assert.ok(!('st_referrer' in params))
  })

  await t.test('includeReferrer: true exposes raw referrer', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const params = window.sourcetrack.getHandoffParams({ includeReferrer: true })
    assert.ok('st_referrer' in params)
    assert.strictEqual(params.st_referrer, 'https://referrer.example.com/blog?q=123')
  })

  await t.test('supports custom prefix', () => {
    const { window } = runHandoffTracker(cookielessCode)
    const params = window.sourcetrack.getHandoffParams({ prefix: 'trk_' })
    assert.ok('trk_utm_source' in params)
    assert.ok(!('st_utm_source' in params))
  })
})

// ─── 5. fillHiddenFields() — standard tracker ────────────────────────────────
test('fillHiddenFields() — standard tracker', async (t) => {
  await t.test('fills existing hidden inputs with correct values', () => {
    const { window, capturedValues } = runHandoffTracker(trackerCode, {
      hiddenFields: ['st_utm_source', 'st_utm_medium', 'st_gclid', 'st_landing_page_path']
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: {
        st_utm_source:        'utm_source',
        st_utm_medium:        'utm_medium',
        st_gclid:             'gclid',
        st_landing_page_path: 'landing_page_path'
      }
    })

    assert.strictEqual(capturedValues.st_utm_source,        'google')
    assert.strictEqual(capturedValues.st_utm_medium,        'cpc')
    assert.strictEqual(capturedValues.st_gclid,             'gclid-abc')
    assert.strictEqual(capturedValues.st_landing_page_path, '/pricing')
  })

  await t.test('skips missing hidden inputs by default (createMissing: false)', () => {
    const { window, capturedValues, createdInputs } = runHandoffTracker(trackerCode, {
      hiddenFields: [] // no pre-existing hidden inputs
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: { st_utm_source: 'utm_source' }
    })

    assert.strictEqual(Object.keys(capturedValues).length, 0)
    assert.strictEqual(createdInputs.length, 0)
  })

  await t.test('creates missing inputs when createMissing: true', () => {
    const { window, capturedValues, createdInputs } = runHandoffTracker(trackerCode, {
      hiddenFields: []
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      createMissing: true,
      fields: { st_utm_source: 'utm_source' }
    })

    assert.strictEqual(createdInputs.length, 1)
    assert.strictEqual(createdInputs[0].type, 'hidden')
    assert.strictEqual(createdInputs[0].name, 'st_utm_source')
    assert.strictEqual(capturedValues.st_utm_source, 'google')
  })

  await t.test('silently skips fields where context value is null', () => {
    const { window, capturedValues } = runHandoffTracker(trackerCode, {
      href: 'https://example.com/page', pathname: '/page', search: '',
      hiddenFields: ['st_utm_source']
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: { st_utm_source: 'utm_source' } // utm_source is null here
    })

    // Field exists in DOM but value should NOT be written (null skip)
    assert.ok(!('st_utm_source' in capturedValues))
  })

  await t.test('is a no-op when querySelectorAll returns empty', () => {
    const { window, capturedValues } = runHandoffTracker(trackerCode, {
      hiddenFields: ['st_utm_source']
    })

    // Use a selector that matches nothing
    window.sourcetrack.fillHiddenFields({
      selector: '#nonexistent-form',
      fields: { st_utm_source: 'utm_source' }
    })

    assert.strictEqual(Object.keys(capturedValues).length, 0)
  })

  await t.test('resolves click_id fields via click_ids object', () => {
    const { window, capturedValues } = runHandoffTracker(trackerCode, {
      hiddenFields: ['st_gclid', 'st_fbclid']
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: { st_gclid: 'gclid', st_fbclid: 'fbclid' }
    })

    assert.strictEqual(capturedValues.st_gclid, 'gclid-abc')
    // fbclid is absent from URL — should not be written
    assert.ok(!('st_fbclid' in capturedValues))
  })
})

// ─── 6. fillHiddenFields() — cookieless tracker ──────────────────────────────
test('fillHiddenFields() — cookieless tracker parity', async (t) => {
  await t.test('fills existing hidden inputs (UTM fields available synchronously)', () => {
    const { window, capturedValues } = runHandoffTracker(cookielessCode, {
      hiddenFields: ['st_utm_source', 'st_landing_page_path']
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: {
        st_utm_source:        'utm_source',
        st_landing_page_path: 'landing_page_path'
      }
    })

    assert.strictEqual(capturedValues.st_utm_source,        'google')
    assert.strictEqual(capturedValues.st_landing_page_path, '/pricing')
  })

  await t.test('anonymous_id field is skipped when null (async not resolved)', () => {
    const { window, capturedValues } = runHandoffTracker(cookielessCode, {
      hiddenFields: ['st_anonymous_id']
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: { st_anonymous_id: 'anonymous_id' }
    })

    // anonymous_id is null before server responds — should not be written
    assert.ok(!('st_anonymous_id' in capturedValues))
  })

  await t.test('skips missing inputs by default', () => {
    const { window, capturedValues, createdInputs } = runHandoffTracker(cookielessCode, {
      hiddenFields: []
    })

    window.sourcetrack.fillHiddenFields({
      selector: 'form',
      fields: { st_utm_source: 'utm_source' }
    })

    assert.strictEqual(Object.keys(capturedValues).length, 0)
    assert.strictEqual(createdInputs.length, 0)
  })
})

// ─── 7. API surface parity ───────────────────────────────────────────────────
test('API surface parity — both trackers expose same handoff methods', (t) => {
  const { window: stdWindow }  = runHandoffTracker(trackerCode)
  const { window: clWindow }   = runHandoffTracker(cookielessCode)

  assert.strictEqual(typeof stdWindow.sourcetrack.getHandoffParams, 'function',
    'standard tracker must expose getHandoffParams')
  assert.strictEqual(typeof clWindow.sourcetrack.getHandoffParams, 'function',
    'cookieless tracker must expose getHandoffParams')

  assert.strictEqual(typeof stdWindow.sourcetrack.fillHiddenFields, 'function',
    'standard tracker must expose fillHiddenFields')
  assert.strictEqual(typeof clWindow.sourcetrack.fillHiddenFields, 'function',
    'cookieless tracker must expose fillHiddenFields')
})
