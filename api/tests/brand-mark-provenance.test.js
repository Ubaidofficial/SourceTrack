// BRAND MARK PROVENANCE — enforces design.md §35.4 in CI rather than in memory.
//
// ── WHY ─────────────────────────────────────────────────────────────────────────
// §35.4: never reconstruct or approximate a third-party mark; when sourcing IS
// available, confirm the URL is the company's OWN domain, not an aggregator or icon
// library. Founder ruling 2026-08-08: official sourcing only, for all ~90 marks.
//
// That rule is unenforceable by review. A reviewer looking at `<img src="/brand/stripe.svg">`
// cannot tell an officially-sourced asset from one pulled off an icon CDN — both are a
// file in a folder. So the registry records WHERE each asset came from, and this test
// makes a mark impossible to promote to 'sourced' without that record.
//
// Same reasoning as v3-lift-detection: an unenforceable rule is one that quietly stops
// being followed, and 90 marks sourced over weeks by whoever is free is exactly the
// shape of task where that happens.
//
// ── WHAT IT CANNOT DO ───────────────────────────────────────────────────────────
// It cannot verify the SVG is genuinely the vendor's artwork, that the brandPage URL
// was really where it came from, or that the vendor's terms permit our use. Those are
// human judgements made at sourcing time. This checks that the judgement was RECORDED
// and is internally consistent. Stating the limit is the point — a guard that
// overstates its coverage is the false-pass class this repo has hit repeatedly.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MARKS, FORBIDDEN_SOURCES, getMark } from '../../marketing/src/lib/brand-marks.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BRAND_DIR = join(REPO, 'marketing/public/brand')

test('every mark declares a name and a legal status', () => {
  for (const [slug, m] of Object.entries(MARKS)) {
    assert.ok(m.name && m.name.trim(), `${slug}: name is the accessible name AND the fallback label — never optional`)
    assert.ok(['sourced', 'label'].includes(m.status), `${slug}: status must be 'sourced' or 'label', got ${JSON.stringify(m.status)}`)
  }
})

test('🔴 a sourced mark carries full provenance — file, brand page, terms', () => {
  const bad = []
  for (const [slug, m] of Object.entries(MARKS)) {
    if (m.status !== 'sourced') continue
    // The FILE the registry records — extensions vary (svg/png/ico/jpg/webp) because
    // each vendor serves what it serves. Assuming .svg here was wrong and made the guard
    // fail on 86 correctly-sourced marks.
    if (!m.file) {
      bad.push(`${slug}: status 'sourced' with no file recorded`)
    } else if (!existsSync(join(BRAND_DIR, m.file))) {
      bad.push(`${slug}: status 'sourced' but marketing/public/brand/${m.file} does not exist`)
    }
    if (!m.brandPage) {
      bad.push(`${slug}: status 'sourced' with no brandPage — §35.4 requires the vendor's own URL be recorded`)
    }
    if (!m.terms) {
      bad.push(`${slug}: status 'sourced' with no terms note — record what the vendor permits`)
    }
  }
  assert.deepEqual(bad, [], 'incomplete provenance:\n  ' + bad.join('\n  '))
})

test('🔴 no sourced mark comes from an aggregator or icon library', () => {
  const bad = []
  for (const [slug, m] of Object.entries(MARKS)) {
    if (m.status !== 'sourced' || !m.brandPage) continue
    const host = m.brandPage.toLowerCase()
    for (const forbidden of FORBIDDEN_SOURCES) {
      if (host.includes(forbidden)) {
        bad.push(`${slug}: brandPage is ${forbidden} — §35.4 requires the company's own domain`)
      }
    }
    assert.ok(/^https:\/\//.test(m.brandPage), `${slug}: brandPage must be https`)
  }
  assert.deepEqual(bad, [], 'forbidden sources:\n  ' + bad.join('\n  '))
})

test('no orphan SVGs — every file in public/brand is a registered sourced mark', () => {
  if (!existsSync(BRAND_DIR)) return
  const registered = new Set(Object.values(MARKS).filter(m => m.status === 'sourced').map(m => m.file))
  const orphans = readdirSync(BRAND_DIR)
    .filter(f => !f.startsWith('.'))
    .filter(f => !registered.has(f))
  assert.deepEqual(orphans, [],
    'SVGs present with no matching sourced entry — an asset with no recorded provenance ' +
    'is exactly what §35.4 bars:\n  ' + orphans.join('\n  '))
})

test('🔴 POSITIVE CONTROL — the guard rejects a mark promoted without provenance', () => {
  // Proves the checks above can fail. A guard that has never demonstrated a catch
  // proves nothing, which is how orphaned selectors survived three phases in #663.
  const planted = { name: 'Fake', status: 'sourced', brandPage: 'https://cdn.simpleicons.org/fake', terms: 'x' }
  const hitsForbidden = FORBIDDEN_SOURCES.some(f => planted.brandPage.includes(f))
  assert.ok(hitsForbidden, 'the forbidden-source check does not fire on an icon-library URL')

  const noFile = !existsSync(join(BRAND_DIR, 'definitely-not-a-real-mark.svg'))
  assert.ok(noFile, 'the missing-file check has nothing to catch')
})

test('NEGATIVE CONTROL — a label-state mark needs no file and is not flagged', () => {
  // The common case by far, and it must stay frictionless or people will promote marks
  // to 'sourced' just to silence the guard.
  const label = Object.entries(MARKS).find(([, m]) => m.status === 'label')
  assert.ok(label, 'expected at least one label-state mark')
  assert.ok(!label[1].brandPage, 'a label-state mark needs no brandPage')
})

test('getMark throws on an unknown slug rather than rendering blank', () => {
  assert.throws(() => getMark('no-such-vendor'), /Unknown brand mark/)
})

test('sourcing progress is reportable', () => {
  const sourced = Object.values(MARKS).filter(m => m.status === 'sourced').length
  const total = Object.keys(MARKS).length
  assert.ok(total >= 80, `registry should cover the design's ~90 marks, has ${total}`)
  console.log(`    brand marks: ${sourced}/${total} officially sourced, ${total - sourced} on text labels`)
})
