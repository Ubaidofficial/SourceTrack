// Volunteered-identity persistence (V1 Named Contacts).
//
// The ONLY writer of public.volunteered_identity. Callers: api/routes/identify.js
// (the live first-party identify() channel) and the demo seeder, which calls the
// SAME function so the seed exercises the real capture code, not a hand-rolled insert.
//
// PRIVACY: name/email are persisted ONLY from the volunteered identify() channel.
// This is a two-field allowlist with validation — NEVER a traits blob or arbitrary
// body passthrough. /api/identify is scrubber-free by construction (CORS +
// rate-limit + validateSiteKey only), so an unvalidated passthrough here would
// store whatever the caller sent. Keep this narrow.

import { getSupabase } from './supabase.js'
// CIRCULAR BY DESIGN, and safe only because of how both sides are written: this module imports
// isErasureSuppressed from erasure-suppression.js, which imports normalizeVolunteeredEmail back
// from here. Both are `export function` DECLARATIONS, so ESM hoists them and each side resolves
// regardless of which loads first. Converting either to `export const fn = () => …` would turn
// this into a temporal-dead-zone crash at require time — there is a test that loads both orders
// to catch exactly that.
//
// The cycle is deliberate rather than incidental: the suppression hash MUST be taken over the
// same normalisation this module applies before writing, or the check silently never matches.
// Duplicating the normaliser to break the cycle would trade a visible import edge for an
// invisible drift bug.
import { isErasureSuppressed, logSuppressionBlocked } from './erasure-suppression.js'

const MAX_NAME_LEN = 128

// Same accept/reject boundary as identify.js's normalizeEmailForHash (identify.js:10-16):
// trim + lowercase, reject empty / > 254 chars / non-email. Kept as its own copy here
// rather than imported from the route — a lib must not depend on a route (that would be a
// backwards, cycle-forming dependency). The regex is intentionally identical.
export function normalizeVolunteeredEmail(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase()
  if (cleaned.length === 0 || cleaned.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null
  return cleaned
}

// Trim, collapse to null when empty, cap length. No HTML/script stripping is
// needed for a stored value that is only ever rendered as text in the dashboard
// (React escapes by default); the cap is abuse control, not sanitization.
export function normalizeVolunteeredName(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (cleaned.length === 0) return null
  return cleaned.slice(0, MAX_NAME_LEN)
}

// Validate + persist volunteered identity for one visitor. Upserts on
// (site_id, distinct_id) so repeat identify() calls refresh rather than duplicate.
// Returns { written: bool, email: string|null, name: string|null } — `written`
// is false when NEITHER field validated (nothing worth a row). Never throws into
// the caller's response path: identify() is fire-and-forget, so a persistence
// failure is logged, not surfaced.
export async function persistVolunteeredIdentity({ siteId, distinctId, email, name, source = 'identify', supabase = null }) {
  if (!siteId || !distinctId) return { written: false, email: null, name: null }

  const cleanEmail = normalizeVolunteeredEmail(email)
  const cleanName = normalizeVolunteeredName(name)

  // Nothing volunteered (or nothing valid) → no row. A visitor who called
  // identify() with only a user_id is handled by site_identity_links, not here.
  if (!cleanEmail && !cleanName) return { written: false, email: null, name: null }

  const db = supabase || getSupabase()

  // ERASURE SUPPRESSION — the identify()-replay case, and the reason this mechanism exists.
  // An erased subject calling identify() again with the same email would silently rewrite their
  // name and address straight back into the store the erasure just cleared.
  //
  // ACCEPT-BUT-DON'T-ATTACH, not reject. The caller still gets its 200 and analytics continues;
  // only the PII write is dropped. Rejecting was considered and turned down: a 400 keyed on
  // "this email was erased" is an ORACLE — anyone could probe which addresses have been erased
  // by watching for the error. Building that disclosure into a privacy feature would be a poor
  // trade. It also means a genuine returning customer is not barred from using the product.
  //
  // Checked on BOTH keys: the distinct_id, and the email itself. A returning subject on a new
  // device arrives with a brand-new anonymous_id, so the id alone would miss them entirely.
  if (await isErasureSuppressed(db, { siteId, subjectId: distinctId, email: cleanEmail })) {
    logSuppressionBlocked('volunteered_identity', { siteId, subjectId: distinctId })
    return { written: false, suppressed: true, email: null, name: null }
  }
  const nowIso = new Date().toISOString()
  const { error } = await db
    .from('volunteered_identity')
    .upsert({
      site_id: siteId,
      distinct_id: distinctId,
      email: cleanEmail,
      name: cleanName,
      source,
      last_seen_at: nowIso
    }, { onConflict: 'site_id,distinct_id' })

  if (error) {
    console.error('[volunteered-identity] upsert failed:', error.message)
    return { written: false, email: cleanEmail, name: cleanName }
  }
  return { written: true, email: cleanEmail, name: cleanName }
}
