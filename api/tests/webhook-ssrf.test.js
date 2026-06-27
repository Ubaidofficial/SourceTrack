import test from 'node:test'
import assert from 'node:assert'

import {
  validateWebhookUrl,
  isBlockedIp,
  isRedirectResponse,
  assertWebhookDestinationSafe
} from '../lib/ssrf-guard.js'

// Run fn with WEBHOOK_ALLOW_PRIVATE set to `value` (undefined deletes it), then
// restore. Synchronous so env is set for the duration of the inline asserts —
// these tests must not depend on NODE_ENV (the guard runs unconditionally).
function withPrivateAllowed(value, fn) {
  const prev = process.env.WEBHOOK_ALLOW_PRIVATE
  if (value === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE
  else process.env.WEBHOOK_ALLOW_PRIVATE = value
  try {
    return fn()
  } finally {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE
    else process.env.WEBHOOK_ALLOW_PRIVATE = prev
  }
}

const ok = (u) => assert.strictEqual(validateWebhookUrl(u).valid, true, `expected ALLOW: ${u}`)
const blocked = (u) => assert.strictEqual(validateWebhookUrl(u).valid, false, `expected BLOCK: ${u}`)

test('public https URL is allowed', () => {
  withPrivateAllowed(undefined, () => ok('https://hooks.example.com/path'))
})

test('plain http is rejected (https required, no opt-in)', () => {
  withPrivateAllowed(undefined, () => blocked('http://hooks.example.com/path'))
})

test('non-http(s) protocol is rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('ftp://example.com/x')
    blocked('file:///etc/passwd')
  })
})

test('malformed URL is rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('not a url')
    blocked('')
  })
})

test('localhost / .local / .internal hostnames are rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('https://localhost/x')
    blocked('https://foo.local/x')
    blocked('https://svc.internal/x')
  })
})

test('loopback 127.0.0.0/8 (not just 127.0.0.1) is rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('https://127.0.0.1/x')
    blocked('https://127.0.0.2/x')
    blocked('https://127.255.255.254/x')
  })
})

test('0.0.0.0 is rejected', () => {
  withPrivateAllowed(undefined, () => blocked('https://0.0.0.0/x'))
})

test('RFC1918 private ranges are rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('https://10.0.0.5/x')
    blocked('https://172.16.0.1/x')
    blocked('https://172.31.255.255/x')
    blocked('https://192.168.1.1/x')
  })
})

test('public range adjacent to 172.16/12 is allowed (172.15, 172.32)', () => {
  withPrivateAllowed(undefined, () => {
    ok('https://172.15.0.1/x')
    ok('https://172.32.0.1/x')
  })
})

test('link-local incl. cloud metadata 169.254.169.254 is rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('https://169.254.169.254/latest/meta-data')
    blocked('https://169.254.0.1/x')
  })
})

test('non-standard IPv4 encodings (decimal/hex/octal/127.1) are rejected', () => {
  // WHATWG URL normalizes all of these to 127.0.0.1 for http/https.
  withPrivateAllowed(undefined, () => {
    blocked('https://2130706433/x') // decimal
    blocked('https://0x7f000001/x') // hex
    blocked('https://0177.0.0.1/x') // octal
    blocked('https://127.1/x')      // short form
  })
})

test('IPv6 loopback/unspecified/ULA/link-local/mapped are rejected', () => {
  withPrivateAllowed(undefined, () => {
    blocked('https://[::1]/x')                 // loopback
    blocked('https://[::]/x')                  // unspecified
    blocked('https://[fc00::1]/x')             // unique-local
    blocked('https://[fd12:3456::1]/x')        // unique-local
    blocked('https://[fe80::1]/x')             // link-local
    blocked('https://[::ffff:127.0.0.1]/x')    // mapped loopback
    blocked('https://[::ffff:169.254.169.254]/x') // mapped metadata
  })
})

test('public IPv6 is allowed', () => {
  withPrivateAllowed(undefined, () => ok('https://[2606:4700:4700::1111]/x'))
})

test('WEBHOOK_ALLOW_PRIVATE=true allows localhost + http (local dev opt-in)', () => {
  withPrivateAllowed('true', () => {
    ok('http://localhost:3333/webhook')
    ok('http://127.0.0.1:9000/x')
  })
})

test('only the exact string "true" enables the opt-in', () => {
  withPrivateAllowed('1', () => blocked('http://localhost/x'))
})

test('isBlockedIp — literal IP classification', () => {
  assert.strictEqual(isBlockedIp('8.8.8.8'), false)
  assert.strictEqual(isBlockedIp('1.1.1.1'), false)
  assert.strictEqual(isBlockedIp('127.0.0.1'), true)
  assert.strictEqual(isBlockedIp('10.1.2.3'), true)
  assert.strictEqual(isBlockedIp('192.168.0.1'), true)
  assert.strictEqual(isBlockedIp('169.254.169.254'), true)
  assert.strictEqual(isBlockedIp('0.0.0.0'), true)
  assert.strictEqual(isBlockedIp('::1'), true)
  assert.strictEqual(isBlockedIp('fe80::1'), true)
  assert.strictEqual(isBlockedIp('2606:4700:4700::1111'), false)
  assert.strictEqual(isBlockedIp('not-an-ip'), true) // fail closed
})

test('isRedirectResponse — rejects redirects (manual mode + raw 3xx)', () => {
  assert.strictEqual(isRedirectResponse({ type: 'opaqueredirect', status: 0 }), true)
  assert.strictEqual(isRedirectResponse({ type: 'basic', status: 302 }), true)
  assert.strictEqual(isRedirectResponse({ type: 'basic', status: 301 }), true)
  assert.strictEqual(isRedirectResponse({ type: 'basic', status: 200 }), false)
  assert.strictEqual(isRedirectResponse({ type: 'basic', status: 404 }), false)
})

// The async guard tests manage env inline (a sync try/finally wrapper would
// restore the var before the awaited body resolves). Default state is opt-in OFF.
async function withPrivateOffAsync(fn) {
  const prev = process.env.WEBHOOK_ALLOW_PRIVATE
  delete process.env.WEBHOOK_ALLOW_PRIVATE
  try {
    await fn()
  } finally {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE
    else process.env.WEBHOOK_ALLOW_PRIVATE = prev
  }
}

test('assertWebhookDestinationSafe — literal blocked IP throws before DNS/fetch', async () => {
  await withPrivateOffAsync(() =>
    assert.rejects(
      () => assertWebhookDestinationSafe('https://169.254.169.254/x'),
      /private or local|not allowed/i
    )
  )
})

test('assertWebhookDestinationSafe — literal public IP passes without DNS lookup', async () => {
  await withPrivateOffAsync(async () => {
    const res = await assertWebhookDestinationSafe('https://8.8.8.8/x')
    assert.strictEqual(res.valid, true)
  })
})

test('assertWebhookDestinationSafe — invalid URL throws', async () => {
  await withPrivateOffAsync(() =>
    assert.rejects(() => assertWebhookDestinationSafe('http://localhost/x'))
  )
})
