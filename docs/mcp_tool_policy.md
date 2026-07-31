# MCP Tool Policy & Scope Model (Phase 0)

**Version:** 0.2 (hardened pass — see Changelog)
**Status:** DRAFT — for founder review before any transport/deployment work begins.
**Owner:** decided by founder; enforced in code, not by review discipline alone (§6).
**Supersedes:** nothing. Formalizes discipline already present in `mcp/lib/tools.js`
tool descriptions; changes no shipped tool's behavior.
**Governs:** every current and future tool in `mcp/server.js`, regardless of transport
(stdio today; HTTP/SSE hosting is explicitly Phase 1+, not started).

**Document control:** this file is the durable copy, per the convention already
established in `post_verdict_roadmap.md`'s own header — *"if a decision here is
superseded, edit this file; do not leave the correction in a chat."* Any change to
Section 3 (denylist) or Section 5 (scope model) requires updating the Section 6
guard test in the same PR. A policy change whose guard test is not also updated
did not happen.

---

## 0. Why this exists

`mcp/server.js` ships 7 `AUTH_API_KEY` tools today — 5 diagnostic
(`get_workspace_context`, `get_site_health`, `get_data_quality`, `debug_data_flow`,
`verify_events`) and 2 volume (`get_leads_volume`, `get_campaign_volume`). When this
document was drafted **all 7 declared the same scope string, `read:analytics`** (in
`mcp/server.js`'s `TOOLS` array and `api/lib/api-key-scopes.js`). §5's split has since
landed: the 5 diagnostics declare `read:diagnostics`, the 2 volume tools declare
`read:volume`, `read:analytics` was removed from the vocabulary outright, and §6's guard
test is `api/tests/mcp-tool-policy-guard.test.js`. The rationale below is kept in the
present tense as the decision record. Diagnostics report pipeline
state that cannot be confidently wrong (`post_verdict_roadmap.md` §1.5's own
rationale); volume tools report real business metrics. Nothing but the tool
author's care distinguishes them today. Fine for 7 hand-reviewed tools. Not fine
the moment a tool ships without that care, or `read:analytics` is handed to an
external integration (Phase 1+) that assumes the name describes a narrow surface.

## 1. Threat model — who this protects against, and what a leak actually costs

Stated explicitly because a policy that doesn't name its adversary tends to
protect against the wrong one.

| Scenario | Blast radius under this policy | Blast radius without it |
|---|---|---|
| A `read:diagnostics` key leaks | Pipeline health/config for one site. No customer business data. | Same — this class was always narrow. |
| A `read:volume` key leaks | Lead/campaign **counts** for one site, first-touch only, no PII, no revenue. | Under one undifferentiated `read:analytics` scope, a future tool could widen this without a caller ever noticing the trust boundary moved. |
| A hosted MCP endpoint (Phase 1+) is scraped/abused | Bounded per-scope, per-site, rate-limited (§7 makes this a Phase-1 precondition, not a retrofit). | Unbounded — coarse scopes plus no rate limit is the failure mode this doc exists to prevent before it ships, not after. |
| An agent is prompt-injected via tool output it renders elsewhere | Cannot be tricked into leaking revenue/attribution it was never given (§3 is a source-level guarantee, not an output filter the agent could be talked around). | An agent holding real revenue numbers is one convincing prompt away from repeating them somewhere they shouldn't be. |

**Design principle:** every tool's worst-case leak must be describable in one
sentence without the word "depends." If it can't be, the tool is scoped wrong.

## 2. Authority this doc extends, not replaces

This is design.md §26 ("Active V1 Prohibited Elements") and §5 (data-truth rules)
restated for a client type that can't read an empty-state message: an LLM agent
consuming structured JSON. It does not invent new product rules. Where this doc
and design.md ever appear to disagree, design.md wins and this file is wrong.

## 3. Hard denylist — no tool response may ever contain, in any field, nested or not

1. **Revenue or value in any unit** — `revenue`, `conversion_value`, `MRR`, `AOV`,
   `revenue_per_visitor`, `revenue_per_lead`, pipeline value, any currency-
   denominated field. No exceptions — not even design.md §5.4-style "estimated,
   GSC-matched" revenue with a truth label. An MCP client can't render a label;
   the only correct mitigation is exclusion.
2. **Cost-derived metrics** — `ROAS`, `CPL`, `CAC`, ad spend, budget, net profit,
   payback period. Hidden, never zero, never a dash (§5.3).
3. **Attribution-model-dependent numbers.** A tool may *state* the touch model
   it used (`"touch":"first"`, the shipped convention). It may never accept a
   caller-supplied model argument, and never return a value that changes by
   model without saying so in the same response. No tool accepts an
   `attribution_model` parameter today; that must stay true.
4. **LLM-narrated recommendations, predictions, or "insights."** No fake
   recommendations, no predictive score, no analyzer, no model-version label
   (§26). A tool returns facts an agent reasons over; it does not pre-reason.
   Same line that keeps this product out of the `analyze_report`-style surface
   `post_verdict_roadmap.md` §5 rejects outright for Cometly-parity reasons.
5. **Cross-tenant data.** Every `AUTH_API_KEY` tool resolves site from the key
   server-side; none accepts `site_id`/`site_key` as a caller argument (verified:
   0 of 7 do). New tools must not introduce one (§6.5).
6. **Secrets or credentials** — API keys, tokens, webhook secrets, raw `site_key`.
   A diagnostic tool may report *whether* something is configured, never its value.
7. **Internal error detail.** A tool error must never leak a stack trace,
   internal hostname/path, SQL fragment, or env-var name. `verify_events`'s
   `READ_STORE_UNAVAILABLE` — a named, closed-form error — is the reference
   shape; a caught exception's raw `.message` is not an acceptable substitute.
8. **Visitor-level PII** — name, email, raw IP, raw `distinct_id` presented as
   an identity rather than an opaque key. Not currently at risk (both volume
   tools are pre-aggregated), but stated explicitly so it can never arrive by
   accident in a future tool. See §8 for a related, *unresolved* question this
   does not fully close.

## 4. Required disclosure — every business-metric tool must self-describe its limits

A positive requirement, not a denylist item, because the two shipped volume
tools already do this well and it should stop being optional going forward:

- State the touch/attribution convention inline on every response
  (`"touch":"first"`), not only in the tool description.
- State that a breakdown is a **complete partition** — untagged traffic gets
  its own bucket (e.g. `"(untagged)"`), never a silently dropped row.
- State units explicitly where two similar counts could be confused (e.g.
  `distinct_leads` vs `breakdown.total` — already documented as "different
  units, not expected to match" in the shipped description; that sentence is
  the pattern, not a one-off).
- Fail closed, never fake-zero, on a broken read store. `verify_events`'s
  `READ_STORE_UNAVAILABLE` is the reference implementation: a SourceTrack-side
  outage must never render as "the customer has no data."

## 5. Scope-granularity model

**Decision: split `read:analytics` now — before any tool relies on its current
coarseness, and before Phase 1 hosting exposes it to an external auth flow.**

| Scope | Covers | Tools today |
|---|---|---|
| `read:diagnostics` | Pipeline/installation state only. Zero business metrics. Answerable even when the analytics read store is down. | `get_workspace_context`, `get_site_health`, `get_data_quality`, `debug_data_flow`, `verify_events` |
| `read:volume` | Counts/breakdowns of the customer's own leads/campaigns. No revenue, cost, or model choice — §3 applies in full. | `get_leads_volume`, `get_campaign_volume` |

**Explicitly not created without a separate design-gate decision that revisits
design.md §26:** `read:revenue`, `read:attribution`, or any scope broader than
the two above. A catch-all `read:*` is the exact accidental-coarseness failure
mode this document exists to prevent.

**Mechanism:** rides on the already-locked `api_keys` scopes plan
(`post_verdict_roadmap.md` §1.1, `KNOWN_ISSUES.md` KI-43 —
`scopes text[] NOT NULL DEFAULT '{}'`, deny-by-default). This is a scope-list
amendment, not new infrastructure — `hasScope()` in
`api/middleware/api-key-scope.js` needs no shape change.

**Cheapest possible moment to do this:** prod `api_keys` is 0 rows (verified,
`post_verdict_roadmap.md` §1.2). Re-declaring the 2 volume tools from
`read:analytics` to `read:volume` costs nothing today and only grows from here.

## 6. Enforcement — required before this policy merges, not optional follow-up

Prose alone has already drifted once in this codebase (#498's GA4/TikTok
CapiDeliveryStatus omission shipped silently until a later PR added a guard
test for it). This policy does not get to make the same mistake. One guard
test, added in the same PR that lands this document, must assert — by reading
the real `TOOLS` array in `mcp/server.js` as source, the same pattern
`capi-config.test.js` and `test-registration-guard.test.js` already use:

- [ ] Every `AUTH_API_KEY` tool declares exactly one of `read:diagnostics` /
      `read:volume`. No third value. No tool silently defaults to a scope.
- [ ] No tool's `inputSchema` includes a `site_id`, `site_key`, or
      `attribution_model`/`model` property.
- [ ] A keyword scan of every tool's `description` string contains none of:
      `revenue`, `ROAS`, `CPL`, `CAC`, `MRR`, `AOV` — descriptions that need to
      *disclaim* these (as `get_leads_volume`'s does) must do so using the
      negation pattern already shipped ("no revenue, no cost..."), and the
      test should assert the negation, not just the keyword's absence.
- [ ] Mutation-verify it the way `#498`'s guard was proven: temporarily add a
      `revenue` field to a fixture tool response and confirm the test fails.
      A guard that cannot be shown to fail is not a guard.

## 7. Audit logging & key lifecycle

- **Log per call:** site (resolved from key), tool name, scope, timestamp,
  success/failure. Reuse the `last_used_at` touch already implemented in
  `api/middleware/api-key-scope.js` (per #503) — this is additive to an
  existing mechanism, not new plumbing.
- **Never log:** raw tool arguments beyond the above (a future tool's argument
  could carry customer-supplied text), or the API key itself beyond its stored
  prefix.
- **Sequencing dependency, stated plainly:** `KNOWN_ISSUES.md` KI-43 PR B (soft
  revoke) and PR C (rate limit + per-site cap) are already planned but **not
  yet built** (`post_verdict_roadmap.md` §1.1). A hosted, more widely
  distributed MCP endpoint (Phase 1+) raises the real-world cost of a leaked
  key. **Recommendation: PR B and PR C land before Phase 1 transport work
  starts, not after.** This doc's scope split reduces blast radius; it does not
  substitute for the ability to actually revoke or throttle a leaked key.

## 8. PII / re-identification — flagged, not resolved

**Open question, deliberately not decided in this document:** a `read:volume`
breakdown fine enough (e.g. a campaign with exactly one lead) can re-identify
an individual even though no name/email field is ever returned. Whether to
suppress or bucket counts below some minimum (the pattern several analytics
products use for small cells) is a real privacy-engineering decision this
product's own privacy-conscious positioning should probably make deliberately —
but I don't have evidence for what threshold would be appropriate here, and
picking one without that evidence would be exactly the kind of unfounded
specific number this doc's own epistemic standard argues against elsewhere.
**Recommendation:** treat as a founder decision before `read:volume` tools are
ever exposed outside hand-issued keys (i.e., before Phase 1 packaging), not
before this document merges.

## 9. What Phase 0 does not decide

- Remote transport (HTTP/SSE), hosted auth flow, rate limiting mechanics, or a
  public tool registry listing — Phase 1+, and per §7, gated on KI-43 PR B/C.
- Whether/when to build `inspect_site` / `get_pixel_status`
  (`post_verdict_roadmap.md` §3.2) — new tools get scoped under this policy
  when proposed, not pre-approved here.
- The `api_keys` packaging decision (`post_verdict_roadmap.md` §1.2) — who can
  hold a key at all remains a separate founder-level call.
- §8's suppression-threshold question.

## 10. Acceptance checklist for every future MCP tool PR

- [ ] Declares exactly one of `read:diagnostics` / `read:volume`, or is
      `AUTH_NONE`/`AUTH_USER_JWT` with a documented reason (matching
      `detect_platform`/`get_install_snippet`/`verify_installation`'s pattern).
- [ ] Tool description states, in the description text itself, which §3
      categories it does not return.
- [ ] No `site_id`/`site_key`/model-choice argument accepted.
- [ ] Fails closed with a named error on a broken read store; never a fake
      empty/zero result.
- [ ] Any count/breakdown states units and partition completeness inline (§4).
- [ ] §6's guard test passes and was mutation-verified for this tool
      specifically, not just re-run.

---

## Changelog

- **0.2** — added Threat model (§1), Enforcement/guard-test spec (§6), Audit
  logging & key-lifecycle sequencing (§7), PII/re-identification flag (§8),
  document-control rule, and error-detail + PII denylist items. Founder asked
  for enterprise-level rigor; this pass adds the parts a denylist alone can't
  cover — how it's enforced, what it costs when it fails, and what it
  deliberately still leaves open.
- **0.1** — initial draft: denylist, required disclosure, scope split.
