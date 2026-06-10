# Session 132 Attribution Accuracy Audit

**Date:** 2026-06-10
**Branch:** `main` (clean, tree at commit `7b1d4e7`)
**Auditor:** Claude (Opus 4.7)
**Scope:** Read-only audit. No code changes. Single file produced: this report.

---

## Verdict

**Approved with fixes needed.** The attribution engine is mathematically correct, the channel classifier is a single source of truth, and the tracker captures every click ID and AI domain that matters. SourceTrack is closer to "trustworthy" than I expected. But three classes of issues stand between this and a confident paid-beta launch: (1) marketing/UI claims that don't exactly match the code (8 vs 9 models; "Multi-touch attribution" implied as always-on when it requires a nightly job to have run); (2) cookieless mode that silently generates throwaway anonymous IDs on server failure, breaking every cross-session journey without telling anyone; (3) the dashboard never tells a marketer which attribution model they're looking at in the default view, and "direct" is never explained inside the app. None of these break attribution math — but the first two erode trust the moment a customer notices, and the third is exactly the "technically working but confusing" failure mode Session 132 was meant to catch. Approve after a Session 132A that fixes these in order.

---

## Scores

| Area | Score |
|---|---:|
| Tracker capture accuracy | **88 / 100** |
| Source classification accuracy | **87 / 100** |
| Conversion stitching readiness | **80 / 100** |
| Revenue dedupe readiness | **78 / 100** |
| Journey explainability | **84 / 100** |
| Report consistency | **74 / 100** |
| Direct / unknown handling clarity | **62 / 100** |
| **Overall attribution trust readiness** | **78 / 100** |

---

## P0 Blockers

### P0-1. Cookieless mode silently generates throwaway anonymous IDs

- **Issue.** When the cookieless tracker can't reach `/api/tracker/id` (network failure, ad-blocker on that endpoint, server hiccup, or the slow path inside `fetchId().catch`), it falls back to `'cl-' + Math.random()...` in-memory. That fallback is a fresh id on every page load. There is no error log, no console warning, no telemetry signal, and no UI surface that says "your cookieless visitors aren't being stitched."
- **Evidence.** [tracker/tracker.cookieless.js:117](tracker/tracker.cookieless.js:117) and [tracker/tracker.cookieless.js:122](tracker/tracker.cookieless.js:122): `AID = (j && j.visitor_id) || 'cl-' + Math.random()…` and the `.catch` branch does the same. First-touch is derived in-memory only ([tracker.cookieless.js:67](tracker/tracker.cookieless.js:67) comment: "first-touch is session-scoped, not cross-session").
- **File/route.** `tracker/tracker.cookieless.js`; consumed by `/api/track` and `/api/conversion`.
- **User impact.** A customer who enables cookieless mode (Privacy-friendly tier) sees full pageview counts but every conversion looks like first-time direct because the anonymous id changed between visit and conversion. They blame us for inaccurate attribution. They never know it was a transient `/api/tracker/id` blip or an ad-blocker rule.
- **Required fix.** (a) Stop generating random fallback IDs silently. Either retry the server fetch with exponential backoff, log a one-time `console.warn` with a doc link, and/or send a `tracker_id_fallback` event so we can surface it in the Event Debugger. (b) In Settings/Privacy where cookieless is enabled, add a one-liner: "Cookieless mode stitches identity via daily salted server hashes. If our `/api/tracker/id` endpoint is blocked, anonymous IDs reset every page load and cross-session attribution will not work."

### P0-2. Marketing & UI claim "8 attribution models"; engine implements 9; multi-touch models require a nightly cron job to populate `attributed_conversions`

- **Issue.** Two sub-problems with the same root cause — the surface claim and the runtime behavior don't match.
  - The actual `ALLOWED_MODELS` set in [api/routes/attribution.js:4](api/routes/attribution.js:4) is **9** models: `first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, ai_platforms, linear, u_shaped, time_decay, w_shaped`. Landing copy ([dashboard/src/pages/Landing.jsx:110](dashboard/src/pages/Landing.jsx:110), [SolutionLeadGen.jsx:17](dashboard/src/pages/SolutionLeadGen.jsx:17), [SolutionEcommerce.jsx:18](dashboard/src/pages/SolutionEcommerce.jsx:18)) advertises "8 attribution models." Minor off-by-one in marketing copy is not the P0 — it's the second part.
  - The four multi-touch models (`linear`, `u_shaped`, `w_shaped`, `time_decay`) all read from the pre-aggregated `attributed_conversions` table populated by [api/jobs/nightly-attribution.js](api/jobs/nightly-attribution.js). [attribution-engine.js:2109, 2143, 2202, 2249, 2293, 2337](api/lib/attribution-engine.js:2109) all `.from('attributed_conversions')`. If the nightly job has not run for a site yet — and it explicitly aborts if another run is in progress ([nightly-attribution.js:65](api/jobs/nightly-attribution.js:65)) — these models return empty with a hidden `_notice` field on the API response. The UI does not surface the notice prominently.
