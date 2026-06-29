// SourceTrack — Tinybird ingest adapter: normalization layer (Phase 2a).
//
// PURE function. Maps one raw producer event onto the canonical contract of the
// committed tinybird/datasources/events.datasource. Transport-layer only — this
// does NOT POST, does NOT claim idempotency, and is NOT wired into producers.
//
// Source of truth: tinybird/datasources/events.datasource (48 typed columns +
// `properties String json:$`). Because `properties` is `json:$` (the whole row),
// the output is ONE FLAT object: typed columns extract by name; everything else
// rides along in `properties`. We never nest.
//
// ESM; no external deps; no api/ imports (standalone by design).

import { randomUUID } from 'node:crypto'

// The 48 typed columns of events.datasource, in schema order. `properties` is the
// json:$ catch-all (Tinybird-generated from the whole row) and is NOT a literal
// output key, so it is intentionally excluded from this list.
export const TYPED_COLUMNS = [
  'site_id', 'event_type', 'event_id', 'distinct_id', 'visitor_id', 'timestamp',
  'conversion_value', 'currency', 'conversion_type', 'ingestion_method', 'provider',
  'stitching_method', 'attribution_status', 'external_event_id',
  'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'first_touch_timestamp',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'li_fatid',
  'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id',
  'ai_source', 'page_url', 'referrer', 'country', 'device_type', 'browser_name',
  'server_timestamp', 'occurred_at',
  'webhook_customer_id', 'stripe_subscription_id', 'stripe_invoice_id'
]

// The 7 NOT NULL columns the normalizer must guarantee on every output.
export const REQUIRED_COLUMNS = [
  'site_id', 'event_type', 'event_id', 'distinct_id', 'visitor_id', 'timestamp', 'ingestion_method'
]

// PII exact-key denylist. Mirrors `redactPiiFromObject` exactPiiKeys
// (api/lib/utils.js:316-326 on origin/main). DROP (not redact): the schema has NO
// PII columns, so dropping is defense-in-depth over upstream redaction. Exact-key
// matching (plus the email/phone suffix rule below) intentionally spares
// legitimate `*_name` columns — order_name, form_name, browser_name, os_name —
// and the boolean flag webhook_email_present.
const PII_KEYS = new Set([
  'email', 'e-mail', 'user_email', 'customer_email', 'contact_email', 'billing_email', 'shipping_email',
  'phone', 'tel', 'mobile', 'billing_phone', 'shipping_phone',
  'name', 'first_name', 'last_name', 'full_name', 'customer_name', 'billing_name', 'shipping_name',
  'password', 'pass',
  'token', 'access_token', 'refresh_token', 'auth', 'authorization', 'secret',
  'api_key', 'apikey', 'secret_key', 'private_key',
  'ssn', 'dob', 'date_of_birth', 'address', 'street', 'zip', 'postal_code', 'postcode',
  'street_address', 'address1', 'address2',
  'invite', 'invite_code', 'auth_code', 'reset_code', 'verification_code', 'code_verifier',
  'checkout_id', 'checkout_session_id', 'stripe_session_id', 'payment_session_id'
])
// customer_email / billing_phone, but NOT webhook_email_present / order_name.
const isContactKey = (lowerKey) => /(^|[_-])(email|phone)$/.test(lowerKey)
const isPii = (key) => { const k = key.toLowerCase(); return PII_KEYS.has(k) || isContactKey(k) }

// Keys that must NEVER reach prod ingest.
//  - site_key: customer-facing secret, never read in HogQL, dropped from schema (§6.5 / §2.6).
//  - _synthetic / refund_of: generator-only flags (the synthetic dataset's edge markers).
const FORBIDDEN_KEYS = new Set(['site_key', '_synthetic', 'refund_of'])

// ph.capture() wrapper fields consumed into canonical columns — never re-emitted as bag keys.
const WRAPPER_KEYS = new Set(['distinctId', 'event', 'properties'])

// pixel.js field divergence (api/routes/pixel.js on origin/main): canonical <- pixel.
//   value   -> conversion_value   (pixel.js:116)
//   browser -> browser_name       (pixel.js:109)
//   os      -> os_name            (pixel.js:110, an os_name JSON-bag key)
const PIXEL_RENAME = { value: 'conversion_value', browser: 'browser_name', os: 'os_name' }

// Phase 2b placeholder. Canonical, deterministic-per-conversion event_id: prefer a
// natural id where one exists; else a generated uuid. Real derivation (the §2.5
// app-side (site_id, event_id) claim) lands in Phase 2b — do NOT rely on the uuid
// branch for dedup yet.
export function deriveEventId (raw) {
  return raw.stripe_invoice_id || raw.stripe_subscription_id || raw.order_id ||
    raw.external_event_id || raw.idempotency_key || randomUUID()
}

