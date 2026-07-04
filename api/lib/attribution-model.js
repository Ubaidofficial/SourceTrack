// SourceTrack — shared attribution allocation model (single source of truth).
//
// PURE, side-effect-free. NO dotenv, NO Supabase, NO main(), NO process.exit, NO
// network. Imports only channelFromEvent (itself pure). Imported by BOTH the live
// read path (api/lib/attribution-engine.js, which re-exports calculateAttribution)
// and the nightly write path (api/jobs/nightly-attribution.js). Extracting it here
// ends the two-engine drift (divergent adjustReconciliation / time_decay NaN-guard /
// field sets) documented during the Tinybird migration.
//
// FIELD SET = UNION (founder-decided, "union-now"): tpBase and first_touch/last_touch
// emit BOTH the read-path fields (keyword/utm_term/referrer_domain) AND the write-path
// field (derived_source). derived_source is READ from tp.derived_source (set by each
// producer's shaping) — NOT computed here. On the nightly path tp.utm_term is currently
// undefined, so keyword/utm_term serialize as null in nightly-written rows until the
// ingestion change lands; that is expected and accepted.

import { channelFromEvent } from './channel-classifier.js'

export function extractReferrerDomain(referrer) {
  if (!referrer || referrer.trim() === '') return 'direct'
  let str = referrer.trim()
  if (!str.includes('://')) {
    str = 'https://' + str
  }
  try {
    const url = new URL(str)
    let host = url.hostname.toLowerCase()
    if (host.startsWith('www.')) {
      host = host.slice(4)
    }
    return host || 'unknown'
  } catch (_) {
    return 'unknown'
  }
}

