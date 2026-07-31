// docs/mcp_tool_policy.md §6 — the guard test the policy requires in order to be a policy
// at all. It reads the REAL `TOOLS` array exported by mcp/server.js, the same way
// api/tests/capi-config.test.js reads the real CAPI_PLATFORMS.
//
// ── Why this exists as a mechanism rather than a review checklist ────────────────────
// Prose has already drifted once here: #498's GA4/TikTok CapiDeliveryStatus omission
// shipped silently until a later PR added a guard test for it. The policy's own §6 says a
// policy change whose guard test is not also updated did not happen. Four rules, all
// enforced below, none optional.
//
// ── Why every rule runs twice ───────────────────────────────────────────────────────
// A guard that cannot be SHOWN to fail is not a guard — §6 asks for that proof by
// mutation. A mutation performed by hand once, during review, leaves nothing behind: the
// next person has only a sentence in a PR description claiming it was done. So each rule
// is a pure function, and each is run against two inputs: the real TOOLS array (must
// pass) and a deliberately-broken fixture carrying exactly the violation that rule exists
// to catch (must fail). The proof is permanent and re-runs on every CI job.
//
// ── One scoping decision worth stating, because it differs from a literal read of §6 ──
// §6's bullet says "no tool's inputSchema includes a site_id, site_key, or
// attribution_model/model property". Applied to EVERY tool that would be wrong and the
// suite would be red today for a legitimate reason: detect_platform, get_install_snippet
// and verify_installation are AUTH_NONE/AUTH_USER_JWT install-support tools whose entire
// job is to act on a site the caller names — site_key IS their argument. The rule §3.5
// actually states is about key-authed tools: "Every AUTH_API_KEY tool resolves site from
// the key server-side; none accepts site_id/site_key as a caller argument." So:
//   · site_id / site_key      — banned on AUTH_API_KEY tools (the tenancy boundary).
//   · attribution_model/model — banned on EVERY tool, no exception (§3.3: no tool may
//                               take a caller-supplied model, whatever its auth model).

import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOLS, processRpcMessage } from '../../mcp/server.js'
import { AUTH_API_KEY } from '../../mcp/lib/tools.js'
import {
  SCOPE_READ_DIAGNOSTICS,
  SCOPE_READ_VOLUME,
  VALID_API_KEY_SCOPES
} from '../lib/api-key-scopes.js'

const READ_SCOPES = [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME]

// Fields a tool must never take from the caller, split by which tools the ban applies to.
const TENANCY_ARGS = ['site_id', 'site_key']
const MODEL_ARGS = ['attribution_model', 'model']

// §3.1/§3.2 vocabulary. Matched case-insensitively on word boundaries so "ROAS" and
// "roas" both count and "across" does not.
const FINANCIAL_TERMS = ['revenue', 'ROAS', 'CPL', 'CAC', 'MRR', 'AOV']

// Words that turn a mention into a disclaimer. §6 asks the test to assert the NEGATION
// pattern the shipped descriptions already use ("Volume only: returns no revenue, no cost
// …"), not merely that the word is absent — absence would also be satisfied by a
// description that silently dropped its own limits.
const NEGATORS = /\b(no|not|never|without|neither|nor|zero)\b/i

// How far back to look for a negator. Long enough to cover "there is no revenue, cost,
// ROAS or CPL column" (the negator governs a list), short enough that an unrelated "not"
// in a previous sentence cannot launder a bare financial claim.
const NEGATION_WINDOW = 60

// ── the four rules, as pure functions ────────────────────────────────────────────────
// Each returns an array of human-readable violations. Empty array = compliant.

export function checkScopeDeclarations (tools) {
  const bad = []
  for (const tool of tools) {
    const declares = Object.prototype.hasOwnProperty.call(tool, 'scope')
    if (tool.auth === AUTH_API_KEY) {
      // "No tool silently defaults to a scope" — the property must be PRESENT, so a tool
      // added without one fails here instead of inheriting whatever a default would be.
      if (!declares) { bad.push(`${tool.name}: AUTH_API_KEY tool declares no scope`); continue }
      if (!READ_SCOPES.includes(tool.scope)) {
        bad.push(`${tool.name}: scope '${tool.scope}' is not one of ${READ_SCOPES.join(' / ')}`)
      }
      // Non-forking: the value must also be in the api_keys vocabulary that the routes
      // actually enforce. A scope declared here but absent there describes an endpoint
      // check that does not exist.
      if (!VALID_API_KEY_SCOPES.includes(tool.scope)) {
        bad.push(`${tool.name}: scope '${tool.scope}' is not in VALID_API_KEY_SCOPES`)
      }
    } else if (declares) {
      // A scope on a tool that never presents an API key is decoration that reads as a
      // guarantee. There is nothing to enforce it.
      bad.push(`${tool.name}: declares a scope but its auth model is ${tool.auth}`)
    }
  }
  return bad
}

