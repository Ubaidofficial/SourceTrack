import test from 'node:test'
import assert from 'node:assert'
import { requestIdMiddleware } from '../middleware/request-id.js'
import { logInfo, logWarn, logError, sanitizeLogFields, sanitizeLogPath } from '../lib/safe-logger.js'

test('Request ID Middleware Tests', async (t) => {
  await t.test('generates request ID when missing', () => {
    const req = { headers: {} }
    const res = {
      setHeader(name, val) {
        this.headers = this.headers || {}
        this.headers[name] = val
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    requestIdMiddleware(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.ok(req.requestId)
    assert.strictEqual(typeof req.requestId, 'string')
    assert.strictEqual(res.headers['X-Request-Id'], req.requestId)
  })

  await t.test('uses safe incoming request ID', () => {
    const req = { headers: { 'x-request-id': 'my-custom-request-id-123' } }
    const res = {
      setHeader(name, val) {
        this.headers = this.headers || {}
        this.headers[name] = val
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    requestIdMiddleware(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.strictEqual(req.requestId, 'my-custom-request-id-123')
    assert.strictEqual(res.headers['X-Request-Id'], 'my-custom-request-id-123')
  })

  await t.test('rejects unsafe incoming request ID with special characters', () => {
    const req = { headers: { 'x-request-id': 'unsafe-id-<>!-$$$' } }
    const res = {
      setHeader(name, val) {
        this.headers = this.headers || {}
        this.headers[name] = val
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    requestIdMiddleware(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.ok(req.requestId)
    assert.notStrictEqual(req.requestId, 'unsafe-id-<>!-$$$')
  })

  await t.test('rejects request ID that is too long', () => {
    const longId = 'a'.repeat(81)
    const req = { headers: { 'x-request-id': longId } }
    const res = {
      setHeader(name, val) {
        this.headers = this.headers || {}
        this.headers[name] = val
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    requestIdMiddleware(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.ok(req.requestId)
    assert.notStrictEqual(req.requestId, longId)
  })
})

test('Safe Logger Tests', async (t) => {
  let logOutput = []
  let warnOutput = []
  let errorOutput = []

  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  t.beforeEach(() => {
    logOutput = []
    warnOutput = []
    errorOutput = []
    console.log = (msg) => logOutput.push(msg)
    console.warn = (msg) => warnOutput.push(msg)
    console.error = (msg) => errorOutput.push(msg)
  })

  t.afterEach(() => {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
  })

  await t.test('redacts sensitive keys case-insensitively', () => {
    logInfo('test_event', {
      cookie: 'secret_cookie',
      COOKIE: 'another_cookie',
      authorization: 'Bearer token',
      password: 'mypassword',
      stripe_session_id: 'sess_123',
      site_key: 'sk_test_123',
      safe_key: 'safe_value'
    })

    assert.strictEqual(logOutput.length, 1)
    const parsed = JSON.parse(logOutput[0])
    assert.strictEqual(parsed.event, 'test_event')
    assert.strictEqual(parsed.level, 'info')
    assert.ok(parsed.timestamp)

    assert.strictEqual(parsed.cookie, '[REDACTED]')
    assert.strictEqual(parsed.COOKIE, '[REDACTED]')
    assert.strictEqual(parsed.authorization, '[REDACTED]')
    assert.strictEqual(parsed.password, '[REDACTED]')
    assert.strictEqual(parsed.stripe_session_id, '[REDACTED]')
    assert.strictEqual(parsed.site_key, '[REDACTED]')
    assert.strictEqual(parsed.safe_key, 'safe_value')
  })

  await t.test('redacts sensitive nested keys and arrays', () => {
    logWarn('test_nested', {
      nested: {
        password: 'nestedpassword',
        user_id: 'uid123',
        safe_field: 123
      },
      array: [
        { email: 'test@example.com' },
        'string_val?query=1'
      ]
    })

    assert.strictEqual(warnOutput.length, 1)
    const parsed = JSON.parse(warnOutput[0])

    assert.strictEqual(parsed.nested.password, '[REDACTED]')
    assert.strictEqual(parsed.nested.user_id, '[REDACTED]')
    assert.strictEqual(parsed.nested.safe_field, 123)
    assert.strictEqual(parsed.array[0].email, '[REDACTED]')
    assert.strictEqual(parsed.array[1], 'string_val')
  })

  await t.test('strips query strings from string values', () => {
    logInfo('test_query_strip', {
      url: 'https://sourcetrack.ai/dashboard?tab=analytics&user=123',
      path: '/api/conversion?foo=bar',
      normal_string: 'no_query_here'
    })

    const parsed = JSON.parse(logOutput[0])
    assert.strictEqual(parsed.url, 'https://sourcetrack.ai/dashboard')
    assert.strictEqual(parsed.path, '/api/conversion')
    assert.strictEqual(parsed.normal_string, 'no_query_here')
  })

  await t.test('does not log request bodies or raw query objects', () => {
    logError('test_body_drop', {
      body: { some_data: 123 },
      reqBody: { secret: 'secret' },
      query: { search: 'term' }
    })

    const parsed = JSON.parse(errorOutput[0])
    assert.strictEqual(parsed.body, '[REDACTED]')
    assert.strictEqual(parsed.reqBody, '[REDACTED]')
    assert.strictEqual(parsed.query, '[REDACTED]')
  })

  await t.test('logs error objects without stack traces', () => {
    const testErr = new Error('Test crash message')
    testErr.code = 'ERR_TEST_CODE'

    logError('test_error_obj', {
      error: testErr
    })

    const parsed = JSON.parse(errorOutput[0])
    assert.ok(parsed.error)
    assert.strictEqual(parsed.error.name, 'Error')
    assert.strictEqual(parsed.error.message, 'Test crash message')
    assert.strictEqual(parsed.error.code, 'ERR_TEST_CODE')
    assert.strictEqual(parsed.error.stack, undefined)
  })

  await t.test('safe logger strips query strings from Error.message and redacts secrets', () => {
    const testErr = new Error('Database connection failed on URL https://db.sourcetrack.ai/connect?api_key=sk_test_secret123&user=john@doe.com')
    logError('test_error_pii', { error: testErr })

    const parsed = JSON.parse(errorOutput[0])
    assert.strictEqual(parsed.error.message, 'Database connection failed on URL https://db.sourcetrack.ai/connect')
  })
})

test('Safe Log Path Normalization Tests', async (t) => {
  await t.test('normalizes public dashboard token path segments', () => {
    const path = '/api/public/st_test_observability_123'
    const normalized = sanitizeLogPath(path)
    assert.strictEqual(normalized, '/api/public/:token')
  })

  await t.test('normalizes Shopify site key path segments', () => {
    const path = '/api/webhooks/shopify/sk_test_abcdef123456789'
    const normalized = sanitizeLogPath(path)
    assert.strictEqual(normalized, '/api/webhooks/shopify/:site_key')
  })

  await t.test('normalizes generic long IDs and hex strings to :id', () => {
    const path1 = '/api/journey/507f1f77bcf86cd799439011' // mongo id (24 hex)
    const normalized1 = sanitizeLogPath(path1)
    assert.strictEqual(normalized1, '/api/journey/:id')

    const path2 = '/api/users/reallylonguuidlookingidentifierstringhere'
    const normalized2 = sanitizeLogPath(path2)
    assert.strictEqual(normalized2, '/api/users/:id')
  })

  await t.test('preserves safe static and base API segments', () => {
    const path = '/api/health'
    const normalized = sanitizeLogPath(path)
    assert.strictEqual(normalized, '/api/health')
  })
})

test('Health and Error Handler Simulated Route Tests', async (t) => {
  let errorOutput = []
  const originalError = console.error

  t.beforeEach(() => {
    errorOutput = []
    console.error = (msg) => errorOutput.push(msg)
  })

  t.afterEach(() => {
    console.error = originalError
  })

  await t.test('health endpoint returns expected shape', () => {
    // Simulate GET /api/health handler
    const req = { requestId: 'req-health-123' }
    let statusSet = null
    let responseJson = null
    const res = {
      status(code) {
        statusSet = code
        return {
          json(data) {
            responseJson = data
          }
        }
      }
    }

    const healthHandler = (req, res) => {
      res.status(200).json({
        success: true,
        data: {
          status: 'ok',
          service: 'api',
          timestamp: new Date().toISOString(),
          request_id: req.requestId
        },
        error: null
      })
    }

    healthHandler(req, res)

    assert.strictEqual(statusSet, 200)
    assert.strictEqual(responseJson.success, true)
    assert.strictEqual(responseJson.data.status, 'ok')
    assert.strictEqual(responseJson.data.service, 'api')
    assert.strictEqual(responseJson.data.request_id, 'req-health-123')
    assert.ok(responseJson.data.timestamp)
    assert.strictEqual(responseJson.error, null)
  })

  await t.test('global error handler logs sanitized details and returns generic 500', () => {
    const req = {
      requestId: 'req-err-123',
      method: 'POST',
      path: '/api/something/sk_test_secretkey?user=john@doe.com'
    }
    let statusSet = null
    let responseJson = null
    const res = {
      status(code) {
        statusSet = code
        return {
          json(data) {
            responseJson = data
          }
        }
      }
    }
    const next = () => {}

    const err = new Error('Database connection failed on URL https://db.sourcetrack.ai/connect?secret=123')
    err.status = 500

    const errorHandler = (err, req, res, next) => {
      const status = err.status || err.statusCode || 500

      logError('request_failed', {
        request_id: req.requestId,
        method: req.method,
        path: sanitizeLogPath(req.path),
        status,
        error: err
      })

      return res.status(status).json({
        success: false,
        data: null,
        error: err.publicMessage || (status >= 500 ? 'Internal server error' : 'Request failed'),
        request_id: req.requestId
      })
    }

    errorHandler(err, req, res, next)

    assert.strictEqual(statusSet, 500)
    assert.strictEqual(responseJson.success, false)
    assert.strictEqual(responseJson.data, null)
    assert.strictEqual(responseJson.error, 'Internal server error')
    assert.strictEqual(responseJson.request_id, 'req-err-123')

    assert.strictEqual(errorOutput.length, 1)
    const logParsed = JSON.parse(errorOutput[0])
    assert.strictEqual(logParsed.event, 'request_failed')
    assert.strictEqual(logParsed.level, 'error')
    assert.strictEqual(logParsed.request_id, 'req-err-123')
    assert.strictEqual(logParsed.path, '/api/something/:token')
    assert.strictEqual(logParsed.status, 500)
    assert.strictEqual(logParsed.error.name, 'Error')
    assert.strictEqual(logParsed.error.message, 'Database connection failed on URL https://db.sourcetrack.ai/connect')
    assert.strictEqual(logParsed.error.stack, undefined)
  })

  await t.test('global error handler does not leak err.message to the client, unless err.publicMessage is explicitly set', () => {
    const req = {
      requestId: 'req-custom-402',
      method: 'POST',
      path: '/api/track'
    }
    let statusSet = null
    let responseJson = null
    const res = {
      status(code) {
        statusSet = code
        return {
          json(data) {
            responseJson = data
          }
        }
      }
    }
    const next = () => {}

    const err = new Error('Internal details about billing customer cus_123 not found')
    err.status = 402

    const errorHandler = (err, req, res, next) => {
      const status = err.status || err.statusCode || 500

      logError('request_failed', {
        request_id: req.requestId,
        method: req.method,
        path: sanitizeLogPath(req.path),
        status,
        error: err
      })

      return res.status(status).json({
        success: false,
        data: null,
        error: err.publicMessage || (status >= 500 ? 'Internal server error' : 'Request failed'),
        request_id: req.requestId
      })
    }

    // Default error: should be replaced with generic 'Request failed'
    errorHandler(err, req, res, next)
    assert.strictEqual(statusSet, 402)
    assert.strictEqual(responseJson.success, false)
    assert.strictEqual(responseJson.error, 'Request failed')

    // Error with publicMessage: should be allowed through
    const publicErr = new Error('Internal billing customer not found')
    publicErr.status = 402
    publicErr.publicMessage = 'Usage limit exceeded'

    errorHandler(publicErr, req, res, next)
    assert.strictEqual(statusSet, 402)
    assert.strictEqual(responseJson.success, false)
    assert.strictEqual(responseJson.error, 'Usage limit exceeded')
  })
})
