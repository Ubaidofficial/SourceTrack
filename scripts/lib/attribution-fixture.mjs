// scripts/lib/attribution-fixture.mjs — the Step-2 ADVERSARIAL construction fixture for the D2 B3 gate.
//
// WHY: pipe-vs-HogQL parity for the nightly write path is structurally unobtainable (KNOWN_ISSUES #19).
// The honest substitute is CONSTRUCTION-TRUTH: seed a KNOWN journey, run the nightly, and assert the
// stored attributed_conversions row equals values computed BY HAND from the documented model formulas —
// never against a fresh calculateAttribution() (that would be a tautology). This module is the single
// source of both the journey (for the seeder) and the hand-computed expected values (for the verifier
// and the construction unit test).
//
// THE JOURNEY (visitor V1) — 4 touchpoints, ordered as the pipe returns them (pageviews_by_visitors:
// ORDER BY distinct_id, timestamp, event_id ASC), a DELIBERATE same-timestamp tie, an AI-Search touch,
// and a DIRECT converting touch (Direct last touch is what triggers the dark-traffic AI stitching, so
// ai_influenced_source / ai_influenced_session_at are exercised — the 4th timestamp field):
//
//   idx source     channel       timestamp (UTC)            event_id            note
//   0   google/cpc Paid Search   2026-07-01T00:00:00.000Z   fixt_tp1_google  ┐ TIE (same ts); pipe breaks
//   1   (ai)       AI Search     2026-07-01T00:00:00.000Z   fixt_tp2_ai      ┘ by event_id → google first
//   2   facebook   Other Campaign 2026-07-08T00:00:00.000Z  fixt_tp3_fb  (utm_medium=social, no click id)
//   3   (direct)   Direct        2026-07-15T00:00:00.000Z   fixt_tp4_direct   converting touch
//   conversion: purchase $100 @ 2026-07-15T12:00:00.000Z
//
// THE TIE IS LOAD-BEARING: 'fixt_tp1_google' < 'fixt_tp2_ai', so the pipe places google first →
// first_touch=google, and u/w-shaped give google the 0.4/0.3 first-position credit. HogQL's
// timestamp-only order could place AI first → first_touch=AI and google's u-shaped credit collapses
// 0.4→0.1. That divergence is invisible to any conversions/revenue SUM and is exactly what --validate
// cannot test (it can't manufacture a comparable tie) — so it is proven here by construction instead.
//
// HAND-COMPUTED DERIVATION (conversionValue = 100; formulas from calculateAttribution):
//   Linear     1/4 each                       → [0.25, 0.25, 0.25, 0.25] / [25, 25, 25, 25]
//   U-shaped   40 / (20÷2 middles) / 40       → [0.4, 0.1, 0.1, 0.4]     / [40, 10, 10, 40]
//   Time-decay 0.5^(daysBack/7): days 14,14,7,0 → raw [0.25,0.25,0.5,1], Σ=2.0
//              → [0.125, 0.125, 0.25, 0.5]     / [12.5, 12.5, 25, 50]   (clean: Σraw=2.0)
//   W-shaped   anchors {0, middleIdx=1, 3}=0.3, other idx2=0.1 → [0.3,0.3,0.1,0.3] / [30,30,10,30]
//   (last entry of each is the reconciliation remainder — here it lands exactly on the formula value.)
//
// last_touch_source IS NOT split[].source — a DELIBERATE field divergence, not drift. The stored SCALAR
// last_touch_source is derived-source-backfilled (utm_source → derived_source → null, nightly-attribution.js:924),
// whereas each split-array .source is utm_source || null only (tpBase, nightly-attribution.js:1099 — NO derived
// fallback). For the SAME touchpoint these two fields can legitimately disagree — the scalar can hold a referrer
// hostname or 'direct' where the split entry holds null. Here V1's converting touch (fixt_tp4_direct) has no
// utm_source and no referrer, so the scalar resolves to 'direct' (derived_source default) while the split-array
// source at index 3 stays null. That is why last_touch_source is 'direct' but every model's split[3].source is
// null below — intentional, not a bug. Any consumer joining last_touch_source against linear_attribution[].source
// MUST account for it.

