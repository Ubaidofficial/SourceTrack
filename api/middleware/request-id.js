import crypto from 'crypto'

/**
 * Middleware to assign or pass through a sanitized Request ID.
 */
export function requestIdMiddleware(req, res, next) {
  let incomingId = req.headers['x-request-id']
  let finalId = null

  if (typeof incomingId === 'string' && incomingId.length <= 80) {
    // Sanitize: allow only a-z, A-Z, 0-9, _, -, .
    const sanitized = incomingId.replace(/[^a-zA-Z0-9_.-]/g, '')
    if (sanitized === incomingId && incomingId.length > 0) {
      finalId = incomingId
    }
  }

  if (!finalId) {
    finalId = crypto.randomUUID()
  }

  req.requestId = finalId
  res.setHeader('X-Request-Id', finalId)
  next()
}
