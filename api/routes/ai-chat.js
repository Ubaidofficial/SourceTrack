import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { aiLimit } from '../middleware/rate-limit.js'
import { requireFeature } from '../lib/plan-features.js'
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
- Revenue expression: toFloatOrZero(toString(properties.conversion_value))
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

export function validateHogQL(sql, siteId) {
  if (typeof sql !== 'string') return false

  // 1. Must reject comments
  if (sql.includes('--') || sql.includes('/*') || sql.includes('*/')) return false

  // 2. Must reject multiple statements / semicolons (except trailing semicolon)
  const trimmed = sql.trim()
  const withoutTrailingSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed
  if (withoutTrailingSemicolon.includes(';')) return false

  const upperSql = withoutTrailingSemicolon.toUpperCase()

  // 3. Must start with SELECT (read-only query)
  if (!upperSql.trim().startsWith('SELECT')) return false

  // 4. Must query only FROM events
  // Check that "FROM events" exists (case-insensitive and word-boundary safe)
  if (!/\bFROM\s+events\b/i.test(withoutTrailingSemicolon)) return false

  // Ensure there is only one "FROM" keyword in the query to avoid subqueries or additional table references
  const fromMatches = upperSql.match(/\bFROM\b/g)
  if (!fromMatches || fromMatches.length !== 1) return false

  // 5. Must reject dangerous keywords
  const dangerousKeywords = [
    'UNION', 'JOIN', 'WITH', 'INSERT', 'UPDATE', 'DELETE',
    'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'COPY', 'CALL', 'EXEC'
  ]
  for (const kw of dangerousKeywords) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(withoutTrailingSemicolon)) return false
  }

  // 6. Must reject OR
  if (/\bOR\b/i.test(withoutTrailingSemicolon)) return false

  // 7. Must require a strict equality filter for the active site inside the WHERE clause.
  const escapedSiteId = siteId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const whereMatch = withoutTrailingSemicolon.match(/\bWHERE\b([\s\S]*)/i)
  if (!whereMatch) return false

  const whereClause = whereMatch[1].split(/\bGROUP\s+BY\b|\bORDER\s+BY\b|\bLIMIT\b|\bHAVING\b/i)[0]
  const siteIdOccurrencesInQuery = withoutTrailingSemicolon.match(/properties\.site_id/gi)
  const siteIdOccurrencesInWhere = whereClause.match(/properties\.site_id/gi)
  if (!siteIdOccurrencesInQuery || !siteIdOccurrencesInWhere) return false
  if (siteIdOccurrencesInQuery.length !== siteIdOccurrencesInWhere.length) return false

  const strictMatches = whereClause.match(new RegExp(`properties\\.site_id\\s*=\\s*(['"])${escapedSiteId}\\1`, 'gi'))
  if (!strictMatches || strictMatches.length !== siteIdOccurrencesInWhere.length) return false

  return true
}

router.post('/', validateSiteKey, aiLimit, async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'ai_chat', 'AI Chat')
    if (block) return res.status(402).json(block)

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

    if (!validateHogQL(parsed.hogql, req.site.id)) {
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
