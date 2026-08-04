// scripts/lib/staging-seed-guard.mjs — the STAGING-ONLY write-target guard for the seed scripts.
//
// WHY THIS EXISTS: the old `assertStaging()` gated on POSTHOG_PROJECT_ID===469905 (DEAD post-D3) plus a
// hardcoded SITE_ID.startsWith('de200000') that is ALWAYS true. Neither looked at the ACTUAL write
// target: dualWriteEvent() sends to the Tinybird workspace the TINYBIRD_APPEND_TOKEN belongs to.
//
// WHAT DISTINGUISHES STAGING FROM PROD — decode the TOKEN, not the host. The `imubaid93` org has three
// workspaces: ST_Staging (STAGING, 3ad4c1a8-…), SourceTrack (PROD, 3c371bb9-…), imubaid93_workspace
// (neither). BOTH staging and prod are reachable at https://api.tinybird.co — Tinybird routes by TOKEN,
// not hostname — so a HOST string CANNOT tell them apart. (An earlier host-allowlist guard was both wrong
// on that premise AND allowlisted a malformed host, api.europe-west3.gcp.tinybird.co, that fails TLS and
// never worked — it has been deleted.) The token carries the workspace: a Tinybird token is
// `p.<base64url payload>` and the payload's "u" field is the workspace UUID. So the guard DECODES the
// append token's workspace and refuses unless it is exactly ST_Staging. Two layers, both fail-closed:
//   (1) assertStagingSeedTarget  — explicit --i-am-targeting-staging + de200000 site + the append token's
//       decoded workspace == ST_Staging. Fail-closed on an undecodable token, a missing "u", or any other
//       workspace (prod, imubaid93_workspace, …).
//   (2) assertStagingWorkspaceLive — LIVE: the target workspace must already HOLD the de200000 fixture
//       (prod SourceTrack has 0 — founder-validated). A belt on the read token.
// SECRET SAFETY: the token is NEVER printed, logged, or returned — only the decoded workspace UUID (not a
// secret) is surfaced.

// The ONLY staging workspace. A decoded append-token workspace must equal this or the guard refuses.
export const STAGING_WORKSPACE_ID = '3ad4c1a8-5605-4665-83dc-5b406a463032'

// ── Which site_ids may be seeded ──────────────────────────────────────────────────────────────────
// Was a single hardcoded `siteId.startsWith('de200000')`. That prefix is the ORIGINAL fixture family
// and still allowed, but it refused every other staging site — including real staging demo tenants
// that are not part of that family. The guard then reads as "no seeding" when what was meant is "no
// seeding OUTSIDE staging", and the practical effect is that the next fixture routes around the guard
// entirely (which is exactly what happened: tinybird/tools/ingest_ndjson_to_tinybird.mjs had no guard
// at all). An allowlist keeps the refusal narrow and makes adding the next fixture a one-line,
// reviewable change instead of a reason to bypass.
//
// SAFETY PROPERTY UNCHANGED: this widens WHICH staging sites may be seeded. It does NOT widen which
// WORKSPACE may be written to — that is still the token-decode check below, and it is what actually
// prevents a prod write.
export const STAGING_SITE_ID_PREFIXES = ['de200000']

export const STAGING_SITE_IDS = new Set([
  // Demo Ecommerce (staging Supabase). Verified: exists in staging, absent from prod.
  '40ae22f2-1ec4-4653-a6cd-c1e116848a60'
])

export function isAllowedStagingSiteId (siteId) {
  const s = String(siteId || '')
  if (!s) return false
  if (STAGING_SITE_IDS.has(s)) return true
  return STAGING_SITE_ID_PREFIXES.some((p) => s.startsWith(p))
}

// Decode a Tinybird token → the workspace UUID in the payload's "u" field, or null if it cannot be
// decoded or carries no "u". Handles `p.<base64url payload>` and JWT-shaped tokens (scans each segment).
// Fail-closed: any error → null. NEVER logs or returns the token itself.
export function decodeTinybirdWorkspaceId (token) {
  const t = String(token || '')
  if (!t) return null
  for (const seg of t.split('.')) {
    if (!seg || seg.length < 8) continue // skip the 'p' prefix and other short segments
    try {
      const json = Buffer.from(seg, 'base64url').toString('utf8')
      if (!json.includes('"u"')) continue
      const payload = JSON.parse(json)
      if (payload && typeof payload.u === 'string' && payload.u) return payload.u
    } catch { /* not the payload segment — try the next */ }
  }
  return null
}

