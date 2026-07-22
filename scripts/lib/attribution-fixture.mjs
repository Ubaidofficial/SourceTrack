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

// TWO staging sites, deliberately. Do NOT collapse them.
//
// FIXTURE_SITE_ID — the ORIGINAL fixture site. Holds the V1–V4 construction fixture (already seeded
// and attributed) plus ~29 historical CC validation fixtures. verify-attribution-fixture.mjs reads
// V1–V4 rows here, so this constant must NOT be repointed — doing so would make that verifier fail its
// precondition on an empty site. Also serves as the guard's workspace-liveness discriminator: it is the
// site the live probe counts events on to prove "this workspace is ST_Staging" (prod holds 0).
// Renamed in Supabase to "SourceTrack Fixture (polluted — do not screenshot)".
export const FIXTURE_SITE_ID = 'de200000-babe-41d4-a716-446655441111'

// DEMO_SITE_ID — the CLEAN site, created 2026-07-22, holding ONLY the --demo dataset so website
// screenshots carry no /4d-fixture/ paths, $0 carrier rows, or Stripe test rows. Supabase name:
// "SourceTrack Demo (clean)". The de200000 prefix is REQUIRED — staging-seed-guard.mjs:52 refuses any
// site id without it, and that guard is not ours to weaken.
export const DEMO_SITE_ID = 'de200000-c1ea-4c1e-a000-000000000001'

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

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATASET — the screenshot seed (docs/marketing/demo_seed_spec.md)
// ─────────────────────────────────────────────────────────────────────────────
// SEPARATE FROM V1–V4 ABOVE. V1–V4 are the adversarial CONSTRUCTION fixture (hand-computed expectations,
// asserted by verify-attribution-fixture.mjs + two unit tests). This block is VOLUME + REALISM for website
// screenshots. They coexist on the same staging site and must never collide:
//   - every demo id is prefixed `demo_` (V1–V4 use `fixt_`), so the verifier's event_id-scoped queries and
//     V4's external_event_id dedupe check are untouched;
//   - the seeder gates them behind separate flags and separate presence pre-checks.
//
// REPLAY, NOT INSERT: these are pageview+conversion EVENTS fired through dualWriteEvent, exactly like
// V1–V4. The nightly stitches the touchpoints. Nothing here writes attributed_conversions directly —
// that is what produced the defective orphan-Direct rows (0 touchpoints, NULL first_touch) in prod.
//
// NO HUMAN NAMES BY DESIGN: the Leads table renders Visitor ID / Source / Medium / Campaign / AI Source /
// Conversions / Revenue / Last Seen / Country — the product is cookieless and stores no person. The
// normalizer would drop name-ish keys anyway (normalize.js PII_KEYS). Realism here = journey depth,
// revenue spread, AI-source variety and a ~30-day curve, NOT fabricated people.

// Day 0 of the demo window. FIXED, not Date.now(): the dry-run plan must be byte-identical to what the
// write emits, and the verifier needs stable timestamps. Re-seeding for fresh screenshots = bump this.
export const DEMO_ANCHOR_UTC = '2026-07-22'
export const DEMO_VISITOR_PREFIX = 'demo_v_'

