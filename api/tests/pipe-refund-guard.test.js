// PR2b guard — refund exclusion in Tinybird conversion-COUNT pipes.
//
// WHY THIS EXISTS: PR2a's refund filter is an inline JS predicate in ~10 sites (a
// shared helper is queued as PR2c). Pipes have no such escape — ~19 .pipe files each
// carry the predicate inline and Tinybird's pipe language offers NO abstraction. So
// "remember to add the filter" would be a permanent memory dependency, and pipe #20
// ships unfiltered six months from now with nobody noticing until a customer's
// conversion count is wrong. This test removes the memory dependency.
//
// IT FAILS when a pipe that COUNTS $conversion rows lacks a refund exclusion and is
// not on the explicit allowlist. (A) says a refund must not ADD to a conversion
// count; SUM(conversion_value) is untouched (netting revenue is correct). The guard
// only inspects COUNT-family aggregates in a $conversion context — pageview / all-event
// counts and row-pulls are not conversion counts and are never flagged.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PIPES_DIR = join(__dirname, '..', '..', 'tinybird', 'pipes')

// ── ALLOWLIST — $conversion-counting pipes that are SAFE without a != 'refund'
// clause, each with the reason that makes it safe. A bare name is not allowed. ──
const SAFE = {
  dash_stages: "conversion_type IN ('lead_created','qualified','opportunity','closed_won') — 'refund' is not a funnel stage, so it is never counted",
  flexible_report_campaign_leads_by_site: 'LEAD_TYPES conversion_type filter — refund is not a lead type',
  flexible_report_touchpoints_per_conversion_by_site: 'INNER JOIN to pageviews + HAVING touch_count > 0 drops the pageview-less refund',
  flexible_report_days_to_convert_by_site: 'HAVING requires a pre-conversion pageview; the pageview-less refund is excluded',
  integ_missing_conv: 'counts $conversion rows with a MISSING/zero value; a refund carries a NEGATIVE value so it never matches',
  // Pageview-based surfaces — event_type='$pageview', not a $conversion count. Never
  // flagged by this guard; listed for clarity so a reader sees they were considered.
  flexible_sessions_by_site: 'sessions = count(DISTINCT distinct_id) over $pageview — not a $conversion count',
  flexible_report_campaign_sessions_by_site: 'sessions over $pageview — not a $conversion count',
  dashboard_live_visitors: 'live visitors over $pageview (5-min) — not a $conversion count',
  google_ads_checklist: "count() is total_events (ALL events); the only $conversion reference is MAX(CASE … THEN timestamp) = last click-ID-attributed conversion time — neither is a conversion COUNT, and a refund carries no click id"
}

// Strip the DESCRIPTION prose (everything before the first `SQL >`) and SQL line
// comments, so `count()`/`$conversion` mentioned in prose never trip detection.
function sqlBodyOf (text) {
  const idx = text.search(/^SQL >/m)
  const body = idx === -1 ? text : text.slice(idx)
  return body.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
}

const CONV_CTX = /event_type\s*=\s*'\$conversion'/
const COUNT_AGG = [
  /\bcountIf\s*\(/i,
  /\bcount\s*\(/i,                                   // count() / count(DISTINCT ...)
  /\buniq[A-Za-z]*\s*\(/i,
  /SUM\s*\(\s*CASE\s+WHEN[^)]*\bTHEN\s+1\b/i,        // SUM(CASE WHEN … THEN 1 …) = a row counter
  /MAX\s*\(\s*CASE\s+WHEN\s+event_type\s*=\s*'\$conversion'[^)]*\bTHEN\s+1\b/i   // MAX(CASE … THEN 1) = a converted-flag (NOT MAX(… THEN timestamp))
]
const REFUND_EXCLUDED = /!=\s*'refund'|<>\s*'refund'|not\s+in\s*\([^)]*'refund'/i

test('every $conversion-COUNT pipe excludes refunds (or is allowlisted with a reason)', () => {
  const files = readdirSync(PIPES_DIR).filter(f => f.endsWith('.pipe'))
  assert.ok(files.length > 50, `sanity: found ${files.length} pipes`)

  const offenders = []
  const flaggedNames = new Set()
  for (const f of files) {
    const name = f.replace(/\.pipe$/, '')
    const sql = sqlBodyOf(readFileSync(join(PIPES_DIR, f), 'utf8'))
    if (!CONV_CTX.test(sql)) continue                 // not a $conversion pipe
    if (!COUNT_AGG.some(re => re.test(sql))) continue // no count-family aggregate
    flaggedNames.add(name)
    if (REFUND_EXCLUDED.test(sql)) continue           // has the filter → good
    if (name in SAFE) continue                        // known-safe → skip
    offenders.push(name)
  }

  assert.deepEqual(offenders, [],
    `these pipes COUNT $conversion rows but do NOT exclude refunds and are not allowlisted:\n  ${offenders.join('\n  ')}\n` +
    "Add `AND lower(coalesce(conversion_type, '')) != 'refund'` to the COUNT expression (NOT the revenue SUM), or allowlist with a reason.")

  // Allowlist hygiene: no entry for a pipe that does not exist, and no BARE reason.
  for (const [name, reason] of Object.entries(SAFE)) {
    assert.ok(files.includes(`${name}.pipe`), `stale allowlist entry: ${name}.pipe does not exist`)
    assert.ok(typeof reason === 'string' && reason.length > 15, `allowlist ${name} needs a real reason`)
  }
})