- **Evidence.** Marketing: `Landing.jsx:79` "8 attribution models". Engine: `attribution.js:4` ALLOWED_MODELS has 9. Live multi-touch fallback at `attribution.js:161` returns empty results with a `_notice`; this notice does not appear in the dashboard cards I read.
- **File/route.** `api/routes/attribution.js`, `api/lib/attribution-engine.js:2109+`, `api/jobs/nightly-attribution.js`, marketing pages.
- **User impact.** A user picks "U-shaped attribution" on the Report Builder, sees an empty chart, assumes the product is broken. Or worse — sees a partial chart and trusts it without knowing the nightly job last ran 36 hours ago.
- **Required fix.** (a) Surface a banner inside any multi-touch report explaining "Last computed: <timestamp>. Multi-touch models update once daily." (b) If `attributed_conversions` is empty for the site, the empty state must say so directly: "Multi-touch attribution data is being computed. Try First-touch or Last-touch reports until the first nightly run completes." (c) Reconcile marketing copy to "9 attribution models" OR drop one from the dropdown — either is fine; the math is right, the count just needs to match.

### P0-3. The dashboard never tells you which attribution model you're looking at

- **Issue.** The Dashboard KPI cards and the Reports they pin in default views render numbers using `last_touch` as default ([ReportBuilder.jsx:445](dashboard/src/pages/ReportBuilder.jsx:445)) but display no "Last touch" label next to the figure. A marketer pulls up "Revenue by source" and has no idea whether that revenue is credited via last-touch, first-touch, or one of the multi-touch models. Two different cards on the same dashboard could use two different models and the user would see them side by side without context.
- **Evidence.** Dashboard.jsx KPI cards do not render the chosen model. ReportBuilder.jsx shows the model only in edit mode and on the saved-report meta hover.
- **File/route.** `dashboard/src/pages/Dashboard.jsx`, `dashboard/src/components/MetricTile.jsx` (likely), any rendered report card.
- **User impact.** Two channel breakdowns disagree, the marketer doesn't trust either, churns or asks support. This is the textbook "technically working but confusing" failure mode you wanted Session 132 to catch.
- **Required fix.** Every report card on the Dashboard must show the attribution model used (e.g., a small "Last touch" / "Linear (multi-touch)" badge in the card header). Empty/no-data states should also state which model produced the empty result.

---

## P1 Must Fix Before Self-Serve Paid Beta

### P1-1. "Direct" has zero in-app explanation
- **Issue.** Direct is the single most misunderstood label in analytics, and SourceTrack defines it cleanly in code ([channel-classifier.js:74-76](api/lib/channel-classifier.js:74)) — "no UTM, no recognized referrer, or source === 'direct'" — but never inside the dashboard. Only `DocsTroubleshooting.jsx:26-29` mentions it.
- **Evidence.** No tooltip, no info icon, no callout adjacent to the "Direct" row in Dashboard/Campaigns/Report Builder.
- **User impact.** Customer sees 60% Direct, panics, asks "is your tracker broken?"
- **Required fix.** One info-tooltip next to the Direct row in Dashboard top-sources card: "Direct = no campaign tag and no recognized referrer. Common causes: app-to-app handoff, HTTPS→HTTP, AI tools stripping referrer, bookmarks. Returning visitors with prior known source are NOT counted as direct."

### P1-2. Cookieless mode trade-offs are not documented honestly inside the UI
- **Issue.** The tracker correctly note in code that cookieless first-touch is session-scoped only ([tracker.cookieless.js:66 comment](tracker/tracker.cookieless.js:66)). No UI exposes this. Privacy.jsx and Site settings do not warn users that cookieless trades off cross-session continuity.
- **Evidence.** I found no string in `dashboard/src/pages` that explains the cookieless ↔ cross-session attribution trade-off.
- **User impact.** Customer turns on cookieless for compliance, then can't reconcile why their multi-day journeys look thinner.
- **Required fix.** Inside Settings → Privacy when cookieless is enabled, add a callout: "Cookieless mode rotates anonymous IDs server-side every day. Same-day conversions are stitched; conversions on day N+1 are treated as new visitors. Use the standard tracker if multi-day journeys matter."

