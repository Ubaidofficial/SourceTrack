import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    global: { fetch }, realtime: { transport: WebSocket }
  })
}

const deepseek = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY })
const SLACK = process.env.SLACK_WEBHOOK_URL
const API_URL = process.env.API_URL || 'http://localhost:3000'

// Checks that failing immediately classify the whole system as critical.
// Everything else is warning-level.
const CRITICAL_CHECKS = new Set(['supabase', 'posthog'])

// check() wraps an async fn.
// Return { _status: 'warning', ...rest } from fn to report a warning without throwing.
// Throw to report an error.
async function check(name, fn) {
  const t = Date.now()
  try {
    const result = await fn()
    const { _status, ...rest } = result || {}
    const status = _status || 'ok'
    return { name, status, ms: Date.now() - t, ...rest }
  } catch (e) {
    return { name, status: 'error', ms: Date.now() - t, error: e.message }
  }
}

async function collectSnapshot() {
  const results = await Promise.allSettled([

    // 1. Supabase connectivity — CRITICAL
    check('supabase', async () => {
      const { data, error } = await getSupabase().from('sites').select('id').limit(1)
      if (error) throw new Error(error.message)
      return { rows: data?.length ?? 0 }
    }),

    // 2. PostHog connectivity — CRITICAL
    check('posthog', async () => {
      const host = (process.env.POSTHOG_HOST || '').replace(/\/$/, '')
      if (!host) throw new Error('POSTHOG_HOST not set')
      const url = `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: 'SELECT 1' } }),
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return {}
    }),

    // 3. API health endpoint — warning only (may not be accessible from job runner)
    check('api_health', async () => {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { status_reported: data.status }
    }),

    // 4. Nightly attribution job — warning if stale, error if failed
    check('nightly_job', async () => {
      const { data: run } = await getSupabase()
        .from('job_runs')
        .select('ran_at, status, conversions_processed, error_message')
        .eq('job_name', 'nightly-attribution')
        .order('ran_at', { ascending: false })
        .limit(1).single()
      if (!run) throw new Error('No job runs found in job_runs table')
      const hoursAgo = (Date.now() - new Date(run.ran_at).getTime()) / 3_600_000
      if (run.status === 'failed') throw new Error(`Job failed: ${run.error_message}`)
      // 28h gives 4h buffer over the 24h schedule
      if (hoursAgo > 28) return { _status: 'warning', last_run: run.ran_at, hours_ago: Math.round(hoursAgo), warning: `Last run was ${Math.round(hoursAgo)}h ago — may be stale` }
      return { last_run: run.ran_at, hours_ago: Math.round(hoursAgo), conversions: run.conversions_processed, job_status: run.status }
    }),

    // 5. Active sites count
    check('sites_count', async () => {
      const { count } = await getSupabase().from('sites').select('*', { count: 'exact', head: true })
      return { total_sites: count ?? 0 }
    }),

    // 6. Recent pageviews — queries PostHog directly (events never go to Supabase)
    check('data_flow', async () => {
      const host = (process.env.POSTHOG_HOST || '').replace(/\/$/, '')
      if (!host) throw new Error('POSTHOG_HOST not set')
      const url = `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: "SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 24 HOUR" } }),
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) throw new Error(`PostHog HTTP ${res.status}`)
      const data = await res.json()
      const count = Number(data.results?.[0]?.[0]) || 0
      // warn but don't error — could be a legitimate quiet period
      if (count === 0) return { _status: 'warning', pageviews_24h: 0, warning: 'Zero pageviews in last 24h — verify tracker is installed' }
      return { pageviews_24h: count }
    }),

    // 7. Recent conversions in attributed_conversions (post-nightly-job)
    check('conversions', async () => {
      const since = new Date(Date.now() - 48 * 3_600_000).toISOString().split('T')[0]
      const { count } = await getSupabase().from('attributed_conversions')
        .select('*', { count: 'exact', head: true }).gte('conversion_date', since)
      return { attributed_conversions_48h: count ?? 0 }
    }),

    // 8. DeepSeek API — warns on billing issue, errors on connectivity failure
    check('deepseek', async () => {
      if (!process.env.DEEPSEEK_API_KEY) {
        return { _status: 'warning', warning: 'DEEPSEEK_API_KEY not set — AI features disabled' }
      }
      try {
        const res = await deepseek.chat.completions.create({
          model: 'deepseek-chat', max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }]
        })
        return { model: res.model }
      } catch (e) {
        if (e.status === 402 || (e.message && e.message.includes('balance'))) {
          return { _status: 'warning', warning: 'Insufficient balance — top up at platform.deepseek.com' }
        }
        throw e
      }
    }),

    // 9. Required env vars — CRITICAL
    check('env_vars', async () => {
      const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'POSTHOG_API_KEY',
        'POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST',
        'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
      const missing = required.filter(k => !process.env[k])
      if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`)
      return { all_present: true }
    }),

    // 10. Health agent process memory — NOT the API server.
    // Measures this script's own Node.js process. Values will always be low (~20-60MB).
    // Flag only extreme values that suggest a runaway script.
    check('agent_memory', async () => {
      const mem = process.memoryUsage()
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024)
      if (heapMB > 200) return { _status: 'warning', heap_mb: heapMB, warning: 'Health agent heap unusually high' }
      return { heap_mb: heapMB, rss_mb: Math.round(mem.rss / 1024 / 1024) }
    })
  ])

  const checks = results.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', status: 'error', error: r.reason?.message })
  const errors = checks.filter(c => c.status === 'error')
  const warnings = checks.filter(c => c.status === 'warning')
  const slow = checks.filter(c => c.status === 'ok' && c.ms > 2000)

  const criticalErrors = errors.filter(c => CRITICAL_CHECKS.has(c.name))
  const overall = criticalErrors.length > 0 ? 'critical'
    : (errors.length > 0 || warnings.length > 0) ? 'warning'
    : slow.length > 0 ? 'warning'
    : 'ok'

  return { ts: new Date().toISOString(), overall, checks, errors, warnings, slow }
}

async function diagnose(snap) {
  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat', max_tokens: 200,
      messages: [
        { role: 'system', content: 'You are a health monitor for SourceTrack SaaS. Return valid JSON only, no markdown. Schema: {"severity":"ok"|"warning"|"critical","diagnosis":"one sentence summary","action":"one actionable sentence or null"}' },
        { role: 'user', content: `Analyze this snapshot: ${JSON.stringify({
          overall: snap.overall,
          errors: snap.errors.map(e => `${e.name}: ${e.error}`),
          warnings: snap.warnings.map(w => `${w.name}: ${w.warning || 'warning'}`),
          slow: snap.slow.map(s => `${s.name}: ${s.ms}ms`)
        })}` }
      ]
    })
    const text = completion.choices[0].message.content.replace(/```json|```/g, '').trim()
    return JSON.parse(text)
  } catch {
    const issues = snap.errors.length + snap.warnings.length
    return { severity: snap.overall, diagnosis: `${snap.errors.length} errors, ${snap.warnings.length} warnings`, action: issues > 0 ? 'Check logs manually' : null }
  }
}

async function notify(dx, snap) {
  if (!SLACK || dx.severity === 'ok') return
  const icon = dx.severity === 'critical' ? '🔴' : '⚠️'
  const failList = [
    ...snap.errors.map(e => `• \`${e.name}\` ERROR: ${e.error}`),
    ...snap.warnings.map(w => `• \`${w.name}\` WARN: ${w.warning || 'warning'}`)
  ].join('\n')
  await fetch(SLACK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${icon} *SourceTrack Health — ${dx.severity.toUpperCase()}*\n*Diagnosis:* ${dx.diagnosis}\n*Action:* ${dx.action || 'None'}\n${failList}`
    })
  })
}

async function run() {
  console.log('🔍 SourceTrack health check starting...\n')
  const snap = await collectSnapshot()

  for (const c of snap.checks) {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : '❌'
    const slow = c.ms > 2000 ? ' SLOW' : ''
    const detail = c.error ? ` — ${c.error}` : c.warning ? ` — ${c.warning}` : c.ms ? ` (${c.ms}ms)` : ''
    const extras = Object.entries(c)
      .filter(([k]) => !['name','status','ms','error','warning','_status'].includes(k))
      .map(([k,v]) => `${k}=${v}`).join(' ')
    console.log(`${icon} ${c.name}${detail}${slow}${extras ? ' | ' + extras : ''}`)
  }

  console.log(`\n━━━ Overall: ${snap.overall.toUpperCase()} ━━━`)
  if (snap.errors.length > 0) console.log(`❌ ${snap.errors.length} failed: ${snap.errors.map(e => e.name).join(', ')}`)
  if (snap.warnings.length > 0) console.log(`⚠️  ${snap.warnings.length} warnings: ${snap.warnings.map(w => w.name).join(', ')}`)
  if (snap.slow.length > 0) console.log(`🐢 ${snap.slow.length} slow: ${snap.slow.map(s => `${s.name}(${s.ms}ms)`).join(', ')}`)

  const dx = await diagnose(snap)
  console.log(`\n🤖 AI Diagnosis: ${dx.diagnosis}`)
  if (dx.action) console.log(`   Action: ${dx.action}`)

  await notify(dx, snap)

  process.exit(snap.overall === 'critical' ? 1 : 0)
}

run().catch(e => { console.error('Health check crashed:', e.message); process.exit(1) })
