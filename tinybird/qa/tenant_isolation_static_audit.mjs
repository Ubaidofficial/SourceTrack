#!/usr/bin/env node
// SourceTrack — Phase 8 tenant-isolation STATIC audit. READ-ONLY, no network.
//
// Reproduces "every endpoint pipe is fail-closed on site_id" as a re-runnable command
// (replaces the point-in-time manual grep that had no committed artifact). Re-run any
// time a pipe is added/changed:  node tinybird/qa/tenant_isolation_static_audit.mjs
//
// PASS criterion per TYPE endpoint pipe: at least one SQL predicate line (WHERE/AND)
// of the exact fail-closed form  site_id = {{ String(site_id, required=True) }}.
// FAIL if that predicate is absent, if site_id is given a DEFAULT (widens scope), or
// if a site_id predicate sits inside a {% if %} template block (bypassable).
// TYPE materialized pipes are reported N/A (projection: no site_id param; isolation is
// enforced by the endpoint pipes that READ the materialized datasource, which ARE checked).
//
// Location: tinybird/qa/ (not tinybird/tools/) — tools/ holds generators + the Phase-4/9
// reconciliation harness; this is a tenant-isolation QA gate, kept separate on purpose.
//
// Exit 0 = all endpoint pipes PASS; exit 1 = one or more FAIL (CI-gateable).

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PIPES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'pipes')

// The exact fail-closed predicate (whitespace-tolerant).
const FAIL_CLOSED = /site_id\s*=\s*\{\{\s*String\(\s*site_id\s*,\s*required\s*=\s*True\s*\)\s*\}\}/
// Any String(site_id, <2nd arg>) whose 2nd arg is NOT required=True → a DEFAULT that widens scope.
const SITE_ID_WITH_DEFAULT = /String\(\s*site_id\s*,(?![^)]*required\s*=\s*True)[^)]*\)/
// A site_id predicate wrapped in a Tinybird templating conditional on the same line.
const IF_BYPASS = /\{%[^%]*\bif\b[^%]*%\}[^\n]*site_id|site_id[^\n]*\{%[^%]*\bif\b/

const isCommentLine = (l) => {
  const t = l.trim()
  return t.startsWith('#') || t.startsWith('--')
}
const isSqlPredicateLine = (l) => {
  const t = l.trim().toUpperCase()
  return t.startsWith('WHERE') || t.startsWith('AND')
}

const files = readdirSync(PIPES_DIR).filter((f) => f.endsWith('.pipe')).sort()
const rows = []
let endpointPass = 0
let endpointFail = 0

for (const file of files) {
  const text = readFileSync(join(PIPES_DIR, file), 'utf8')
  const lines = text.split('\n')
  const type = (lines.find((l) => /^TYPE\s+/i.test(l.trim())) || '').replace(/^TYPE\s+/i, '').trim().toLowerCase() || 'endpoint'

  if (type === 'materialized') {
    rows.push({ file, type, verdict: 'N/A', detail: 'materialized projection — no site_id param; readers are checked' })
    continue
  }

  // Collect fail-closed predicate lines that sit on a real SQL WHERE/AND (not prose/comment).
  const predicateHits = []
  const defaultHits = []
  const ifHits = []
  lines.forEach((l, i) => {
    if (isCommentLine(l)) return
    if (FAIL_CLOSED.test(l) && isSqlPredicateLine(l)) predicateHits.push({ n: i + 1, line: l.trim() })
    if (SITE_ID_WITH_DEFAULT.test(l) && !isCommentLine(l)) defaultHits.push({ n: i + 1, line: l.trim() })
    if (IF_BYPASS.test(l)) ifHits.push({ n: i + 1, line: l.trim() })
  })

  let verdict = 'PASS'
  const notes = []
  if (predicateHits.length === 0) { verdict = 'FAIL'; notes.push('no fail-closed site_id predicate on any WHERE/AND line') }
  if (defaultHits.length > 0) { verdict = 'FAIL'; notes.push(`site_id given a DEFAULT (widens scope): ${defaultHits.map((h) => `:${h.n}`).join(',')}`) }
  if (ifHits.length > 0) { verdict = 'FAIL'; notes.push(`site_id predicate inside {% if %} (bypassable): ${ifHits.map((h) => `:${h.n}`).join(',')}`) }

  if (verdict === 'PASS') endpointPass++; else endpointFail++
  rows.push({
    file, type, verdict,
    detail: verdict === 'PASS'
      ? `${predicateHits.length} fail-closed predicate(s): ${predicateHits.map((h) => `:${h.n}`).join(',')}`
      : notes.join(' | '),
    predicates: predicateHits
  })
}

// ── Report ──
const pad = (s, n) => String(s).padEnd(n)
console.log('Phase 8 tenant-isolation STATIC audit — ' + PIPES_DIR)
console.log('─'.repeat(96))
for (const r of rows) {
  const mark = r.verdict === 'PASS' ? '✅' : r.verdict === 'N/A' ? '➖' : '❌'
  console.log(`${mark} ${pad(r.verdict, 4)} ${pad(r.file, 40)} ${r.detail}`)
  if (r.verdict === 'PASS' && r.predicates?.[0]) console.log(`        e.g. ${r.file}:${r.predicates[0].n}  ${r.predicates[0].line}`)
}
console.log('─'.repeat(96))
const materialized = rows.filter((r) => r.verdict === 'N/A').length
console.log(`Totals: ${rows.length} pipes = ${endpointPass} endpoint PASS · ${endpointFail} endpoint FAIL · ${materialized} materialized (N/A)`)

if (endpointFail > 0) {
  console.error('\nRESULT: FAIL — at least one endpoint pipe is not fail-closed on site_id (tenant-leak risk).')
  process.exit(1)
}
console.log('\nRESULT: PASS — every endpoint pipe is fail-closed on site_id = {{ String(site_id, required=True) }}.')
process.exit(0)
