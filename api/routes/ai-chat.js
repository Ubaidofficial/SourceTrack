import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { aiLimit } from '../middleware/rate-limit.js'
import { callAI } from '../lib/ai-client.js'
import { queryHogQL } from '../lib/posthog.js'

const DESTRUCTIVE_RE = /\b(drop|delete|insert|update|truncate|alter|create|grant|revoke)\b/i

const router = Router()

function buildSystemPrompt(siteId) {
  return `You are a marketing analytics assistant for TrackIQ.
Write one valid PostHog HogQL query that answers the user's question.
Then provide one short plain-English explanation.

Rules:
- Use table: events only
- Always include: WHERE properties.site_id = '${siteId}'
- Only use these properties:
  properties.utm_source
  properties.utm_medium
  properties.utm_campaign
  properties.ai_source
  properties.is_conversion
  properties.conversion_value
  properties.first_touch_source
  properties.device_type
  properties.country
  properties.page_url
- Default date filter: timestamp >= now() - INTERVAL 30 DAY
- Revenue expression: toFloat64OrZero(toString(properties.conversion_value))
- AI source null check: properties.ai_source IS NOT NULL AND properties.ai_source != ''
- Allowed SQL operations: SELECT, WHERE, GROUP BY, ORDER BY, LIMIT, count(), countIf(), sum(), uniq()
- Do not use any table other than events
- Do not use any property not listed above
- Return JSON only, no markdown, no backticks, no prose outside JSON

Return exactly this shape:
{"hogql":"<sql>","explanation":"<plain English answer>"}`
}

function parseAIResponse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

function validateHogQL(sql) {
  if (!sql.includes('FROM events')) return false
  if (!sql.includes('properties.site_id')) return false
  return true
}

router.post('/', validateSiteKey, aiLimit, async (req, res) => {
  try {
    const { question } = req.body

    if (typeof question !== 'string') {
      return res.status(400).json({ success: false, data: null, error: 'question is required' })
    }

    const trimmed = question.trim()
    if (!trimmed) {
      return res.status(400).json({ success: false, data: null, error: 'question is required' })
    }

    if (DESTRUCTIVE_RE.test(trimmed)) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid query content' })
    }

    const safeQuestion = trimmed.slice(0, 500)
    const systemPrompt = buildSystemPrompt(req.site.id)

    let aiText
    try {
      aiText = await callAI(systemPrompt, safeQuestion)
    } catch (_err) {
      console.error(_err)
      return res.status(500).json({ success: false, data: null, error: 'AI request failed' })
    }

    const parsed = parseAIResponse(aiText)
    if (!parsed) {
      return res.status(500).json({ success: false, data: null, error: 'Failed to parse AI response' })
    }

    if (typeof parsed.hogql !== 'string' || !parsed.hogql) {
      return res.status(500).json({ success: false, data: null, error: 'AI returned no query' })
    }

    if (!validateHogQL(parsed.hogql)) {
      return res.status(500).json({ success: false, data: null, error: 'AI returned invalid query' })
    }

    let results
    try {
      results = await queryHogQL(parsed.hogql, 'ai_chat')
    } catch (_err) {
      console.error(_err)
      return res.status(500).json({ success: false, data: null, error: 'Query failed' })
    }

    return res.status(200).json({
      success: true,
      data: { answer: parsed.explanation, results },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Query failed' })
  }
})

export { router as aiChatRouter }
