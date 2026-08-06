// AI Visibility kill switch — the route and its PAGE_TITLES key must move TOGETHER.
// TOKEN-FREE, NO network. Reads source text, because what is being guarded is a pair of
// declarations in two different files, not a runtime behaviour.
//
// THE POINT OF THIS FILE IS THE §10 CLASS-3 TRAP. Layout.jsx's PAGE_TITLES maps route
// paths to titles by PATH STRING. An import grep cannot see a stale key — that is exactly
// the class CLAUDE.md §10 names ("Title/route maps keyed by a path STRING"), and it is how
// a deleted page leaves a title behind that nothing ever finds. The route is gated on
// AI_VISIBILITY_ENABLED (dashboard/src/featureFlags.js) because the page's backend does not
// exist: crawler_hits is absent from the prod Tinybird workspace, both crawler_* pipes are
// undeployed, and readPipe() fails CLOSED — so serving the route means throwing on every
// request. See featureFlags.js for the five conditions that must hold before it flips.
//
// These tests are written to pass in BOTH states. Flipping the flag to true and restoring
// the PAGE_TITLES line keeps them green; flipping it and forgetting the title (or the
// reverse) fails. That is the drift this file exists to catch.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const flags = await import('../../dashboard/src/featureFlags.js')
const appSrc = read('dashboard/src/App.jsx')
const layoutSrc = read('dashboard/src/components/Layout.jsx')

// A PAGE_TITLES entry is a quoted path key followed by a colon. An occurrence inside a
// comment is not an entry — the flag-off state deliberately leaves an explanatory comment
// mentioning the path, and that must not read as a live key.
const hasTitleEntry = layoutSrc
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .some((line) => /['"]\/ai-visibility['"]\s*:/.test(line))

const routeIsGated = /AI_VISIBILITY_ENABLED\s*&&\s*\(?\s*<Route\s+path="\/ai-visibility"/s.test(appSrc)
const routeExists = /<Route\s+path="\/ai-visibility"/.test(appSrc)

test('the flag is a real boolean, not a truthy string', () => {
  assert.equal(typeof flags.AI_VISIBILITY_ENABLED, 'boolean')
})

test('🔴 §10 CLASS-3: the route and its PAGE_TITLES key move together', () => {
  if (flags.AI_VISIBILITY_ENABLED) {
    assert.ok(routeExists, 'flag is ON -> the /ai-visibility route must be registered')
    assert.ok(hasTitleEntry, 'flag is ON -> PAGE_TITLES must carry /ai-visibility, or the page renders untitled')
  } else {
    assert.equal(
      hasTitleEntry,
      false,
      'flag is OFF -> PAGE_TITLES must NOT carry /ai-visibility: a key whose route does not resolve is the stale title-map trap (§10)'
    )
  }
})

test('🔴 while OFF, the route is GATED rather than deleted', () => {
  if (flags.AI_VISIBILITY_ENABLED) return
  assert.ok(
    routeIsGated,
    'the route must stay wired behind AI_VISIBILITY_ENABLED — deleting it orphans AIVisibility.jsx and makes re-enabling archaeology'
  )
})

// Deploying the pipes without adding them to TINYBIRD_READ_PIPES changes nothing, and the
// allowlist IS set in production. Anyone flipping the flag must have read that list.
test('the flag documents every precondition, so flipping it cannot skip one', () => {
  const doc = read('dashboard/src/featureFlags.js')
  for (const needle of ['crawler_hits', 'TINYBIRD_READ_PIPES', 'ai-crawler-range-refresh', 'api_keys']) {
    assert.ok(doc.includes(needle), `featureFlags.js must name ${needle} as a precondition`)
  }
})
