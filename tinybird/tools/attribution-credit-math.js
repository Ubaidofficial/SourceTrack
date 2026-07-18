// attribution-credit-math — INDEPENDENT reference implementation of per-model credit math,
// used ONLY to cross-check the live engine (api/tests/phase9-agg-models.test.js). EXTRACTED
// VERBATIM from tinybird/tools/phase4_touchpoint_diff.js (D3) when the phase4 cross-store diff
// tools were retired. Pure — imports NOTHING (no posthog.js, directly or transitively). DO NOT
// edit this math: a subtle change makes the test validate the new wrong math against itself.

export function toUtcSafeTs(ts) {
  if (typeof ts !== 'string') return ts
  const s = ts.trim()
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z'
}

const tsOf = (x) => new Date(toUtcSafeTs(x?.timestamp ?? x)).getTime()
const coalesceSource = (s) => (s !== undefined && s !== null && s !== '') ? s : 'direct' // COALESCE(NULLIF(x,''),'direct')
const coalesceMedium = (m) => (m !== undefined && m !== null && m !== '') ? m : 'none'   // COALESCE(NULLIF(x,''),'none')

// Non-direct pageviews for a conversion's visitor, at/ before the conversion,
// ascending by ts — the shared population all non-direct joins draw from
// (pipe subqueries: utm_source IS NOT NULL AND != '' AND != 'direct').
function nonDirectPvsUpTo(conv, pageviews) {
  const cutoff = tsOf(conv)
  return (pageviews || [])
    .filter(p => p.utm_source && p.utm_source !== '' && p.utm_source !== 'direct' && tsOf(p) <= cutoff)
    .sort((a, b) => tsOf(a) - tsOf(b))
}

// Model 7 — first_touch: from the conversion's OWN first_touch_* columns
// (first_touch_by_site.pipe: COALESCE(NULLIF(first_touch_source,''),'direct'),
//  COALESCE(NULLIF(first_touch_medium,''),'none'), COALESCE(first_touch_campaign,'')).
export function creditFirstTouch(conv) {
  return {
    source: coalesceSource(conv.first_touch_source),
    medium: coalesceMedium(conv.first_touch_medium),
    campaign: conv.first_touch_campaign ?? '' // COALESCE(campaign,'') — null -> ''
  }
}

// Model 8 — first_touch_non_direct: PER-FIELD earliest non-direct pageview, mirroring
// LIVE (attribution-engine.js:188-190) argMin(pv.utm_source/medium/campaign, ts). ClickHouse
// argMin skips only NULL args (not ''), so each field is independently the EARLIEST
// non-direct pv HAVING that field non-null (incl ''): medium/campaign can come from a later
// pv than source when the earliest pv's field is null. (Was whole-row nd[0] — wrong vs LIVE.)
export function creditFirstTouchNonDirect(conv, pageviews) {
  const nd = nonDirectPvsUpTo(conv, pageviews) // ascending by ts
  const earliest = (pred) => { for (let i = 0; i < nd.length; i++) if (pred(nd[i])) return nd[i]; return null }
  const src = earliest(() => true) // utm_source guaranteed present by the non-direct filter
  const med = earliest(p => p.utm_medium !== undefined && p.utm_medium !== null)   // non-null incl ''
  const camp = earliest(p => p.utm_campaign !== undefined && p.utm_campaign !== null) // non-null incl ''
  return {
    source: coalesceSource(src?.utm_source),
    medium: coalesceMedium(med?.utm_medium),
    campaign: camp ? (camp.utm_campaign ?? null) : null
  }
}

// Model 9 — last_touch_non_direct: PER-FIELD latest non-direct pageview, mirroring LIVE
// (attribution-engine.js:247-249) argMax(pv.utm_source/medium/campaign, ts). argMax skips only
// NULL (not ''), so each field is the LATEST non-direct pv HAVING that field non-null INCLUDING
// '' — do NOT skip empty-string campaigns pre-pick. This relies on the HogQL pageview read
// preserving '' (run_phase4_diff.mjs keeps '' via ?? null); the '' is normalized AFTER the pick
// (coalesceMedium ''->'none'; campaign '' canonicalized ''<->null at bucket time, see bucketKey).
export function creditLastTouchNonDirect(conv, pageviews) {
  const nd = nonDirectPvsUpTo(conv, pageviews)
  const latest = (pred) => { for (let i = nd.length - 1; i >= 0; i--) if (pred(nd[i])) return nd[i]; return null }
  const src = latest(() => true)
  const med = latest(p => p.utm_medium !== undefined && p.utm_medium !== null)
  const camp = latest(p => p.utm_campaign !== undefined && p.utm_campaign !== null)
  return {
    source: coalesceSource(src?.utm_source),
    medium: coalesceMedium(med?.utm_medium),
    campaign: camp ? (camp.utm_campaign ?? null) : null
  }
}

