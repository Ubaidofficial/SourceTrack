#!/usr/bin/env node
// SourceTrack — direct NDJSON -> Tinybird Events API ingest.
//
// PURPOSE: SHORTCUT path to populate a SECOND test tenant in Tinybird staging (Tinybird-only)
// so the Phase-8 isolation test has two populated site_ids. This BYPASSES the app + PostHog,
// so it is NOT reconciliation-faithful (no PostHog side, no app enrichment/site_key validation).
// Use ONLY to unblock the isolation test — do NOT use it as a source of truth for reconciliation.
//
// ⚠️ FOUNDER-GATED WRITE. Default (no --confirm) is DRY-RUN: it prints exactly what WOULD be
// sent and sends NOTHING. The real POST to ST_Staging must be triggered by the founder with
// --confirm and the append token in env. Agents do not run the --confirm path.
//
// The --confirm path is now GUARDED by scripts/lib/staging-seed-guard.mjs (it previously was not,
// which meant a prod append token would have written here silently — see the block above the guard
// call below). The write additionally requires:
//   --i-am-targeting-staging   explicit opt-in; the guard never assumes staging
//   TINYBIRD_READ_TOKEN        for the live workspace probe (layer 2)
// and the site_id must be an allowed staging target (staging-seed-guard.mjs: STAGING_SITE_IDS /
// STAGING_SITE_ID_PREFIXES).
//
// Mirrors the production dual-write transport (tinybird/adapter/transport.js:63,74):
//   POST {TINYBIRD_HOST}/v0/events?name={TINYBIRD_DATASOURCE||events}
//   headers: Content-Encoding: gzip, Authorization: Bearer {TINYBIRD_APPEND_TOKEN}
//   body: gzip(NDJSON)
// TINYBIRD_APPEND_TOKEN must be a DATASOURCE:APPEND-scoped token (NOT admin) — same token
// class the dual_write_append path uses.
//
// Usage:
//   node tinybird/tools/ingest_ndjson_to_tinybird.mjs --in <file.ndjson> [--only-site-id <uuid>]            # DRY-RUN (default)
//   TINYBIRD_HOST=.. TINYBIRD_APPEND_TOKEN=.. TINYBIRD_READ_TOKEN=.. [TINYBIRD_DATASOURCE=events] \
//     node tinybird/tools/ingest_ndjson_to_tinybird.mjs --in <file> --only-site-id <uuid> \
//       --i-am-targeting-staging --confirm                                                                 # SENDS (founder)

import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { assertStagingSeedTarget, assertStagingWorkspaceLive, isAllowedStagingSiteId } from '../../scripts/lib/staging-seed-guard.mjs'

function parseArgs (argv) {
  const o = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true'
      o[k] = v
    }
  }
  return o
}
const args = parseArgs(process.argv.slice(2))
// --in is REQUIRED. Previously it defaulted to the synthetic events_sample.ndjson
// fixture, so a broken/absent flag silently ingested 989 junk `site-0x` rows into the
// real datasource. Never fall back to the fixture — demand an explicit path or exit.
const IN = args.in
if (!IN || IN === 'true') {
  console.error('ERROR: --in <file.ndjson> is required (no default — refusing to silently load the synthetic fixture).')
  process.exit(2)
}
const ONLY_SITE = args['only-site-id'] || null
const CONFIRM = args.confirm === 'true' || args.confirm === true
// Explicit staging opt-in, same flag name the three sibling seed scripts use. The guard never
// assumes staging — absence of this flag is a refusal, not a default.
const TARGETING_STAGING = args['i-am-targeting-staging'] === 'true' || args['i-am-targeting-staging'] === true
// Escape hatch for a deliberately multi-site file. Off by default: with more than one target the
// guard's per-site check is easy to reason about wrongly, so demand --only-site-id instead.
const MULTI_SITE_OK = args['allow-multi-site'] === 'true' || args['allow-multi-site'] === true
const CHUNK = parseInt(args.chunk || '1000', 10)
const DATASOURCE = process.env.TINYBIRD_DATASOURCE || 'events'
const HOST = process.env.TINYBIRD_HOST
const TOKEN = process.env.TINYBIRD_APPEND_TOKEN

// Load + (optionally) filter by site_id — a safety gate so a multi-site file can never
// push another tenant's rows when you meant to seed exactly one.
const allLines = readFileSync(IN, 'utf8').split('\n').filter((l) => l.trim())
const siteIds = new Set()
for (const l of allLines) { try { siteIds.add(JSON.parse(l).site_id) } catch { /* skip unparseable */ } }
const lines = ONLY_SITE
  ? allLines.filter((l) => { try { return JSON.parse(l).site_id === ONLY_SITE } catch { return false } })
  : allLines
const targetSites = ONLY_SITE ? [ONLY_SITE] : [...siteIds]

