// SourceTrack — traffic-quality signals (MEASUREMENT ONLY).
//
// ⚠️ NOTHING HERE DROPS, FILTERS, METERS, OR EXCLUDES ANYTHING. Every export is a pure
// function over rows already stored in Tinybird. No caller may use these to reject an
// event. §6/§6.5: an ingestion drop is irreversible (there is no PostHog fallback), and
// the 2026-07-14 incident was an ingestion filter deleting real humans. #666 exists
// because of that. Whether anything is EVER excluded is a founder ruling that needs the
// observed numbers first — which is what this file produces.
//
// ─── WHY THIS IS NOT THE KI-77 SCORER, AND NOT A SECOND COPY OF IT ────────────────────
// KI-77's automation score (`getAutomationScore`, tracker/tracker.js + tracker.cookieless.js,
// logged at api/routes/track.js:190) is a CLIENT-SIDE, PER-REQUEST signal: it reads
// navigator.webdriver, automation globals, and window.chrome inside the visitor's browser
// and ships the result as `auto_score`. Two properties make it unable to answer the
// question this file answers:
//   1. It is NEVER PERSISTED. track.js:188 reads req.body.auto_score, :190 console.logs it,
//      and nothing writes it to `properties` — `auto_score` appears nowhere in tinybird/.
//      So it cannot be run over history, only observed live going forward.
//   2. It only exists when the tracker RAN. The population this file characterises is
//      requests where the tracker demonstrably did NOT run (see anonIdAbsent below), so
//      auto_score is structurally absent for exactly the traffic in question.
// This module is therefore the AGGREGATE layer — it scores a (site, window) from stored
// columns — not a reimplementation of the per-request client-side scorer. Extending
// getAutomationScore could not produce a cadence or a per-window rate; the two layers
// measure different things and neither subsumes the other.
//
// ─── THE UA FILTER IS STRUCTURALLY BLIND TO THIS TRAFFIC ──────────────────────────────
// api/routes/track.js:171 already calls isIngestionBotUserAgent (since #124). The traffic
// that motivated this file PASSES that filter by construction: it sends a plausible Chrome
// UA, so it is neither empty nor a match for INGESTION_BOT_UA_PATTERN. Adding UA tokens
// cannot fix a client that chooses its own UA. Every signal below is therefore
// UA-INDEPENDENT — none of them reads a user agent.

// A burst is the sharpest stored-column signal available. Observed on prod 2026-08-07:
// eight distinct techrupt.pk URLs each took 4 hits from 4 distinct_ids across 2 device_types
// within a 3-4 second span. One human cannot be four visitors on two device classes on one
// URL in three seconds; the device alternation is what separates this from a shared NAT or
// an office clicking the same link, which would share a device class.
const BURST_WINDOW_SEC = 10
const BURST_MIN_IDS = 3
const BURST_MIN_DEVICE_TYPES = 2

function isBlank (v) {
  return v === null || v === undefined || v === ''
}

// Group pageviews by page_url and find bursts. Rows need { page_url, distinct_id,
// device_type, timestamp }. `timestamp` may be a Date or an ISO string.
export function burstGroups (rows, opts = {}) {
  const windowSec = opts.windowSec ?? BURST_WINDOW_SEC
  const minIds = opts.minIds ?? BURST_MIN_IDS
  const minDeviceTypes = opts.minDeviceTypes ?? BURST_MIN_DEVICE_TYPES

  const byUrl = new Map()
  for (const r of rows) {
    if (isBlank(r.page_url)) continue
    if (!byUrl.has(r.page_url)) byUrl.set(r.page_url, [])
    byUrl.get(r.page_url).push(r)
  }

  const bursts = []
  for (const [url, group] of byUrl) {
    const sorted = group
      .map(r => ({ ...r, _t: new Date(r.timestamp).getTime() }))
      .filter(r => Number.isFinite(r._t))
      .sort((a, b) => a._t - b._t)

    // Sliding window: for each start row, take everything within windowSec of it.
    for (let i = 0; i < sorted.length; i++) {
      const win = []
      for (let j = i; j < sorted.length; j++) {
        if ((sorted[j]._t - sorted[i]._t) / 1000 > windowSec) break
        win.push(sorted[j])
      }
      const ids = new Set(win.map(r => r.distinct_id))
      const devices = new Set(win.map(r => r.device_type).filter(d => !isBlank(d)))
      if (ids.size >= minIds && devices.size >= minDeviceTypes) {
        bursts.push({
          page_url: url,
          hits: win.length,
          distinct_ids: ids.size,
          device_types: devices.size,
          span_sec: (win[win.length - 1]._t - win[0]._t) / 1000,
          event_ids: win.map(r => r.event_id).filter(Boolean)
        })
        break // one burst per URL is enough to characterise it; don't double-count
      }
    }
  }
  return bursts
}