export function checkForbiddenArgs (tools) {
  const bad = []
  for (const tool of tools) {
    const props = Object.keys(tool.inputSchema?.properties || {})
    for (const arg of MODEL_ARGS) {
      if (props.includes(arg)) bad.push(`${tool.name}: accepts '${arg}' — no tool may take a caller-supplied model (§3.3)`)
    }
    if (tool.auth !== AUTH_API_KEY) continue
    for (const arg of TENANCY_ARGS) {
      if (props.includes(arg)) bad.push(`${tool.name}: accepts '${arg}' — the API key is the tenant (§3.5)`)
    }
  }
  return bad
}

export function checkDescriptionDisclaimers (tools) {
  const bad = []
  for (const tool of tools) {
    // Each description is scanned as its OWN string, never concatenated. Measured while
    // writing this: joining the tool description to its argument descriptions let a
    // disclaimer in the first ("Volume only: no revenue, no cost.") sit inside the
    // negation window of a bare claim in the second ("Sort by AOV descending"), so the
    // guard passed on a tool that promised AOV. A negator only ever qualifies the string
    // it appears in.
    const segments = [
      ['description', tool.description || ''],
      ...Object.entries(tool.inputSchema?.properties || {}).map(([k, p]) => [`inputSchema.${k}`, p.description || ''])
    ]
    for (const [where, text] of segments) {
      for (const term of FINANCIAL_TERMS) {
        const re = new RegExp(`\\b${term}\\b`, 'gi')
        let m
        while ((m = re.exec(text)) !== null) {
          const before = text.slice(Math.max(0, m.index - NEGATION_WINDOW), m.index)
          if (!NEGATORS.test(before)) {
            bad.push(`${tool.name}: ${where} mentions '${m[0]}' without a negation — "${text.slice(Math.max(0, m.index - 40), m.index + 20).trim()}"`)
          }
        }
      }
    }
  }
  return bad
}

const ALL_RULES = [
  ['scope declarations', checkScopeDeclarations],
  ['forbidden arguments', checkForbiddenArgs],
  ['description disclaimers', checkDescriptionDisclaimers]
]

// ── 1. the real array complies ───────────────────────────────────────────────────────

test('🔴 the shipped TOOLS array satisfies every mcp_tool_policy.md §6 rule', () => {
  for (const [label, rule] of ALL_RULES) {
    assert.deepEqual(rule(TOOLS), [], `${label}: ${rule(TOOLS).join(' | ')}`)
  }
})

// Non-vacuity for the rules themselves: if TOOLS ever lost its AUTH_API_KEY tools, every
// rule above would pass by having nothing to check.
test('🔴 the fixture under test is non-vacuous: key-authed tools exist and are split across BOTH scopes', () => {
  const keyed = TOOLS.filter(t => t.auth === AUTH_API_KEY)
  assert.ok(keyed.length >= 7, `expected at least 7 AUTH_API_KEY tools, found ${keyed.length}`)
  const byScope = {}
  for (const t of keyed) (byScope[t.scope] ||= []).push(t.name)
  assert.deepEqual(byScope[SCOPE_READ_DIAGNOSTICS].sort(), [
    'debug_data_flow', 'get_data_quality', 'get_site_health', 'get_workspace_context', 'verify_events'
  ])
  assert.deepEqual(byScope[SCOPE_READ_VOLUME].sort(), ['get_campaign_volume', 'get_leads_volume'])
  assert.deepEqual(Object.keys(byScope).sort(), [...READ_SCOPES].sort(), 'no third scope on this surface')
})

// ── 2. the MUTATION PROOF, kept rather than performed once ───────────────────────────
// Each case is the exact regression its rule exists to catch. If a rule is ever weakened
// into a tautology, its case here stops failing and this test goes red.

