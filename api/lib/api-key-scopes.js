// KI-43 PR A — the `api_keys.scopes` vocabulary. Single source of truth, shared by the
// generate/list routes (api/routes/integrations.js) and the ingest guard
// (api/routes/server-events.js). Do not fork this list.
//
// This is an ARRAY, not a permission system. Exactly four values, deliberately:
//   write:events        — required by POST /api/server/event (enforced, see server-events.js)
//   write:crawler_hits  — required by POST /api/server/crawler-hit (enforced, see
//                         server-crawler-hits.js). See the note below on why this is its
//                         own scope rather than a reuse of write:events.
//   read:diagnostics    — required by the five pipeline-state routes on GET /api/diagnostics/*
//                         (workspace-context, site-health, data-quality, data-flow,
//                         verify-events). Pipeline/installation state only, zero business
//                         metrics — answerable even when the analytics read store is down.
//   read:volume         — required by the two volume routes on GET /api/diagnostics/*
//                         (leads-volume, campaign-volume). Counts/breakdowns of the
//                         customer's own leads and campaigns; no revenue, no cost, no
//                         model choice (docs/mcp_tool_policy.md §3 applies in full).
//
// Both read scopes are enforced in api/middleware/api-key-scope.js + api/routes/diagnostics.js.
// The wider §1.3 goal — key-auth as an ALTERNATIVE mode on the existing user-authed
// /api/analytics endpoints — is still NOT built.
//
// ── Why the read surface is TWO scopes and not one ───────────────────────────────────
// It shipped as a single `read:analytics`, which was removed outright (not deprecated:
// prod api_keys is 0 rows, so no live key held it). docs/mcp_tool_policy.md §5 is the
// decision record. The short version: diagnostics report state that cannot be
// confidently wrong, volume tools report real business metrics, and one undifferentiated
// scope let a future tool widen the second class without any caller noticing the trust
// boundary had moved. A leaked read:volume key must not be describable only as "some
// analytics" — every scope's worst-case leak has to fit in one sentence without the word
// "depends".
//
// Explicitly NOT created without a separate design-gate decision that revisits
// design.md §26: read:revenue, read:attribution, or any catch-all read:* .
//
// ── Why write:crawler_hits is separate, and not implied by write:events ───────────────
// KI-43's MVP vocabulary was two values and this is a deliberate third, added while
// prod `api_keys` is still 0 rows — the same window that made scope enforcement safe to
// introduce at all. Three reasons, in order of weight:
//
//   1. LEAST PRIVILEGE AT A WIDER CREDENTIAL SURFACE. The write:events key lives in a
//      backend SDK. The crawler-hit key lives in the customer's EDGE/origin request path
//      (integrations/express-crawler-middleware.js, and the CDN-worker variants that
//      follow) — more copies, more places, more people. A leaked write:events key can
//      forge `$conversion` rows with arbitrary conversion_value onto the revenue/
//      attribution rail and burn the pageview meter. A leaked write:crawler_hits key can
//      at worst append junk to `crawler_hits`: no revenue, no metering, no attribution,
//      not even a row in `events`. Scoping the wider-deployed credential to the narrower
//      blast radius is the whole point of having scopes.
//   2. THE CREDENTIAL SHOULD NOT CONTRADICT THE DATA MODEL. This entire feature rests on
//      "a crawler fetch is NOT an event" — separate datasource, no dualWriteEvent, no
//      meter (see tinybird/datasources/crawler_hits.datasource). Labelling its write
//      `write:events` would assert the opposite in the auth layer.
//   3. IT IS CHEAP AND REVERSIBLE. Validation is app-only (no DB CHECK constraint) and
//      the column is text[], so this needs NO migration and NO DDL.
//
// Consequence, stated plainly: an existing write:events key gets 403 on /crawler-hit.
// That is intended — write:events does not imply write:crawler_hits, and a customer
// running both surfaces mints two keys. Safe today only because zero keys exist.
//
// ── Siblings, in every direction ──────────────────────────────────────────────────────
// Each scope is checked exactly and none implies another. Concretely, all of these are
// 403s: write:events on /api/diagnostics/*, read:diagnostics on /api/server/event,
// write:events on /api/server/crawler-hit, and — the pair added by the read split —
// read:diagnostics on /leads-volume and read:volume on /site-health. Every one is
// intended. There is no hierarchy in which a "broader" read admits a narrower one.
//
// TWO DIFFERENT DEFAULTS, ON PURPOSE — do not unify them:
//   · DB column default is '{}' (see supabase/migrations/20260722000000_api_keys_scopes_and_revoke.sql,
//     merged at cf18c69). That is the fail-closed BACKSTOP: a non-app INSERT that omits
//     scopes grants nothing, and every guard below denies it.
//   · The APP default for a create that omits `scopes` is ['write:events'] — the useful
//     default for the only consumer that exists today.
// Collapsing these would turn the backstop into a grant.
//
// Validation is APP-ONLY (no DB CHECK constraint). An unrecognised scope is DENIED —
// never ignored, never silently dropped, never coerced to a valid one.

export const SCOPE_WRITE_EVENTS = 'write:events'
export const SCOPE_WRITE_CRAWLER_HITS = 'write:crawler_hits'
export const SCOPE_READ_DIAGNOSTICS = 'read:diagnostics'
export const SCOPE_READ_VOLUME = 'read:volume'

export const VALID_API_KEY_SCOPES = Object.freeze([
  SCOPE_WRITE_EVENTS,
  SCOPE_WRITE_CRAWLER_HITS,
  SCOPE_READ_DIAGNOSTICS,
  SCOPE_READ_VOLUME
])

// App-side default when `scopes` is omitted on create. NOT the DB default — see above.
// write:crawler_hits is deliberately NOT here: adding it would silently widen every key
// created without an explicit `scopes` array, which is the opposite of why it exists.
// It must be asked for.
export const DEFAULT_API_KEY_SCOPES = Object.freeze([SCOPE_WRITE_EVENTS])

// True only when `scopes` is an array that actually contains `required`.
// A null/undefined/missing column (or the '{}' DB default) therefore denies — fail-closed.
export function hasScope (scopes, required) {
  return Array.isArray(scopes) && scopes.includes(required)
}

// Validate a client-supplied `scopes` value for create.
// Returns { ok: true, scopes: string[] } or { ok: false, error: string } — the caller maps
// a failure to 400. Rejects (never sanitises) anything unrecognised.
export function normalizeRequestedScopes (input) {
  if (input === undefined || input === null) {
    return { ok: true, scopes: [...DEFAULT_API_KEY_SCOPES] }
  }

  if (!Array.isArray(input)) {
    return { ok: false, error: 'scopes must be an array of strings' }
  }

  // An explicit [] is rejected rather than honoured: it would mint a key that every guard
  // denies, which reads as a broken token rather than a deliberate choice. Omit `scopes`
  // to get the default instead.
  if (input.length === 0) {
    return { ok: false, error: `At least one scope is required (valid scopes: ${VALID_API_KEY_SCOPES.join(', ')})` }
  }

  const seen = []
  for (const raw of input) {
    if (typeof raw !== 'string') {
      return { ok: false, error: 'scopes must be an array of strings' }
    }
    const scope = raw.trim()
    if (!VALID_API_KEY_SCOPES.includes(scope)) {
      return { ok: false, error: `Unrecognised scope '${scope}' (valid scopes: ${VALID_API_KEY_SCOPES.join(', ')})` }
    }
    if (!seen.includes(scope)) seen.push(scope)
  }

  return { ok: true, scopes: seen }
}
