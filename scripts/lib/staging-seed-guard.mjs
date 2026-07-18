// scripts/lib/staging-seed-guard.mjs — the STAGING-ONLY write-target guard for the seed scripts.
//
// WHY THIS EXISTS: the old `assertStaging()` in each seeder gated on POSTHOG_PROJECT_ID===469905
// (DEAD post-D3 — PostHog is decommissioned, the var may be unset or anything) plus a hardcoded
// SITE_ID.startsWith('de200000') that is ALWAYS true (SITE_ID is a constant). Neither looked at the
// ACTUAL write target: dualWriteEvent() sends to TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN. So a run with
// PROD Tinybird creds would seed test fixtures straight into prod — the wave1_/gate0_-in-prod hole.
//
// WHAT DISTINGUISHES STAGING FROM PROD: the `imubaid93` org has THREE workspaces —
//   • ST_Staging          (STAGING, 3ad4c1a8-…)  ← the ONLY staging workspace; Frankfurt (europe-west3 GCP)
//   • SourceTrack         (PROD,    3c371bb9-…)
//   • imubaid93_workspace (neither, 3b8a6b92-…)  ← older notes wrongly called THIS staging; it is not.
// A host allowlist rejects a wrong-region prod host, but if prod shares the region a host STRING cannot
// tell them apart — and an append/read token cannot resolve its own workspace NAME via the Tinybird API.
// So the authoritative runtime check is FIXTURE PRESENCE: the de200000 staging fixture site holds events
// in ST_Staging and does NOT exist in prod SourceTrack. Founder-validated (tb --cloud sql): ST_Staging
// = 159 de200000 events, SourceTrack (prod) = 0. Two layers, both fail-closed:
//   (1) assertStagingSeedTarget  — PURE, token-free: explicit --i-am-targeting-staging flag + de200000
//       site + host on the staging allowlist. A prod-shaped host is rejected here (unit-tested).
//   (2) assertStagingWorkspaceLive — LIVE: the target workspace must already hold the de200000 fixture,
//       else it is not ST_Staging. This is the real "which workspace am I writing to" gate.

import { esc } from '../../api/lib/utils.js'

// Known ST_Staging (workspace 3ad4c1a8-…, Frankfurt) Tinybird host(s). Fail-closed: an unlisted host is
// refused. If staging ever moves region, add the new host here — the startup echo prints the resolved
// host to compare. NOTE (flagged to founder): inferred from the docs (ST_Staging = Frankfurt) + the
// europe-west3 host in the test suite — NOT verified against the live staging env. If it differs the
// guard REFUSES (safe); it never falls open. The live fixture-presence probe below is the authoritative
// staging check regardless of this host value.
export const STAGING_TINYBIRD_HOSTS = ['https://api.europe-west3.gcp.tinybird.co']

const normHost = (h) => String(h || '').trim().replace(/\/+$/, '').toLowerCase()

// PURE, token-free, no side effects. Returns { ok:true } or { ok:false, reason }.
export function assertStagingSeedTarget ({ host, siteId, targetingStaging }) {
  if (targetingStaging !== true) {
    return { ok: false, reason: 'REFUSING: pass --i-am-targeting-staging to confirm the write target is STAGING (explicit opt-in required — the seeder never assumes staging).' }
  }
  if (!String(siteId || '').startsWith('de200000')) {
    return { ok: false, reason: `REFUSING: SITE_ID ${siteId || '<unset>'} is not the de200000 staging fixture.` }
  }
  const h = normHost(host)
  if (!h) {
    return { ok: false, reason: 'REFUSING: TINYBIRD_HOST is not set — cannot confirm the write target.' }
  }
  if (!STAGING_TINYBIRD_HOSTS.map(normHost).includes(h)) {
    return { ok: false, reason: `REFUSING: TINYBIRD_HOST ${host} is not a known ST_Staging host ${JSON.stringify(STAGING_TINYBIRD_HOSTS)} — a prod-shaped host is rejected here. If staging moved region, add its host to STAGING_TINYBIRD_HOSTS.` }
  }
  return { ok: true }
}

// LIVE probe — needs TINYBIRD_HOST + a read token. Confirms the target workspace HOLDS the de200000
// staging fixture; prod SourceTrack has no such site, so a prod token/workspace fails closed. This is
// the authoritative workspace-identity check (a shared-region host string cannot provide it).
// Returns { ok, reason, count }.
export async function assertStagingWorkspaceLive ({ host, readToken, siteId, fetchImpl = fetch }) {
  if (!host || !readToken) {
    return { ok: false, reason: 'REFUSING (fail-closed): no TINYBIRD_HOST/TINYBIRD_READ_TOKEN — cannot confirm the target is the staging workspace.', count: null }
  }
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(siteId)}' FORMAT JSON`
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
    return { ok: false, reason: `REFUSING: target workspace has 0 events for the de200000 staging fixture — this is NOT ST_Staging (prod SourceTrack has no such site). Wrong workspace/token.`, count }
  }
  return { ok: true, count }
}
