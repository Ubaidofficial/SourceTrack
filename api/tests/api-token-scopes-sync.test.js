// ANTI-DRIFT: the dashboard's scope checkboxes vs the server's scope vocabulary.
//
// ── The regression this file exists to make impossible ───────────────────────────────
// The mint modal (Settings → Advanced → API tokens) is the ONLY surface where a customer
// can issue an API key, and the scopes it offers were a hand-maintained array in
// dashboard/src/pages/Settings.jsx guarded by nothing but a comment reading "must stay in
// sync with VALID_API_KEY_SCOPES".
//
// That comment failed as enforcement. #523 split `read:analytics` into `read:diagnostics`
// + `read:volume` and removed the old value from the vocabulary outright; its grep
// excluded *.jsx, so the modal was left offering the REMOVED scope and NEITHER
// replacement. Two live consequences, and the second is the severe one:
//   1. Checking `read:analytics` 400s on submit — validation is app-only and rejects
//      (never sanitises) an unrecognised scope, api/lib/api-key-scopes.js.
//   2. Every API-key-authed MCP tool was UNREACHABLE for every customer. All seven declare
//      read:diagnostics or read:volume, the guard requires the exact scope, and no mint
//      surface could grant either. Working server, working tools, no issuable credential.
//
// A comment cannot fail CI. These tests can, so the list moved to
// dashboard/src/lib/apiTokenScopes.js (importable by node --test, which cannot load JSX)
// and is pinned here BY IMPORT of both sides.
//
// ── Why the UI array is a copy at all ────────────────────────────────────────────────
// dashboard/src may not import api/: Railway builds the Dashboard with
// rootDirectory=/dashboard (#252, and api/tests/dashboard-build-root.test.js). The
// duplication is forced by build topology, so the anti-drift mechanism has to be a test.
// This is the same arrangement as dashboard/src/lib/gate-constants.js.
//
// ── Direction matters ────────────────────────────────────────────────────────────────
// Set EQUALITY, not "the UI is a subset". A subset assertion passes while a newly added
// scope is unmintable — which is exactly the bug above, and it would have stayed green.

import test from 'node:test'
import assert from 'node:assert/strict'

import { API_TOKEN_SCOPES } from '../../dashboard/src/lib/apiTokenScopes.js'
import { VALID_API_KEY_SCOPES } from '../lib/api-key-scopes.js'
import { TOOLS } from '../../mcp/server.js'
import { AUTH_API_KEY } from '../../mcp/lib/tools.js'

const offered = API_TOKEN_SCOPES.map(s => s.value)

// ── 1. The pin the founder asked for: set equality, both directions ──────────────────

test('🔴 the UI offers EXACTLY the server vocabulary — no missing scope, no removed one', () => {
  assert.deepStrictEqual(
    [...offered].sort(),
    [...VALID_API_KEY_SCOPES].sort(),
    'dashboard/src/lib/apiTokenScopes.js has drifted from VALID_API_KEY_SCOPES'
  )
})

test('🔴 every offered scope is actually mintable (would not 400 on submit)', () => {
  for (const value of offered) {
    assert.ok(
      VALID_API_KEY_SCOPES.includes(value),
      `the modal offers '${value}', which the create route rejects with a 400`
    )
  }
})

test('🔴 every server scope is reachable from the modal (the only mint surface)', () => {
  for (const scope of VALID_API_KEY_SCOPES) {
    assert.ok(
      offered.includes(scope),
      `'${scope}' is valid server-side but no checkbox offers it — it cannot be minted at all`
    )
  }
})

// The specific value that regressed. Named explicitly so the failure message says what
// happened rather than just printing two arrays.
test('🔴 the REMOVED read:analytics scope is not offered', () => {
  assert.ok(!offered.includes('read:analytics'), 'read:analytics was removed in #523 and 400s on submit')
})

// ── 2. The severe half: every MCP tool's scope must be mintable ──────────────────────
// Derived from the real TOOLS declarations rather than a copied list, so a NEW key-authed
// MCP tool introducing a new scope fails here until the modal can grant it.

test('🔴 every scope an API-key MCP tool requires is offered by the modal', () => {
  const keyTools = TOOLS.filter(t => t.auth === AUTH_API_KEY)
  assert.ok(keyTools.length >= 7, `expected at least 7 key-authed MCP tools, found ${keyTools.length}`)

  for (const tool of keyTools) {
    assert.ok(
      offered.includes(tool.scope),
      `MCP tool '${tool.name}' requires '${tool.scope}', which no checkbox offers — the tool is unusable`
    )
  }
})

// Non-vacuity. If TOOLS ever stopped declaring the read scopes, the test above would pass
// trivially; this pins the fact that both read scopes are genuinely load-bearing for MCP.
test('🔴 both read scopes are genuinely required by MCP tools (the check above is not vacuous)', () => {
  const required = new Set(TOOLS.filter(t => t.auth === AUTH_API_KEY).map(t => t.scope))
  assert.ok(required.has('read:diagnostics'), 'no MCP tool requires read:diagnostics')
  assert.ok(required.has('read:volume'), 'no MCP tool requires read:volume')
})

// ── 3. Shape — the array drives a rendered checkbox list ─────────────────────────────

test('🔴 every entry has a non-empty description and there are no duplicates', () => {
  assert.strictEqual(new Set(offered).size, offered.length, 'a scope is listed twice')
  for (const s of API_TOKEN_SCOPES) {
    assert.strictEqual(typeof s.value, 'string')
    assert.ok(s.description && s.description.trim().length > 0, `${s.value} renders with no description`)
  }
})

// NOTE — deliberately NOT asserted here: that no description "claims one scope implies
// another". That is a real §6 truthfulness requirement, but a regex over English prose
// cannot express it. The first attempt matched /campaign/ inside read:diagnostics's own
// DISCLAIMER ("No traffic, revenue or campaign figures") and failed a correct string.
// Wording accuracy stays a review concern; a test that fires on the negation is worse
// than no test.