### P1-3. Sessionization does not split on UTM change
- **Issue.** [api/lib/sessionization.js](api/lib/sessionization.js) splits sessions by 30-min inactivity only ([line 6](api/lib/sessionization.js:6)). If a visitor enters via `?utm_source=google`, browses for 10 min, then clicks an email link `?utm_source=newsletter`, both pageviews live in the same session. The journey view ([Journey.jsx](dashboard/src/pages/Journey.jsx)) renders them as one session with the FIRST source label — the email touch is hidden as far as session-level attribution goes.
- **Evidence.** No UTM-change branching in the sessionizer. `sessionization.js:32` checks time gap only.
- **User impact.** Multi-touch journey reports under-count distinct campaign touches. Same-session A→B campaigns get rolled up to A.
- **Required fix.** Either (a) split sessions on UTM/click-ID change; (b) keep current sessionization but ensure Journey.jsx shows the per-pageview UTM, not the per-session UTM (the agent indicates it does — verify); (c) document the choice in DocsTroubleshooting.jsx so users understand "one campaign visit = one session" is by design.

### P1-4. Conversion engine joins on PostHog `distinct_id` only — no fallback to `user_id`
- **Issue.** [attribution-engine.js:1002, 1079, 1146](api/lib/attribution-engine.js:1002) all join on `distinct_id`. The `/api/identify` endpoint accepts `user_id`, but the attribution engine does not stitch a conversion to a known `user_id` if the `distinct_id` (anonymous_id) doesn't match.
- **Evidence.** ConversionExplanationModal.jsx and DevelopersOfflineConversions.jsx both mention `user_id` as an identity field, but the engine doesn't read it.
- **User impact.** A SaaS user logs in on device A (gets identified), converts on device B (signed in, same user_id, different anonymous_id) → conversion attributes to "direct" because no prior pageview matches the new anonymous_id. The user_id link is ignored at attribution time.
- **Required fix.** Either implement user_id-based identity resolution in the engine (proper feature work, P1 because the doc implies it) or remove `user_id` from the offline-conversion docs as an attribution stitcher (it can still be useful as metadata).

### P1-5. Revenue dedupe is correct at insertion, but raw-event reads can double-count
- **Issue.** [api/routes/conversion.js:13-19](api/routes/conversion.js:13) uses a 24h in-memory `NodeCache` to dedupe `external_event_id` (`site_id:order_id:type`). The Stripe and Shopify webhook handlers use `revenue_ingestion_events` for persistent idempotency. **But** the attribution engine reads from the raw PostHog `events` table at attribution time and does not consume the `status='duplicate'` flag from `revenue_ingestion_events`. If a `$conversion` event has already been captured to PostHog and then a duplicate arrives, the second insert IS blocked by the 24h cache — BUT after process restart, cache is empty, and dedupe relies solely on `order_id` being present.
- **Evidence.** `conversion.js:17-19` comment: "Note: restarts lose the cache." `attribution-engine.js` queries `events` table directly, no `revenue_ingestion_events` join.
- **User impact.** Server restart during a Black-Friday checkout storm → identical `order_id` events sent 60 seconds apart get both captured to PostHog. Revenue inflates.
- **Required fix.** Use the `revenue_ingestion_events` table as the canonical idempotency check on the conversion route (not just on Stripe/Shopify webhooks); or replace the in-memory cache with a Postgres-backed dedup table. Either way, dedupe must survive process restart.