console.log('─'.repeat(76))
console.log(`[tb-ingest] input=${IN}`)
console.log(`[tb-ingest] total lines=${allLines.length}  to-ingest=${lines.length}${ONLY_SITE ? `  (filtered to site_id=${ONLY_SITE})` : ''}`)
console.log(`[tb-ingest] distinct site_id(s) in file: ${[...siteIds].join(', ') || '(none)'}`)
console.log(`[tb-ingest] target datasource=${DATASOURCE}  host=${HOST ? '(set)' : '(MISSING)'}  append-token=${TOKEN ? '(set)' : '(MISSING)'}  chunk=${CHUNK}`)
console.log(`[tb-ingest] sample row: ${lines[0] ? lines[0].slice(0, 180) + '…' : '(none)'}`)
console.log('─'.repeat(76))

if (!CONFIRM) {
  console.log(`DRY-RUN (no --confirm): WOULD POST ${lines.length} rows for site(s) [${targetSites.join(', ')}] to ` +
    `${HOST || '<TINYBIRD_HOST>'}/v0/events?name=${DATASOURCE} (gzip NDJSON, ${Math.ceil(lines.length / CHUNK)} chunk(s) of ${CHUNK}). Sending NOTHING.`)
  // Report the guard verdict the WRITE would face, so a dry-run is a real preview of the gate and not
  // just of the payload. Site allowlisting is checkable without any token; the workspace checks are
  // not, and are reported as unevaluated rather than as passing.
  for (const siteId of targetSites) {
    console.log(`[tb-ingest] guard preview — site_id=${siteId} allowed-staging-target=${isAllowedStagingSiteId(siteId) ? 'YES' : 'NO — write would be REFUSED'}`)
  }
  console.log(`[tb-ingest] guard preview — --i-am-targeting-staging=${TARGETING_STAGING}${TARGETING_STAGING ? '' : ' (write would be REFUSED without it)'}`)
  console.log('[tb-ingest] guard preview — append-token workspace + live de200000 probe NOT evaluated in dry-run (no tokens read).')
  process.exit(0)
}

// ── --confirm path: FOUNDER-RUN. Actually send. ──
if (!HOST || !TOKEN) {
  console.error('[tb-ingest] --confirm set but TINYBIRD_HOST / TINYBIRD_APPEND_TOKEN missing — refusing to send.')
  process.exit(2)
}
if (lines.length === 0) {
  console.error('[tb-ingest] 0 rows to ingest — nothing to do (check --only-site-id matches rows in the file).')
  process.exit(1)
}

// ── STAGING WRITE-TARGET GUARD ────────────────────────────────────────────────────────────────────
// This tool previously had NONE. It POSTed to whatever workspace TINYBIRD_APPEND_TOKEN belonged to,
// and since BOTH staging and prod answer on https://api.tinybird.co (Tinybird routes by token, not
// host), a prod token would have silently written fabricated fixture rows into the production events
// datasource — no error, no warning. The header comment asserting the target is ST_Staging was a
// claim, not a mechanism. Three sibling seed scripts already used this guard; this one did not.
//
// Both layers, same order and semantics the other seeders use:
//   1. pure  — explicit opt-in flag + allowlisted staging site + append token decoded to ST_Staging
//   2. live  — the target workspace must actually hold the de200000 fixture family (prod holds none)
if (!MULTI_SITE_OK && targetSites.length !== 1) {
  console.error(`[tb-ingest] refusing: file spans ${targetSites.length} site_id(s). Pass --only-site-id <uuid> so the guard can check exactly one target.`)
  process.exit(2)
}
for (const siteId of targetSites) {
  const gate = assertStagingSeedTarget({ appendToken: TOKEN, siteId, targetingStaging: TARGETING_STAGING })
  if (!gate.ok) {
    console.error(`[tb-ingest] ${gate.reason}`)
    process.exit(2)
  }
  console.log(`[tb-ingest] guard 1/2 OK — site_id=${siteId} append-token workspace=${gate.workspaceId} (ST_Staging)`)
}

const live = await assertStagingWorkspaceLive({ host: HOST, readToken: process.env.TINYBIRD_READ_TOKEN })
if (!live.ok) {
  console.error(`[tb-ingest] ${live.reason}`)
  process.exit(2)
}
console.log(`[tb-ingest] guard 2/2 OK — workspace holds ${live.count} de200000 fixture row(s), confirming ST_Staging.`)

const url = `${HOST.replace(/\/$/, '')}/v0/events?name=${encodeURIComponent(DATASOURCE)}`
let sent = 0
for (let i = 0; i < lines.length; i += CHUNK) {
  const chunk = lines.slice(i, i + CHUNK)
  const body = gzipSync(Buffer.from(chunk.join('\n'), 'utf8'))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Encoding': 'gzip', Authorization: `Bearer ${TOKEN}` },
    body
  })
  if (!res.ok) {
    console.error(`[tb-ingest] chunk ${i}-${i + chunk.length} FAILED (${res.status}): ${(await res.text()).slice(0, 240)}`)
    process.exit(1)
  }
  sent += chunk.length
  console.log(`[tb-ingest] sent ${sent}/${lines.length}`)
}
console.log(`[tb-ingest] DONE — ingested ${sent} row(s) for site(s) [${targetSites.join(', ')}] into datasource '${DATASOURCE}'.`)
console.log('[tb-ingest] AUDIT: verify with the Tinybird MCP / a read pipe that the site now returns rows before trusting the isolation test.')
process.exit(0)