// Campaign canonicalization: '' and null both mean "no campaign" — collapse to ONE key on
// BOTH legs. LIVE emits null (campaign || null); the pipes emit raw '' (no nullIf); the reference
// picks '' at pick time (fixes #1/#3/#4) then normalizes here. Treating ''<->null as equal makes
// the representational difference vanish without touching pipes or attribution math.
const canonCampaign = (c) => (c === undefined || c === null || c === '') ? null : c
const bucketKey = (b) => JSON.stringify([b.source, b.medium, canonCampaign(b.campaign)])

// Aggregate the reference model over raw HogQL rows into the pipe's output shape:
// GROUP BY (source, medium, campaign) -> { conversions, revenue }.
export function aggregateModelCredits(conversions, pageviews, creditFn) {
  const pvByVisitor = new Map()
  for (const pv of (pageviews || [])) {
    if (!pvByVisitor.has(pv.distinct_id)) pvByVisitor.set(pv.distinct_id, [])
    pvByVisitor.get(pv.distinct_id).push(pv)
  }
  const buckets = new Map()
  for (const conv of conversions) {
    const c = creditFn(conv, pvByVisitor.get(conv.distinct_id) || [])
    const k = bucketKey(c)
    const b = buckets.get(k) || { source: c.source, medium: c.medium, campaign: canonCampaign(c.campaign), conversions: 0, revenue: 0 }
    b.conversions += 1
    b.revenue += Number(conv.conversion_value) || 0
    buckets.set(k, b)
  }
  return [...buckets.values()]
}

// Aggregate-set parity: bucket-key set equality + per-bucket conversions/revenue
// equality (revenue within a small float tolerance). Symmetric report.
export function compareAggregateBuckets(hogqlBuckets, tinybirdBuckets, { revenueTolerance = 0.01 } = {}) {
  const norm = (rows) => {
    const m = new Map()
    for (const r of (rows || [])) {
      const k = bucketKey(r)
      const existing = m.get(k)
      // Accumulate: a pipe leg can return SEPARATE campaign='' and campaign=null rows for the
      // same (source, medium); canonicalizing collapses them to one key, so sum instead of
      // overwrite (otherwise the second silently drops the first's conversions/revenue).
      if (existing) {
        existing.conversions += Number(r.conversions) || 0
        existing.revenue += Number(r.revenue) || 0
      } else {
        m.set(k, {
          source: r.source, medium: r.medium, campaign: canonCampaign(r.campaign),
          conversions: Number(r.conversions) || 0, revenue: Number(r.revenue) || 0
        })
      }
    }
    return m
  }
  const A = norm(hogqlBuckets)
  const B = norm(tinybirdBuckets)
  const bucketsHogqlOnly = [...A.keys()].filter(k => !B.has(k)).map(k => A.get(k))
  const bucketsTinybirdOnly = [...B.keys()].filter(k => !A.has(k)).map(k => B.get(k))
  const valueMismatches = []
  for (const [k, a] of A) {
    const b = B.get(k)
    if (!b) continue
    if (a.conversions !== b.conversions || Math.abs(a.revenue - b.revenue) > revenueTolerance) {
      valueMismatches.push({ key: k, hogql: a, tinybird: b })
    }
  }
  const totalConversions = [...A.values()].reduce((s, x) => s + x.conversions, 0)
  return {
    totalConversions,
    buckets: A.size,
    bucketsHogqlOnly,
    bucketsTinybirdOnly,
    valueMismatches,
    pass: bucketsHogqlOnly.length === 0 && bucketsTinybirdOnly.length === 0 && valueMismatches.length === 0
  }
}
