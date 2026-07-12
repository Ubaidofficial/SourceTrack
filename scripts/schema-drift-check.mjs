#!/usr/bin/env node
// SCHEMA DRIFT CHECK — the build-failing guard against staging↔prod↔migrations drift.
//
// WHY THIS EXISTS: migrations were hand-applied per-environment with no automation, so
// the two DBs silently drifted BOTH ways (staging was 13 columns behind on `sites` and
// missing `site_alerts` entirely; prod was missing a table staging had). Silence behind
// a green check is exactly what let that run for weeks. This check turns any divergence
// RED.
//
// It is source-agnostic: it diffs N named information_schema snapshots (produced by
// scripts/schema-snapshot.sql). In CI the three sources are:
//   migrations = a throwaway DB built ONLY from supabase/migrations/  (the intended truth)
//   staging    = the live staging DB
//   prod       = the live prod DB
// A (table, column) must exist with the SAME (data_type, is_nullable) in EVERY source.
// Any missing table, missing column, or type/nullability mismatch → non-zero exit.
//
// column_default is reported as an informational NOTE, never a failure: defaults carry
// per-DB noise (sequence names, cast spellings) that would false-RED. Presence + type +
// nullability is the meaningful drift signal (and is exactly what bit us).
//
// Usage:
//   node scripts/schema-drift-check.mjs migrations=shadow.json staging=staging.json prod=prod.json
//   node scripts/schema-drift-check.mjs --ignore=scripts/schema-drift-ignore.json <sources...>
//
// Exit 0 = all sources agree (GREEN). Exit 1 = drift (RED). Exit 2 = usage/IO error.

import { readFileSync } from 'node:fs'

function fail (msg) { console.error(`schema-drift-check: ${msg}`); process.exit(2) }

const args = process.argv.slice(2)
let ignorePath = null
const sources = []
for (const a of args) {
  if (a.startsWith('--ignore=')) { ignorePath = a.slice('--ignore='.length); continue }
  const eq = a.indexOf('=')
  if (eq === -1) fail(`bad arg '${a}' — expected name=path or --ignore=path`)
  sources.push({ name: a.slice(0, eq), path: a.slice(eq + 1) })
}
if (sources.length < 2) fail('need at least two sources to diff (e.g. staging=… prod=…)')

// ignore-list: array of "table.column" (or "table.*" for a whole table) that are
// KNOWN, REVIEWED, intentional per-env exceptions. Empty by default — every entry is an
// explicit, reviewed decision, never a silent skip.
let ignore = new Set()
if (ignorePath) {
  try {
    const raw = JSON.parse(readFileSync(ignorePath, 'utf8'))
    ignore = new Set(Array.isArray(raw) ? raw : (raw.ignore || []))
  } catch (e) { fail(`could not read --ignore ${ignorePath}: ${e.message}`) }
}
// Match "table.column" exact, "table.*" whole-table, or "table.prefix*" column-prefix.
// Used only for KNOWN, REVIEWED per-env exceptions (e.g. an unformalized prod orphan
// whose exact DDL must still be captured from prod). Every entry is an explicit decision.
function isIgnored (table, column) {
  if (ignore.has(`${table}.${column}`) || ignore.has(`${table}.*`)) return true
  for (const pat of ignore) {
    if (!pat.endsWith('*') || pat.endsWith('.*')) continue
    const dot = pat.indexOf('.')
    if (dot === -1) continue
    const t = pat.slice(0, dot)
    const colPrefix = pat.slice(dot + 1, -1) // drop the trailing '*'
    if (t === table && column.startsWith(colPrefix)) return true
  }
  return false
}

// Load a snapshot (array of column rows) → Map "table.column" -> {data_type,is_nullable,column_default}.
function load ({ name, path }) {
  let rows
  try { rows = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { fail(`could not read ${name} snapshot ${path}: ${e.message}`) }
  if (!Array.isArray(rows)) fail(`${name} snapshot ${path} is not a JSON array (run scripts/schema-snapshot.sql)`)
  const map = new Map()
  for (const r of rows) {
    map.set(`${r.table_name}.${r.column_name}`, {
      data_type: r.data_type,
      is_nullable: r.is_nullable,
      column_default: r.column_default ?? null
    })
  }
  return { name, map }
}

const snapshots = sources.map(load)
const names = snapshots.map(s => s.name)

// Union of every (table.column) seen in any source.
const allKeys = new Set()
for (const s of snapshots) for (const k of s.map.keys()) allKeys.add(k)

const failures = []
const notes = []
for (const key of [...allKeys].sort()) {
  const [table, column] = key.split(/\.(.*)/s) // split on FIRST dot (column names have no dot)
  if (isIgnored(table, column)) continue

  const present = snapshots.filter(s => s.map.has(key))
  const missing = snapshots.filter(s => !s.map.has(key))

  // 1) presence drift — the column/table exists in some sources but not others.
  if (missing.length > 0) {
    failures.push(`MISSING  ${key.padEnd(52)} present in [${present.map(s => s.name).join(', ')}] · absent in [${missing.map(s => s.name).join(', ')}]`)
    continue
  }

  // 2) type / nullability drift — present everywhere but not identical.
  const sig = (s) => { const c = s.map.get(key); return `${c.data_type}|nullable=${c.is_nullable}` }
  const sigs = new Set(present.map(sig))
  if (sigs.size > 1) {
    failures.push(`TYPEDIFF ${key.padEnd(52)} ` + present.map(s => `${s.name}=${sig(s)}`).join(' · '))
    continue
  }

  // 3) default drift — informational only (never fails the build).
  const defs = new Set(present.map(s => String(s.map.get(key).column_default)))
  if (defs.size > 1) {
    notes.push(`default differs ${key} · ` + present.map(s => `${s.name}=${s.map.get(key).column_default}`).join(' · '))
  }
}

console.log(`schema-drift-check: comparing [${names.join(', ')}] over ${allKeys.size} columns`)
if (notes.length) {
  console.log(`\nNOTES (informational, not failures) — ${notes.length}:`)
  for (const n of notes) console.log('  · ' + n)
}
if (failures.length === 0) {
  console.log('\n✅ GREEN — no schema drift. All sources agree on every table + column (type + nullability).')
  process.exit(0)
}
console.error(`\n🔴 RED — ${failures.length} schema divergence(s):\n`)
for (const f of failures) console.error('  ' + f)
console.error('\nSchema drift detected. Converge the environments (author/apply the missing migration) before merging.')
process.exit(1)
