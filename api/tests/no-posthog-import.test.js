// D3 STRUCTURAL GUARD — the single invariant that replaces the ~40 scattered "ph.capture must NOT
// be called" assertions removed across the cutover tests. PostHog is decommissioned and
// api/lib/posthog.js is DELETED; this asserts, on SOURCE TEXT (not runtime import success — once the
// module is gone "no importer" would be trivially true because the import would crash), that no file
// under api/lib, api/routes, or api/jobs imports/requires the deleted module. That is what actually
// blocks reintroduction: a new `import { ph } from '../lib/posthog.js'` fails HERE, in CI, loudly.
//
// SCOPE NOTE: this guards against importing the deleted MODULE, not against PostHog references in
// general. api/jobs/nightly-attribution.js legitimately still reads POSTHOG_* env directly and does
// its own fetch to the PostHog query API (its queryPostHog is D2 scope, not D3) — that is fine and
// intentionally NOT flagged here. Only an `import`/`require`/dynamic-`import` of posthog.js is caught.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')

function walk (dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

// import { … } from '…posthog.js'  |  require('…posthog.js')  |  await import('…posthog.js')
const POSTHOG_IMPORT = /(?:import\s[^'"]*from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*posthog\.js['"]/

test('🔴 no file under api/lib, api/routes, api/jobs imports the deleted posthog.js module', () => {
  const offenders = []
  for (const sub of ['lib', 'routes', 'jobs']) {
    for (const file of walk(join(API_DIR, sub))) {
      if (POSTHOG_IMPORT.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(API_DIR, 'api'))
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    `posthog.js is deleted (D3) — these files must not import it (reads of POSTHOG_* env are fine, importing the module is not):\n  ${offenders.join('\n  ')}`)
})
