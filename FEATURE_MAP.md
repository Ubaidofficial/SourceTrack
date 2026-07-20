# SourceTrack — FEATURE MAP (canonical)

> ⚠️ **FRESHNESS GUARD — read before trusting.** This doc goes stale the moment features change (a 139M-inventory doc misled this very session). **Rules:** (1) verify against current code / `git log -1`, not this doc, for anything load-bearing; (2) CC must update this file in the SAME PR that adds/removes any feature; (3) keep the "Verified @" line below current.
>
> **Status: verified against `main` @ fc00e406be2cd62cf9ff2fdf81f0f000efb757c7.** **Verified @ fc00e406be2cd62cf9ff2fdf81f0f000efb757c7** (`fc00e40`) · **Built:** 2026-07-16.
>
> **Audit scope — verified by grep/execution against `main` @ `cb17cc2`:** §22 (the FULL mount list — see the correction there), §21, §15 team-invites, **and the reporting-surface tags in §3 · §4 · §5 · §8 · §9 · §20**, re-tagged 🚧 against the **dead-store gate that went live 2026-07-16 14:41** (PRs #248/#249/#250). **Everything else is still inherited from the draft and NOT re-verified** — it keeps its original 📜/🗺️/❓ tags. Where a section conflicts with §21/§22 or a 🚧 tag, the latter wins.
>
> **Re-baseline `cb17cc2` → `fc00e406` (2026-07-16), for the D1–D6 PostHog removal.** Re-verified by grep/execution, NOT by re-reading this doc: **§22** (mount count corrected **45 → 46** `/api/*`, **52 → 53** overall — a *second* incomplete-grep miss, see there), **§9** (KEEP set holds, but was **incomplete on the `model` axis** — see the 🔴 hole there), plus two NEW inventories for the removal: **§23** (bare `queryHogQL` call sites = the PR#4 spec) and **§24** (the PostHog touch-point map — **PostHog is reached from 4 independent places, not 1**). Intervening commits: #251 (doc), #252, #254, #253. Sections not listed here were **not** re-verified at `fc00e406`.


**Built:** 2026-07-16, this session. **Reconciles:** live code inventory (my grep) + `SourceTrack_GTM.md` §5 truth-gate + `README.md` + `docs/paid_beta_go_no_go_master_audit.md` + `docs/archive/SELF_SERVE_PAID_BETA_AUDIT.md` + `docs/archive/qa/full_functional_feature_browser_qa_140G-26.md` + `DATA_CAPTURE_SPEC.md` + `docs/archive/BUSINESS_DASHBOARDS_SPEC.md` + `docs/design/design.md` + June 20–29 chat history.

> **Purpose:** kill the "what does the app actually do" surprises. This supersedes my earlier from-memory list, which was materially incomplete (missed CAPI, outbound webhook, subscription rail, coverage score, ops surfaces; mis-stated MRR + UTM builder + outbound decoration).

## Legend + provenance
- ✅ **live** — built + working (file/route confirmed by my grep this session unless noted)
- 🔒 **plan-gated** — built but gated by PLAN (Free/Starter/Growth/Founder matrix in `plan-features.js`)
- 🚧 **gated (dead-store)** — built, but the read has no live backend (no Supabase pre-agg + no Tinybird pipe), so the server **DENIES** it (422 + `error_code`) and the UI shows a calm "temporarily unavailable" state. **NOT live, NOT returning data — and deliberately not returning zeros either** (§6). Distinct from 🔒: a plan gate is a sales boundary, this is a migration boundary. Each 🚧 re-tags ✅ in the SAME PR that lands its backlog pipe.
- 🧪 **unproven** — built + truth-gated but never validated on real customer/organic data
- ⚠️ **half-built** — partially wired / blocked / has a named gap
- 🗺️ **design-only** — in a spec doc; build-state NOT verified
- ⛔ **cut** — deliberately not built / removed
- 📜 = build-state from chats/audits (AGENT-REPORTED — needs current re-verify against `main`)
- ❓ = mount/build-state I could NOT confirm from my stale local copy (CC must verify on `main`)

> **Standing caveat:** the draft was written from a STALE local copy; "exists" = file present in that copy. §21/§22/§15-invites have since been **verified against `main` @ `cb17cc2`**; the remaining sections have not. The uploaded `trackiq-ui-beta-wiring-fixes-exact.patch` (onboarding + auth-hardening + `/api/reports` alias + login/signup UI) was assumed UNAPPLIED — ✅ **partially disproved:** the **`/api/reports` alias IS mounted** on `main` (`api/index.js:497`). The patch's other targets remain unverified.

---

## 1. Tracking & data capture
- ⚠️ Cookieless-**by-default** tracker (`tracker/tracker.min.js`) — first-party `localStorage`, no fingerprint, no IP storage. **NOT "no cookies":** the **served** `tracker.min.js` DOES contain `document.cookie` (verified 2026-07-20) — it writes a first-party cookie **only** on the customer's opt-in `data-cookie-domain` path, and **reads** (never sets) merchant `_fbp`/`_fbc` for Meta CAPI. A strictly-cookieless build exists but is **not served**. 🚫 do not claim "no cookies."
- ✅ Honors DNT / Global Privacy Control (aborts before any storage/network)
- ✅ Pageview + custom event + conversion capture
- ✅ UTM / referrer / campaign / medium / `ref`/`source`/`via` capture
- ✅ **Click-ID capture** — gclid, gbraid, wbraid, fbclid, msclkid, ttclid, li_fat_id, twclid, dclid, snapclid, pclid, sccid, ko_click_id (README/DATA_CAPTURE stale-listed these as "not built" — June chats confirm all captured)
- ✅ Google Ads ValueTrack params (`st_campaign_id`, `st_adgroup_id`, `st_ad_id`, `st_target_id`, `st_network`, `st_device`, `st_matchtype`)
- ✅ **AI-referrer detection** — 22 named domains (ChatGPT, Gemini, Claude, Perplexity, Copilot, DeepSeek, Grok, +more)
- ✅ First-touch fields stored (source/medium/campaign)
- ✅ `sourcetrack.getToken()` — client accessor for payment↔visitor stitching
- ✅ Second tracker `tracker/analytics.js` — Plausible-style pageview analytics, **bundled into our own dashboard** (internal), not customer-installed
- ⚠️❓ Full cross-device identity stitching — DATA_CAPTURE lists as not-built; `identity-links.js` exists (partial)
- ⛔ Predictive LTV — not built (DATA_CAPTURE "not yet built")

## 2. Form attribution / automatic insertion (moat cluster — mostly SHIPPED)
- ✅ **Form auto-fill (Phase 1)** — opt-in `data-auto-fields="true"`; auto-injects attribution into pre-existing hidden form fields (allowlist, skip-non-empty, bounded SPA MutationObserver, never reads visible inputs)
- ✅ **Manual form fill** — `fillHiddenFields()`, `getContext()`, `decorateUrl()`
- ✅ **UTM Link Builder** — `components/UTMBuilder.jsx` + standalone page `pages/tools/UtmBuilder.jsx` (route `/tools/utm-builder`) + embedded in Setup/Settings (GTM "audit in flight" → RESOLVED: it exists)
- ✅ **Cross-domain link decoration** — opt-in `data-cross-domains="..."`; auto-rewrites cross-domain link hrefs to carry `__st_id` + attribution
- ✅ **Booking-host attribution passthrough** — for known booking hosts (Calendly etc.), auto-appends UTMs + click IDs to the booking URL (a real lead-gen edge)
- ⛔ **"Direct Rescue" / synthetic AI UTMs** — NOT built (by design). AI detection is built + stored as separate `ai_source`; never injected as synthetic `utm_source`. GTM §4 flags surfacing-into-CRM as the top unshipped quick-win moat.

## 3. Analytics (lightweight)
- ✅ Visitors, sessions, pageviews, top pages, top sources
- ✅ Device / browser / country / OS breakdowns
- ✅ Traffic trends, recent activity, live/recent visitors
- ✅ New vs returning; ✅ bounce rate + avg session duration (truth-gated, PR #82)
- ⚠️ **Funnels — dormant entitlement + dead code, NOT a marketable feature.** `analytics.js:1022` `GET /funnel` `requireFeature('funnels_cohorts')` grants a plan entitlement (`plan-features.js:36`), but the feature has **NO UI** (`FunnelChart.jsx` **DELETED #317**) and its endpoint reads the Supabase `pageviews` table (`analytics.js:1047`), **empty by design in prod (0 rows)** → returns nothing. **Nothing customer-facing promises it:** `FEATURE_LABELS` "Funnels & cohorts" (`dashboard/src/lib/planFeatures.js:58`) is **imported nowhere** (never renders) and `Pricing.jsx` doesn't mention it. Resolve as cleanup, not as a sales claim (verified 2026-07-20).
- 🚧 **`sessions` (Unique Visitors by dim) + `conversion_rate` — GATED ENTIRELY** (@ `cb17cc2`). VERIFIED: both `break` in the engine's metric switch and fall to the main flexible sql, where only `revenue`/`conversions` have a pipe → **dead PostHog on all 15 dims**. They **never** routed to the session pipes. **2 of the 13 shipped templates are non-functional: `univ_visitors` ("Unique Visitors by Channel") + `univ_cvr` ("Conversion Rate by Channel")** — the other 11 still return data via the pre-agg (verified by executing the gate over all 13). Backlogged. *(Analytics-page visitor counts are a DIFFERENT path — `analytics.js` → `dispatchPageviews` → the `summary` pipe — and are ✅ live, unaffected.)*
- ⚠️❓ `/dashboard/recent-activity` 404 seen in staging QA (deploy-pending fix)

## 4. Attribution (core)
- ✅ **9 models** — first-touch, last-touch, linear, time-decay, U-shaped, W-shaped, + first/last-touch non-direct variants (README stale-says 4–6; actual = 9). Served by the **Supabase pre-agg** short-circuit (`attribution.js:151` + the 4 multi-touch readers) at the site's materialized window — live-confirmed.
- ✅ Source / medium / campaign / landing / exit dimensions, touchpoint count, time-to-convert
- ✅ **The Attribution page is LIVE** — it reads the pre-agg (not PostHog); untouched by the gate.
- 🚧 **Non-default attribution-window reports — GATED** on every non-Class-A dim (@ `cb17cc2`). The pre-agg holds only the ONE window the nightly materialized and cannot re-window; no pipe covers the others → dead PostHog. **Class-A dims** (provider/attribution_status/stitching_method/conversion_type) are **exempt — their pipes are window-tolerant and still serve any window.**
- 🚧 **`keyword` / `referrer_domain` / `custom_param:*` dimensions — GATED** (@ `cb17cc2`): no pre-agg column, no pipe, at any window/model. *(The old 31-day `capUnmaterializedRange` mitigation is now vestigial — capping a dead store returned zeros LABELED "showing the last 31 days".)*
- ⚠️ **Multi-touch is NIGHTLY (02:00 UTC cron), NOT real-time** — must be disclosed; customers may perceive "missing" attribution for hours
- ✅ Attribution Coverage Score card (any-touch, denylist-based; PR #47/#48) 📜
- 🚧 **Attribution "explainer" — the per-lead JOURNEY NARRATIVE is GATED/dead** (@ `cb17cc2`): `attribution_explain_journey` has **no pipe** and reads dead PostHog. The *conversion* half (`attribution_explain_conversion`) IS piped ✅ — so the modal's "attributed to" verdict works while the timeline does not. Backlog: the pipe is a clone of the already-deployed conversion sibling.
- ⚠️ Per-site custom attribution-window config — **blocked on unrun migration** (`integrations.js:560`: "column not yet available")

## 5. AI-source attribution (differentiator)
- ✅ AI visitors / leads / (revenue if data) by platform; AI Sources tab, source chips, AI-vs-paid/organic — the `ai_platforms` model routes to `getAiPlatformAttributionLive` → the `aiplatform_conversions_by_site` + `pageviews_by_visitors` **pipes**. Live.
- ✅ ~22 named AI domains classified (real but narrowing moat — competitors name ChatGPT too)
- 🚧 **Report Builder AI METRICS — GATED** (@ `cb17cc2`), distinct from the AI Sources tab above:
  `ai_conversion_share` + `ai_revenue_share` (engine `:2998` **bare** `queryHogQL` — outside the read seam) and `ai_conversions` + `ai_revenue` (no pre-agg, no pipe → the `:2923` else-branch). All four are dead PostHog and now deny cleanly. Backlogged; `ai_*_share` is a cheap clone of the `flexible_report_*_by_site` dim-swap template.

## 6. Leads & qualification
- ✅ All-Leads table, filters, CSV export, Lead Detail
- ✅ Manual 4-state qualification (Unqualified / Qualified / MQL / SQL) + bulk actions + RLS (PR #45)
- ⚠️ Leads list pagination truncates sites >200 leads (`leads-server.js`)

## 7. Journeys
- ✅ Visitor journey panel + chronological timeline + attribution trail
- 🧪 Session grouping/duration math — route loads; not browser-verified (QA 140G)

## 8. Campaigns & cost
- ⚠️ **Campaigns page — DEGRADED (graceful banner), pending the 3 campaign pipes** (@ `cb17cc2`). `campaigns.js` calls `getFlexibleReport` **directly**, so it never reaches the pre-agg short-circuit, and the 3 campaign pipes it needs (`flexible_report_campaign_by_site` / `_sessions_by_site` / `_leads_by_site` — built in PRs #237/#238) are **INERT: authored but not deployed + not in `TINYBIRD_READ_PIPES`**. Its `safeHogQL` wrapper catches and renders the banner rather than fake numbers. **Fix = deploy + allowlist those 3 pipes (backlog), NOT a gate.**
- ✅ Read-only campaign performance (visitors, conversions, revenue, CVR%) — reads Tinybird post-migration-fix *(📜 tag predates the pipe-inertness finding above; treat the bullet above as current)*
- ✅ **Cost import** — CSV + REST API (`campaign-costs.js`, mounted `/api/campaign-costs`) → unlocks ROAS/CPL/CAC **when cost data exists** (design.md wrongly labels "V2")
- 🔒 ROAS / CPL / CAC — real only when cost data present
- 🧪 **Ad-platform cost sync (Google + Meta) — BUILT + wired** (✅ verified @ `cb17cc2`): `ad-platforms.js` exposes `/google/sync`, `/meta/sync`, OAuth, `save-account` (gated `requireAdCostSync`); called by `Campaigns.jsx:350-353` + `ReportBuilder.jsx:528`. Positioned **V2** (PR #23 removed only the Integrations UI as a spec-leak; endpoints + callers survived). **END-TO-END UNPROVEN** (no real ad account has run it). Distinct from CSV cost import (separately live). **Truth-gate: do not market as working until proven.**

## 9. Report Builder & saved reports
> **KEEP set re-verified @ `fc00e406` — UNCHANGED by #252/#253/#254.** Executed proof: all 5 gate Sets (`GATED_GROUPS`, `GATED_METRICS`, `SESSION_REPORT_DIMS`, `SESSION_PIPE_METRICS`, `CLASS_A_DIMS`) are **identical** `cb17cc2` → `fc00e406` when both are imported and diffed, and `git diff --stat cb17cc2..fc00e406 -- api/lib/attribution-engine.js api/routes/attribution.js api/routes/export.js` is **empty** — the three files that decide what returns real data were never touched. (#252/#253 are frontend; #254 moved the 4 canonical Sets to `dashboard/src/lib/gate-constants.js` and **re-exports** them, so identity holds — that is what the anti-drift test asserts.)
>
> 🔴 **BUT the KEEP set below was INCOMPLETE: it never mentions the `model` axis, and the pre-agg differs by model.** `PREAGG_CONVERSION_METRICS` = {revenue, conversions, leads, customers, avg_conversion_value} applies **only to `first_touch` / `last_touch`** (`attribution.js:174`). The 4 multi-touch models use **`PREAGG_MULTITOUCH_METRICS` = {conversions, revenue} ONLY** (`attribution.js:195/211/227/…`). So **12 shapes are UNGATED and have NO pre-agg**: `{linear, u_shaped, time_decay, w_shaped}` × `{leads, customers, avg_conversion_value}`. They fall through to a **bare `queryHogQL`** (dead PostHog) → **0 rows → a fake zero / empty report (§6 violation)**. The `linear` branch (`attribution-engine.js:2088`) additionally **ignores `metric` entirely** — its SQL always computes revenue/conversions/touchpoints. The picker does **not** grey these (they're KEEP metrics, honest for touch models only). **Not covered by #248's gate. Founder decision — NOT fixed here (doc-only task).** Executed: `gatedReportReason({group_by:'source', metric:'leads', preAggWindowMatches:true})` → `null` (ungated), and `leads ∉ PREAGG_MULTITOUCH_METRICS`.
>
> **What actually returns data (@ `fc00e406`, post-gate) — the KEEP set:**
> - ✅ **Common dims** (`source`, `campaign`, `channel`, `medium`, `landing_page`, `country`, `device`, `browser`, `date`, `ai_source`) **× {`revenue`, `conversions`, `leads`, `customers`, `avg_conversion_value`}** at the site's default window → **Supabase pre-agg** (`PREAGG_CONVERSION_METRICS` resolves to exactly those five at runtime) — **only for `model` ∈ {`first_touch`, `last_touch`}; multi-touch models keep only {revenue, conversions} (see the 🔴 hole above).**
> - ✅ **Class-A dims** (`provider`, `attribution_status`, `stitching_method`, `conversion_type`) × those metrics → **Tinybird pipes**, at **any** window (window-tolerant).
> - ✅ **The 4 `session_*` metrics** (`session_count`, `avg_session_duration`, `pages_per_session`, `conversion_sessions`) × the **7 `SESSION_REPORT_DIMS`** (`source`, `medium`, `campaign`, `landing_page`, `country`, `device`, `date`) → the **session pipes**. Any other dim there is 🚧 `unsupported_session_dim` (it used to fabricate a single 'unknown' bucket).
> - ✅ `days_to_convert` + `touchpoints_per_conversion` → dedicated pipes.
>
> **Everything else in the pickers is 🚧 gated** — see §3 (`sessions`/`conversion_rate`), §4 (`keyword`/`referrer_domain`/`custom_param`, non-default windows), §5 (the 4 AI metrics), §20 rows 13–14.

- ✅ Template gallery, dimension/metric pickers, filters, preview, save/pin, CSV export
- ⚠️ **The pickers still OFFER gated shapes** — the server denies them with an honest "temporarily unavailable" state (no fake zeros, no Retry), but the **picker trim is still backlogged**, so a user can select a shape that cannot return data. Same for the **`univ_cvr` template** (non-functional, §3).
- ⚠️ **Saved reports holding a gated config** (e.g. a `keyword` or `conversion_rate` report saved pre-gate) now replay into the 422 gated state. `validateReportConfig` gates *writes*, not existing rows — a deprecation/migration pass is backlogged.
- ✅ Saved reports (`/api/saved-reports`; patch adds `/api/reports` alias — dashboard was calling wrong path)
- 🚧 **`ltv_revenue` ("LTV Revenue v1") — GATED** (@ `cb17cc2`): engine `:2791` **bare** `queryHogQL`, no pre-agg (`ltv_revenue` ∉ `PREAGG_CONVERSION_METRICS`), no pipe → dead PostHog. It was exposed in the metric picker on every paid plan while returning nothing. Backlogged (novel pipe shape — a per-`distinct_id` LTV rollup; nothing existing to clone).
- ⚠️ `conversion_type` filter ignored on ~6 templates → inflated data (bug logged this session)
- ✅ **CSV export is gated in lockstep** — `export.js` calls `getFlexibleReport` directly (never reaching the pre-agg), so it would have exported a CSV of zeros; it now denies with the same code.
- ⛔ PDF export (→V1.1), public report sharing (→V2), SQL/formula builder (not V1)

## 10. Revenue & conversions
- ✅ Conversion + revenue capture; manual conversion API; offline conversion API (positive values only — rejects negatives)
- ✅ Identify API (attach email/PII only when sent; stitches anon→user for LTV)
- ✅ **Refund netting (Stripe)** — negative `$conversion` nets by source (PRs #239/#240) — **DORMANT** until a Stripe webhook subscribes `refund.created` (no attribution webhook connected in prod yet)
- 🔒 AOV, revenue-per-visitor/lead — need revenue data
- ⚠️ Anonymous conversions bypass persistent dedupe (no `order_id`) — inflation risk at scale

## 11. Subscription / MRR rail
- ✅📜 **Steps 1–3 built** — Stripe subscription lifecycle ingestion + `subscription_identity` (acquisition-locked customer→source) + `subscription_revenue` tables (PRs #81/#84/#85)
- ⚠️📜 **Step 4 (MRR-by-source + trial→paid rate) BLOCKED** — the no-card 30-day trial is a SourceTrack **plan flag only**, creates no Stripe subscription, so `trial_start`/`trial_converted` never fire. Infrastructure exists; the headline metric produces no data. **🚫 cannot claim (GTM §5).**

## 12. Integrations
- 🧪 **Stripe (attribution)** — manual webhook `/api/webhooks/stripe/:site_key` (checkout + refund); built but **no prod site connected** — buyer-attribution not live in prod
- ✅ **Stripe (own billing)** — `/api/billing/webhook` (subscription lifecycle, plan/limit updates, dunning) — separate from attribution
- 🧪 **Shopify** — manual webhook (orders/paid + orders/create); **no refund netting** (parity gap vs Stripe); not a native app
- 🧪 **Google Search Console (GSC SEO-revenue)** — built + truth-gated; **never proven on real organic data**; staging OAuth redirect bug (points at prod host)
- ✅🔒📜 **CAPI (server-side Conversions API)** — Meta + Google; token encryption at rest, `capi_deliveries` log, event-ID dedup, hashed PII, plan-gated (`requireFeature('capi_server_side')`), wired into conversion routes (PRs #57–60). MS/LinkedIn senders reachable+tested. TikTok deliberately stripped. ⚠️ don't claim "live forwarding" until a merchant uses it.
- ✅📜 **Outbound webhook** — HMAC-signed, SSRF-guarded, plan-gated; carries `ai_source` + 14 click IDs into customers' CRMs (**gap in all 4 competitors**)
- ✅ Incoming/manual conversion webhook (HMAC, replay-bound)
- ⚠️ GSC / CSV-cost error UX returns generic 500/400 (SELF_SERVE P1-2)
- ⛔ Slack digest, HubSpot sync (→V1.1); Salesforce, Zapier, native Shopify/Stripe apps (→V2)

## 13. Multi-site / portfolio & dashboards
- ✅ All-Sites view (2+ sites), site health badges, sparklines, per-site cards
- ✅ Business-type onboarding selector (Revenue/Ecommerce/LeadGen/SaaS)
- 🗺️❓ **Business-type dashboard VARIANTS** (Revenue/General, E-commerce, Lead-Gen, SaaS) — `docs/archive/BUSINESS_DASHBOARDS_SPEC.md` design-confirmed; **explicitly says "don't claim implemented unless verified code/data/QA."** Build-state UNVERIFIED — CC must confirm which variants actually render.

## 14. Onboarding & setup
- ⚠️ **Onboarding flow — being wired by the patch** (`/api/onboarding` `/me`/`/site`, OnboardingCard/Progress, seedReports). Currently: resume verified, **fresh signup E2E untested** (QA 140G)
- ⚠️ Onboarding abuse-guard rejections return `500` not `400` (patch may fix)
- ✅ Setup / Install page + snippet; ✅ Setup Doctor (`setup-doctor.js`, install/tracking health checks)
- ✅ Site switcher, add-site wizard

## 15. Settings & data controls (privacy/GDPR)
- ✅ Install & connect, conversion-event config, timezone/currency, IP exclusion, bot filtering, data retention, webhook secret, danger zone
- ⛔ **Workspace/team member invites — NOT BUILT** (✅ verified @ `cb17cc2`, see §22). No invite/member endpoints, no route file, no Settings UI; `company_members` is read-only (role lookup only). Membership is *enforced* (`requireSiteMembership`) but members can only be provisioned out-of-band. The 139M "present in Settings" claim was a **spec-leak**; design.md's "Team = V2" stands.
- ✅ GDPR: DB hard-delete + per-visitor erase (Tinybird); privacy suppression list; retention purge (now covers `custom_events`, PR #88)
- ⚠️📜 Account/full-erasure historically left raw events in PostHog (P1-4) — changing with Tinybird migration; re-verify
- ⚠️ **`data_retention_days = NULL` = keep-forever by design** (paid sites) — naive null→default would silently delete promised data
- ⛔ "GDPR compliant" badge — gated behind full EU migration + DPA + lawyer review (not claimable)

## 16. Developer / API
- ✅ Identify API; developer docs portal (API, Tracker, Conversions, Offline, Webhooks, Campaign-Costs, Security, Identify)
- ✅📜 **Server-side event ingestion** — `POST /api/server/event` + `api_keys` table (SHA-256 Bearer)
- ⚠️ **NO API-key management UI** — can't generate/view/revoke keys in Settings/Dev portal; requires manual DB injection (**SELF_SERVE P1-1, top self-serve blocker**)

## 17. Ops / internal (not customer-facing)
- ✅ **Admin / Ops console** — `/api/admin` route (auth-guarded) + `Admin.jsx` page
- ✅ **Event Debugger** — real-time event inspector (`/debugger`) — polished, QA-verified
- ✅ **Data Quality** page (`/data-quality`) + `data-quality-check.js` job
- ✅ Jobs: nightly-attribution, anomaly-watcher, email-reports (digest), usage-threshold-emails, **health-agent**
- ⚠️❓ **health-agent scheduling UNCONFIRMED** (no repo cron; maybe Railway dashboard cron) + **still monitors DEAD PostHog** (needs Tinybird repoint) — see #97
- ⚠️ **Quarantine alarm** (`quarantine-alarm.js`, silent-revenue-loss monitor) — built + tested, **being wired into health-agent (#97)**
- ✅ Data export (`/api/export`), job-status (`/api/jobs`), hygiene checks (`/api/hygiene`), backfill tool
- ⚠️ No exception monitoring (Sentry-class) — biggest ops blind spot (P1-1); no public status page

## 18. Docs & marketing site
- ✅ Docs: platform recipes (GTM, Google Ads, Shopify, Stripe, Webflow, WordPress, Framer, Install, Quickstart, Troubleshooting) + dev API docs + **live search + TOC + breadcrumbs + brand logos** (shipped this session)
- ⚠️ **No form-attribution / auto-fill / cross-domain / booking-passthrough docs** — built moats, undocumented (discovery gap)
- ✅ Marketing: Landing, Product, Attribution, AI-Referral-Tracking, Compare-GA4, Pricing, interactive no-login Demo, **Solution pages** (SaaS/Ecommerce/LeadGen/Agency/Shopify)
- ✅ Legal: Terms, Privacy, DPA, Do-Not-Sell, Sub-processors (draft, not lawyer-reviewed)
- ✅ Pricing: Starter $49/mo · Growth $79/mo · Founder $99/yr (25 spots)

## 19. Plan gating, limits & security
- ✅ **Plan/feature-gating system** (`plan-features.js`) — Free/Starter/Growth/Founder FEATURE_MATRIX + LIMITS; feature gates return 402
- ✅ **Pageview cap enforced** (`checkTierLimit` on track/collect/conversion)
- ⚠️ **Conversion cap + sites/seats limits DEFINED but NOT enforced** — pricing advertises "30/150/750/2,500 conversions/mo" but only pageviews are metered (honesty/billing gap, P2-1)
- ✅ Security: layered rate-limits, HMAC log-hashing, bot UA filter, SSRF guard, abuse guards, webhook signature verify, encryption-at-rest, Supabase RLS (patch also hardens `/api/live` auth + `/api/campaign-costs` membership)
- ⚠️ In-memory rate limits (single-instance; Redis needed before horizontal scale); Stripe webhook has no rate limiter (P1-5)

---

## 20. ⚠️ HALF-BUILT / BLOCKED — the actionable list
| # | Feature | State | Gap |
|---|---------|-------|-----|
| 1 | MRR-by-source + trial→paid | Steps 1–3 built | Step 4 blocked: no-card trial makes no Stripe sub → `trial_start` never fires |
| 2 | Server-side event API keys | Backend built | No UI to generate/view/revoke keys (self-serve P1) |
| 3 | Attribution-window config | UI + route exist | Blocked on unrun DB migration |
| 4 | GSC SEO-revenue | Built + truth-gated | Never proven on real organic data + staging redirect bug |
| 5 | Business-type dashboard variants | Design-confirmed | Build-state unverified (design says don't claim) |
| 6 | Onboarding fresh-signup | Resume works | Fresh signup E2E untested; 500-not-400 on reject (patch fixes) |
| 7 | health-agent + quarantine alarm | Alarm built | Wire (#97) + scheduling unconfirmed + still on dead PostHog |
| 8 | Stripe/Shopify buyer-attribution | Webhooks built | No prod site connected → not live; Shopify has no refund netting |
| 9 | Report Builder conv_type filter | Built | Ignored on ~6 templates → inflated data |
| 10 | Conversion/sites/seats caps | Advertised | Not enforced backend (only pageviews metered) |
| 11 | Ad-platform cost sync (Google + Meta) | 🧪 Built + wired (endpoints + callers survived PR #23; positioned V2) | **END-TO-END UNPROVEN** — no real ad account has run it. Truth-gate: don't market as working (§8) |
| 12 | Funnels | ⚠️ Endpoint live + gated entitlement, but **NOT customer-facing** | **NO UI** (`FunnelChart.jsx` DELETED #317) + reads empty `pageviews` (0 rows prod) + label/Pricing don't surface it → dormant code, not a claim (§1/§3) |
| 13 | Report-Builder **gated depth** (🚧 @ `cb17cc2`) | Denies honestly (422 + calm state, no zeros) | Needs pipes: `ltv_revenue` (novel shape) · `ai_*_share`/`ai_conversions`/`ai_revenue` (clone the dim-swap template) · `keyword`/`referrer_domain`/`custom_param` · non-default windows (non-Class-A) · journey-explain narrative (clone the conversion sibling) |
| 14 | `sessions` + `conversion_rate` (🚧 @ `cb17cc2`) | Gated ENTIRELY — dead on every dim; never routed to the session pipes | Unique-Visitors-by-dim + the `univ_cvr` template are non-functional until a pipe lands (§3) |
| 15 | Campaigns page | ⚠️ Degraded → graceful banner | The 3 campaign pipes exist but are **INERT** (undeployed + unallowlisted) — deploy + allowlist, not a gate (§8) |
| 16 | Report-Builder picker trim + saved-report migration | Backlogged | Pickers still offer gated shapes; saved reports with gated configs replay into the 422 state (§9) |

## 21. ⛔ CUT / REMOVED (NOT in app) — ✅ VERIFIED @ `cb17cc2`
- ✅ **`ai-chat` — FULLY REMOVED.** Zero references in `api/` **and** `dashboard/src`. No route file, no page, no App.jsx route, no Layout/Dashboard entry point. Nothing lingers.
- ✅ **`ai-analytics` — RESOLVED (#315): both orphan files DELETED** (receipts kept per §21's own lesson — verify against current code, not this doc).
  - `api/routes/ai-analytics.js` — **deleted (#315).** ⚠️ **but the `admin.js` probe was NOT deleted with it** (verified 2026-07-20): `admin.js:686` still runs `routeExists('ai-analytics.js')` (used at `:701`). With the file gone the probe returns false → the console now reports **"AI Analytics: dormant"** (flipped from the old "live" truth-bug). Two hardcoded `'AI Analytics' status: 'live'` entries also linger (`admin.js:644`, `:722`). **OPEN: strip the probe + the hardcoded entries** so the console stops reporting a deleted feature.
  - `dashboard/src/pages/AIAnalytics.jsx` — **deleted (#315)**, and its `query-error-surfaces.test.js` entry was removed with it (verified gone).
  - `dashboard/src/components/Layout.jsx` `'/ai-analytics'` title entry — **already gone** (this row was stale); the remaining `/debugger` orphan is removed in the same PR's Layout change.
- ❗ **Funnels — MOVED OUT of this list (were mis-classified as "removed").** The endpoint is live + a plan entitlement exists, but the feature is **not customer-facing** (no UI, no rendered label, not in Pricing) → dormant code; see **§3 (Analytics)** + **§20 row 12**.
- ✅ **"Add Annotation" — removed from the UI.** Zero references in `dashboard/src`. `api/routes/annotations.js` was the provably-safe orphan → **DELETED (#315).** (`site_annotations` appears only as a table name in the schema-drift ignore list — unrelated to the route.)
- cohorts · heatmaps · session replay · two-way CRM sync · affiliate mgmt · Consent Mode v2 (→V1.1) · synthetic AI UTMs / Direct-Rescue (unshipped moat) · predictive LTV · DeepSeek health-agent LLM (deleted PR #184). *(📜 not re-verified by this audit.)*
- ❗ **Ad-platform cost sync — MOVED OUT of this list (was mis-classified "not built").** Endpoints + callers are live; PR #23 removed only the Integrations UI → see **§8** + **§20 row 11**.
> **Lesson:** the Session-139M inventory doc is STALE — but so was this doc's own §21: it called funnels "removed (0 refs)" when the endpoint is live and plan-gated. **Verify against current code, not any inventory doc — including this one.**

## 22. ✅ MOUNT-VERIFY — RESOLVED @ `cb17cc2`
> ❗ **CORRECTION (@ `cb17cc2`) — the previous count was INCOMPLETE.** It said "31 `/api/*` mounts" because the grep was **`app.use(`-only**. Express also mounts handlers **directly** via `app.<verb>(...)`, and that grep missed **18** of them — including the entire **`/api/attribution*`** surface (the Report Builder's own backend!), plus the whole ingestion rail (`/api/track`, `/api/collect`, `/api/conversion`, `/api/identify`, …). **Any future mount audit MUST grep `app.use(` AND `app.get|post|put|delete|all(`.**
>
> ❗❗ **SECOND CORRECTION (@ `fc00e406`) — the `cb17cc2` count was ALSO incomplete.** It said 45 `/api/*` / 52 overall because that grep was **anchored at line start** (`^app\.`) and `api/index.js:525` indents its handler by two spaces: **`  app.get('/api/diag/ip', …)`** was missed. `api/index.js` is **byte-identical** `cb17cc2` → `fc00e406` (`git diff --stat cb17cc2..fc00e406 -- api/index.js` is empty), so this is a **counting fix, not drift**. **The rule is now: grep `app.use(` AND `app.<verb>(`, AND allow leading whitespace** (`^[[:space:]]*app\.`). Two audits in a row missed mounts to a too-narrow grep.
>
> **TRUE COUNT @ `fc00e406`: 46 `/api/*` mounts** = **31** router mounts (`app.use`) **+ 15** direct handlers (`app.<verb>`), plus **7** non-`/api` mounts (`/tracker` guard + static, `/tracker.min.js`, `/tracker.cookieless.min.js`, `/sp` proxy, `/health`, `/track`). Totals: 34 `app.use` + 19 `app.<verb>` = **53** mounts overall.

**The 15 DIRECT `/api/*` handlers** (`grep -nE "^[[:space:]]*app\.(get|post|put|patch|delete|all)\([[:space:]]*['\"]" api/index.js`):
`POST /api/billing/webhook` · `POST /api/track` · `GET /api/pixel` · `POST /api/collect` · `POST /api/identify` · `POST /api/conversion` · `POST /api/conversion/offline` · **`GET /api/attribution`** · **`GET /api/attribution/explain`** · **`GET /api/attribution/verdicts`** · `GET /api/journey/:visitorId` · `GET /api/sessions/overview` · `GET /api/sessions` · **`GET /api/diag/ip`** (⚠️ `index.js:525`, indented — the one the `cb17cc2` grep missed; **unaudited**: no intent classification, no consumer trace, and it is IP-adjacent — see §6 privacy) · `GET /api/health`
*(non-`/api` direct: `GET /tracker.min.js` · `GET /tracker.cookieless.min.js` · `GET /health` · `POST /track`)*

**The 31 `app.use` router mounts:**

`/api/install` · `/api/events` · `/api/alerts` · `/api/site-alerts` · `/api/hygiene` · `/api/export` · `/api/onboarding` · `/api/sites` · `/api/dashboard` · `/api/leads` · `/api/campaigns` · `/api/saved-reports` · `/api/reports` (alias → savedReportsRouter — **the patch alias IS applied**) · `/api/integrations/google-search-console` · `/api/integrations/ad-platforms` · `/api/integrations/capi` · `/api/integrations` · `/api/seo-revenue` · `/api/campaign-costs` · `/api/server` · `/api/billing` · `/api/admin` · `/api/jobs` · `/api/live` · `/api/analytics` · `/sp` (proxy) · `/api/webhooks/incoming` · `/api/webhooks` · `/api/webhooks/stripe` (raw) · `/api/webhooks/shopify` (raw) · `/api/tracker/id` · `/api/gdpr` · `/tracker` (static).

**Intent classification (A3):**
- 🟡 **`/api/alerts` — MOUNTED, NO in-repo consumer.** One route only (`GET /` , `validateSiteKey` + `requireAlertsFeature`), computes alerts live from HogQL/Tinybird. **No frontend caller.** The live alerts rail is the *separate* **`/api/site-alerts`**: `Layout.jsx:64-67` polls `/site-alerts`, `AlertDrawer.jsx:37` dismisses; the jobs (`anomaly-watcher.js`, `data-quality-check.js`) **write the `site_alerts` table directly** — they do not call this HTTP route. Covered by tests (`alerts-plan-gate`, `alerts-read-cutover`) but tests aren't consumers. → **dead-but-mounted from the app's perspective** (may be an intentional API-customer surface — founder decides). **NOT removed.**
- ✅ **`/api/integrations/ad-platforms` — LIVE, real customer UI.** `Campaigns.jsx:329-353` calls `/status`, `/google/sync`, `/meta/sync`; `ReportBuilder.jsx:528-529` calls `/status`. The draft's "customer UI removed PR #23" is **outdated for this path**. **NOT removed.**
- ❌ **`/api/public` — DOES NOT EXIST.** Not mounted; there is **no `api/routes/public.js`**. The draft's "`/api/public` (ShareDashboard)" mount claim is **false**. `dashboard/src/pages/ShareDashboard.jsx` exists but is **not routed in App.jsx and referenced nowhere** → another orphan.

**Orphan files (file present, NOT mounted/routed) — 1 deletable, 3 blocked/out-of-scope:**
| File | Refs | Action |
|---|---|---|
| `api/routes/annotations.js` | **0** | ✅ **DELETED (#315)** |
| `api/routes/ai-analytics.js` | `admin.js:686` `routeExists()` probe | ✅ file **DELETED (#315)** — ⚠️ probe NOT removed; admin console now reports "dormant" (§21) |
| `dashboard/src/pages/AIAnalytics.jsx` | (test entry removed with it) | ✅ **DELETED (#315)** + its `query-error-surfaces.test.js` entry |
| `dashboard/src/pages/ShareDashboard.jsx` | 0 (unrouted; backing `/api/public` absent) | ✅ **DELETED (#323)** with `public-dashboard.js` + the Settings `/share` UI |
| `dashboard/src/components/FunnelChart.jsx` | 0 (unimported) | ✅ **DELETED (#317)** — endpoint still live but no UI, empty `pageviews` data, no customer-facing surface (§21/§3): dormant, not sold |

**§15 team/workspace invites — ✅ RESOLVED: NOT BUILT.** No invite/member route file, **zero** member-management endpoints (`router.get|post|put|delete` matching member/invite/team/seat → none), and **no invite control in `Settings.jsx`** (its only "member" text is GDPR account-deletion prose). `company_members` is **read-only** across the codebase (role lookup in `user-auth.js:34`, plus `email-reports.js`, `google-search-console.js`, `admin.js`). Membership *enforcement* exists (`requireSiteMembership`, `auth.js:189`) so the data model supports shared workspaces, but **there is no way to invite/add a member in-product** — members must be provisioned out-of-band. → the §15 ❓ is a **spec-leak from 139M**, not a partial build.

---

## Verification debt (before trusting this fully)
1. ~~**CC grep `api/index.js` on `main`** for every mounted route~~ → ✅ **DONE @ `cb17cc2`** (§22): **45** `/api/*` mounts (31 `app.use` + 14 direct `app.<verb>`) — the first pass under-counted by 14 because it grepped `app.use(` only, **missing the entire `/api/attribution*` + ingestion surface**; `/api/public` proved non-existent; alerts/ad-platforms intent classified; ai-analytics/annotations/ai-chat/funnels state confirmed; team-invites resolved to NOT BUILT.
2. **CC confirm** business-type dashboard variants (§13) actually render vs design-only. *(still open — not in this audit's scope)*
3. **Founder/Antigravity** confirm health-agent cron (§17) + apply the beta-wiring patch (§14). *(still open; note §22 proves the `/api/reports` alias IS applied)*
4. Several source docs are **stale** (README model count; DATA_CAPTURE Session-78 click-ID list) — this map corrects them but flag if you cite the originals.
5. **Founder decisions opened by this audit:** (a) delete `api/routes/annotations.js` (0-ref, ready); (b) delete `ai-analytics.js` + its `admin.js:691` probe **together** — the probe currently misreports "AI Analytics: live"; (c) delete `AIAnalytics.jsx` + its `query-error-surfaces.test.js:34` entry together; (d) `ShareDashboard.jsx` / `FunnelChart.jsx` orphans; ~~(e) reconcile §8/§12 "auto ad-spend sync not built" vs the live `ad-platforms` sync endpoints~~ → ✅ **RESOLVED: §8 corrected** (🧪 built + wired, end-to-end unproven); §12 carried no ad-sync claim. Funnels likewise re-classified out of §21 → §3 + §20 row 12; (f) `/api/alerts` — keep as an API surface or retire.

*Confidence: **§21, §22, and §15-invites = grep-verified against `main` @ `cb17cc2` (this audit)**. Sections 1–20 are inherited from the draft and were NOT re-verified: ✅ there = author's earlier grep; 📜 = from chats/audits, needs re-verify; 🗺️/❓ = unverified. Trust the §21/§22 tables over any other section where they conflict.*

---

## 23. 🔻 BARE `queryHogQL` CALL SITES — the PR#4 spec (✅ verified @ `fc00e406`)

> **Method (why this list is short and the naive one is wrong).** `_queryHogQL` is **not** a Tinybird seam — it is a *mutable test-injection alias* (`attribution-engine.js:18 let _queryHogQL = queryHogQL`). The real seams are **`readTb()`** (routes) and **`_pipeRead()`** (engine): attempt a Tinybird pipe, fall back to HogQL. A call is **BARE only if no pipe is attempted on its own branch**. Grepping by identifier, or per-function, gives the WRONG answer: `getFlexibleReport` is one ~1000-line function with independent branches, so an earlier `_pipeRead` does not guard a later branch. Each site below was read individually.

**BARE = 4 sites. ALL are in `getFlexibleReport` (`api/lib/attribution-engine.js`). ALL are money-rail.**

| # | file:line | query name | Money-rail? | Reachable at the edge? |
|---|---|---|---|---|
| 1 | `api/lib/attribution-engine.js:2144` | `flexible_report_linear` | 🔴 **YES** — SQL sums `fractional_revenue` / `fractional_conversions` | 🔴 **YES** — `model=linear` × {`leads`,`customers`,`avg_conversion_value`} is **ungated + no multi-touch pre-agg** (see §9 🔴). Branch **ignores `metric`**. |
| 2 | `api/lib/attribution-engine.js:2833` | `flexible_report_ltv` | 🔴 **YES** — `total_revenue` | ✅ No — `ltv_revenue` ∈ `GATED_METRICS` → 422 at the edge |
| 3 | `api/lib/attribution-engine.js:2965` | `flexible_report` (**the `pipe=NONE` `else` branch** — `if (_flexPipe) {…} else { rows = await _queryHogQL(sql,'flexible_report') }`) | 🔴 **YES** — generic flex SQL; `metric` may be `revenue`/`conversions` | 🔴 **YES** for any ungated shape with no pipe (incl. the u_shaped/time_decay/w_shaped × leads/customers/avg_conversion_value fall-through) |
| 4 | `api/lib/attribution-engine.js:3040` | `flexible_ai_share` | 🔴 **YES** — `SUM(conversion_value)` / `count()` | ✅ No — `ai_conversion_share`/`ai_revenue_share` ∈ `GATED_METRICS` → 422 |

**NOT bare — behind a pipe attempt (do NOT include in PR#4's delete set; they are the Tinybird fallback leg):**
`attribution-engine.js` **:142** `first_touch_by_site` · **:219** `last_touch_by_site` · **:301** / **:375** (non-direct) · **:512** + **:692** `aiplatform_*` · **:1104** / **:1123** `session_report_*` · **:1297** / **:1334** `attribution_explain_*` · **:1721** / **:1832** `multitouch_*` · **:2211** `days_to_convert` · **:2277** `touchpoints_per_conversion` · **:2963** (flex ternary) · **:3012** `flexible_sessions_by_site`.
⚠️ **:142/:219/:301/:375 look bare** (unconditional `const rows = await _queryHogQL(...)`) but are **early-return fallbacks** — `_pipeRead('first_touch_by_site', …)` at **:131** returns first. Do not classify by shape.

**ROUTES: zero bare sites.** All 11 route files that call HogQL (`sessions`, `alerts`, `leads-server`, `events`, `hygiene`, `seo-revenue`, `dashboard`, `admin`, `live`, `integrations`, `journey`) + `api/lib/setup-doctor.js` call it **only** as the `readTb()`/inline fallback after a pipe attempt — executed check: each file has exactly **1** `queryHogQL(` and **≥1** `_queryTinybirdPipe(`.

## 24. 🔻 PostHog TOUCH-POINT MAP (✅ verified @ `fc00e406`)

> **Numbering note:** the rows below (1–6) are a TOUCH-POINT enumeration (six independent places PostHog is reached) — they are **NOT** the `POSTHOG_MIGRATION_HANDOFF.md` **D0–D6 decommission steps** and do not map 1:1. In particular, the frontend `posthog-js` removal (row 6) is the handoff's **D4** (shipped in #312); the handoff's **D6** is the ai-analytics/annotations orphan cleanup. Use the handoff's numbering as canonical.

> 🔴 **PostHog is reached from FOUR independent places, not one.** Deleting `api/lib/posthog.js` does **NOT** remove PostHog: `nightly-attribution.js` and `health-agent.js` each `fetch()` PostHog's query API **directly**, bypassing that module entirely. A `queryHogQL`-only inventory misses both — and the nightly **is** the money-rail.

| # | Surface | Evidence | Money-rail? |
|---|---|---|---|
| D1 | **`api/lib/posthog.js`** — exports `ph` (:13), `queryHogQL` (:25), `fetchPageviews` (:129). `import { PostHog } from 'posthog-node'` (:1). Consumers: 12 files import `queryHogQL`; `fetchPageviews` → `api/routes/analytics.js:7` (injectable `_fetchPageviews`, pipe-first). | grep | 🔴 yes (via engine) |
| D2 | **The `ph` client — WRITE-DEAD ALREADY.** **Zero live `ph.capture(` calls remain** (executed grep: no matches outside tests/comments). The only live uses are **`ph.shutdown()`** — `api/index.js:632` and the `process.on('exit')` handler at `posthog.js:23`. The client is instantiated with `POSTHOG_API_KEY` but never captures. | grep | ⚪ no (no writes) |
| D3 | **`posthog-node`** — imported ONLY at `api/lib/posthog.js:1`; dep `package.json:36` (`^4.3.0`). | grep | — |
| D4 | 🔴 **`api/jobs/nightly-attribution.js` — its OWN PostHog reader.** `queryPostHog()` at **:1350** is a **direct `fetch`** to `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/` with `Bearer POSTHOG_PERSONAL_API_KEY` (+ 429/5xx retry) — **does not import `api/lib/posthog.js`**. Call sites **:495**, **:616**, **:768**, all Tinybird-first fallbacks (`if (rows === null)`). Env read at :155–157. | read | 🔴 **YES — this is the attribution/revenue pre-agg writer** |
| D5 | 🔴 **`api/jobs/health-agent.js` — its OWN PostHog check.** `check('posthog', …)` at **:136**: direct `fetch` to the same query API with `POSTHOG_PERSONAL_API_KEY`, body `SELECT 1`, marked **CRITICAL**. Env at :137/:139/:142 and again :182/:184/:187 (a second check). **Deleting PostHog while this check stays CRITICAL will red the health agent.** | read | ⚪ no (health) |
| 6 (= handoff **D4**, #312) | **Frontend — product analytics on the dashboard app itself (NOT the tracker).** `dashboard/src/lib/posthog.js` (`import posthog from 'posthog-js'` :1, `posthog.init` :31, `export default posthog` :44); single consumer `dashboard/src/App.jsx:8` (`initPostHog`). Dep `dashboard/package.json:23` (`posthog-js ^1.203.0`). ⚠️ **Distinct from the customer tracker** — do not conflate; §6 cookieless rules apply to the tracker, this is first-party app analytics. **✅ REMOVED in #312 (handoff D4).** | grep | ⚪ no |

**`POSTHOG_*` env references — CODE ONLY (env var VALUES are not visible to CC; this is the reference list for D1–D6):**
**Server (6):** `POSTHOG_API_KEY` (`posthog.js:13`, `index.js:264`) · `POSTHOG_HOST` (`posthog.js:14,27`, `nightly-attribution.js:157`, `health-agent.js:137,182`) · `POSTHOG_PROJECT_ID` (`posthog.js:28`, `index.js:266`, `nightly-attribution.js:156`, `health-agent.js:139,184`) · `POSTHOG_PERSONAL_API_KEY` (`posthog.js:37`, `index.js:265`, `nightly-attribution.js:155`, `health-agent.js:142,187`) · `POSTHOG_FLUSH_AT` (`posthog.js:5,6`) · `POSTHOG_FLUSH_INTERVAL_MS` (`posthog.js:9,10`).
**Frontend (3):** `VITE_POSTHOG_API_KEY` (`dashboard/src/lib/posthog.js:8`) · `VITE_POSTHOG_HOST` (:17) · `VITE_POSTHOG_UI_HOST` (:18).
**Non-prod also reads these** (scripts/tinybird tools — out of the app's runtime, listed so D1–D6 doesn't break them): `scripts/qa-dedupe-regression.mjs:13`, `scripts/seed-duplicate-conversion.mjs:80`, `scripts/seed-multitouch-carrier.mjs:80`, `tinybird/qa/phase4_replay_verify.mjs:33-34`, `tinybird/tools/route_ab_diff.mjs:844-845`, `tinybird/tools/run_phase4_diff.mjs:73-84`, `tinybird/tools/phase4_touchpoint_diff.js:37`, `scripts/qa-referrer-domain-reporting.mjs:10`.
⚠️ **A `grep POSTHOG_` without excluding `dist/`+`node_modules/` is polluted** by posthog-js bundle internals (`POSTHOG_TOOLBAR__`, `POSTHOG_INSTRUMENTED__`, `POSTHOG_DEBUG`, …) — those are **not** env vars. Scope to `process.env.POSTHOG_*` / `import.meta.env.VITE_POSTHOG_*` over source only.

---

## 25. DELTA LIST — what changed `cb17cc2` → `fc00e406` (review just this)

**Code drift in the four intervening commits: NONE that affects this map.** #251 = doc-only; #252/#253 = frontend-only; #254 = moved the 4 canonical gate Sets to `dashboard/src/lib/gate-constants.js` with `api/lib/report-config-validation.js` **re-exporting** them (public surface byte-identical — 14 exports, same names/members/types). Executed: `api/index.js`, `attribution-engine.js`, `routes/attribution.js`, `routes/export.js` are **all byte-identical** `cb17cc2` → `fc00e406`.

| # | Section | Change | Kind |
|---|---|---|---|
| 1 | Header | `Verified @` `cb17cc2` → **`fc00e406`**; re-baseline scope note added | freshness |
| 2 | **§22** | `/api/*` mounts **45 → 46**; overall **52 → 53**; direct handlers **14 → 15**; **`GET /api/diag/ip`** added (`index.js:525`) | 🔴 **correction — my miss** |
| 3 | **§22** | New grep rule: must also allow **leading whitespace** (`^[[:space:]]*app\.`), not just both forms | process fix |
| 4 | **§9** | KEEP set **re-verified UNCHANGED** by #252/#253/#254 (5 gate Sets identical, 3 deciding files untouched) | confirmation |
| 5 | **§9** | 🔴 **NEW HOLE**: 12 shapes = 4 multi-touch models × {leads, customers, avg_conversion_value} are **ungated + no pre-agg → bare dead-store → fake zeros (§6)**. Not covered by #248's gate. **Founder decision.** | 🔴 **new finding** |
| 6 | **§23** (new) | Bare `queryHogQL` inventory = **4 sites, all in `getFlexibleReport`, all money-rail**. Routes have **zero**. | new (PR#4 spec) |
| 7 | **§24** (new) | PostHog touch-point map: 🔴 **4 independent surfaces, not 1** — `nightly-attribution.js:1350` and `health-agent.js:136` `fetch()` PostHog **directly**, bypassing `api/lib/posthog.js` | 🔴 **new finding** |
| 8 | **§24** | **`ph.capture` is already fully removed** — zero live capture calls; only `ph.shutdown()` remains. PostHog is **write-dead today**; D1–D6 is a **read**-decommission. | new finding |
| 9 | **§24** | Full `POSTHOG_*` env reference list (9 names: 6 server + 3 `VITE_`), + the `dist/`-pollution warning | new (D1–D6 input) |

**Not re-verified at `fc00e406`** (unchanged tags, still inherited): §1–§8, §10–§21 except where noted above. `GET /api/diag/ip` is newly *listed* but **not audited** (no consumer trace / intent class; IP-adjacent → §6 privacy review).