// Per-(site, window) rates. Every field is a RATE with its denominator alongside, so a
// reader can never mistake "0 of 0" for "0%". Returns null counts rather than 0 where
// there is nothing to divide (§6: no fake zeros).
export function trafficQualitySignals (rows, opts = {}) {
  const total = rows.length
  if (total === 0) return { total: 0, signals: null }

  const bursts = burstGroups(rows, opts)
  const burstEventIds = new Set(bursts.flatMap(b => b.event_ids))

  const nullBrowser = rows.filter(r => isBlank(r.browser_name)).length
  const zeroReferrer = rows.filter(r => isBlank(r.referrer)).length

  const pvPerVisitor = new Map()
  for (const r of rows) {
    pvPerVisitor.set(r.distinct_id, (pvPerVisitor.get(r.distinct_id) || 0) + 1)
  }
  const singlePvVisitors = [...pvPerVisitor.values()].filter(n => n === 1).length

  return {
    total,
    signals: {
      // S1 — the discriminating one. Derivable from stored columns TODAY.
      burst_events: burstEventIds.size,
      burst_rate: burstEventIds.size / total,
      bursts,
      // S2 — UAParser could not resolve a browser from the UA. Derivable TODAY.
      null_browser_rate: nullBrowser / total,
      // S3 — high false-positive rate on its own (see FALSE_POSITIVE_POPULATIONS).
      zero_referrer_rate: zeroReferrer / total,
      // S4 — recorded but NOT discriminating on this data; see the note below.
      single_pv_visitor_share: singlePvVisitors / pvPerVisitor.size,
      distinct_visitors: pvPerVisitor.size,
      pages_per_visitor: total / pvPerVisitor.size
    }
  }
}

// Documented per-signal false-positive populations. This object is asserted against in
// api/tests/traffic-quality-signals.test.js so a signal cannot be added without one — an
// undocumented false-positive population is how a measurement turns into a bad drop.
export const FALSE_POSITIVE_POPULATIONS = {
  burst_rate:
    'Shared egress IP (office/NAT/campus) where several people open the SAME url within ' +
    'seconds AND land on different device_type classes. Rare: the device-type split is ' +
    'what makes it rare, since colleagues on one wifi are usually one device class. ' +
    'Also: a site running an on-page prefetch/preview that re-requests its own url.',
  null_browser_rate:
    'Real humans on browsers UAParser does not recognise — new releases, niche/regional ' +
    'browsers, hardened privacy builds that trim the UA, and some in-app WebViews. This ' +
    'population is small but it is REAL HUMANS, so this signal must never gate anything ' +
    'on its own.',
  zero_referrer_rate:
    'LARGE and mostly human. Direct navigation, bookmarks, typed urls, HTTPS->HTTP ' +
    'downgrade, apps and messengers that strip Referer, and every privacy-conscious ' +
    'browser or extension with a referrer policy. On this data 209 of 214 rows have no ' +
    'referrer, but so does most genuine direct traffic. Context only — never a signal ' +
    'by itself.',
  single_pv_visitor_share:
    'NOT DISCRIMINATING ON THIS DATA — reported for completeness and to stop it being ' +
    'proposed again. Measured over all prod history: 2675 of 2709 visitors have exactly ' +
    'one pageview, so the baseline is ~98.7% for BOTH populations. The founder-supplied ' +
    'premise that "real content-site traffic runs 2-4 pages per visitor" does not hold ' +
    'here, because api/routes/track.js:426 mints a FRESH uuid whenever a request omits ' +
    'anonymous_id — so a 1.0 ratio measures "the tracker did not run", not "this is a ' +
    'bot". Any threshold on this signal flags ~100% of genuine traffic too.'
}

// Signals that CANNOT be computed from stored columns and would need forward
// instrumentation. Kept here (rather than in a doc) so the tests can assert the list and
// it cannot silently drift from what the module actually computes.
export const NEEDS_INSTRUMENTATION = {
  anon_id_absent:
    'THE HIGHEST-PRECISION SIGNAL AVAILABLE, and it is currently invisible. ' +
    'api/routes/track.js:426 is `req.body.anonymous_id || uuidv4()` — when a client omits ' +
    'anonymous_id the server silently mints one, and the minted uuid is INDISTINGUISHABLE ' +
    'in shape from the server-issued visitor_id that the legitimate cookieless build ' +
    'fetches and sends back (tracker.cookieless.js:300). Both are uuidv4, which is why ' +
    'all 214 rows and all 2847 historical pageviews match the same shape. Every real ' +
    'browser page load runs the tracker and therefore SENDS an anonymous_id; a client ' +
    'that POSTs straight to /api/track does not. Cost: one boolean column. It stores no ' +
    'PII, no UA, and no IP, so it is §6-clean.',
  geo_locale_mismatch:
    'Needs a per-site expected-locale, which is not a stored column on the event and not ' +
    'currently on `sites`. Would also be weak alone: a .pk tech site legitimately has ' +
    'diaspora and international readers, so geo mismatch is evidence only in combination.'
}