function tsMillis (v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return NaN
    // Disambiguate epoch-seconds (10-digit, ~1.7e9) from epoch-ms (13-digit,
    // ~1.7e12): any finite value below 1e12 is treated as seconds and scaled up.
    // `timestamp` is the partition/sort key — a mis-scaled value silently
    // mis-partitions, so we normalize rather than pass through. (A genuine
    // pre-2001 ms timestamp would be misread, but that predates the product.)
    return v < 1e12 ? v * 1000 : v
  }
  const t = Date.parse(v)
  return Number.isNaN(t) ? NaN : t
}

// Max recursion depth for the PII/forbidden-key strip, mirroring
// redactPiiFromObject (api/lib/utils.js on origin/main). Beyond it, replace the
// value wholesale rather than risk leaking deeply-nested PII.
const MAX_SANITIZE_DEPTH = 5

// Recursively DROP PII and forbidden keys at EVERY depth of nested objects/arrays.
// The producers' redactPiiFromObject is recursive; a top-level-only strip would
// silently no-op the backstop for shapes like custom_properties:{email} or
// meta:{site_key} (track.js wraps user properties as { custom_properties: ... }).
// Returns a sanitized COPY — never mutates the input.
function sanitizeDeep (value, depth = 0) {
  if (depth > MAX_SANITIZE_DEPTH) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v, depth + 1))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k) || isPii(k)) continue
      out[k] = sanitizeDeep(v, depth + 1)
    }
    return out
  }
  return value
}

/**
 * Normalize one raw producer event into the canonical, flat events.datasource shape.
 * Pure: returns a new object, never mutates `raw`.
 *
 * Accepts either a flat event (e.g. a generator fixture line) OR a ph.capture-shaped
 * event { distinctId, event, properties:{...} } — a nested `properties` object is
 * flattened up (top-level keys win on collision) so there is one input contract.
 *
 * @param {object} raw
 * @returns {object} flat object: guaranteed typed columns + pass-through bag keys.
 */
export function normalizeEvent (raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('normalizeEvent: raw must be a non-array object')
  }

  // Flatten a nested ph.capture `properties` object (top-level wins on collision).
  let src = raw
  if (raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)) {
    const { properties, ...top } = raw
    src = { ...properties, ...top }
  }

  // site_id is a TENANT key — never fabricate (§6.5: an ingestion path must never
  // fall through to a default tenant). Reject instead.
  const siteId = src.site_id
  if (siteId == null || siteId === '') {
    throw new Error('normalizeEvent: missing site_id — refusing to assign a default tenant')
  }

  const out = {}

  // 1) Pass through everything except forbidden / PII / wrapper keys, applying the
  //    pixel renames. A canonical key already set by a non-pixel field is not
  //    clobbered by its pixel alias.
  for (const [k, v] of Object.entries(src)) {
    if (FORBIDDEN_KEYS.has(k) || WRAPPER_KEYS.has(k)) continue
    if (isPii(k)) continue
    const key = PIXEL_RENAME[k] || k
    if (PIXEL_RENAME[k] && key in out) continue
    // Recursively strip PII/forbidden keys inside nested bag objects/arrays so a
    // shape like custom_properties:{email} or meta:{site_key} cannot smuggle them
    // into the json:$ row.
    out[key] = (v !== null && typeof v === 'object') ? sanitizeDeep(v, 1) : v
  }

  // 2) Guarantee the 7 NOT NULL columns. Use empty-AWARE fallbacks (`|| default`)
  //    so an explicit '' coerces to the default instead of passing through — these
  //    columns are non-nullable with no DEFAULT, so '' would otherwise satisfy
  //    NOT NULL while violating the contract.
  out.site_id = siteId
  out.event_type = (src.event_type ?? src.event) || 'custom'
  const distinctId = (src.distinct_id ?? src.distinctId ?? src.anonymous_id) || randomUUID()
  out.distinct_id = distinctId
  out.visitor_id = (src.visitor_id ?? src.anonymous_id) || distinctId
  out.event_id = (src.event_id != null && src.event_id !== '') ? src.event_id : deriveEventId(src)
  const ms = tsMillis(src.timestamp)
  out.timestamp = Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString()
  out.ingestion_method = src.ingestion_method || 'unknown'

  // Nullable typed columns absent from `src` are left ABSENT (not fabricated) —
  // Tinybird maps a missing json path to NULL and the read side applies its
  // COALESCE/NULLIF default. We never invent values here.
  return out
}
