#!/usr/bin/env node
// FEATURE_MAP freshness guard — the check FEATURE_MAP.md's own header recommends
// ("fail when api/routes/** or dashboard/src/pages/** changes without FEATURE_MAP.md").
//
// ⚠️ THIS CHECK CANNOT SHIP ALONE. FEATURE_MAP.md is a *.md file, and CLAUDE.md §9 rule 3
// requires the session-doc (*.md) diff to be EMPTY. A PR that updates the map fails rule 3;
// one that skips it fails this guard. The two are a direct contradiction, not a race. The
// §9 carve-out proposed alongside this file is what makes the pair satisfiable — if that
// carve-out is not accepted, this guard must not be enabled.
//
// ── WHY IT IS ADVISORY BY DEFAULT ────────────────────────────────────────────────────
// Measured against the last 30 merged PRs (#661–#691): the trigger fires on 5, and only
// ONE (#676, accepting click IDs on /api/server-events) was a capability change the map
// should record. The other four were a log-only boolean (#684), two bot-filter fixes
// (#666, #667) and a display refactor (#686). That is a ~80% false-positive rate on a
// BLOCKING check, and a blocking check that is wrong four times in five gets bypassed as
// routine — which converts a known gap into a false sense of coverage, strictly worse than
// no check. So the default is WARN. Set FEATURE_MAP_GUARD=block to enforce.
//
// The escape hatch is deliberate and deliberately NOISY: a PR may declare
// `feature-map: n/a — <reason>` in its body. That turns a silent skip into a recorded
// decision, and the count of those lines is the evidence needed to re-scope the path list
// later. A guard nobody can opt out of gets disabled; a guard whose opt-outs are counted
// gets tuned.

import { execSync } from 'node:child_process'

export const TRIGGER_PATHS = [
  /^api\/routes\//,
  /^dashboard\/src\/pages\//
]

export const MAP = 'FEATURE_MAP.md'
const OPT_OUT = /feature-map:\s*n\/a\s*[—-]\s*\S/i

// Pure, so the controls below can exercise it without touching git.
export function evaluate (changedFiles, prBody = '') {
  const triggered = changedFiles.filter(f => TRIGGER_PATHS.some(re => re.test(f)))
  const mapUpdated = changedFiles.includes(MAP)
  const optedOut = OPT_OUT.test(prBody)
  return {
    triggered,
    mapUpdated,
    optedOut,
    // The map is only DEMANDED when a trigger path changed, the map did not, and no
    // reason was recorded.
    violation: triggered.length > 0 && !mapUpdated && !optedOut
  }
}

function changedFilesFromGit (base) {
  const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' })
  return out.split('\n').map(s => s.trim()).filter(Boolean)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = process.env.GUARD_BASE || 'origin/main'
  const body = process.env.PR_BODY || ''
  const files = process.env.GUARD_FILES
    ? process.env.GUARD_FILES.split(',').map(s => s.trim()).filter(Boolean)
    : changedFilesFromGit(base)

  const r = evaluate(files, body)
  const blocking = process.env.FEATURE_MAP_GUARD === 'block'

  if (!r.triggered.length) {
    console.log('feature-map-guard: no trigger paths changed — nothing to check')
    process.exit(0)
  }
  if (r.mapUpdated) {
    console.log(`feature-map-guard: OK — ${r.triggered.length} trigger path(s) changed and ${MAP} was updated`)
    process.exit(0)
  }
  if (r.optedOut) {
    console.log(`feature-map-guard: OPT-OUT RECORDED — ${r.triggered.length} trigger path(s) changed, ${MAP} not updated`)
    console.log('  a "feature-map: n/a — <reason>" line was found in the PR body. Counted, not silent.')
    process.exit(0)
  }

  console.error(`feature-map-guard: ${MAP} was NOT updated, but these changed:`)
  for (const f of r.triggered) console.error(`  - ${f}`)
  console.error('')
  console.error(`Either update ${MAP} in this PR, or record why not with a line in the PR body:`)
  console.error('  feature-map: n/a — <reason>')
  console.error('')
  console.error(`Updating ${MAP} requires the CLAUDE.md §9 rule-3 carve-out to be in force.`)
  process.exit(blocking ? 1 : 0)
}