export const FIXTURE_SITE_ID = 'de200000-babe-41d4-a716-446655441111' // ST_Staging fixture (guarded write target)

export const V1 = {
  visitor: 'fixt_v1_multitouch',
  conversionTs: '2026-07-15T12:00:00.000Z',
  conversionValue: 100,
  conversionEventId: 'fixt_v1_conv',
  // Touchpoints in PIPE order. `ai_source` (not just referrer) makes the AI classification explicit.
  touchpoints: [
    { event_id: 'fixt_tp1_google', ts: '2026-07-01T00:00:00.000Z', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' },
    { event_id: 'fixt_tp2_ai', ts: '2026-07-01T00:00:00.000Z', utm_source: null, utm_medium: null, utm_campaign: null, ai_source: 'chatgpt.com', referrer: 'https://chatgpt.com/' },
    { event_id: 'fixt_tp3_fb', ts: '2026-07-08T00:00:00.000Z', utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'ret' },
    { event_id: 'fixt_tp4_direct', ts: '2026-07-15T00:00:00.000Z', utm_source: null, utm_medium: null, utm_campaign: null }
  ]
}

// Visitor V2 — a $0 subscription-checkout CARRIER conversion (single google touch). isSubscriptionCheckoutCarrier
// matches it, so the nightly `continue`s and NEVER writes an attributed_conversions row (nightly-attribution.js
// line ~1494). Proves the carrier never inflates the money rail — it must be ABSENT, not merely $0.
export const V2 = {
  visitor: 'fixt_v2_carrier',
  touchTs: '2026-07-10T09:00:00.000Z',
  conversionTs: '2026-07-10T10:00:00.000Z',
  conversionEventId: 'fixt_v2_carrier_conv',
  subscriptionId: 'sub_fixt_carrier_v2'
}
// The exact carrier conversion shape isSubscriptionCheckoutCarrier keys on (provider=stripe, purchase, $0,
// has subscription id, checkout.session.completed). Shared by the seeder and the coverage unit test.
export const V2_CARRIER_SHAPE = {
  provider: 'stripe', conversion_type: 'purchase', conversion_value: 0,
  stripe_subscription_id: V2.subscriptionId, stripe_event_type: 'checkout.session.completed'
}

// Visitor V3 — a SINGLE-touchpoint conversion. With nothing to split credit across, all 4 models must
// degrade to giving the one touch 100% (fraction 1.0, full value). google/cpc → Paid Search; last touch
// is not Direct, so no AI stitching (ai_influenced_* stay null).
export const V3 = {
  visitor: 'fixt_v3_singletouch',
  touch: { event_id: 'fixt_v3_tp', ts: '2026-07-12T00:00:00.000Z', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' },
  conversionTs: '2026-07-12T06:00:00.000Z',
  conversionValue: 50,
  conversionEventId: 'fixt_v3_conv'
}
export const V3_EXPECTED = {
  conversion_value: 50,
  first_touch_source: 'google', first_touch_channel: 'Paid Search',
  last_touch_source: 'google', last_touch_channel: 'Paid Search',
  ai_influenced_source: null, ai_influenced_session_at: null,
  linear_attribution: [{ source: 'google', channel: 'Paid Search', fraction: 1, attributed_value: 50 }],
  u_shaped_attribution: [{ source: 'google', channel: 'Paid Search', fraction: 1, attributed_value: 50 }],
  time_decay_attribution: [{ source: 'google', channel: 'Paid Search', fraction: 1, attributed_value: 50 }],
  w_shaped_attribution: [{ source: 'google', channel: 'Paid Search', fraction: 1, attributed_value: 50 }]
}

// Visitor V4 — a DUPLICATE conversion: two $conversion events sharing one external_event_id but with
// DIFFERENT conversion_event_id. The attributed_conversions partial-unique (site_id, external_event_id)
// collapses them → exactly ONE stored row survives (the other upsert hits 23505 → skipped_duplicate).
export const V4 = {
  visitor: 'fixt_v4_dedup',
  touch: { event_id: 'fixt_v4_tp', ts: '2026-07-13T00:00:00.000Z', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' },
  externalEventId: 'fixt_dup_evt',
  conversionValue: 75,
  conversions: [
    { event_id: 'fixt_v4_conv_a', ts: '2026-07-13T06:00:00.000Z' },
    { event_id: 'fixt_v4_conv_b', ts: '2026-07-13T07:00:00.000Z' } // same external_event_id → deduped away
  ]
}

// HAND-COMPUTED expected attributed_conversions values for V1 (pipe order). Split entries carry the
// money-critical fields only: { source, channel, fraction, attributed_value }. NOT produced by
// calculateAttribution — literal, derived above.
export const V1_EXPECTED = {
  conversion_value: 100,
  first_touch_source: 'google',
  first_touch_channel: 'Paid Search',
  last_touch_source: 'direct', // scalar is derived-source-backfilled → 'direct' (see header note); split[3].source stays null — different field
  last_touch_channel: 'Direct',
  ai_influenced_source: 'AI Search',
  ai_influenced_session_at: '2026-07-01T00:00:00.000Z', // the AI touch instant (compared as instant)
  linear_attribution: [
    { source: 'google', channel: 'Paid Search', fraction: 0.25, attributed_value: 25 },
    { source: null, channel: 'AI Search', fraction: 0.25, attributed_value: 25 },
    { source: 'facebook', channel: 'Other Campaign', fraction: 0.25, attributed_value: 25 },
    { source: null, channel: 'Direct', fraction: 0.25, attributed_value: 25 }
  ],
  u_shaped_attribution: [
    { source: 'google', channel: 'Paid Search', fraction: 0.4, attributed_value: 40 },
    { source: null, channel: 'AI Search', fraction: 0.1, attributed_value: 10 },
    { source: 'facebook', channel: 'Other Campaign', fraction: 0.1, attributed_value: 10 },
    { source: null, channel: 'Direct', fraction: 0.4, attributed_value: 40 }
  ],
  time_decay_attribution: [
    { source: 'google', channel: 'Paid Search', fraction: 0.125, attributed_value: 12.5 },
    { source: null, channel: 'AI Search', fraction: 0.125, attributed_value: 12.5 },
    { source: 'facebook', channel: 'Other Campaign', fraction: 0.25, attributed_value: 25 },
    { source: null, channel: 'Direct', fraction: 0.5, attributed_value: 50 }
  ],
  w_shaped_attribution: [
    { source: 'google', channel: 'Paid Search', fraction: 0.3, attributed_value: 30 },
    { source: null, channel: 'AI Search', fraction: 0.3, attributed_value: 30 },
    { source: 'facebook', channel: 'Other Campaign', fraction: 0.1, attributed_value: 10 },
    { source: null, channel: 'Direct', fraction: 0.3, attributed_value: 30 }
  ]
}

// Build the touchpoint objects calculateAttribution consumes, from V1.touchpoints (pipe order).
export function v1TouchpointsForEngine () {
  return V1.touchpoints.map((tp) => ({
    utm_source: tp.utm_source, utm_medium: tp.utm_medium, utm_campaign: tp.utm_campaign,
    ai_source: tp.ai_source || null, referrer: tp.referrer || null, timestamp: tp.ts
  }))
}

// The money-critical projection of an engine split entry, for comparing against *_EXPECTED literals.
export function projectSplit (arr) {
  return (arr || []).map((e) => ({ source: e.source ?? null, channel: e.channel, fraction: e.fraction, attributed_value: e.attributed_value }))
}