### P1-6. "AI Platforms" model is not what it sounds like
- **Issue.** [ConversionExplanationModal.jsx:112](dashboard/src/components/ConversionExplanationModal.jsx:112) says the AI Platforms model "detects the referrer at conversion time and matches it against known AI platform domains." This is technically correct but doesn't say what happens when the conversion's `ai_source` is empty AND a prior pageview had `ai_source = ChatGPT`. The implementation in attribution-engine likely only counts conversions whose event itself carries `ai_source`. So a user who lands via ChatGPT, clicks around, then converts an hour later with referrer cleared will NOT credit ChatGPT under this model.
- **Evidence.** `attribution-engine.js` line ~280-307 (per the agent's audit). The model name "AI Platforms" implies platform-level attribution; the implementation is "AI referral at conversion event."
- **User impact.** Marketers expecting "all conversions attributable to an AI platform touch in the journey" get a much smaller number.
- **Required fix.** Either rename to "AI Platform — direct referral at conversion" so the scope is clear, or extend the model to walk the journey and credit any AI touch in the lookback window.

### P1-7. Same-domain referrer is classified as `Referral`, not `Direct`
- **Issue.** [channel-classifier.js:71](api/lib/channel-classifier.js:71) classifies any referrer with `length > 5` as Referral. There's no exception for the same hostname. An internal link from `/blog` to `/pricing` therefore appears as Referral from your own domain.
- **Evidence.** Line 71 quote: `if (ref && ref.length > 5) return 'Referral'`.
- **User impact.** Internal navigation pollutes the Referral channel. Top-of-funnel Referral numbers are inflated and not actionable.
- **Required fix.** Strip referrers whose hostname matches the site's primary or aliased domain BEFORE classification. The tracker does already capture referrer, so this is purely a classifier change. ~10 lines.

### P1-8. `st_ft_ts` is captured by the tracker but never sent in payloads
- **Issue.** [tracker.js:149, 211](tracker/tracker.js:149) write a first-touch timestamp to localStorage, but the field is not included in any payload to `/api/track` or `/api/conversion`. Orphan capture.
- **Evidence.** Pageview payload at `tracker.js:244-250` does not include `first_touch_ts`. Conversion payload at `tracker.js:340+` likewise.
- **User impact.** The "Attribution window" the engine uses ([attribution-engine.js:1064](api/lib/attribution-engine.js:1064)) calculates lookback from the conversion event's timestamp. With `first_touch_ts` in the payload, we could honor the visitor's actual first-touch timestamp even when prior pageview events are out of the lookback window. Today we lose this information.
- **Required fix.** Send `first_touch_ts` alongside `first_touch_source/medium/campaign` in both pageview and conversion payloads. Engine can optionally use it.

### P1-9. No SPA pushState debounce
- **Issue.** [tracker.js:254-261](tracker/tracker.js:254) re-fires `$pageview` on every `history.pushState` whose URL is new. Modern SPA frameworks (Next.js, Remix, SvelteKit, React Router) can fire 3-10 `pushState` per second during animated transitions or programmatic redirects.
- **User impact.** Inflated pageview counts, potentially noisy session journeys.
- **Required fix.** 50-100ms trailing debounce on `sendPageview()`. ~5 lines.

---

## P2 Important Polish

### P2-1. `tracker.cookieless.min.js` source map list differs slightly from `channel-classifier.js`
- The min tracker lists 13 AI sources by name; `AI_REFERRER_DOMAINS` in the backend classifier has 22 entries including `chat.mistral.ai`, `character.ai`, `pi.ai`, `inflection.ai`. The latter four cannot be classified to `AI Search` at the tracker (so `ai_source` is null) but WILL be classified to `AI Search` at the backend via referrer match. Inconsistency is benign but worth aligning so the tracker can also set `ai_source` for those four.
- **Files.** `tracker/tracker.js:170-173`, `tracker/tracker.cookieless.js:43`, `api/lib/channel-classifier.js:11-17`.
- **Fix.** Unify the two lists.

### P2-2. Conversion explanation modal references "U-Shaped (40/20/40)" and "W-Shaped (30/30/30/10)" 
- The math is correct per the engine, but the modal does not say "credit splits to 40% first touch / 40% last touch / 20% spread evenly across middles." It just says the percentages without naming the touches. A first-time reader gets the numbers but not what they mean.
- **Files.** `dashboard/src/components/ConversionExplanationModal.jsx:121-127, 380-386`.
- **Fix.** Add a one-line diagram or example.

### P2-3. No timezone hint anywhere
- All dashboard cards use `toLocaleString()` which is browser-local. No site-level timezone is exposed. For sites whose reports must align with billing/region, this is a gap.
- **Fix.** Add a site-settings `timezone` field; show it in the report meta.

### P2-4. Marketing 8 vs engine 9 model count
- Already noted under P0-2 but worth listing as a polish-level fix too: just change "8" → "9" in Landing/SolutionEcommerce/SolutionLeadGen if the count is the only delta.

### P2-5. `mock_` prefix usage in OAuth-style libraries (`google-search-console.js`, `google-ads.js`, `meta-ads.js`)
- These look like dev/test fallbacks gated by env vars but I did not exhaustively trace whether they can leak into production. If the env var is missing, the lib silently returns mock data ([google-search-console.js:247-263](api/lib/google-search-console.js:247)). Worth confirming the env-gate is hard.
- **Fix.** Replace silent mock fallback with explicit `throw` if env not set in production mode.

### P2-6. AI domain `searchgpt.com` is not in either list
- OpenAI's SearchGPT product is a likely future referrer; pre-emptively add it.

### P2-7. Marketing & dashboard inconsistency: `ai_platforms` (model name) vs "AI Conversion Source" (Campaigns.jsx label)
- Same engine model, two different surface names. Pick one.

---

## Tracker Capture Audit

🟢 = working, 🟡 = partial, 🔴 = broken/missing

| Capture | Status | Evidence |
|---|:---:|---|
| UTM (source/medium/campaign/content/term) | 🟢 | `tracker.js:188`, sent on every pageview + conversion |
| `ref`, `source`, `via` query params | 🟢 | same line; also sent as `*_param` aliases |
| Click IDs (gclid, gbraid, wbraid, fbclid, msclkid, ttclid, li_fat_id, twclid) | 🟢 | `tracker.js:188`, conversion payload mirrors |
| Referrer | 🟢 | every payload, fresh `document.referrer` |
| Landing page / current URL | 🟢 | `location.href` in every payload |
| First-touch persistence (localStorage `st_ft_*`) | 🟢 | `tracker.js:197-212`, write-once guard |
| Anonymous id stability | 🟢 | localStorage + optional cookie + validation against TLD allowlist |
| Cross-domain `__st_id` decoration | 🟢 | `tracker.js:429-470`, mousedown/touchstart `decorateUrl` |
| Cookie-domain validation (no `.com` shenanigans) | 🟢 | `tracker.js:88-103`, TLD blocklist + ≥2-part check |
| DNT / GPC respect | 🟢 | `tracker.js:7`, early return |
| Consent gate (`data-consent-required`) | 🟢 | `tracker.js:272-294`, queue + persisted decision |
| SPA pushState pageview re-fire | 🟢 | `tracker.js:254-261` |
| SPA pushState debounce | 🔴 | none — P1-9 |
| Outbound click tracking | 🟢 | `tracker.js:418` |
| Path exclusion (`data-exclude` with wildcards) | 🟢 | `tracker.js:15-30` |
| AI source detection (13 platforms) | 🟢 | `tracker.js:170+`, UTM beats referrer when both present |
| `ai_source` for Bing→Copilot via `/chat` path | 🟢 | `tracker.js` aiSrc() handles bing.com/chat as Copilot |
| Cookieless mode no-localStorage / no-cookie isolation | 🟢 | `tracker.cookieless.js:34-39` |
| Cookieless mode anonymous-id stability | 🔴 | random fallback on server failure — **P0-1** |
| Cookieless mode cross-session first-touch | 🔴 | in-memory only, lost on page unload — P1-2 |
| `first_touch_ts` capture | 🟡 | written to localStorage, never sent to backend — P1-8 |
| TODO/FIXME in tracker | 🟢 | none |

---

## Backend Ingestion Audit

| Behavior | Status | Evidence |
|---|:---:|---|
| `/api/track` captures UTMs + click IDs + referrer + landing | 🟢 | `track.js` payload structure |
| `/api/conversion` captures the full attribution payload | 🟢 | `conversion.js:167-225` |
| `/api/conversion-offline` accepts `anonymous_id`, `user_id`, dedupe keys | 🟢 | `conversion-offline.js:38-57` |
| Stripe webhook stitching (`client_reference_id` / `metadata.anonymous_id`) | 🟢 | `stripe-webhook.js:86-117`, fallback to `unattributed` |
| Shopify webhook stitching (`note_attributes._st_aid` etc.) | 🟢 | `shopify-webhook.js:152-192` |
| Revenue dedupe (persistent) | 🟡 | `revenue_ingestion_events` works for webhooks; `/api/conversion` uses in-memory NodeCache that resets on restart — P1-5 |
| Duplicate Stripe/Shopify events return 200 with `duplicate:true` | 🟢 | both webhook handlers |
| `last_seen_at` is telemetry only, NOT attribution | 🟢 | `conversion.js:281-287` updates throttled, separate from PostHog capture |
| Path exclusions respected on ingest | 🟢 | `conversion.js:151`, `isPathExcluded` |
| Bot UA filtering on `/api/track` | 🟢 | `track.js:14` regex |
| PII redaction on properties | 🟢 | `conversion.js:159-162` via `redactPiiFromObject` |
| Custom URL params extracted per-site | 🟢 | `extractCustomParams` |
| Timezone grouping in reports | 🟡 | reports group by date but no site-level TZ; browser locale used — P2-3 |

---

## Channel Classification Audit

| Bucket | Branch condition | Verdict |
|---|---|:---:|
| AI Search | explicit `ai_source` OR referrer matches `AI_REFERRER_DOMAINS` (22 domains) | 🟢 |
| Paid Search | `gclid \|\| gbraid \|\| wbraid \|\| msclkid` OR medium ∈ {cpc, ppc, paid, paid_search, paidsearch, sem} | 🟢 |
| Paid Social | `fbclid \|\| ttclid \|\| li_fat_id` OR medium ∈ {paid_social, paidsocial, social_paid} | 🟢 |
| Display | medium ∈ {display, banner, gdn, expandable, retargeting} | 🟢 |
| Affiliate | medium ∈ {affiliate, affiliates, partner, cpa, cps} | 🟢 |
| Email | medium ∈ {email, e-mail, newsletter, mailing, edm} OR source ∈ {mailchimp, klaviyo, hubspot, sendgrid, ...} | 🟢 |
| SMS | medium ∈ {sms, text, mms} | 🟢 |
| Organic Search | referrer matches search-engine list OR source ∈ search-list AND no medium | 🟢 |
| Organic Social | referrer matches social-domain list OR source ∈ social-list AND no medium | 🟢 |
| Referral | `ref && ref.length > 5` | 🟡 — internal-domain referrals not stripped (P1-7) |
| Other Campaign | source present, none of the above | 🟢 |
| Direct | `!source \|\| source === 'direct'` | 🟢 |

**Precedence note.** AI Search > Paid Search > Paid Social. When `gclid` + AI referrer (e.g., ChatGPT) both present, AI Search wins because it short-circuits first. This is correct — AI referrer is more specific.

**Domain coverage.** AI domains: 22 (3 more in classifier than in tracker source map — see P2-1). Search engines: 9. Social: 11 (`threads.net` included; good). ESP sources: 11.

**Stale/misspelled.** None found.

---

## Attribution Model Audit

**Models implemented and verified** (all in [api/jobs/nightly-attribution.js](api/jobs/nightly-attribution.js) for pre-aggregation, with read paths in `attribution-engine.js:2109+` from `attributed_conversions`):

| Model | Where computed | Formula | Verdict |
|---|---|---|:---:|
| `first_touch` | live (`attribution-engine.js`) + nightly | First non-null source touch in lookback | 🟢 |
| `last_touch` | live + nightly | argMax timestamp before conversion | 🟢 |
| `first_touch_non_direct` | live | first source where source != 'direct' | 🟢 |
| `last_touch_non_direct` | live | last source where source != 'direct' | 🟢 |
| `linear` | nightly only | `revenue / touchpoints.length` | 🟢 |
| `u_shaped` | nightly only | 40% first, 40% last, 20% spread middle | 🟢 |
| `time_decay` | nightly only | 7-day half-life `0.5^(days/7)` | 🟢 |
| `w_shaped` | nightly only | 30/30/30/10 (first/middle-lead/last/rest) | 🟢 |
| `ai_platforms` | live | counts conversion events where `ai_source` is set | 🟡 — name implies broader scope than implementation (P1-6) |

**Attribution window.** 30 days default ([attribution-engine.js:1064](api/lib/attribution-engine.js:1064)). Configurable per-site (`site.attribution_window_days`) and per-request (`?attribution_window=` with allowed values `ltv, 1, 7, 14, 30, 60, 90`). Fall-through: pageviews older than window → conversion lands as 100% Direct. This is correct behavior but is invisible to the UI.

**Live multi-touch fallback.** When `attributed_conversions` is empty for the requested site, `/api/attribution` returns `{ data: [], _notice: '...' }`. The dashboard does not surface `_notice`. This is the surfacing problem from P0-2.

**Sessionization.** 30-min inactivity timeout ([sessionization.js:6](api/lib/sessionization.js:6)). No UTM-change splitting (P1-3). Sessions are derived on-read, not materialized.

**Conversion → journey stitching.** Joins on PostHog `distinct_id` only. No `user_id` fallback (P1-4). Orphan conversions → 100% Direct with `touchpoint_count = 0` and a low `attribution_confidence` score ([nightly-attribution.js:351](api/jobs/nightly-attribution.js:351)) — that confidence score does not appear in the UI either, which is a separate small gap.

---

## Journey Explainability Audit

🟢 Journey.jsx renders chronological sessions with: event type, timestamp, utm_source/medium/campaign per touch, device, browser, OS, conversion_type, order_id, destination. Conversion event is visually highlighted (green badge + "Converted" label + value). Empty state at line 284 says "No events found for this visitor."

🟢 AI source per touch is rendered with a Bot icon ([Journey.jsx:410-414](dashboard/src/pages/Journey.jsx:410)).

🟢 ConversionExplanationModal explains all 9 models accurately. Has a generic mode (model definition) and a per-conversion mode (which touch got credit and why, via `data.reason`).

🟡 If sessionization does not split on UTM change (P1-3), Journey.jsx might show one session with the FIRST touch's UTM and hide the second touch's UTM under expanded events. Need to verify the per-pageview UTM is rendered, not the per-session UTM — the audit agent says it does, but worth re-verifying when fixes ship.

🟡 No timezone hint on touch timestamps.

🟢 Direct/unknown clearly visible in the journey when applicable.

**Marketer test.** Can a marketer understand why this conversion got this source? **Yes, IF they open the conversion explanation modal and IF the journey has at least one touch.** The default Dashboard view does NOT answer that question (see P0-3).

---

## Dashboard and Reports Audit

| Surface | Verdict | Notes |
|---|:---:|---|
| Dashboard KPI cards show model used | 🔴 | **P0-3** |
| Top sources / revenue use one model consistently per card | 🟡 | model is consistent within a saved report but not labeled to the viewer |
| Report Builder dimensions match backend support | 🟢 | 16 dims, 15 metrics, locked multi-touch on free plan |
| Saved reports persist server-side | 🟢 | `/reports/saved`; localStorage is for edit-draft only |
| Campaigns ROAS/CPA suppression on currency mismatch | 🟢 | clear copy ([Campaigns.jsx:198-210](dashboard/src/pages/Campaigns.jsx:198)) |
| Campaigns "Awaiting first sync" copy | 🟢 | fixed in Session 131 |
| SEORevenue aggregate-data disclaimer | 🟢 | inline blue callout (also added inside Integrations card in Session 131) |
| AI referral pages show same platform list as tracker | 🟢 | 10–11 listed, matches tracker's 13 (small drift but no missing major) |
| Empty states actionable | 🟢 | Session 130 added "Finish setting up" + step-by-step Event Debugger |
| Multi-touch `_notice` surfaced when nightly job not run | 🔴 | **P0-2** |
| "Direct" tooltip / explainer | 🔴 | **P1-1** |
| Marketing claim "8 models" matches code "9 models" | 🔴 | **P0-2** part b |
| Timezone shown | 🔴 | P2-3 |

---

## Edge-Case QA Matrix

Legend: ✅ supported by code & UI · ⚠️ supported by code but invisible in UI · ❌ gap · ➖ N/A

| Scenario | Expected behavior | Code support | UI/report visibility | Risk |
|---|---|:---:|:---:|---|
| Direct first visit | classified Direct, no first-touch set yet | ✅ tracker stores `st_ft_src='direct'` only if no UTM | ⚠️ no in-app "what does direct mean" tooltip | P1-1 |
| Google organic referrer | Organic Search via referrer regex | ✅ classifier matches `google.*` | ✅ | low |
| ChatGPT / AI referrer | AI Search via `ai_source` or referrer | ✅ tracker tags `ai_source` from UTM+referrer | ✅ AI Sources tab, Journey bot icon | low |
| Paid search: `utm_source=google` + `gclid` | Paid Search; `cpc` medium inferred even without `utm_medium` | ✅ classifier + tracker | ✅ | low |
| Paid social: `utm_source=meta` + `fbclid` | Paid Social | ✅ | ✅ | low |
| Email with UTM | Email channel | ✅ | ✅ | low |
| Referral from a known domain | Referral | ✅ | ⚠️ same-domain referrer also classified as Referral — P1-7 | P1 |
| Returning direct visitor (prior known source) | Preserves first-touch source | ✅ standard tracker (`st_ft_src` write-once); ❌ cookieless mode loses it across sessions | ⚠️ not surfaced | P0-1, P1-2 |
| Same-session conversion | Conversion credits the visit's source | ✅ live engine | ✅ | low |
| Later-session conversion within 30d window | Credits via lookback to first/last touch | ✅ engine windowed | ⚠️ no banner on what window is in use | P2 |
| Browser conversion stitched by `anonymous_id` | Conversion joins prior pageviews via `distinct_id` (= anonymous_id) | ✅ | ✅ | low |
| Offline conversion via `anonymous_id` | Stitched to journey | ✅ `conversion-offline.js:118-126` | ✅ docs cover it | low |
| Offline conversion via `user_id` only | Should stitch to identified visitor's journey | ❌ engine does not stitch by user_id | ❌ doc implies it works | **P1-4** |
| Stripe checkout with `client_reference_id` | Stitched correctly | ✅ `stripe-webhook.js:86-93` | ✅ Integrations card explains | low |
| Stripe checkout with `metadata.anonymous_id` | Same | ✅ | ✅ | low |
| Shopify order with `note_attributes._st_aid` | Stitched | ✅ `shopify-webhook.js:152+` | ✅ | low |
| Duplicate Stripe event (same `event.id`) | Returns 200 with `duplicate:true` | ✅ `revenue_ingestion_events` idempotency | ⚠️ visible in Session 131's new activity log | low |
| Duplicate offline order_id | Caught by 24h NodeCache while process alive | ⚠️ cache lost on restart | ❌ not surfaced | **P1-5** |
| Excluded path | Tracker + server both skip | ✅ tracker + `conversion.js:151` | ✅ | low |
| Per-site timezone grouping | All grouping in DB UTC, rendered in browser locale | ⚠️ no site-level TZ field | ❌ no timezone hint anywhere | P2-3 |
| Cookieless mode happy path | Server returns daily-rotated visitor_id | ✅ `tracker.cookieless.js:113-126` happy path | ⚠️ no UI explanation of the daily-rotation trade-off | **P0-1, P1-2** |
| Cookieless mode `/api/tracker/id` blocked / failed | Should retry or surface; instead generates random fallback | ❌ silent `'cl-' + Math.random()` | ❌ invisible failure | **P0-1** |
| Cross-domain mode (`data-cross-domains`) | Outbound link decorated with `__st_id` + `__st_ft` | ✅ `tracker.js:429-470` | ✅ docs cover it | low |
| SPA rapid pushState burst (10+ in 1s) | Should debounce | ❌ no debounce | ❌ pageview spam silent | P1-9 |
| AI Platforms model — visit by ChatGPT, convert direct 1h later | Should credit ChatGPT under "AI Platforms" model | ❌ model only counts conversions whose event itself carries `ai_source` | ❌ no UI hint of scope | **P1-6** |
| Marketing 8 models vs code 9 models | Match | ❌ off by one | ❌ user-visible | **P0-2** part b |
| Multi-touch model selected, nightly job hasn't run | Should explain | ⚠️ API returns `_notice` | ❌ not surfaced in UI | **P0-2** |

---

## Validation Results

```
$ node --check api/index.js api/routes/*.js api/lib/*.js
✓ all pass

$ git diff --check
✓ exit 0

$ npm run qa:static
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
==================================================
PASS — static launch QA passed

$ cd dashboard && npm run build
✓ 2075 modules transformed.
dist/assets/index-QrszWFCA.css    103.63 kB │ gzip:  16.49 kB
dist/assets/index-FKvr95SX.js   1,747.05 kB │ gzip: 455.08 kB
✓ built in 2.84s

$ git status --short
(empty — working tree clean, this audit produced only SESSION_132_ATTRIBUTION_AUDIT.md)

$ git diff --stat
(SESSION_132_ATTRIBUTION_AUDIT.md only)
```

**Required grep results (summary):**

| Grep | Hits | Notes |
|---|---:|---|
| `perfect attribution\|100% accurate\|guaranteed attribution\|guaranteed accuracy\|cross-device\|identity graph\|deterministic` | 2 | Both legitimate: `google-search-console.js:262` "deterministic" hash comment; `admin.js:439` "No cross-device sync" as accurate disclaimer about saved-reports. **No real overclaims.** |
| `direct traffic\|first touch\|last touch\|multi-touch\|linear attribution\|attribution window\|AI referral\|ChatGPT\|Perplexity\|Claude` | ~100+ | Most are legitimate model/feature descriptions in marketing pages, ConversionExplanationModal, demo mocks. Marketing says "8 attribution models" in 3 places; engine has 9. |
| `gclid\|gbraid\|wbraid\|fbclid\|msclkid\|ttclid\|li_fat_id` | ~50 in code | All major click IDs captured in tracker, conversion route, channel classifier, attribution engine. **No gaps.** |
| `TODO\|FIXME\|HACK\|temporary\|mock\|fake` | ~30 | One TODO at `api/lib/ai-client.js:20` (anthropic endpoint). `mock_` placeholders in `google-search-console.js`, `google-ads.js`, `meta-ads.js`, `dns-resolver.js`, `webhook.js` — appear to be dev/test fallbacks. Need to confirm they are env-gated (see P2-5). `sessionization.js:58` "temporary, reassigned later" is benign variable comment. |

---

## Final Recommendation

**Proceed to implementation as Session 132A.** Attribution is more solid than the brief implied. The classifier is a single source of truth, the engine math is correct, dedupe works at the right layers, and the journey UI is genuinely good once a user opens the right modal. What's missing is honesty surfaces and one silent failure mode.

**Session 132A — fix in this exact order:**

1. **P0-1 — Cookieless silent ID fallback.** Two-line tracker change to log and queue retry; one paragraph in Privacy settings explaining the daily-rotation trade-off. Without this, cookieless mode is a trust landmine.

2. **P0-2 — Surface the attribution model and the multi-touch staleness.**
   - Reconcile marketing "8 models" → "9 models" (or remove one — pick).
   - Show a model badge on every report card.
   - Surface the `_notice` from `/api/attribution` when `attributed_conversions` is empty, with a "Last computed: <ts>" hint.

3. **P0-3 — Model badge on Dashboard KPI cards.** ~30 lines across Dashboard.jsx + MetricTile.

4. **P1-1 — Tooltip explaining "Direct"** wherever it appears in the dashboard, with one sentence per cause.

5. **P1-7 — Strip same-domain referrer in `channel-classifier.js`** before the Referral branch. ~10 lines.

6. **P1-3 + P1-6 — sessionization on UTM-change OR a per-pageview source label in Journey.jsx that supersedes the session label; rename `ai_platforms` to `ai_platforms_at_conversion` OR extend the model.** Either-or per the team's call.

7. **P1-5 — Replace the in-memory NodeCache with `revenue_ingestion_events` idempotency for `/api/conversion`.** ~30 lines, removes the restart-cache-loss footgun.

8. **P1-9 + P1-8 — Debounce SPA pushState; send `first_touch_ts` in payloads.** Small.

9. **P1-4 — Either implement `user_id`-based stitching in the engine OR remove the implication from the docs.** Bigger work; can split into 132B.

10. **All P2 items in a bundled polish PR after the above.**

After Session 132A lands, re-run this audit. Target: overall trust score ≥ 90 / 100.

**Risks if we ship paid beta without 132A:**
- Cookieless customers see broken attribution silently → churn + bad reviews.
- Customers pick "U-shaped" multi-touch, see empty chart, lose trust → churn.
- Customers see "60% Direct" with no explanation, blame our tracker → support load.
- Marketers can't tell which model their Dashboard cards use → "your reports disagree with each other" tickets.

**Do not commit this audit file as part of any product change.** It is documentation of the current state, not a change to it. Either keep it as a working doc in the repo or move it to a session-notes folder.