// PURE (no network). Decodes the append token's workspace and gates on it. Returns
// { ok:true, workspaceId } or { ok:false, reason }. NEVER returns or logs the token.
export function assertStagingSeedTarget ({ appendToken, siteId, targetingStaging }) {
  if (targetingStaging !== true) {
    return { ok: false, reason: 'REFUSING: pass --i-am-targeting-staging to confirm the write target is STAGING (explicit opt-in required — the seeder never assumes staging).' }
  }
  if (!isAllowedStagingSiteId(siteId)) {
    return { ok: false, reason: `REFUSING: SITE_ID ${siteId || '<unset>'} is not an allowed staging seed target (allowed: prefixes [${STAGING_SITE_ID_PREFIXES.join(', ')}], ids [${[...STAGING_SITE_IDS].join(', ')}]).` }
  }
  const workspaceId = decodeTinybirdWorkspaceId(appendToken)
  if (!workspaceId) {
    return { ok: false, reason: 'REFUSING (fail-closed): could not decode a workspace id from TINYBIRD_APPEND_TOKEN (missing, malformed, or no "u" field). Refusing to write without confirming the target workspace.' }
  }
  if (workspaceId !== STAGING_WORKSPACE_ID) {
    return { ok: false, reason: `REFUSING: TINYBIRD_APPEND_TOKEN targets workspace ${workspaceId}, not ST_Staging (${STAGING_WORKSPACE_ID}). A prod / other-workspace token is rejected here.` }
  }
  return { ok: true, workspaceId }
}

const normHost = (h) => String(h || '').trim().replace(/\/+$/, '').toLowerCase()

// LIVE probe — host (api.tinybird.co; routing is by token) + read token. Confirms the target workspace
// already HOLDS the de200000 fixture; prod SourceTrack has 0, so a prod token/workspace fails closed.
// Returns { ok, reason, count }.
//
// ⚠️ THE PROBE TARGET IS DELIBERATELY *NOT* THE SITE BEING SEEDED. It used to be: the caller passed the
// seed target and the probe asserted that site already had rows. That conflated two different questions
// — "is this the staging WORKSPACE?" (what this gate is for) and "does this SITE already have data?"
// (irrelevant, and false for any site you are seeding precisely because it is empty). The two happened
// to coincide only because every caller seeded the de200000 fixture, which is already populated. Point
// it at a genuinely empty staging site and the guard refuses a correct target — the failure mode that
// makes people bypass the guard rather than fix it.
//
// So the probe always asks the WORKSPACE-identifying question: does this workspace hold the de200000
// fixture family at all? Staging does; prod SourceTrack has zero (founder-validated). Behaviour for the
// existing callers is unchanged — they were all seeding de200000 sites, which this still matches.
//
// If the de200000 fixture is ever deleted from ST_Staging this probe starts refusing every seed. That is
// the correct direction to fail: it means the workspace can no longer be positively identified.
export const WORKSPACE_PROBE_PREFIX = 'de200000'

export async function assertStagingWorkspaceLive ({ host, readToken, fetchImpl = fetch }) {
  if (!host || !readToken) {
    return { ok: false, reason: 'REFUSING (fail-closed): no TINYBIRD_HOST/TINYBIRD_READ_TOKEN — cannot confirm the target is the staging workspace.', count: null }
  }
  // Constant predicate — no interpolation of caller input, so nothing to escape.
  const q = `SELECT count() AS c FROM events WHERE site_id LIKE '${WORKSPACE_PROBE_PREFIX}%' FORMAT JSON`
  let count = null
  try {
    const res = await fetchImpl(`${normHost(host)}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${readToken}` } })
    if (!res.ok) return { ok: false, reason: `REFUSING (fail-closed): staging-workspace probe returned HTTP ${res.status}.`, count }
    const body = await res.json()
    count = Number(body?.data?.[0]?.c) || 0
  } catch (e) {
    return { ok: false, reason: `REFUSING (fail-closed): staging-workspace probe errored (${e.message}).`, count }
  }
  if (count <= 0) {
    return { ok: false, reason: `REFUSING: target workspace holds 0 events for the ${WORKSPACE_PROBE_PREFIX} staging fixture family — this is NOT ST_Staging (prod SourceTrack has no such site). Wrong workspace/token.`, count }
  }
  return { ok: true, count }
}