export function calculateAttribution(touchpoints, conversionValue) {
  if (!touchpoints || touchpoints.length === 0) {
    return {
      first_touch: null,
      last_touch: null,
      linear: [],
      u_shaped: [],
      time_decay: [],
      w_shaped: []
    }
  }

  const firstTouchpoint = touchpoints[0]
  const lastTouchpoint = touchpoints[touchpoints.length - 1]

  const tpCh = (tp) => channelFromEvent({
    utm_source: tp.utm_source, utm_medium: tp.utm_medium,
    ai_source: tp.ai_source, gclid: tp.gclid, gbraid: tp.gbraid, wbraid: tp.wbraid,
    fbclid: tp.fbclid, msclkid: tp.msclkid, ttclid: tp.ttclid,
    li_fat_id: tp.li_fat_id, li_fatid: tp.li_fatid, twclid: tp.twclid,
    dclid: tp.dclid, snapclid: tp.snapclid, pclid: tp.pclid,
    sccid: tp.sccid, ko_click_id: tp.ko_click_id,
    referrer: tp.referrer, page_url: tp.page_url
  })
  const tpBase = (tp) => {
    const base = {
      source: tp.utm_source || null,
      medium: tp.utm_medium || null,
      campaign: tp.utm_campaign || null,
      keyword: tp.utm_term || null,
      utm_term: tp.utm_term || null,
      referrer_domain: extractReferrerDomain(tp.referrer),
      derived_source: tp.derived_source || null,
      channel: tpCh(tp),
      timestamp: tp.timestamp,
      country: tp.country || 'unknown',
      device: tp.device || 'unknown',
      browser: tp.browser || 'unknown',
      landing_page: tp.landing_page || 'unknown'
    }
    for (const key of Object.keys(tp)) {
      if (key.startsWith('custom_')) {
        base[key] = tp[key]
      }
    }
    return base
  }

  // ── Linear ──────────────────────────────────────────────────────────────────
  const fraction = 1.0 / touchpoints.length
  const linearValue = conversionValue * fraction
  const linear = touchpoints.map(tp => ({
    ...tpBase(tp),
    fraction: parseFloat(fraction.toFixed(4)),
    attributed_value: parseFloat(linearValue.toFixed(2))
  }))

  // ── U-Shaped (40/20/40) ──────────────────────────────────────────────────────
  const u_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    const middleCount = touchpoints.length - 2
    const middleFraction = parseFloat((0.2 / middleCount).toFixed(4))
    const middleValue = parseFloat((conversionValue * 0.2 / middleCount).toFixed(2))
    return touchpoints.map((tp, i) => {
      if (i === 0) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      if (i === touchpoints.length - 1) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      return { ...tpBase(tp), fraction: middleFraction, attributed_value: middleValue }
    })
  })()

  // ── Time Decay (7-day half-life) ─────────────────────────────────────────────
  const time_decay = (() => {
    const conversionTime = new Date(lastTouchpoint.timestamp).getTime()
    const isConversionTimeValid = !isNaN(conversionTime)

    // Check if any touchpoint has an invalid timestamp
    let hasInvalid = !isConversionTimeValid
    const tpTimes = touchpoints.map(tp => {
      const t = new Date(tp.timestamp).getTime()
      if (isNaN(t)) hasInvalid = true
      return t
    })

    const halfLifeDays = 7
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

    const rawWeights = touchpoints.map((tp, i) => {
      if (hasInvalid) {
        // Fall back to equal decay weights when valid ordering/dates cannot be computed
        return 1.0
      }
      const daysBack = Math.max(0, (conversionTime - tpTimes[i]) / halfLifeMs)
      return Math.pow(0.5, daysBack) // 0.5^(days/halfLife)
    })

    const totalWeight = rawWeights.reduce((s, w) => s + w, 0) || 1
    return touchpoints.map((tp, i) => {
      const frac = parseFloat((rawWeights[i] / totalWeight).toFixed(4))
      return {
        ...tpBase(tp),
        fraction: frac,
        attributed_value: parseFloat((conversionValue * frac).toFixed(2))
      }
    })
  })()

  // ── W-Shaped (30/30/30/10) ───────────────────────────────────────────────────
  const w_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    if (touchpoints.length === 3) {
      return touchpoints.map((tp, i) => ({
        ...tpBase(tp),
        fraction: 0.333,
        attributed_value: parseFloat((conversionValue / 3).toFixed(2))
      }))
    }
    const middleIdx = Math.floor((touchpoints.length - 1) / 2)
    const anchorIndices = new Set([0, middleIdx, touchpoints.length - 1])
    const otherCount = touchpoints.length - anchorIndices.size
    const otherFrac = otherCount > 0 ? parseFloat((0.1 / otherCount).toFixed(4)) : 0
    const otherValue = otherCount > 0 ? parseFloat((conversionValue * 0.1 / otherCount).toFixed(2)) : 0
    return touchpoints.map((tp, i) => {
      if (anchorIndices.has(i)) {
        return { ...tpBase(tp), fraction: 0.3, attributed_value: parseFloat((conversionValue * 0.3).toFixed(2)) }
      }
      return { ...tpBase(tp), fraction: otherFrac, attributed_value: otherValue }
    })
  })()

  const adjustReconciliation = (shares) => {
    if (!shares || shares.length === 0) return shares
    const sumOthers = shares.slice(0, -1).reduce((s, x) => s + x.attributed_value, 0)
    shares[shares.length - 1].attributed_value = parseFloat((conversionValue - sumOthers).toFixed(2))
    const fracOthers = shares.slice(0, -1).reduce((s, x) => s + x.fraction, 0)
    shares[shares.length - 1].fraction = parseFloat((1.0 - fracOthers).toFixed(4))
    return shares
  }

  return {
    first_touch: {
      source: firstTouchpoint.utm_source || null,
      medium: firstTouchpoint.utm_medium || null,
      campaign: firstTouchpoint.utm_campaign || null,
      keyword: firstTouchpoint.utm_term || null,
      utm_term: firstTouchpoint.utm_term || null,
      referrer_domain: extractReferrerDomain(firstTouchpoint.referrer),
      derived_source: firstTouchpoint.derived_source || null,
      timestamp: firstTouchpoint.timestamp
    },
    last_touch: {
      source: lastTouchpoint.utm_source || null,
      medium: lastTouchpoint.utm_medium || null,
      campaign: lastTouchpoint.utm_campaign || null,
      keyword: lastTouchpoint.utm_term || null,
      utm_term: lastTouchpoint.utm_term || null,
      referrer_domain: extractReferrerDomain(lastTouchpoint.referrer),
      derived_source: lastTouchpoint.derived_source || null,
      timestamp: lastTouchpoint.timestamp
    },
    linear: adjustReconciliation(linear),
    u_shaped: adjustReconciliation(u_shaped),
    time_decay: adjustReconciliation(time_decay),
    w_shaped: adjustReconciliation(w_shaped)
  }
}
