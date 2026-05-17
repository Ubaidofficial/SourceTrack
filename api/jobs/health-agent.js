import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { realtime: { transport: WebSocket } })
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
})
const SLACK = process.env.SLACK_WEBHOOK_URL

async function _queryPostHog(sql) {
  const host = process.env.POSTHOG_HOST.replace(/\/$/, "")
  const url = `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } })
  })
  if (!res.ok) throw new Error(`PostHog ${res.status}`)
  const data = await res.json()
  return data.results || []
}

async function collectSnapshot() {
  const snap = {
    ts: new Date().toISOString(),
    posthog: { status: 'unknown', ms: null },
    supabase: { status: 'unknown', ms: null },
    batch: { last_run: null, conversions: null, status: null, hours_ago: null },
    errors: []
  }

  // PostHog check
  try {
    const t = Date.now()
    await _queryPostHog('SELECT count() FROM events LIMIT 1')
    snap.posthog.ms = Date.now() - t
    snap.posthog.status = snap.posthog.ms > 3000 ? 'slow' : 'ok'
  } catch (e) {
    snap.posthog.status = 'error'
    snap.errors.push(`PostHog: ${e.message}`)
  }

  // Supabase check
  try {
    const t = Date.now()
    await supabase.from('sites').select('id').limit(1)
    snap.supabase.ms = Date.now() - t
    snap.supabase.status = snap.supabase.ms > 2000 ? 'slow' : 'ok'
  } catch (e) {
    snap.supabase.status = 'error'
    snap.errors.push(`Supabase: ${e.message}`)
  }

  // Batch job check
  const { data: run } = await supabase
    .from('job_runs')
    .select('ran_at, status, conversions_processed, error_message')
    .eq('job_name', 'nightly-attribution')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single()

  if (run) {
    const h = (Date.now() - new Date(run.ran_at).getTime()) / 3_600_000
    snap.batch = { last_run: run.ran_at, conversions: run.conversions_processed, status: run.status, hours_ago: Math.round(h) }
    if (h > 26) snap.errors.push(`Batch job not run in ${Math.round(h)}h`)
    if (run.status === 'success' && run.conversions_processed === 0) snap.errors.push('Batch ran but 0 conversions processed')
    if (run.status === 'failed') snap.errors.push(`Last batch FAILED: ${run.error_message}`)
  } else {
    snap.errors.push('No batch runs in job_runs table')
  }

  return snap
}

async function diagnose(snap) {
  const completion = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 150,
    messages: [
      {
        role: 'system',
        content: 'Health monitor for SourceTrack. Return valid JSON only, no markdown. Schema: {"severity":"ok"|"warning"|"critical","diagnosis":"one sentence","action":"one sentence or none"}'
      },
      {
        role: 'user',
        content: `Analyze this health snapshot and return JSON: ${JSON.stringify(snap)}`
      }
    ]
  })
  try {
    const text = completion.choices[0].message.content.replace(/```json|```/g, '').trim()
    return JSON.parse(text)
  } catch {
    return { severity: 'warning', diagnosis: 'Parse failed', action: 'Check logs manually' }
  }
}

async function run() {
  const snap = await collectSnapshot()
  const dx = await diagnose(snap)
  console.log(JSON.stringify({ dx, snap }, null, 2))

  if (dx.severity !== 'ok' && SLACK) {
    const icon = dx.severity === 'critical' ? '🔴' : '⚠️'
    await fetch(SLACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${icon} *SourceTrack Health — ${dx.severity.toUpperCase()}*\n*Issue:* ${dx.diagnosis}\n*Action:* ${dx.action}`
      })
    })
  }
}

run().catch(e => { console.error(e); process.exit(1) })