// Touch presets → the exact property shapes channelFromEvent (api/lib/channel-classifier.js) resolves.
// Channel decision order verified against that file: AI (221) → Paid Search (225/226) → Paid Social
// (230/231) → Email (241) → Organic Search (245) → Referral (259) → Direct (262).
// derived_source = utm_source || gclid || hostname(referrer, www-stripped) || 'direct'
// (nightly-attribution.js:799) — which is what first_touch_source falls back to (line 866).
export const DEMO_TOUCH_PRESETS = {
  ai_chatgpt:   { referrer: 'https://chatgpt.com/', ai_source: 'chatgpt.com' },
  ai_perplexity:{ referrer: 'https://www.perplexity.ai/', ai_source: 'perplexity.ai' },
  ai_claude:    { referrer: 'https://claude.ai/', ai_source: 'claude.ai' },
  ai_gemini:    { referrer: 'https://gemini.google.com/', ai_source: 'gemini.google.com' },
  organic:      { referrer: 'https://www.google.com/' },
  organic_bing: { referrer: 'https://www.bing.com/' },
  paid_search:  { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'attribution-software', gclid: 'demo_gclid_x1' },
  paid_brand:   { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand-defense', gclid: 'demo_gclid_x2' },
  paid_social:  { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'founders-q3', fbclid: 'demo_fbclid_x1' },
  paid_li:      { utm_source: 'linkedin', utm_medium: 'paid_social', utm_campaign: 'saas-icp', li_fat_id: 'demo_lifat_x1' },
  referral:     { referrer: 'https://news.ycombinator.com/' },
  email:        { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'weekly-digest' },
  direct:       {}
}

// The journey plan. Tuple: [suffix, touches[[preset, daysBack, path]], conversionValue|null, country, device, browser]
// conversionValue null = a NON-converting visitor (traffic realism: the funnel must not be 100%).
// First-touch channel mix across the 45 visitors — Organic 14 (31%) · Paid Search 9 (20%) ·
// Paid Social 7 (16%) · AI 7 (16%) · Direct 4 (9%) · Referral+Email 4 (9%). 16 journeys carry an AI
// touch somewhere (36% — spec floor is 30%).
export const DEMO_PLAN = [
  // ── HERO-1 — the money shot. ChatGPT first touch → $2,000 annual. first_touch_source MUST be
  // 'chatgpt.com' (no utm_source, no gclid → derived_source falls to the referrer hostname).
  ['h1_hero', [['ai_chatgpt', 8, '/blog/how-to-track-chatgpt-traffic'], ['organic', 5, '/'], ['direct', 2, '/pricing']], 2000, 'US', 'desktop', 'Chrome'],
  // ── HERO-2 — the SEO landing-page half of keyword→revenue. The GSC keyword half is NOT seedable
  // here (it lives in Supabase gsc_performance_daily, not Tinybird) — see the seeder header.
  ['h2_seo', [['organic', 27, '/marketing-attribution-software'], ['organic', 20, '/blog/revenue-attribution'], ['direct', 14, '/pricing'], ['direct', 12, '/pricing']], 249, 'GB', 'desktop', 'Safari'],
  // ── HERO-4 — AI variety. Four distinct AI sources so the AI Sources panel renders populated.
  ['h4_perplexity', [['ai_perplexity', 19, '/blog/multi-touch-attribution-models'], ['direct', 17, '/pricing']], 149, 'DE', 'desktop', 'Firefox'],
  ['h4_claude', [['ai_claude', 16, '/blog/cookieless-attribution'], ['organic', 13, '/product'], ['direct', 11, '/pricing']], 99, 'CA', 'desktop', 'Chrome'],
  ['h4_gemini', [['ai_gemini', 24, '/blog/revenue-attribution'], ['direct', 22, '/pricing']], 49, 'AU', 'mobile', 'Chrome'],

  // ── AI-first, remaining (7 AI-first total incl. the four heroes above)
  ['ai_01', [['ai_chatgpt', 30, '/blog/how-to-track-chatgpt-traffic'], ['organic', 26, '/product'], ['direct', 25, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['ai_02', [['ai_perplexity', 12, '/blog/first-touch-vs-last-touch-attribution']], null, 'NL', 'desktop', 'Chrome'],
  // Non-converting by design: keeps `converting` at 35 (spec ceiling) while carrying the 7th AI first
  // touch, and its day-0 touch is what makes the window span the full 30 days.
  ['ai_03', [['ai_claude', 3, '/blog/cookieless-attribution'], ['direct', 0, '/pricing']], null, 'US', 'desktop', 'Chrome'],

  // ── Organic-first (14)
  // Deliberately the deepest chain (6 touches) — this is the journey the Lead Journey panel screenshot
  // frames when it needs to show real multi-touch depth rather than a 2-hop.
  ['org_01', [['organic', 28, '/blog/revenue-attribution'], ['organic', 24, '/product'], ['ai_chatgpt', 21, '/blog/how-to-track-chatgpt-traffic'], ['organic', 19, '/marketing-attribution-software'], ['direct', 18, '/pricing'], ['direct', 17, '/pricing']], 249, 'US', 'desktop', 'Chrome'],
  ['org_02', [['organic', 26, '/marketing-attribution-software'], ['direct', 23, '/pricing']], 99, 'US', 'desktop', 'Safari'],
  ['org_03', [['organic', 25, '/blog/cookieless-attribution'], ['organic', 18, '/product'], ['direct', 15, '/pricing']], 149, 'FR', 'desktop', 'Firefox'],
  ['org_04', [['organic_bing', 23, '/blog/multi-touch-attribution-models'], ['direct', 21, '/pricing']], 49, 'US', 'mobile', 'Safari'],
  ['org_05', [['organic', 22, '/marketing-attribution-software'], ['ai_claude', 19, '/product'], ['direct', 18, '/pricing']], 249, 'GB', 'desktop', 'Chrome'],
  ['org_06', [['organic', 21, '/blog/revenue-attribution']], null, 'IN', 'mobile', 'Chrome'],
  ['org_07', [['organic', 20, '/product'], ['ai_gemini', 18, '/blog/revenue-attribution'], ['direct', 17, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['org_08', [['organic', 18, '/blog/how-to-track-chatgpt-traffic'], ['ai_perplexity', 16, '/product'], ['organic', 14, '/pricing'], ['direct', 13, '/pricing']], 149, 'DE', 'desktop', 'Chrome'],
  ['org_09', [['organic', 15, '/marketing-attribution-software']], null, 'BR', 'mobile', 'Chrome'],
  ['org_10', [['organic', 13, '/blog/cookieless-attribution'], ['direct', 10, '/pricing']], 49, 'ES', 'desktop', 'Firefox'],
  ['org_11', [['organic', 11, '/product'], ['organic', 8, '/blog/revenue-attribution'], ['direct', 6, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['org_12', [['organic', 9, '/marketing-attribution-software'], ['ai_gemini', 7, '/product'], ['direct', 5, '/pricing']], 249, 'US', 'desktop', 'Safari'],
  ['org_13', [['organic', 6, '/blog/first-touch-vs-last-touch-attribution']], null, 'IT', 'mobile', 'Safari'],
  ['org_14', [['organic', 4, '/product'], ['direct', 2, '/pricing']], 99, 'SE', 'desktop', 'Chrome'],

  // ── Paid Search-first (9)
  ['ps_01', [['paid_search', 27, '/marketing-attribution-software'], ['direct', 24, '/pricing']], 149, 'US', 'desktop', 'Chrome'],
  ['ps_02', [['paid_search', 24, '/marketing-attribution-software'], ['organic', 20, '/product'], ['direct', 19, '/pricing']], 249, 'US', 'desktop', 'Chrome'],
  ['ps_03', [['paid_brand', 22, '/'], ['direct', 20, '/pricing']], 49, 'GB', 'mobile', 'Chrome'],
  ['ps_04', [['paid_search', 19, '/marketing-attribution-software']], null, 'US', 'desktop', 'Edge'],
  ['ps_05', [['paid_search', 17, '/product'], ['ai_chatgpt', 15, '/blog/revenue-attribution'], ['direct', 14, '/pricing']], 249, 'CA', 'desktop', 'Chrome'],
  ['ps_06', [['paid_brand', 14, '/'], ['organic', 11, '/product'], ['direct', 9, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['ps_07', [['paid_search', 12, '/marketing-attribution-software'], ['direct', 9, '/pricing']], 149, 'DE', 'desktop', 'Firefox'],
  ['ps_08', [['paid_search', 8, '/product']], null, 'US', 'mobile', 'Chrome'],
  ['ps_09', [['paid_brand', 5, '/'], ['direct', 3, '/pricing']], 49, 'US', 'desktop', 'Chrome'],

  // ── Paid Social-first (7)
  ['psoc_01', [['paid_social', 26, '/'], ['organic', 22, '/product'], ['direct', 21, '/pricing']], 99, 'US', 'mobile', 'Chrome'],
  ['psoc_02', [['paid_li', 23, '/use-cases/saas'], ['direct', 20, '/pricing']], 249, 'US', 'desktop', 'Chrome'],
  ['psoc_03', [['paid_social', 20, '/'], ['ai_claude', 18, '/product'], ['direct', 16, '/pricing']], 149, 'NL', 'desktop', 'Chrome'],
  ['psoc_04', [['paid_li', 16, '/use-cases/saas']], null, 'US', 'desktop', 'Chrome'],
  ['psoc_05', [['paid_social', 13, '/'], ['direct', 11, '/pricing']], 49, 'MX', 'mobile', 'Chrome'],
  ['psoc_06', [['paid_li', 10, '/use-cases/agencies'], ['organic', 7, '/product'], ['direct', 6, '/pricing']], 99, 'GB', 'desktop', 'Safari'],
  ['psoc_07', [['paid_social', 7, '/']], null, 'US', 'mobile', 'Safari'],

  // ── Direct-first (4)
  ['dir_01', [['direct', 25, '/'], ['organic', 21, '/product'], ['direct', 19, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['dir_02', [['direct', 18, '/'], ['direct', 15, '/pricing']], 49, 'US', 'desktop', 'Chrome'],
  ['dir_03', [['direct', 12, '/']], null, 'JP', 'mobile', 'Safari'],
  ['dir_04', [['direct', 6, '/'], ['ai_chatgpt', 4, '/blog/how-to-track-chatgpt-traffic'], ['direct', 3, '/pricing']], 149, 'US', 'desktop', 'Chrome'],

  // ── Referral + Email-first (4)
  ['ref_01', [['referral', 28, '/blog/revenue-attribution'], ['organic', 25, '/product'], ['direct', 23, '/pricing']], 249, 'US', 'desktop', 'Firefox'],
  ['ref_02', [['referral', 17, '/blog/cookieless-attribution']], null, 'US', 'desktop', 'Chrome'],
  ['eml_01', [['email', 15, '/product'], ['direct', 12, '/pricing']], 99, 'US', 'desktop', 'Chrome'],
  ['eml_02', [['email', 9, '/blog/multi-touch-attribution-models'], ['organic', 6, '/product'], ['direct', 4, '/pricing']], 149, 'CA', 'desktop', 'Chrome']
]

// Deterministic timestamp: `daysBack` before DEMO_ANCHOR_UTC, at a fixed spread-out hour.
// hourSalt keeps same-day touches from colliding and gives the time-series intra-day texture.
function demoTs (daysBack, hourSalt) {
  const base = new Date(`${DEMO_ANCHOR_UTC}T00:00:00.000Z`).getTime()
  const hour = 8 + (hourSalt % 10) // 08:00–17:00 UTC
  return new Date(base - (daysBack * 86400000) + (hour * 3600000)).toISOString()
}

// Expand DEMO_PLAN into concrete journeys. PURE + deterministic — the dry-run prints exactly what the
// write emits. Returns [{ visitor, touchpoints: [{event_id, ts, path, ...props}], conversion|null }].
export function buildDemoJourneys () {
  return DEMO_PLAN.map(([suffix, touches, value, country, device, browser], ji) => {
    const visitor = `${DEMO_VISITOR_PREFIX}${suffix}`
    const touchpoints = touches.map(([preset, daysBack, path], ti) => {
      const p = DEMO_TOUCH_PRESETS[preset]
      if (!p) throw new Error(`unknown demo touch preset: ${preset}`)
      return {
        event_id: `demo_${suffix}_tp${ti + 1}`,
        ts: demoTs(daysBack, ji + ti),
        preset,
        path,
        utm_source: p.utm_source ?? null,
        utm_medium: p.utm_medium ?? null,
        utm_campaign: p.utm_campaign ?? null,
        referrer: p.referrer ?? null,
        ai_source: p.ai_source ?? null,
        gclid: p.gclid ?? null,
        fbclid: p.fbclid ?? null,
        li_fat_id: p.li_fat_id ?? null,
        country,
        device_type: device,
        browser_name: browser
      }
    })
    // Conversion fires 6h after the last touch — inside the window, always after the touch chain.
    const lastTs = touchpoints[touchpoints.length - 1].ts
    const conversion = value == null
      ? null
      : {
          event_id: `demo_${suffix}_conv`,
          ts: new Date(new Date(lastTs).getTime() + 6 * 3600000).toISOString(),
          value
        }
    return { visitor, touchpoints, conversion }
  })
}

// Marker conversion ids — the seeder's demo-presence pre-check keys on these (NOT the V1–V4 markers,
// so the two seeds stay independently re-runnable).
export function demoConversionEventIds () {
  return buildDemoJourneys().filter((j) => j.conversion).map((j) => j.conversion.event_id)
}
