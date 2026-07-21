// KI-43 PR A — the `api_keys.scopes` vocabulary. Single source of truth, shared by the
// generate/list routes (api/routes/integrations.js) and the ingest guard
// (api/routes/server-events.js). Do not fork this list.
//
// This is an ARRAY, not a permission system. Exactly two values, deliberately:
//   write:events    — required by POST /api/server/event (enforced, see server-events.js)
//   read:analytics  — grantable and stored, reserved for the read REST API.
//                     Enforced by NOTHING today. Do not wire it to an endpoint here.
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
export const SCOPE_READ_ANALYTICS = 'read:analytics'

export const VALID_API_KEY_SCOPES = Object.freeze([SCOPE_WRITE_EVENTS, SCOPE_READ_ANALYTICS])

// App-side default when `scopes` is omitted on create. NOT the DB default — see above.
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
