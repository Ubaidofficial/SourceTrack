// The schema-drift check must go RED on any missing table/column or type divergence,
// and GREEN only when every source agrees. TOKEN-FREE, NO network — runs the real
// scripts/schema-drift-check.mjs against fixture snapshots.

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('../../scripts/schema-drift-check.mjs', import.meta.url).pathname
const F = new URL('../../scripts/__fixtures__/schema-drift/', import.meta.url).pathname

// Run the check; return { code, out }. Non-zero exit is captured, not thrown.
function run(...srcArgs) {
  try {
    const out = execFileSync('node', [SCRIPT, ...srcArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}
function snap(rows) {
  const p = join(mkdtempSync(join(tmpdir(), 'drift-')), 's.json')
  writeFileSync(p, JSON.stringify(rows))
  return p
}

test('GREEN: exit 0 when all sources are converged', () => {
  const r = run(`migrations=${F}intended.json`, `staging=${F}intended.json`, `prod=${F}intended.json`)
  assert.equal(r.code, 0)
  assert.match(r.out, /GREEN/)
})

test('🔴 RED: exit 1 on this week\'s real drift (missing cols/tables, BOTH ways)', () => {
  const r = run(`migrations=${F}intended.json`, `staging=${F}staging-drifted.json`, `prod=${F}prod-drifted.json`)
  assert.equal(r.code, 1, 'drift must fail the build')
  assert.match(r.out, /sites\.meta_capi_token .*absent in \[staging\]/, 'catches the CAPI column staging lacked')
  assert.match(r.out, /site_alerts\.id .*absent in \[staging\]/, 'catches the table staging lacked (anomaly-watcher throws)')
  assert.match(r.out, /tinybird_revenue_idempotency_keys\.event_id .*absent in \[prod\]/, 'catches drift the OTHER way (prod lacked it)')
  assert.match(r.out, /pageviews\.os .*absent in \[migrations, prod\]/, 'catches a staging-only orphan')
})

test('RED: a TYPE/nullability divergence fails even when the column is present everywhere', () => {
  const base = [{ table_name: 'sites', column_name: 'plan', data_type: 'text', is_nullable: 'NO', column_default: null }]
  const drifted = [{ table_name: 'sites', column_name: 'plan', data_type: 'character varying', is_nullable: 'NO', column_default: null }]
  const r = run(`staging=${snap(base)}`, `prod=${snap(drifted)}`)
  assert.equal(r.code, 1)
  assert.match(r.out, /TYPEDIFF\s+sites\.plan/)
})

test('column_default differences are NOTES, not failures (no false-RED on default noise)', () => {
  const a = [{ table_name: 't', column_name: 'c', data_type: 'integer', is_nullable: 'NO', column_default: "nextval('t_c_seq'::regclass)" }]
  const b = [{ table_name: 't', column_name: 'c', data_type: 'integer', is_nullable: 'NO', column_default: "nextval('t_c_seq1'::regclass)" }]
  const r = run(`staging=${snap(a)}`, `prod=${snap(b)}`)
  assert.equal(r.code, 0, 'default noise must not fail the build')
  assert.match(r.out, /NOTES/)
})

test('an explicit --ignore entry suppresses a KNOWN, reviewed exception', () => {
  const ig = snap(['pageviews.os'])
  const r = run(`--ignore=${ig}`, `migrations=${F}intended.json`, `staging=${F}staging-drifted.json`, `prod=${F}intended.json`)
  // still RED for the other drifts, but pageviews.os no longer listed
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.out, /pageviews\.os/)
})

test('--ignore column-prefix glob (table.prefix*) suppresses the unformalized prod orphans', () => {
  const ig = snap(['sites.custom_domain*', 'site_annotations.*'])
  const rows = [
    { table_name: 'sites', column_name: 'custom_domain', data_type: 'text', is_nullable: 'YES', column_default: null },
    { table_name: 'sites', column_name: 'custom_domain_verified', data_type: 'boolean', is_nullable: 'YES', column_default: null },
    { table_name: 'site_annotations', column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: null }
  ]
  // prod has the orphans; migrations/staging don't — normally RED, but ignored here.
  const r = run(`--ignore=${ig}`, `migrations=${snap([])}`, `staging=${snap([])}`, `prod=${snap(rows)}`)
  assert.equal(r.code, 0, 'the reviewed orphan deferrals are suppressed')
  assert.doesNotMatch(r.out, /custom_domain|site_annotations/)
})

test('the committed schema-drift-ignore.json defers ONLY the deliberate sites.owner_id exception', async () => {
  const { readFileSync } = await import('node:fs')
  const p = new URL('../../scripts/schema-drift-ignore.json', import.meta.url).pathname
  const j = JSON.parse(readFileSync(p, 'utf8'))
  // Exactly ONE deferral: the deliberate sites.owner_id default-divergence (founder decision).
  assert.deepEqual(j.ignore, ['sites.owner_id'])
  // The two prod orphans converged 2026-07-18 — they MUST NOT be deferred anymore (removing them
  // is precisely what re-enforces the drift check on those objects). Assert explicit absence so a
  // future re-add is caught.
  assert.ok(!j.ignore.includes('site_annotations.*'), 'site_annotations.* converged — must not be re-ignored')
  assert.ok(!j.ignore.includes('sites.custom_domain*'), 'sites.custom_domain* converged — must not be re-ignored')
  // Every deferral must carry a documented rationale; owner_id's must state it is a deliberate,
  // reviewed exception (not drift-by-neglect).
  for (const k of j.ignore) assert.ok(j._rationale?.[k], `ignore "${k}" must have a _rationale entry`)
  assert.match(j._rationale['sites.owner_id'], /deliberate|intentional|founder decision/i)
  // No stale rationale for the removed orphans.
  assert.ok(!('site_annotations.*' in (j._rationale || {})), 'stale site_annotations rationale must be removed')
  assert.ok(!('sites.custom_domain*' in (j._rationale || {})), 'stale custom_domain rationale must be removed')
})
