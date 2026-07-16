// BUILD-ROOT BOUNDARY GUARD — the test that would have caught #252 before prod.
//
// THE INCIDENT: #252 shipped `dashboard/src/lib/reportGating.js` importing
// '../../../api/lib/report-config-validation.js'. CI passed and prod deploy 0b5f2075 FAILED.
// Both are correct: CI builds the dashboard from the REPO ROOT, where ../../../api resolves.
// Railway builds the Dashboard service with rootDirectory=/dashboard, so /api is NOT in the
// build context and rollup can't resolve it. Green CI, un-deployable dashboard.
//
// So CI cannot catch this by building — it builds from the wrong root. It has to be asserted
// structurally: NOTHING under dashboard/src may reach outside dashboard/.
//
// The DIRECTION that is safe is the inverse: the API service builds from the repo root, so
// api/ -> dashboard/ resolves in every context. That is the proven, deployed precedent
// (api/lib/source-normalizer.js re-exports from dashboard/src/lib and is imported by the live
// dashboard.js / journey.js / leads-server.js routes). Shared constants therefore live under
// dashboard/ (see dashboard/src/lib/gate-constants.js) and the API reaches in.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const DASHBOARD_ROOT = join(REPO_ROOT, 'dashboard')
const DASHBOARD_SRC = join(DASHBOARD_ROOT, 'src')

function walk (dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

// static `from '...'` + dynamic `import('...')`
const SPECIFIER_RE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g

function relativeSpecifiers (code) {
  const found = []
  for (const m of code.matchAll(SPECIFIER_RE)) {
    if (m[1].startsWith('.')) found.push(m[1])
  }
  return found
}

test('🔴 no file under dashboard/src imports outside the dashboard build root (Railway rootDirectory=/dashboard)', () => {
  const escapes = []
  for (const file of walk(DASHBOARD_SRC)) {
    for (const spec of relativeSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), spec)
      if (!target.startsWith(DASHBOARD_ROOT)) {
        escapes.push(`${relative(REPO_ROOT, file)} -> ${spec}`)
      }
    }
  }
  assert.deepEqual(escapes, [], `these imports escape /dashboard and WILL fail the Railway dashboard build (CI builds from the repo root and will not catch it):\n${escapes.join('\n')}`)
})

test('the guard actually detects an escaping import (it is not vacuously passing)', () => {
  // the exact #252 line, checked against the real boundary logic above
  const offending = join(DASHBOARD_SRC, 'lib/reportGating.js')
  const target = resolve(dirname(offending), '../../../api/lib/report-config-validation.js')
  assert.ok(!target.startsWith(DASHBOARD_ROOT), 'the #252 import must be classified as an escape')
  assert.equal(relativeSpecifiers(`import { X } from '../../../api/lib/report-config-validation.js'`).length, 1)
})

// The safe direction, asserted so nobody "fixes" the coupling by flipping it back.
test('the API-side re-export still points INTO dashboard (the deployed source-normalizer precedent)', () => {
  const norm = readFileSync(join(REPO_ROOT, 'api/lib/source-normalizer.js'), 'utf8')
  assert.match(norm, /from '\.\.\/\.\.\/dashboard\/src\/lib\/source-normalizer\.js'/, 'precedent intact')
  const gate = readFileSync(join(REPO_ROOT, 'api/lib/report-config-validation.js'), 'utf8')
  assert.match(gate, /from '\.\.\/\.\.\/dashboard\/src\/lib\/gate-constants\.js'/, 'gate constants imported the safe direction')
})

// strip comments so prose ("no fs/path/process") isn't mistaken for a dependency
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('gate-constants.js stays PURE — the API imports it, so no client-only or node-only deps', () => {
  const code = stripComments(readFileSync(join(DASHBOARD_SRC, 'lib/gate-constants.js'), 'utf8'))
  assert.equal(relativeSpecifiers(code).length, 0, 'zero relative imports')
  assert.doesNotMatch(code, /\bfrom\s*['"][^'"]+['"]/, 'zero imports of any kind')
  assert.doesNotMatch(code, /\b(require|process|window|document)\b|\bimport\.meta\b|\bfrom\s*['"](fs|path)['"]/, 'no node-only or browser-only API')
})