const MUTATIONS = [
  {
    label: 'a new key-authed tool that forgot to declare a scope',
    rule: checkScopeDeclarations,
    tool: { name: 'get_new_thing', auth: AUTH_API_KEY, description: 'counts', inputSchema: { type: 'object', properties: {} } }
  },
  {
    label: 'a key-authed tool declaring a scope outside the two-value set',
    rule: checkScopeDeclarations,
    tool: { name: 'get_everything', auth: AUTH_API_KEY, scope: 'read:analytics', description: 'counts', inputSchema: { type: 'object', properties: {} } }
  },
  {
    label: 'a key-authed tool that accepts site_id (cross-tenant read)',
    rule: checkForbiddenArgs,
    tool: {
      name: 'get_other_site',
      auth: AUTH_API_KEY,
      scope: SCOPE_READ_VOLUME,
      description: 'counts',
      inputSchema: { type: 'object', properties: { site_id: { type: 'string', description: 'which site' } } }
    }
  },
  {
    label: 'a tool that reintroduces a caller-supplied attribution_model',
    rule: checkForbiddenArgs,
    tool: {
      name: 'get_modelled',
      auth: AUTH_API_KEY,
      scope: SCOPE_READ_VOLUME,
      description: 'counts',
      inputSchema: { type: 'object', properties: { attribution_model: { type: 'string', description: 'last_touch' } } }
    }
  },
  {
    // §6's own worked example: add a revenue-shaped claim and confirm the guard fails.
    label: 'a tool whose description promises revenue',
    rule: checkDescriptionDisclaimers,
    tool: {
      name: 'get_revenue_by_source',
      auth: AUTH_API_KEY,
      scope: SCOPE_READ_VOLUME,
      description: 'Returns revenue and ROAS per source over a window.',
      inputSchema: { type: 'object', properties: {} }
    }
  },
  {
    label: 'a revenue claim hidden in an ARGUMENT description rather than the tool description',
    rule: checkDescriptionDisclaimers,
    tool: {
      name: 'get_sneaky',
      auth: AUTH_API_KEY,
      scope: SCOPE_READ_VOLUME,
      description: 'Volume only: no revenue, no cost.',
      inputSchema: { type: 'object', properties: { sort: { type: 'string', description: 'Sort by AOV descending' } } }
    }
  }
]

for (const { label, rule, tool } of MUTATIONS) {
  test(`🔴 MUTATION — ${label} is CAUGHT`, () => {
    const mutated = [...TOOLS, tool]
    const violations = rule(mutated)
    assert.ok(violations.length > 0, 'the rule must reject this tool — a guard that cannot fail is not a guard')
    assert.ok(
      violations.some(v => v.startsWith(`${tool.name}:`)),
      `the violation must name the offending tool, got: ${violations.join(' | ')}`
    )
    // And it must fail for THIS tool only — a rule that rejects everything is equally useless.
    assert.deepEqual(rule(TOOLS), [], 'the same rule must still pass on the real array')
  })
}

// ── 3. the declaration stays internal ────────────────────────────────────────────────
// `scope` is routing metadata like `auth`. Leaking it would put a SourceTrack-internal
// vocabulary into a published tool contract, where a client could start depending on it.

test('🔴 tools/list exposes neither `auth` nor `scope`', () => {
  const res = processRpcMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  for (const tool of res.result.tools) {
    assert.ok(!('auth' in tool), `${tool.name} leaked its internal auth field`)
    assert.ok(!('scope' in tool), `${tool.name} leaked its internal scope field`)
  }
  // …while the scope a caller must actually hold stays discoverable where it belongs: the
  // api_key argument description, which IS part of the contract.
  for (const tool of res.result.tools) {
    const keyArg = tool.inputSchema?.properties?.api_key
    if (!keyArg) continue
    assert.match(
      keyArg.description,
      new RegExp(READ_SCOPES.join('|')),
      `${tool.name}: its api_key description must name the scope the key needs`
    )
  }
})

// The api_key descriptions must agree with the declaration — otherwise a caller mints a
// key for the scope the text names and gets a 403 from the scope the route enforces.
test('🔴 every key-authed tool\'s api_key description names ITS OWN declared scope', () => {
  for (const tool of TOOLS.filter(t => t.auth === AUTH_API_KEY)) {
    const desc = tool.inputSchema?.properties?.api_key?.description || ''
    assert.ok(desc.includes(tool.scope), `${tool.name}: declares ${tool.scope} but its api_key description does not say so`)
    const other = READ_SCOPES.find(s => s !== tool.scope)
    // The other scope may appear only as an explicit refusal ("a read:diagnostics key is
    // NOT accepted here"), never as an alternative the caller could supply.
    if (desc.includes(other)) {
      assert.match(desc, new RegExp(`${other}[^.]*\\bNOT\\b`), `${tool.name}: mentions ${other} without refusing it`)
    }
  }
})
