import rateLimit from 'express-rate-limit'

export const trackLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})

export const defaultLimit = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})

export const aiLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})
