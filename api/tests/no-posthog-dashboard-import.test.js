// D4 STRUCTURAL GUARD — the frontend analog of api/tests/no-posthog-import.test.js.
//
// PostHog is decommissioned. D4 deleted dashboard/src/lib/posthog.js and removed the posthog-js
// dependency, so SourceTrack's own dashboard no longer ships PostHog product analytics. This asserts,
// on SOURCE TEXT, that NO file under dashboard/src imports the `posthog-js` package or the deleted
// `lib/posthog` module — so it cannot creep back into the frontend bundle. A new
// `import posthog from 'posthog-js'` fails HERE, in CI, loudly.
//
// SCOPE: dashboard/src only (not dist/ build output, not node_modules). Runs from the repo root under
// node --test like the other dashboard guards (dashboard-build-root.test.js) — source scan, no build.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DASHBOARD_SRC = join(__dirname, '..', '..', 'dashboard', 'src')

function walk (dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// import … from 'posthog-js'  |  require('posthog-js')  |  await import('posthog-js')
// and the deleted local module: … from '…/lib/posthog'  (with or without extension)
const POSTHOG_JS = /(?:import\s[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"]posthog-js['"]/
const LIB_POSTHOG = /(?:import\s[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*\/lib\/posthog(?:\.js)?['"]/

test('🔴 no file under dashboard/src imports posthog-js or the deleted lib/posthog (PostHog is decommissioned)', () => {
  const offenders = []
  for (const file of walk(DASHBOARD_SRC)) {
    const src = readFileSync(file, 'utf8')
    if (POSTHOG_JS.test(src) || LIB_POSTHOG.test(src)) {
      offenders.push(file.replace(join(__dirname, '..', '..'), ''))
    }
  }
  assert.deepStrictEqual(offenders, [],
    `PostHog is removed from the dashboard (D4) — these files must not import posthog-js or lib/posthog:\n  ${offenders.join('\n  ')}`)
})
