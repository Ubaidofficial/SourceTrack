const REDACT_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'stripe',
  'supabase',
  'posthog',
  'email',
  'phone',
  'name',
  'checkout_session_id',
  'stripe_session_id',
  'session_id',
  'site_key',
  'site_id',
  'key',
  'uid',
  'user_id',
  'anonymous_id',
  'visitor_id',
  'ip',
  'x-forwarded-for',
  'referer',
  'referrer',
  'origin'
])

function cleanStringValue(str) {
  if (str.includes('?')) {
    return str.split('?')[0]
  }
  return str
}

export function scrubSensitiveString(str) {
  let temp = cleanStringValue(str)
  // Redact email patterns
  temp = temp.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
  // Redact key/token patterns starting with typical secret prefixes followed by underscore
  temp = temp.replace(/(sk|pk|st|whsec|sess|cs)_[a-zA-Z0-9_-]+/g, '[REDACTED_KEY]')
  return temp
}

export function sanitizeLogPath(path = '') {
  const cleanPath = String(path).split('?')[0]

  if (cleanPath.startsWith('/api/public/')) return '/api/public/:token'
  if (cleanPath.startsWith('/api/webhooks/shopify/')) return '/api/webhooks/shopify/:site_key'

  return cleanPath
    .split('/')
    .map((segment) => {
      if (!segment) return segment
      if (segment.length > 24) return ':id'
      if (/^(sk|pk|st|whsec|sess|cs)_[a-zA-Z0-9_-]+/.test(segment)) return ':token'
      if (/^[0-9a-f]{24,}$/i.test(segment)) return ':id'
      return segment
    })
    .join('/')
}

/**
 * Recursively sanitizes fields to redact sensitive keys, strip query strings, and drop stack traces.
 */
export function sanitizeLogFields(fields, depth = 0) {
  if (!fields || typeof fields !== 'object') {
    return {}
  }
  if (depth > 2) {
    return '[NESTED_OBJECT]'
  }

  const sanitized = {}
  for (const [key, value] of Object.entries(fields)) {
    const lowerKey = key.toLowerCase()

    // Drop keys that could leak bodies or query strings
    if (lowerKey.includes('body') || lowerKey.includes('query')) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    if (REDACT_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    if (value === null) {
      sanitized[key] = null
    } else if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: scrubSensitiveString(String(value.message || '')).slice(0, 300),
        code: value.code
      }
    } else if (typeof value === 'object') {
      if (Array.isArray(value)) {
        sanitized[key] = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            return sanitizeLogFields(item, depth + 1)
          }
          if (typeof item === 'string') {
            return scrubSensitiveString(item)
          }
          return item
        })
      } else {
        sanitized[key] = sanitizeLogFields(value, depth + 1)
      }
    } else if (typeof value === 'string') {
      sanitized[key] = scrubSensitiveString(value)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value
    } else {
      sanitized[key] = String(value)
    }
  }
  return sanitized
}

export function logInfo(event, fields = {}) {
  const logLine = {
    timestamp: new Date().toISOString(),
    level: 'info',
    event,
    ...sanitizeLogFields(fields)
  }
  console.log(JSON.stringify(logLine))
}

export function logWarn(event, fields = {}) {
  const logLine = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    event,
    ...sanitizeLogFields(fields)
  }
  console.warn(JSON.stringify(logLine))
}

export function logError(event, fields = {}) {
  const logLine = {
    timestamp: new Date().toISOString(),
    level: 'error',
    event,
    ...sanitizeLogFields(fields)
  }
  console.error(JSON.stringify(logLine))
}
