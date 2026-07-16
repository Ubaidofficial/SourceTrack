# SourceTrack — FEATURE MAP (canonical)

> ⚠️ **FRESHNESS GUARD — read before trusting.** This doc goes stale the moment features change (a 139M-inventory doc misled this very session). **Rules:** (1) verify against current code / `git log -1`, not this doc, for anything load-bearing; (2) CC must update this file in the SAME PR that adds/removes any feature; (3) keep the "Verified @" line below current.
>
> **Status: verified against `main` @ cb17cc24939c42f0bba3d78160c6f2b4123c2f8e.** **Verified @ cb17cc24939c42f0bba3d78160c6f2b4123c2f8e** (`cb17cc2`) · **Built:** 2026-07-16.
>
> **Audit scope — verified by grep/execution against `main` @ `cb17cc2`:** §22 (the FULL mount list — see the correction there), §21, §15 team-invites, **and the reporting-surface tags in §3 · §4 · §5 · §8 · §9 · §20**, re-tagged 🚧 against the **dead-store gate that went live 2026-07-16 14:41** (PRs #248/#249/#250). **Everything else is still inherited from the draft and NOT re-verified** — it keeps its original 📜/🗺️/❓ tags. Where a section conflicts with §21/§22 or a 🚧 tag, the latter wins.


**Built:** 2026-07-16, this session. **Reconciles:** live code inventory (my grep) + `SourceTrack_GTM.md` §5 truth-gate + `README.md` + `docs/paid_beta_go_no_go_master_audit.md` + `SELF_SERVE_PAID_BETA_AUDIT.md` + `docs/qa/full_functional_feature_browser_qa_140G-26.md` + `DATA_CAPTURE_SPEC.md` + `BUSINESS_DASHBOARDS_SPEC.md` + `docs/design/design.md` + June 20–29 chat history.

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
- ✅ Lightweight cookieless tracker (`tracker/tracker.min.js`), no `document.cookie`, no fingerprint, no IP storage
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
- ⚠️ **Funnels — backend endpoint LIVE + plan-gated** (✅ verified @ `cb17cc2`): `analytics.js:933` `GET /funnel` `requireFeature('funnels_cohorts')`; **SOLD on starter/growth/scale** (`plan-features.js:36`). But **NO UI** — `FunnelChart.jsx` imported nowhere = **billable feature customers can't reach**.
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
> **What actually returns data (@ `cb17cc2`, post-gate) — the KEEP set:**
> - ✅ **Common dims** (`source`, `campaign`, `channel`, `medium`, `landing_page`, `country`, `device`, `browser`, `date`, `ai_source`) **× {`revenue`, `conversions`, `leads`, `customers`, `avg_conversion_value`}** at the site's default window → **Supabase pre-agg** (`PREAGG_CONVERSION_METRICS` resolves to exactly those five at runtime).
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
- 🗺️❓ **Business-type dashboard VARIANTS** (Revenue/General, E-commerce, Lead-Gen, SaaS) — `BUSINESS_DASHBOARDS_SPEC.md` design-confirmed; **explicitly says "don't claim implemented unless verified code/data/QA."** Build-state UNVERIFIED — CC must confirm which variants actually render.

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
| 12 | Funnels | ⚠️ Backend endpoint live + plan-gated; **SOLD** on starter/growth/scale | **NO UI** — `FunnelChart.jsx` imported nowhere → billable feature customers can't reach (§3) |
| 13 | Report-Builder **gated depth** (🚧 @ `cb17cc2`) | Denies honestly (422 + calm state, no zeros) | Needs pipes: `ltv_revenue` (novel shape) · `ai_*_share`/`ai_conversions`/`ai_revenue` (clone the dim-swap template) · `keyword`/`referrer_domain`/`custom_param` · non-default windows (non-Class-A) · journey-explain narrative (clone the conversion sibling) |
| 14 | `sessions` + `conversion_rate` (🚧 @ `cb17cc2`) | Gated ENTIRELY — dead on every dim; never routed to the session pipes | Unique-Visitors-by-dim + the `univ_cvr` template are non-functional until a pipe lands (§3) |
| 15 | Campaigns page | ⚠️ Degraded → graceful banner | The 3 campaign pipes exist but are **INERT** (undeployed + unallowlisted) — deploy + allowlist, not a gate (§8) |
| 16 | Report-Builder picker trim + saved-report migration | Backlogged | Pickers still offer gated shapes; saved reports with gated configs replay into the 422 state (§9) |

## 21. ⛔ CUT / REMOVED (NOT in app) — ✅ VERIFIED @ `cb17cc2`
- ✅ **`ai-chat` — FULLY REMOVED.** Zero references in `api/` **and** `dashboard/src`. No route file, no page, no App.jsx route, no Layout/Dashboard entry point. Nothing lingers.
- ⚠️ **`ai-analytics` — DE-WIRED but 2 orphan files REMAIN, and neither is zero-ref (NOT deleted).**
  - Not mounted (absent from `api/index.js`), no App.jsx route/import → **unreachable at runtime**.
  - `api/routes/ai-analytics.js` — **referenced by `api/routes/admin.js:691`**: `routeExists('ai-analytics.js')`, an `fs.existsSync` probe. ⚠️ **Truth bug:** that probe makes the admin console report **"AI Analytics: live"** purely because the FILE EXISTS, while the route is not mounted — the console currently misreports a dead feature as live. Delete the file **and** the probe entry together.
  - `dashboard/src/pages/AIAnalytics.jsx` — **referenced by `api/tests/query-error-surfaces.test.js:34`** (empty-state marker list). Delete the page **and** that test entry together.
  - `dashboard/src/components/Layout.jsx:44` still maps `'/ai-analytics': 'AI Analytics'` — a dead title entry for a path with no route.
- ❗ **Funnels — MOVED OUT of this list (were mis-classified as "removed").** The endpoint is live + plan-gated and the feature is SOLD → see **§3 (Analytics)** + **§20 row 12**.
- ✅ **"Add Annotation" — removed from the UI.** Zero references in `dashboard/src`. `api/routes/annotations.js` lingers: **not mounted, 0 references anywhere** → the one **provably safe orphan** (delete pending founder go). (`site_annotations` appears only as a table name in the schema-drift ignore list — unrelated to the route.)
- cohorts · heatmaps · session replay · two-way CRM sync · affiliate mgmt · Consent Mode v2 (→V1.1) · synthetic AI UTMs / Direct-Rescue (unshipped moat) · predictive LTV · DeepSeek health-agent LLM (deleted PR #184). *(📜 not re-verified by this audit.)*
- ❗ **Ad-platform cost sync — MOVED OUT of this list (was mis-classified "not built").** Endpoints + callers are live; PR #23 removed only the Integrations UI → see **§8** + **§20 row 11**.
> **Lesson:** the Session-139M inventory doc is STALE — but so was this doc's own §21: it called funnels "removed (0 refs)" when the endpoint is live and plan-gated. **Verify against current code, not any inventory doc — including this one.**

## 22. ✅ MOUNT-VERIFY — RESOLVED @ `cb17cc2`
> ❗ **CORRECTION (@ `cb17cc2`) — the previous count was INCOMPLETE.** It said "31 `/api/*` mounts" because the grep was **`app.use(`-only**. Express also mounts handlers **directly** via `app.<verb>(...)`, and that grep missed **18** of them — including the entire **`/api/attribution*`** surface (the Report Builder's own backend!), plus the whole ingestion rail (`/api/track`, `/api/collect`, `/api/conversion`, `/api/identify`, …). **Any future mount audit MUST grep `app.use(` AND `app.get|post|put|delete|all(`.**
>
> **TRUE COUNT: 45 `/api/*` mounts** = **31** router mounts (`app.use`) **+ 14** direct handlers (`app.<verb>`), plus **7** non-`/api` mounts (`/tracker` guard + static, `/tracker.min.js`, `/tracker.cookieless.min.js`, `/sp` proxy, `/health`, `/track`). Totals: 34 `app.use` + 18 `app.<verb>` = **52** mounts overall.

**The 14 DIRECT `/api/*` handlers the old list missed** (`grep -E "^app\.(get|post|put|delete|all)\(" api/index.js`):
`POST /api/billing/webhook` · `POST /api/track` · `GET /api/pixel` · `POST /api/collect` · `POST /api/identify` · `POST /api/conversion` · `POST /api/conversion/offline` · **`GET /api/attribution`** · **`GET /api/attribution/explain`** · **`GET /api/attribution/verdicts`** · `GET /api/journey/:visitorId` · `GET /api/sessions/overview` · `GET /api/sessions` · `GET /api/health`
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
| `api/routes/annotations.js` | **0** | ✅ safe to delete — **pending founder go** |
| `api/routes/ai-analytics.js` | `admin.js:691` `routeExists()` probe | ⛔ blocked — delete with the probe entry |
| `dashboard/src/pages/AIAnalytics.jsx` | `api/tests/query-error-surfaces.test.js:34` | ⛔ blocked — delete with the test entry |
| `dashboard/src/pages/ShareDashboard.jsx` | 0 (unrouted; backing `/api/public` absent) | 🔍 newly found — founder decision |
| `dashboard/src/components/FunnelChart.jsx` | 0 (unimported) | 🔍 newly found — but funnels endpoint is LIVE (§21) |

**§15 team/workspace invites — ✅ RESOLVED: NOT BUILT.** No invite/member route file, **zero** member-management endpoints (`router.get|post|put|delete` matching member/invite/team/seat → none), and **no invite control in `Settings.jsx`** (its only "member" text is GDPR account-deletion prose). `company_members` is **read-only** across the codebase (role lookup in `user-auth.js:34`, plus `email-reports.js`, `google-search-console.js`, `admin.js`). Membership *enforcement* exists (`requireSiteMembership`, `auth.js:189`) so the data model supports shared workspaces, but **there is no way to invite/add a member in-product** — members must be provisioned out-of-band. → the §15 ❓ is a **spec-leak from 139M**, not a partial build.

---

## Verification debt (before trusting this fully)
1. ~~**CC grep `api/index.js` on `main`** for every mounted route~~ → ✅ **DONE @ `cb17cc2`** (§22): **45** `/api/*` mounts (31 `app.use` + 14 direct `app.<verb>`) — the first pass under-counted by 14 because it grepped `app.use(` only, **missing the entire `/api/attribution*` + ingestion surface**; `/api/public` proved non-existent; alerts/ad-platforms intent classified; ai-analytics/annotations/ai-chat/funnels state confirmed; team-invites resolved to NOT BUILT.
2. **CC confirm** business-type dashboard variants (§13) actually render vs design-only. *(still open — not in this audit's scope)*
3. **Founder/Antigravity** confirm health-agent cron (§17) + apply the beta-wiring patch (§14). *(still open; note §22 proves the `/api/reports` alias IS applied)*
4. Several source docs are **stale** (README model count; DATA_CAPTURE Session-78 click-ID list) — this map corrects them but flag if you cite the originals.
5. **Founder decisions opened by this audit:** (a) delete `api/routes/annotations.js` (0-ref, ready); (b) delete `ai-analytics.js` + its `admin.js:691` probe **together** — the probe currently misreports "AI Analytics: live"; (c) delete `AIAnalytics.jsx` + its `query-error-surfaces.test.js:34` entry together; (d) `ShareDashboard.jsx` / `FunnelChart.jsx` orphans; ~~(e) reconcile §8/§12 "auto ad-spend sync not built" vs the live `ad-platforms` sync endpoints~~ → ✅ **RESOLVED: §8 corrected** (🧪 built + wired, end-to-end unproven); §12 carried no ad-sync claim. Funnels likewise re-classified out of §21 → §3 + §20 row 12; (f) `/api/alerts` — keep as an API surface or retire.

*Confidence: **§21, §22, and §15-invites = grep-verified against `main` @ `cb17cc2` (this audit)**. Sections 1–20 are inherited from the draft and were NOT re-verified: ✅ there = author's earlier grep; 📜 = from chats/audits, needs re-verify; 🗺️/❓ = unverified. Trust the §21/§22 tables over any other section where they conflict.*
