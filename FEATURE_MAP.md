# SourceTrack — FEATURE MAP (canonical)

> ⚠️ **FRESHNESS GUARD — read before trusting.** This doc goes stale the moment features change (a 139M-inventory doc misled this very session). **Rules:** (1) verify against current code / `git log -1`, not this doc, for anything load-bearing; (2) CC must update this file in the SAME PR that adds/removes any feature; (3) keep the "Verified @" line below current.
>
> ## ⚠️ THIS DOCUMENT HAS NO WHOLE-FILE VERIFICATION DATE. It never has.
>
> **There is deliberately no "Verified @ `<sha>`" line here any more.** Every such line this file
> has carried has been a *partial* re-baseline of a named handful of sections, presented in the
> position where a reader expects a whole-document guarantee. Provenance is real, but it is
> **per-section** — each section carries its own `cb17cc2` / `fc00e406` / `c9a4113` / `93da62d` /
> `44dd620` tag, and that tag is the only claim you may rely on. A section with no tag is unverified.
>
> **Last partial re-baseline: `44dd620` (2026-07-31)** — scope, exhaustively: **§15's two GDPR
> bullets** and **§10 + §27's currency-labelling rail (#528 · #529 · #532 · #534 · #535)**. Nothing
> else. Previous partial: `93da62d` (2026-07-26). **Built:** 2026-07-16.
>
> **Drift since that partial: 92 PRs (#466 → #664), 94 commits** — measured 2026-08-06 against
> `origin/main @ 2e65b821`. Not re-verified, and deliberately not re-verified: re-checking 92 PRs to
> justify a new SHA would cost more than it is worth and would produce the same partial guarantee
> in a more convincing font.
>
> > ⚠️ **READ "92 PRs" CORRECTLY — it counts ALL PRs, not feature PRs, and that distinction is why
> > two re-baselines failed.** Measured on the last 30 merged PRs (#661–#691, 2026-08-07, PR #692):
> > only **5** touched `api/routes/**` or `dashboard/src/pages/**` at all, and of those exactly
> > **one** (#676, accepting click IDs on `/api/server-events`) was a capability change this map
> > should record — the rest were a log-only boolean, two bug fixes and a display refactor. Of the
> > **10** `feat(` PRs in that window, most were marketing pages, a brand mark, or internal
> > instrumentation: presentation and internals, **not** catalogued capability. So the real backlog
> > is a small fraction of 92, and the headline number **overstates the work while understating the
> > mechanism** — which is what made "re-baseline harder" look like the answer twice. The mechanism
> > is rule (2) vs the §9 merge gate, addressed by the `FEATURE_MAP.md` carve-out and the advisory
> > guard in #692; the arithmetic never was.
>
> ### ⚠️ The range caveat is now a PATTERN, not an incident — read this before adding another baseline
>
> The `44dd620` block below already admits its own delta list was **incomplete for ~100 PRs**
> (#431–#536, of which seven were inventoried). This header now records the **same admission a
> second consecutive time**, for a comparable span. Two in a row is not bad luck; it is what this
> document does under its own update rule.
>
> **So do not "fix" this by re-baselining harder.** The mechanism that keeps failing is rule (2) of
> the freshness guard — *"CC must update this file in the SAME PR"* — which loses every race against
> the empty-session-doc-diff requirement in the PR gate (the conflict is named at the bottom of this
> header and is still unaddressed). Until that conflict is resolved, a new "Verified @" line
> **advertises a guarantee the process cannot produce.** The recommended CI check — fail when
> `api/routes/**` or `dashboard/src/pages/**` changes without `FEATURE_MAP.md` — is the fix; a
> fresher SHA is not.
>
> ### Re-baseline `93da62d` → `44dd620` (2026-07-31) — WHAT WAS AND WAS NOT RE-VERIFIED
>
> **Re-verified by grep/execution/code-read at `44dd620`** — these and nothing else:
> - **§15, two bullets only** — the GDPR/privacy pair. (a) the **"privacy suppression list" claim was FALSE and is removed** — exhaustively disproved this session, evidence in the §15 bullet itself. (b) the **"server-side GDPR erasure is Phase 7, NOT STARTED" claim was STALE and is removed** — all three endpoints confirmed present and mounted in code. Every OTHER §15 row (settings surface, the 4-tab split, team-invites ⛔, the `data_retention_days = NULL` warning, the PostHog-residue line, the badge ⛔) is **untouched and keeps its prior tag and provenance**.
> - **§10 + §27** — the currency-labelling rail, PRs **#528 · #529 · #532 · #534 · #535** (all merged). One new §10 bullet; five new numbered §27 rows.
>
> **NOT re-verified at `44dd620` — every other section keeps its existing 📜/🗺️/❓ tag and its `cb17cc2`/`fc00e406`/`c9a4113`/`93da62d` provenance:** §1–§9, §11–§14, §16–§22, and every §15 row not named above. Deliberately not mass-upgraded.
>
> **⚠️ RANGE CAVEAT — this delta list is NOT complete for `93da62d` → `44dd620`.** That span is ~100 PRs (#431–#536); this pass reflects the **seven** named above and nothing else. Read §27 as "these PRs, verified" — never as "everything that landed in the range". Notably NOT inventoried here: #530/#531/#533 (marketing-site scroll-reveal fixes — `marketing/` only, no app-surface impact) and #536 (`CLAUDE.md` §13 corrections — doc-only, no map impact). The §20 and §22 audits carry their `93da62d` provenance forward **unchanged and unre-run**; §22's mount count in particular has NOT been re-grepped at this ref.
>
> **⚠️ PROCESS FINDING (carried forward, still unaddressed) — rule (2) of the freshness guard vs session-doc check conflict.** Between `c9a4113` and `93da62d` six PRs (#425–#430) landed without updating `FEATURE_MAP.md` because every prompt demanded an empty session-doc diff. The span since is far worse — ~100 PRs, one map update. A CI check that fails when `api/routes/**` or `dashboard/src/pages/**` changes without `FEATURE_MAP.md` is recommended.
>
> **Audit scope inherited from `cb17cc2` / `c9a4113` / `93da62d` (unchanged, still the provenance for those sections):** §21, §15 team-invites, reporting-surface tags in §3 · §4 · §5 · §8 · §9, and the §20/§22 audits.


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
- ✅ `sourcetrack.getToken()` — client accessor for payment↔visitor stitching; **returns `null` while consent is withdrawn** (breaking change to a shipped API — safe at zero external customers; KI-33)
- ✅ Second tracker `tracker/analytics.js` — Plausible-style pageview analytics, **bundled into our own dashboard** (internal), not customer-installed
- ⚠️❓ Full cross-device identity stitching — DATA_CAPTURE lists as not-built; `identity-links.js` exists (partial)
- ⛔ Predictive LTV — not built (DATA_CAPTURE "not yet built")

## 2. Form attribution / automatic insertion (moat cluster — mostly SHIPPED)
- ✅ **Form auto-fill (Phase 1)** — opt-in `data-auto-fields="true"`; auto-injects attribution into pre-existing hidden form fields (allowlist, skip-non-empty, bounded SPA MutationObserver, never reads visible inputs)
- ✅ **Manual form fill** — `fillHiddenFields()`, `getContext()`, `decorateUrl()`
- ✅ **UTM Link Builder** — `components/UTMBuilder.jsx` + standalone page `pages/tools/UtmBuilder.jsx` (route `/tools/utm-builder`) + embedded in Setup/Settings (GTM "audit in flight" → RESOLVED: it exists)
- ✅ **Cross-domain link decoration** — opt-in `data-cross-domains="..."`; auto-rewrites cross-domain link hrefs to carry `__st_id` + attribution
- ✅ **Booking-host attribution passthrough** — for known booking hosts (Calendly etc.), auto-appends UTMs + click IDs to the booking URL (a real lead-gen edge)
- ✅ **Confirmed-booking DETECTION and conversion promotion** (added 2026-08-04 @ `ee93b755`; this was absent from the map entirely). The tracker detects completed bookings in an **embedded** Calendly or Cal.com widget — origin-validated `postMessage` for Calendly, the `window.Cal` embed hook for Cal.com (`tracker/tracker.js`, both minified builds) — and `track.js:332` allowlists the provenance fields on ingest. **#592** then promotes a confirmed booking to a real `$conversion` with `conversion_type: 'meeting'` (in `LEAD_TYPES`, so it counts as a lead; `'booking'` deliberately NOT used — it is absent from the classifier and would silently classify as `'other'`). **#605** hardened the gate to require **full** provenance — `booking_provider && booking_detection_method && booking_event_type` (`track.js:631`) — so a partial payload no longer promotes. ⚠️ **Link-only Calendly flows are NOT detected** (redirect to the provider's own page) — UTM passthrough only, which is the row above. 🔴 **Zero `conversion_type='meeting'` rows have ever existed in prod** (founder-reported; needs a real embedded booking on a live site). Untested by any committed regression test — **#602**.
- ⚠️ **Chat lead capture — DETECT-ONLY, does NOT promote to a conversion** (added 2026-08-04 @ `ee93b755`; absent from the map entirely). **#594** auto-detects an in-widget lead capture for **Intercom and Crisp** and emits a `chat_lead_captured` event through `/api/track`. 🔴 **It is stored and nothing more.** Verified at `ee93b755`: `track.js:481` writes it with a FIXED schema and `:498` excludes it from custom-property passthrough (the comment at `:492-497` warns that removing it "silently reopens the hole"). There is **no `$conversion` promotion block for chat** — grep for one returns nothing, unlike the booking path above. That asymmetry is **deliberate**, not an oversight: promoting chat would compound the cross-path double-count risk in **#590**. So chat data exists in Tinybird and reaches no conversion, lead count, or attribution model. 🚫 Do not sell chat attribution. Phase 2 (Tawk.to) is **#595**; Facebook Messenger is blocked on a privacy review, **#596**.
- ✅ **Frontend/backend entitlement parity — ENFORCED and pinned** (added 2026-08-04 @ `ee93b755`). `dashboard/src/lib/planFeatures.js` had drifted from `api/lib/plan-features.js` on **17 (key, tier) pairs**: 13 Starter features the UI locked while the backend granted them, plus `multi_user` offered on trial/starter/growth/scale while the backend grants it on **no tier at any price**. Because the backend repackage (`plan-features.js:31-38`) existed to close a downgrade-on-purchase gap, the UI was still showing the exact bug the backend had fixed. **#604** synced all 27 keys × 5 tiers and added `api/tests/plan-features-parity.test.js` (4 tests, verified present at `ee93b755`) comparing `hasFeature()` rather than the raw tables, so legacy plan aliases are covered too. `reportGating.js:8` had documented the lockstep rule for months with nothing enforcing it.
- ✅ **Ops Console Feature Status panel self-corrects** (added 2026-08-04 @ `ee93b755`). It was stateless: the recheck compared live probes against a **hardcoded** baseline that #574 never updated, so it re-announced the same five already-happened changes on every run — a diff list that could not reach empty. **#589** persists each run's `{name,status}` into the existing `admin_audit_log.metadata` jsonb (no schema change) and reads the most recent run as the baseline, seeding from a hand-verified array only on a cold database. It also corrected **three more false entries** (deduplication, widgetized dashboard, period-over-period) on top of #574's two.
- ⛔ **"Direct Rescue" / synthetic AI UTMs** — NOT built (by design). AI detection is built + stored as separate `ai_source`; never injected as synthetic `utm_source`. GTM §4 flags surfacing-into-CRM as the top unshipped quick-win moat.

## 3. Analytics (lightweight)
- ✅ Visitors, sessions, pageviews, top pages, top sources
- ✅ Device / browser / country / OS breakdowns
- ✅ Traffic trends, recent activity, live/recent visitors
- ✅ **Realtime Visitors panel** — `live_visitors_detail` Tinybird pipe, `/api/live/visitors` endpoint, `RealtimeVisitors.jsx` component. Positioned above Top Sources. Refreshes every 10s. Degraded state on pipe failure — a dead read reports `degraded: true` and the panel says so, never "no active visitors" (§6). (#438/#442, 2026-07-27)
- ✅ **Custom Goals section** — `/api/analytics/goals` route using the existing `flexible_report_conversion_type_by_site` pipe (no new pipe/SQL). Shows completions, revenue (when > 0), conversion rate per goal type. Excludes `'refund'` and `'untyped'`. Conversion rate is computed client-side from the summary read's `unique_visitors` so it cannot disagree with the other rates on the page. ⚠️ No unit test yet — issue #447. (#446, 2026-07-27)
- ✅ New vs returning; ✅ bounce rate + avg session duration (truth-gated, PR #82)
- ⚠️ **Funnels — dormant entitlement + dead code, NOT a marketable feature.** `analytics.js:1022` `GET /funnel` `requireFeature('funnels_cohorts')` grants a plan entitlement (`plan-features.js:36`), but the feature has **NO UI** (`FunnelChart.jsx` **DELETED #317**) and its endpoint reads the Supabase `pageviews` table (`analytics.js:1047`), **empty by design in prod (0 rows)** → returns nothing. **Nothing customer-facing promises it:** `FEATURE_LABELS` "Funnels & cohorts" (`dashboard/src/lib/planFeatures.js:58`) is **imported nowhere** (never renders) and `Pricing.jsx` doesn't mention it. Resolve as cleanup, not as a sales claim (verified 2026-07-20).
- 🚧 **`sessions` (Unique Visitors by dim) + `conversion_rate` — GATED ENTIRELY** (@ `cb17cc2`). VERIFIED: both `break` in the engine's metric switch and fall to the main flexible sql, where only `revenue`/`conversions` have a pipe → **dead PostHog on all 15 dims**. They **never** routed to the session pipes. **The two templates that used these metrics — `univ_visitors` ("Unique Visitors by Channel") + `univ_cvr` ("Conversion Rate by Channel") — were REMOVED from `PRESET_TEMPLATES` in #374**, so all **11** shipped templates return data via the pre-agg (verified: `PRESET_TEMPLATES` in `ReportBuilder.jsx` holds 11 ids, neither of those two among them; the removal comment sits at `:139`). Re-add them in the same PR that lands a `sessions`/`conversion_rate` backend. Backlogged. *(Analytics-page visitor counts are a DIFFERENT path — `analytics.js` → `dispatchPageviews` → the `summary` pipe — and are ✅ live, unaffected.)*
- ⚠️❓ `/dashboard/recent-activity` 404 seen in staging QA (deploy-pending fix)

## 4. Attribution (core)
- ✅ **9 models** — first-touch, last-touch, linear, time-decay, U-shaped, W-shaped, + first/last-touch non-direct variants (README stale-says 4–6; actual = 9). Served by the **Supabase pre-agg** short-circuit (`attribution.js:151` + the 4 multi-touch readers) at the site's materialized window — live-confirmed.
- ✅ Source / medium / campaign / landing / exit dimensions, touchpoint count, time-to-convert
- ✅ **The Attribution page is LIVE** — it reads the pre-agg (not PostHog); untouched by the gate.
- 🚧 **Non-default attribution-window reports — GATED** on every non-Class-A dim (@ `cb17cc2`). The pre-agg holds only the ONE window the nightly materialized and cannot re-window; no pipe covers the others → dead PostHog. **Class-A dims** (provider/attribution_status/stitching_method/conversion_type) are **exempt — their pipes are window-tolerant and still serve any window.**
- 🚧 **`keyword` / `referrer_domain` / `custom_param:*` dimensions — GATED** (@ `cb17cc2`): no pre-agg column, no pipe, at any window/model. *(The old 31-day `capUnmaterializedRange` mitigation is now vestigial — capping a dead store returned zeros LABELED "showing the last 31 days".)*
- ⚠️ **Multi-touch is NIGHTLY (02:00 UTC cron), NOT real-time** — must be disclosed; customers may perceive "missing" attribution for hours
- ✅ Attribution Coverage Score card (any-touch, denylist-based; PR #47/#48) 📜
- ✅ **Attribution "explainer" — BOTH halves are piped** (corrected 2026-07-21 @ `b3cb043`; the prior "JOURNEY NARRATIVE is GATED/dead" line was **stale**, pinned @ `cb17cc2` and written before the D1c-2 cutover). It remains true that **no `attribution_explain_journey.pipe` exists** — but the journey leg no longer needs one: it **reuses the already-deployed `journey` pipe** (`api/lib/attribution-engine.js:952`), the same pipe that serves the `/journey` route. The conversion half reads `attribution_explain_conversion` (`attribution-engine.js:923`). So the timeline **does** return data; the "reads dead PostHog" claim is false at this ref (the HogQL builder and seam were removed in D3). The reuse is pinned by `api/tests/explain-journey-pipe-parity.test.js` (**2/2 passing**), which fails loudly if a `journey.pipe` edit drops a column the explain leg reads. ⚠️ **Pipe-deployment evidence is STAGING-ONLY** — both `journey` and `attribution_explain_conversion` are present in the Tinybird workspace reachable from the orchestrator MCP, and that MCP is staging-bound (§13). **Prod pipe state is UNVERIFIED here** and needs a founder-held prod token to confirm. Endpoint behaviour documented in `docs/guides/attribution-explain-api.md`.
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

## 7.9 Attribution API surface — corrected 2026-07-21 (session 145)

- ✅ **`GET /api/attribution/verdicts` is DETERMINISTIC** (@ `ab9fc7b`). The LLM call is **gone** — no `ai-client` import, no prompt, **no data egress**. Verdicts are computed in-process by the pure `api/lib/campaign-verdicts.js`. This restored `docs/SourceTrack_GTM.md`'s published **"no data to LLM"** claim, which had been **false** from the day that endpoint shipped (KI-47).
  - 🔴 **Three of the old prompt's four rules were structurally unsatisfiable** — the model could only have invented them: *"positive trend"* (the payload had **no time dimension**), *"good conversion rate"* (it sent `sessions: c.sessions || 0`, but the pre-agg reader **emits no `sessions` field**, so it sent literal `0` every call), *"no conversions"* (the aggregation iterates conversions, so a campaign **cannot appear with zero**). **Every `SCALE` and every `KILL` it ever returned was fabricated;** `PAUSE` was the only rule with real inputs.
  - ⚠️ **Thresholds are ABSOLUTE and CURRENCY-BLIND** (**KI-50**). `sites` has **no `currency` column** and `Settings.jsx` has **no currency field**, so the "make it site-configurable" option needs **new DDL + new UI**, not a reused field.
  - The `ai_analytics` **gate key is unchanged**; only its display label became **"Campaign verdicts"** (@ `541c5dc`) — the feature is arithmetic, not AI.
- ✅ **`GET /api/attribution/explain` is documented** — `docs/guides/attribution-explain-api.md` (@ `19c64dd`), and **`/llms.txt` is served** with an explicit `text/plain` route in `dashboard/server.mjs`.
- ⚠️ **Export serves 5 of its 16 `ALLOWED_GROUPS` under `last_touch`** (14/16 under multi-touch, 11/16 under `ai_platforms`). Lower severity than Campaigns because **Report Builder already gates its picker** from the same `gate-constants.js` the API imports — Campaigns is the outlier that consults none of it.
- 🧹 **`api/lib/ai-client.js` has ZERO code callers repo-wide** (verified). It and the `openai` dependency are provably dormant and removable at will. With it gone, `DEEPSEEK_API_KEY` can be revoked without the silent-outage hazard KI-47(d) described.

## 8. Campaigns & cost
- ⚠️ **Campaigns page — serves 1 of the 4 dimension tabs it offers (UTC) / 0 of 4 (non-UTC)** (corrected 2026-07-21 @ `a3d112d`; the prior "pending the 3 campaign pipes … INERT: authored but not deployed" line was **stale and wrong**). The 3 campaign pipes **ARE deployed and DO serve** — verified by executing `servedByDeployedBackend` with `campaigns.js:53-59`'s exact argument shape: `campaign` resolves to `flexible_report_campaign_by_site` / `_sessions_by_site` / `_leads_by_site` and returns **200** on a UTC site. The real defects are two, on different axes:
  - **KI-53** — `campaigns.js:28` defaults and `Campaigns.jsx:563` **hardcodes** `model:'last_touch'` with no selector, and under that model only `campaign` is backed. `source`/`medium`/`ai_source` return **422 for EVERY site, UTC included** (all four metrics resolve to `NONE`, not just one). `campaigns.js:61` throws for the whole request if any one metric is unbacked.
  - **KI-51** — on a **non-UTC** site the `flexBreaker` tz gate takes the last surviving tab too, so all four 422.
  - ✅ The failure render is **honest** (browser-verified): lock icon, "Temporarily unavailable", cost imports still offered — **not** a fake empty state (§6 holds). ⚠️ **Copy corrected 2026-07-21:** it previously said "while reporting moves to the new analytics store" — a migration that COMPLETED 2026-07-19, so it read to a paying customer as mid-migration and got less true every week. Now "…is not available yet.", which carries no expiry date. Deliberately model-agnostic: three of the five gate call sites are model-independent, so naming the attribution model there would have been a new falsehood (see KI-57).
  - **Multi-touch models already serve `campaign`, `source` AND `medium`** (all four metrics, via `multitouch_conversions_by_site`) and rule 4 is **not** tz-gated — so the backings largely exist and the page simply cannot ask for them. See KI-53 options (a)/(b)/(c). **Fix is NOT "deploy the pipes" — they are deployed.**
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
- ✅ **The pickers still LIST gated shapes, but they can no longer be SELECTED** — `metricGateReason` / `dimensionGateReason` (`dashboard/src/lib/reportGating.js`) render them `disabled` with `cursor-not-allowed` and an explanatory tooltip (`ReportBuilder.jsx:1807`), so the "a user can pick a shape that cannot return data" hazard is closed; the server's honest 422 "temporarily unavailable" state (no fake zeros, no Retry) remains the backstop. Literal removal from the picker is still backlogged, but greying is a deliberate substitute, not a gap. The **`univ_cvr` template** no longer ships at all — removed in #374 (§3).
- ⚠️ **Saved reports holding a gated config** (e.g. a `keyword` or `conversion_rate` report saved pre-gate) now replay into the 422 gated state. `validateReportConfig` gates *writes*, not existing rows — a deprecation/migration pass is backlogged.
- ✅ Saved reports (`/api/saved-reports`; patch adds `/api/reports` alias — dashboard was calling wrong path)
- 🚧 **`ltv_revenue` ("LTV Revenue v1") — GATED** (@ `cb17cc2`): engine `:2791` **bare** `queryHogQL`, no pre-agg (`ltv_revenue` ∉ `PREAGG_CONVERSION_METRICS`), no pipe → dead PostHog. It was exposed in the metric picker on every paid plan while returning nothing. Backlogged (novel pipe shape — a per-`distinct_id` LTV rollup; nothing existing to clone).
- ⚠️ `conversion_type` filter ignored on ~6 templates → inflated data (bug logged this session)
- ✅ **CSV export is gated in lockstep** — `export.js` calls `getFlexibleReport` directly (never reaching the pre-agg), so it would have exported a CSV of zeros; it now denies with the same code.
- ⛔ PDF export (→V1.1), public report sharing (→V2), SQL/formula builder (not V1)

## 10. Revenue & conversions
- ✅ Conversion + revenue capture; manual conversion API; offline conversion API (positive values only — rejects negatives)
- ✅ Identify API (attach email/PII only when sent; stitches anon→user for LTV)
- ✅ **Refund netting** — a refund is a negative `$conversion` that nets revenue but does NOT decrement conversion counts. Phase 7, 2026-07-24: **#381** resolves a Stripe `refund.created` to its original conversion by `payment_intent` and inherits the original `distinct_id` (so the nightly re-derives Supabase attribution from the real touchpoints); **#382** makes the Supabase read paths refund-aware (counts exclude refunds; refunds bucket to an explicit "Unattributed refunds" line, not 'direct'); **PR 4/5 (2026-08-01) REVERSED the attribution half**: a refund is now **NEVER** attributed to a source — the nightly CLEARS its attribution descriptor columns and marks it `refund_attribution:'unattributed'` (matched) or `'unresolved'` (unmatched), and BOTH bucket to that line on `dashboard.js` **and** `analytics.js`. KI-62 Step C's verbatim inheritance is deleted, resolver and all: attribution on the original is a model output, so debiting it doubles a mis-attribution instead of cancelling it. Site-level revenue still nets exactly; **#383** does the same for 19 Tinybird pipes (**AUTHORED, NOT DEPLOYED** — parks in the deferred Tinybird cutover); **#384** adds Shopify `refunds/create` netting. **Boundary:** a subscription-mode refund carrying no `payment_intent` resolves as `refund_unresolved` (phantom `distinct_id`, kept queryable). **NOT yet live** — no prod webhook connected, no real refund processed (see the refunds launch-gate KI)
- 🔒 AOV, revenue-per-visitor/lead — need revenue data
- ✅ **Revenue per Visitor KPI tile** — client-side computed from `totalRevenue / kpis.sessions` (distinct visitors). Three-condition gate: `hasConversions` + revenue > 0 + visitors > 0, so it hides rather than rendering a $0 with no revenue source (§6). Placed here rather than under §13 because the 🔒 line above is the claim it partially discharges: the tile ships, but still only appears once real revenue exists. (#443, 2026-07-27)
- ✅ **Currency-ACCURATE labelling of money figures** — end-to-end unit carriage, PRs **#528 · #529 · #532 · #534 · #535** (all merged, 2026-07-30/31). 🚫 **This is NOT "multi-currency support"** and must not be sold as it: there is **no FX conversion and no cross-currency rollup anywhere** (verified — zero exchange-rate/`convertCurrency` machinery in `api/` or `dashboard/src`). The unit now travels ingestion → `attributed_conversions.currency` → reader → formatter, and a figure whose unit is not known is **suppressed or labelled, never stamped with a default** (§6). `collapseCurrencies()` (`api/lib/currency.js`) returns four statuses and **only `'ok'` may render a currency symbol**: `ok` (all amounts agree), `mixed` (amounts disagree — the sum is not meaningful, so it is NOT converted, it is suppressed), `partial` (one known currency but ≥1 amount carries no usable unit), `unknown` (nothing carries a unit). `mixed` outranks `partial`; `currency` is non-null **only** for `ok`, asserted as a property test. ⚠️ **Live prod state: the one revenue-bearing site reports `partial`** — `www.techrupt.pk` has 3 revenue rows, 2 USD and one 777.77 with no unit — so a correct client stops printing a symbol on its combined total. That is the intended outcome; the previous `USD` label was asserting something untrue. **Browser + server-SDK conversion rails accept an optional `currency` (#534); both refund builders stopped manufacturing `'USD'` (#535).**
- ⚠️ Anonymous conversions bypass persistent dedupe (no `order_id`) — inflation risk at scale

## 11. Subscription / MRR rail
- ✅📜 **Steps 1–3 built** — Stripe subscription lifecycle ingestion + `subscription_identity` (acquisition-locked customer→source) + `subscription_revenue` tables (PRs #81/#84/#85)
- ⚠️📜 **Step 4 (MRR-by-source + trial→paid rate) BLOCKED** — the no-card 30-day trial is a SourceTrack **plan flag only**, creates no Stripe subscription, so `trial_start`/`trial_converted` never fire. Infrastructure exists; the headline metric produces no data. **🚫 cannot claim (GTM §5).**

## 12. Integrations
- 🧪 **Stripe (attribution)** — manual webhook `/api/webhooks/stripe/:site_key` (checkout + refund); built but **no prod site connected** — buyer-attribution not live in prod
- ✅ **Stripe (own billing)** — `/api/billing/webhook` (subscription lifecycle, plan/limit updates, dunning) — separate from attribution
- ✅ **`getSiteByCustomerId` error handling** — now propagates Supabase errors as 500 (so Stripe retries) instead of silently treating a DB failure as an absent customer (200, no retry). Previously `{ data }` was destructured without `error`, so a PostgREST 5xx / connection loss / RLS denial was indistinguishable from "no such site" — a paid customer could stay `plan: 'inactive'` with Stripe never retrying. (#448, 2026-07-27)
- 🧪 **Shopify** — manual webhook (orders/paid + orders/create); **refund netting added #384** (`refunds/create` → negative `$conversion`, resolves the original order by `order_id`, mirrors the Stripe design) — but **NOT yet live** (no prod webhook, no real refund processed); not a native app
- 🧪 **Google Search Console (GSC SEO-revenue)** — built + truth-gated. **The automated pipeline was DEAD 2026-06-29 → 2026-07-20:** the daily sync failed on a missing then malformed `ENCRYPTION_KEY` on the `nightly-attribution` service; each failure set `gsc_connections.status='error'`, which the `.eq('status','connected')` eligibility filter (`gsc-daily-sync.js:152`) then **permanently disqualifies** — so subsequent nights returned `{eligible:0}` and the job wrote a hardcoded `success` (fixed in #332). `gsc_performance_daily` froze at 2026-07-16 (67 rows, 1 site). **Fixed 2026-07-20** (key aligned, connection reset, #332 derives the status). **Manual sync works** (2026-06-26, 2026-07-18); the **automated path is unverified since 2026-06-29** — 🧪 pending its first successful 02:00 UTC run after 2026-07-20. ⚠️ **Live design flaw:** a transient failure permanently disqualifies a connection with no retry/backoff/self-heal — #332 made it visible, it does not prevent recurrence. **✅ Full chain now VERIFIED WORKING (2026-07-20 19:58:35 UTC):** `gsc_sync_runs` manual success, `records_synced 39`, error null; `gsc_connections` = `https://www.techrupt.pk/`, connected, `last_synced_at` moved off 07-18; `gsc_performance_daily` 2026-06-20→2026-07-18, 39 rows (3 clicks, 42 impressions). `latest=2026-07-18` is **correct, not stale** — GSC lags 2–3 days by design. Chain proven: well-formed key → OAuth re-encrypt → decrypt → Google API → rows land. **STILL PENDING: first successful AUTOMATED (cron) sync.** ⚠️ **SECOND, DISTINCT ROOT CAUSE found 2026-07-21 — the automated path had a *different* blocker underneath the `ENCRYPTION_KEY` one:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` were **absent from the `nightly-attribution` service**, so the cron could not complete OAuth regardless of key health. **Two evidence grades, and they are NOT the same — do not read them as one:** ① **DIRECT (the diagnosis, queried):** `job_runs` 2026-07-21 02:04:03 `gsc-daily-sync` **FAILED** — `"1/1 connection(s) failed, 0 records synced"`; `gsc_connections.status='error'`, `last_error_message` `"Google OAuth credentials are not configured"`, `property_url` `https://www.techrupt.pk/` (correct, post-repair), `last_synced_at` 2026-07-20 19:58:35, `updated_at` 2026-07-21 02:04:03. **The cleanest evidence for the diagnosis is the asymmetry: the MANUAL sync SUCCEEDED at 19:58 through `SourceTrack-Api` while the CRON FAILED at 02:04 through `nightly-attribution` — same code, same token, same property, different container.** That isolates the fault to per-service env, not to the key, the token, or the code. ② **INDIRECT (the fix, inferred — NOT verified):** both environments redeployed on the **unchanged** commit `9a3f464` (prod `0f1080fa` SUCCESS 08:12:33Z, staging `59f03cdd` SUCCESS 08:16:00Z), replacing 00:25 deployments on the identical commit — a redeploy with no code change is the signature of a variable change, **but presence and correctness of the values are UNVERIFIED** (Railway MCP exposes no variable-read tool — orchestrator constraint #2, §11). **Proof point: the 02:00 UTC 2026-07-22 run** — `success` + records synced = proven; the same OAuth error = vars missing or misnamed on that service. 📋 **Follow-up recommended, NOT built — env-var parity audit across all services:** which vars each service *needs* versus *has*. This is the **second instance of the class** (KI-34 was `ENCRYPTION_KEY` on this same service); both were invisible until a job failed at runtime, and neither is caught by CI, code review, or any code-only audit. ⚠️ **Caveat:** techrupt.pk has only 3 clicks / 42 impressions in a month — the SEO-revenue allocation model has almost nothing to allocate; **GSC cannot be demonstrated as a moat on this site.** Proving the allocation math needs a property with real search volume.
- ⚠️🔒📜 **CAPI (server-side Conversions API)** — **CORRECTED 2026-08-04 @ `ee93b755`. The prior "Meta + Google only / TikTok deliberately stripped / MS+LinkedIn silently no-op" text was STALE.** `CAPI_PLATFORMS` (`api/routes/capi.js:61-67`) now holds **five** platforms: `meta`, `google` (via `ad_platform_connections`, OAuth), `ga4`, `tiktok`, `linkedin` — each with a real token column and id cols, so each is configurable. Token encryption at rest, `capi_deliveries` log, event-ID dedup, hashed PII, plan-gated (`requireFeature('capi_server_side')`), wired into conversion routes (PRs #57–60). 🔴 **ZERO DELIVERIES EVER — `capi_deliveries` is EMPTY in prod (founder-reported 2026-08-04, NOT code-verifiable: CC has no prod DB access; the only repo reference is the retention purge at `api/lib/retention-purge.js:44`).** So five configured platforms and no evidence any of them has forwarded a single conversion. 🚫 **Do not claim CAPI works, for any platform** — "code exists" and "has ever delivered" are different claims, and only the first is established. This is the specific finding behind GTM §5.1's "only once production-verified" condition. `⏸ delivery state not verifiable by CC`
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
- ✅ **Settings page 4-tab split** — General / Tracking / Attribution & Privacy / Advanced. All 13 sections placed. URL-based tabs via `setSearchParams`. `Integrations.jsx` deep link updated. (#453, 2026-07-27)
- ⛔ **Workspace/team member invites — NOT BUILT** (✅ verified @ `cb17cc2`, see §22). No invite/member endpoints, no route file, no Settings UI; `company_members` is read-only (role lookup only). Membership is *enforced* (`requireSiteMembership`) but members can only be provisioned out-of-band. The 139M "present in Settings" claim was a **spec-leak**; design.md's "Team = V2" stands.
- ✅ GDPR: DB hard-delete + per-visitor erase (Tinybird); retention purge (now covers `custom_events`, PR #88)
- ✅ **Server-side GDPR endpoints are BUILT and mounted** (corrected 2026-07-31 @ `44dd620` — the prior "Phase 7, NOT STARTED" line was **stale**, and had been since 2026-07-19). `app.use('/api/gdpr', requireUserAuth, gdprRouter)` (`api/index.js:568`) over `DELETE /visitor` (`gdpr.js:167`, Art. 17 erasure), `GET /subject` (`:315`, Art. 15 access), `DELETE /account` (`:430`, workspace purge), plus `PUT /retention` (`:582`) and `GET /export` (`:730`). Confirmed live by 2026-07-19 per `POSTHOG_MIGRATION_HANDOFF.md` **D5**, which gated the GDPR claim on the PostHog decommission and records it as ✅ DONE; the erasure path has since survived a real bug-fix cycle of its own (#371 — an erasure that matched **zero rows** while answering *"has been erased"*, because it matched `anonymous_id` on tables whose column actually holds a `distinct_id`; counts now drive the response, see CLAUDE.md §6.5). *(Note the endpoints are **not** all erasure: `/subject` is Art. 15 **access**. Art. 15 must disclose exactly what Art. 17 removes — if the two lists diverge, one of them is lying.)*
- 🔴 **NO SUPPRESSION LIST EXISTS — erasure is POINT-IN-TIME ONLY** (corrected 2026-07-31 @ `44dd620`; the prior "privacy suppression list" claim on the bullet above was **FALSE** and is removed). Exhaustively disproved, four independent ways: (1) **`erasure_log` is write-only** — it appears only in its migration, ONE `.insert()` at `gdpr.js:146`, its tests, and a comment in `tinybird/adapter/erase.js`; it is **never `SELECT`ed by any code in the repo**. (2) **No ingest route consults anything erasure-related** — `track.js`, `conversion.js`, `pixel.js`, `server-events.js`, `stripe-webhook.js`, `shopify-webhook.js`, `conversion-offline.js`, `webhook-incoming.js` read only `sites` (plus `api_keys` for `server-events.js`) before accepting, and none imports a suppression module. (3) **No Postgres trigger** implements it (checked per CLAUDE.md §10 class 2) and **no table** in the migration inventory is a suppression/opt-out list. (4) **No Tinybird pipe** filters erased subjects at read time. ⚠️ **Two look-alikes that are NOT this:** `api/lib/privacy-suppression.js` despite its name only *counts* GPC/DNT signals into a Tinybird `privacy_signals` datasource and gates nothing; and the tracker's "erasure" is client-side `localStorage` clearing on `consent(false)` (the bullet below). **Consequence:** nothing prevents post-erasure reintroduction — a repeat `identify()` with the same email repopulates `volunteered_identity` with the same PII, and a delayed refund webhook re-attaches to the erased subject (`resolveOriginalDistinctId` / `resolveOriginalDistinctIdByOrderId` look the original subject up by design). The nightly retention purge is **age-based per site**, not subject-based, so it does not re-apply an erasure. *(Scoping note for whoever fixes this: under the cookieless rotating-identifier model a returning visitor gets a NEW `distinct_id`, so "browses again" is largely new pseudonymous processing, not reintroduction — the real exposure is the **keyed/identified** re-arrival paths named above.)*
- ✅ **Consent-withdrawal client-side erasure ENFORCED** (`consent(false)`): prefix-sweep of `st_*` localStorage/sessionStorage/cookies (preserve `st_consent`), in-memory `AID`/`SID` nulled, re-consent mints fresh (KI-33). **Client-side only** — this is the browser-storage sweep, NOT the server-side erasure two bullets above, and neither is "full compliance" on its own.
- ⚠️📜 Account/full-erasure historically left raw events in PostHog (P1-4) — changing with Tinybird migration; re-verify
- ⚠️ **`data_retention_days = NULL` = keep-forever by design** (paid sites) — naive null→default would silently delete promised data
- ⛔ "GDPR compliant" badge — gated behind full EU migration + DPA + lawyer review (not claimable)

## 16. Developer / API
- ✅ Identify API; developer docs portal (API, Tracker, Conversions, Offline, Webhooks, Campaign-Costs, Security, Identify)
- ✅📜 **Server-side event ingestion** — `POST /api/server/event` + `api_keys` table (SHA-256 Bearer)
- ✅⚠️ **API-key management is BUILT end-to-end** (the prior "NO API-key UI / manual DB injection" line here was **materially false** — a line-3 freshness-guard failure, corrected 2026-07-20). Full create/list/revoke REST surface (`GET`/`POST`/`DELETE /api/integrations/api-keys`, `integrations.js`) + `Settings.jsx` "Server API Tokens" UI; hashed storage (`api_keys.key_hash` sha256), **reveal-once by construction**, plan-gated `api_access`, hidden in support-preview; consumed by `POST /api/server/event` (`server-events.js`). ⚠️ **But NEVER EXERCISED IN PROD** — `api_keys` = **0 rows, 0 ever used** (Supabase-verified 2026-07-20). ⚠️ **The real self-serve blocker is PACKAGING, not engineering:** `api_access` is gated to **Growth+**, so free/starter customers cannot obtain a key at all — a plan-tier decision. Related security gaps: `KNOWN_ISSUES` **KI-42** (plaintext `sites.api_key` + dead middleware), **KI-43** (no scopes / revoke-destroys-audit / no gen rate-limit).

## 17. Ops / internal (not customer-facing)
- ✅ **Admin / Ops console** — `/api/admin` route (auth-guarded) + `Admin.jsx` page
- ✅ **Event Debugger** — real-time event inspector (`/debugger`) — polished, QA-verified
- ✅ **Data Quality** page (`/data-quality`) + `data-quality-check.js` job
- **Jobs — per-job status (verified from prod Railway config + `job_runs`, 2026-07-20; NOT a blanket ✅):**

  | Job | Status |
  |---|---|
  | `nightly-attribution` | ✅ runs `0 2 * * *`, config correct — but `conversions_processed: 0` on 18–20 Jul: the Tinybird read path is proven, the money-rail **write** path is unexercised. |
  | `health-agent` | ⚠️ runs `*/30 * * * *`, checks correct — but delivery is broken (see next bullet). |
  | `data-quality-check` | ✅ runs `0 0 * * *`. |
  | `email-reports` | ❌ **has never sent an email** — job is in `buildCommand` (runs at build time; ~255 "success" `job_runs` rows), `startCommand` absent → the Monday cron boots `bootstrap.js` and crashes. `KNOWN_ISSUES` 21. |
  | `usage-threshold-emails` | ❌ **scheduled nowhere** (not staging, not prod). The `0 14 * * *` schedule that once appeared in the runbook/README does not exist. |
  | `anomaly-watcher` | ❌ **NOT scheduled in production** — staging only (`0 3 * * *`); its former GitHub-Actions cron (#70) is gone (`.github/workflows/` has only `ci.yml`). Never run in prod. |
  | `gsc-daily-sync` | runs **inside** `nightly-attribution` (not its own service) — see the GSC row in §1/§20. |
- ⚠️ **health-agent: detection correct, delivery absent.** Scheduling is **confirmed** (Railway `f15924b7`, `*/30 * * * *`, `node api/jobs/health-agent.js`) — not "unconfirmed". It does **NOT** monitor PostHog: that check was **RETIRED in D2**, `data_flow` reads Tinybird, and `CRITICAL_CHECKS = {supabase, nightly_job, conversions, tinybird_quarantine}` (`health-agent.js:18`). The gap splits in two. **Env — FIXED 2026-07-20:** `SLACK_WEBHOOK_URL` held a literal placeholder (so `notify()`'s `:283` guard, `if (!SLACK || dx.severity === 'ok') return`, passed on a truthy-but-dead value and every alert POSTed into the void); it now points at a real webhook on all three readers, curl-verified HTTP 200. **Code — NOT fixed (the durable defect):** the `fetch` at `:289` still has **no `.ok` check and no `try/catch`**, and `notify()` is still **unwrapped** at `:320` — so a revoked URL, a Slack outage, or a transient network *throw* is swallowed silently again (the throw rejects `run()`, the top-level `.catch` at `:328` logs a generic crash, and `process.exit(snap.overall === 'critical' ? 1 : 0)` at `:322` never runs — masking the verdict). Alerts land today only because the URL is currently valid. health-agent additionally writes **no `job_runs` row** (its own runs are unobservable). `KNOWN_ISSUES` 29.
- ✅ **Quarantine alarm** (`quarantine-alarm.js`, silent-revenue-loss monitor) — built + tested + **wired into health-agent (#97)**: imported at `health-agent.js:5`, `tinybird_quarantine` is in `CRITICAL_CHECKS` (`:18`). ⚠️ Caveat: its alert rides the same fragile channel — deliverable today (real webhook, HTTP 200, since 2026-07-20) but silently droppable if the URL is revoked or Slack errors, because the `fetch` at `:289` is unchecked and `notify()` is unwrapped at `:320` (see the health-agent row above).
- ⚠️ **Email reports (weekly digest)** — a plan entitlement (`plan-features.js:37` `email_reports`, trial+), but the delivery job (`email-reports`) **has never functioned** (above) and **nothing customer-facing promises it** (zero `email.report`/`weekly report` surface in `dashboard/src`). Dormant entitlement + broken job — **not** a sales claim.
- ⚠️ **Usage-cap threshold emails (50/80/100%)** — the notification **job (`usage-threshold-emails`) is scheduled nowhere** and has never run. Distinct from the **live** in-dashboard usage meter (`Billing.jsx`, reads `/billing/usage` → `site_usage_monthly`, which works). Nothing customer-facing promises the *emails* — **not** a sales claim.
- ✅ Data export (`/api/export`), job-status (`/api/jobs`), hygiene checks (`/api/hygiene`), backfill tool
- ⚠️ No exception monitoring (Sentry-class) — biggest ops blind spot (P1-1); no public status page

## 18. Docs & marketing site
- ✅ Docs: platform recipes (GTM, Google Ads, Shopify, Stripe, Webflow, WordPress, Framer, Install, Quickstart, Troubleshooting) + dev API docs + **live search + TOC + breadcrumbs + brand logos** (shipped this session)
- ⚠️ **No form-attribution / auto-fill / cross-domain / booking-passthrough docs** — built moats, undocumented (discovery gap)
- ✅ **The public marketing site is a separate Astro app (`marketing/`)**, deployed to its own Railway service and serving **`www.sourcetrack.ai` + `sourcetrack.ai`** (both verified 200 serving `/_astro/` assets, 2026-07-29). `app.sourcetrack.ai` still serves the dashboard SPA and is unaffected. De-templated across #479–#488: PowerAI branding, fabricated testimonials, the template's purple palette and every stock/AI image of a person are gone.
- ✅ Marketing pages **inside the dashboard SPA** (`dashboard/src/pages/`): Landing, Product, Attribution, AI-Referral-Tracking, Compare-GA4, Pricing, interactive no-login Demo, **Solution pages** (SaaS/Ecommerce/LeadGen/Agency/Shopify) — these are the `app.` routes, *not* what www/apex serves. Two marketing surfaces now exist; check which one a change belongs to before editing.
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

> **✅ Every row below re-verified at `c9a4113` (2026-07-25).** Rows marked **`⏸ not re-verified`** could not be settled from the repo — the reason is stated per row, and they are NOT to be read as confirmed. **5 rows were wrong** (1 partly, 2, 3, 8, 10) and are corrected in place with the evidence.

| # | Feature | State | Gap |
|---|---------|-------|-----|
| 1 | MRR-by-source + trial→paid | ⚠️ **ROW WAS CONFLATING TWO DIFFERENT TRIALS** — split below | **(a) SourceTrack's OWN trial→paid: STILL BLOCKED**, and #416 did not touch it. Its trial is a pure DB state (`sites.plan='trial'` + `trial_ends_at`, enforced in `auth.js:38-40,149-150`); no Stripe subscription exists at trial start, so `customer.subscription.created` never fires for it. `billing.js:473` passes `trial_period_days` only when a trial-plan site *starts a checkout*. MRR-by-source + trial→paid remain **not built** (CLAUDE.md §7 concurs). **(b) The `trial_start` conversion TYPE in the customers'-buyers' rail: WORKS** — `stripe-subscription.js:68` emits it on `subscription.created` when `status==='trialing'`, and #416 added it to the classifier (`conversion-classifier.js:30`) plus the alias set. The old row's "`trial_start` never fires" is true only of (a); as written it wrongly implied the ingestion type was broken too |
| 2 | Server-side event API keys | ❌ **ROW WAS WRONG — the UI EXISTS.** Re-tag ✅ built | **NO GAP.** Full generate/list/revoke UI in `Settings.jsx`: state `:65-67`, list fetch `:81`, create `:104`, revoke `:126`, "Generate Token" button `:1461-1464`. Backed by `integrations.js` `GET /api-keys :1061` · `POST :1085` · `DELETE /api-keys/:id :1149`. Scopes validated via `api-key-scopes.js`. The "no UI (self-serve P1)" claim is stale — independently corroborated by a live browser click-through (create → list → revoke) this session |
| 3 | Attribution-window config | ❌ **ROW WAS WRONG — migration IS applied.** Re-tag ✅ live | **NO GAP.** Verified read-only on **prod** (`zxjjjsipafojhzkkumvh`): `information_schema.columns` confirms `sites.attribution_window_days` exists. Migration `20260519000005_custom_properties_annotations_attribution_window.sql`. It is read in `auth.js:58` and written by `PATCH /api/integrations/settings`. "Blocked on unrun DB migration" is stale by some margin |
| 4 | GSC SEO-revenue | Built + truth-gated | **Automated pipeline was dead 2026-06-29→07-20** (`ENCRYPTION_KEY`, then auto-disable via `.eq('connected')`); fixed #332 but 🧪 pending first automated sync. Manual path works. Auto-disable is a live design flaw (no retry). `⏸ not re-verified @ c9a4113` — "first automated sync happened" needs a `gsc_sync_runs` prod read + a real connected property; not settleable from code. |
| 5 | Business-type dashboard variants | Design-confirmed | Build-state unverified (design says don't claim). `⏸ not re-verified @ c9a4113` — still open, still explicitly out of scope (also listed in Verification debt #2) |
| 6 | Onboarding fresh-signup | Resume works | Fresh signup E2E untested; 500-not-400 on reject (patch fixes). `⏸ not re-verified @ c9a4113` — needs a browser E2E on a real signup, which CC cannot run. **Related open item:** the account-vs-site onboarding gate (`resolveDashboardSite`, logged 2026-07-23) — note its described symptom does not obviously follow from current code, since both `selectedKey`/`selectedId` branches are guarded by `onboarding_completed` and fall through to any completed site; confirm it reproduces before scheduling a refactor |
| 7 | health-agent + quarantine alarm | ✅ built + wired (#97), scheduled `*/30` in prod, on Tinybird | **Delivery:** env fixed 2026-07-20 (real webhook on all three readers, HTTP 200); **code defect remains** — the `fetch` at `:289` has no `.ok`/`try/catch` and `notify()` is unwrapped at `:320`, so a revoked URL/outage/transient throw fails silently again (throw masks the exit verdict, `:322`/`:328`). Works today only while the URL is valid. Writes no `job_runs` row (`KNOWN_ISSUES` 29). ✅ **Code defect RE-CONFIRMED @ `c9a4113`:** `fetch(SLACK, {` at `health-agent.js:289` still has no `.ok` check and no `try/catch`, and `notify(dx, snap)` at `:320` is still unwrapped. Cron/delivery state is `⏸ not verifiable by CC` (no Railway access). |
| 8 | Stripe/Shopify buyer-attribution | Webhooks built; refund netting added (Stripe #381, Shopify #384) | ⚠️ **"#383 authored but undeployed" is NO LONGER a safe claim — but is NOT repo-verifiable either way.** Repo side at `c9a4113`: refund exclusion is present across the pipes and pinned by `api/tests/pipe-refund-guard.test.js`. **Tinybird DEPLOY state cannot be verified from this repo or from CC** (no prod Tinybird access; the Tinybird MCP is ST_Staging-bound — §13). Founder reports **prod deployment #23 landed 2026-07-25**, which if correct retires this gap; recorded as founder-reported, not code-verified. `⏸ deploy-state not verifiable by CC` · Remaining real gaps: no prod site connected → not live; no real refund processed |
| 9 | Report Builder conv_type filter | Built | Ignored on ~6 templates → inflated data. `⏸ not re-verified @ c9a4113` — the "~6 templates" figure needs a per-template read that was out of this pass's bounded scope |
| 10 | Conversion/sites/seats caps | ⚠️ **ROW WAS WRONG — only SEATS is unenforced.** "only pageviews metered" is false | **CONVERSIONS: ENFORCED** on 8 ingestion paths via `claimConversionUsage` (`api/lib/conversion-limits.js`) — `conversion.js:378` · `conversion-offline.js:214` · `track.js:440` · `proxy.js:145` · `stripe-webhook.js:88` + `:582` · `shopify-webhook.js:242` · `webhook-incoming.js:146`. Refunds deliberately exempt (`stripe-webhook.js:295`, `shopify-webhook.js:303`) so a refund cannot consume quota. **SITES: ENFORCED** — `checkSiteCreationLimit` (`site-limits.js`) at `onboarding.js:247`. **PAGEVIEWS: ENFORCED** — `pageview-limits.js`. 🔴 **NEW GAP FOUND — one ingestion path has NO conversion gate: `POST /api/server/event` (`api/routes/server-events.js`)** accepts `conversion_value`/`conversion_type` (`:118-119`) with no `claimConversionUsage` call. It is `requireFeature(…,'api_access')`-gated (growth/scale only), so conversions ingested through the server API bypass the monthly cap. **SEATS: genuinely NOT enforced** — `team_members` appears ONLY in the `plan-features.js` limits table (`:64-70`) with zero consumers; per §22 there is also no in-product invite mechanism, so today it is unreachable rather than exploitable |
| 11 | Ad-platform cost sync (Google + Meta) | 🧪 Built + wired (endpoints + callers survived PR #23; positioned V2) | **END-TO-END UNPROVEN** — no real ad account has run it. Truth-gate: don't market as working (§8). `⏸ not re-verified @ c9a4113` — "no real ad account has run it" needs a prod data read, not a code read. |
| 12 | Funnels | ⚠️ Endpoint live + gated entitlement, but **NOT customer-facing** | **NO UI** (`FunnelChart.jsx` DELETED #317) + reads empty `pageviews` (0 rows prod) + label/Pricing don't surface it → dormant code, not a claim (§1/§3). ✅ **Re-confirmed @ `c9a4113`:** `dashboard/src/components/FunnelChart.jsx` is still absent. `⏸` the "empty `pageviews`, 0 rows prod" half is a prod-data claim, not re-read here (and §5 says that table is empty BY DESIGN). |
| 13 | Report-Builder **gated depth** (🚧 @ `cb17cc2`) | Denies honestly (422 + calm state, no zeros) | Needs pipes: `ltv_revenue` (novel shape) · `ai_*_share`/`ai_conversions`/`ai_revenue` (clone the dim-swap template) · `keyword`/`referrer_domain`/`custom_param` · non-default windows (non-Class-A) · journey-explain narrative (clone the conversion sibling). `⏸ not re-verified @ c9a4113` — the per-shape pipe backlog was not re-walked in this bounded pass. |
| 14 | `sessions` + `conversion_rate` (🚧 @ `cb17cc2`) | Gated ENTIRELY — dead on every dim; never routed to the session pipes | Unique-Visitors-by-dim is unavailable until a pipe lands (§3); the `univ_cvr` **template** no longer ships — removed from `PRESET_TEMPLATES` in #374, so no shipped template is dead-on-click. ✅ **Gate re-confirmed @ `c9a4113`** (`report-config-validation.js:331` denies on `GATED_METRICS`). **DOWNGRADED urgent→backlog this session:** the only live exposure was `api/routes/campaigns.js`, closed by **#409**; `attribution.js`/`export.js` both call `gatedReportReason()` before `getFlexibleReport()`, and the internal `multiTouchAttributionHelper` hardcodes `metric:'revenue'`. |
| 15 | Campaigns page | ⚠️ 1 of 4 tabs (UTC) / 0 of 4 (non-UTC) | The 3 campaign pipes **are deployed and do serve** (the old "INERT/undeployed" note was wrong). `campaign` works on UTC; `source`/`medium`/`ai_source` 422 for every site (**KI-53**), and non-UTC loses `campaign` too (**KI-51**). Honest "temporarily unavailable" render, not fake zeros (§8). ✅ **Partly closed since:** **#409** added a route-scoped model allowlist to `campaigns.js` (`:11-30`), closing the fabrication path where the API accepted `model=linear\|ai_platforms\|…` and returned conversion counts mislabelled as sessions. **#415** synced 3 pipes to the canonical channel classifier (KI-13). `⏸` KI-53 (`source`/`medium`/`ai_source` 422) and KI-51 (non-UTC loses `campaign`) not re-verified — both need a per-site prod query. |
| 16 | Report-Builder picker trim + saved-report migration | Backlogged | Pickers still offer gated shapes; saved reports with gated configs replay into the 422 state (§9). ✅ **Partly addressed since:** **#404** removed 4 seeded reports whose metric sits in `GATED_METRICS`, **#405** the 5th (date-dim / `PREAGG_DIMS` gap) — so fresh signups no longer receive canned reports that replay into 422. `⏸` the picker trim itself is still backlogged. |

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

## 22. ✅ MOUNT-VERIFY — RESOLVED @ `93da62d`
> ❗ **CORRECTION (@ `cb17cc2`) — the previous count was INCOMPLETE.** It said "31 `/api/*` mounts" because the grep was **`app.use(`-only**. Express also mounts handlers **directly** via `app.<verb>(...)`, and that grep missed **18** of them — including the entire **`/api/attribution*`** surface (the Report Builder's own backend!), plus the whole ingestion rail (`/api/track`, `/api/collect`, `/api/conversion`, `/api/identify`, …). **Any future mount audit MUST grep `app.use(` AND `app.get|post|put|delete|all(`.**
>
> ❗❗ **SECOND CORRECTION (@ `fc00e406`) — the `cb17cc2` count was ALSO incomplete.** It said 45 `/api/*` / 52 overall because that grep was **anchored at line start** (`^app\.`) and `api/index.js:525` indents its handler by two spaces: **`  app.get('/api/diag/ip', …)`** was missed. `api/index.js` is **byte-identical** `cb17cc2` → `fc00e406` (`git diff --stat cb17cc2..fc00e406 -- api/index.js` is empty), so this is a **counting fix, not drift**. **The rule is now: grep `app.use(` AND `app.<verb>(`, AND allow leading whitespace** (`^[[:space:]]*app\.`). Two audits in a row missed mounts to a too-narrow grep.
>
> **COUNT UPDATE @ `93da62d`: 47 `/api/*` mounts** = **32** router mounts (`app.use`) **+ 15** direct handlers (`app.<verb>`), plus **6** non-`/api` mounts (`/tracker` guard + static, `/tracker.min.js`, `/tracker.cookieless.min.js`, `/sp` proxy, `/health`, `/track`). Totals: 35 `app.use` + 18 `app.<verb>` = **53** mounts overall. (`app.use('/api/tracker/id'...)` at `api/index.js:521` included in router mounts).
>
> ✅ **RE-RUN @ `93da62d` (2026-07-26) — MEASURED COUNT: 47 `/api/*`, 53 overall.** Pass using documented grep:
> ```
> grep -nE "^[[:space:]]*app\.(use|get|post|put|patch|delete|all)\(" api/index.js   → 66 lines
> ```
> Of those 66, **13 are pathless middleware** (`app.use(cors())`, `app.use(express.json())`, …) and are not mounts. The 53 path-bearing lines break down as: **47 `/api/*`** (32 `app.use` + 15 direct `app.<verb>`) **+ 6 non-`/api`** = **53**; `app.use` with a path = 35, `app.<verb>` = 18.

**The 15 DIRECT `/api/*` handlers** (`grep -nE "^[[:space:]]*app\.(get|post|put|patch|delete|all)\([[:space:]]*['\"]" api/index.js`):
`POST /api/billing/webhook` · `POST /api/track` · `GET /api/pixel` · `POST /api/collect` · `POST /api/identify` · `POST /api/conversion` · `POST /api/conversion/offline` · **`GET /api/attribution`** · **`GET /api/attribution/explain`** · **`GET /api/attribution/verdicts`** · `GET /api/journey/:visitorId` · `GET /api/sessions/overview` · `GET /api/sessions` · **`GET /api/diag/ip`** (`index.js:529`) · `GET /api/health`
*(non-`/api` direct: `GET /tracker.min.js` · `GET /tracker.cookieless.min.js` · `GET /health` · `POST /track`)*

**The 32 `app.use` router mounts:**

`/api/webhooks/stripe` · `/api/webhooks/shopify` · `/api/install` · `/api/events` · `/api/alerts` · `/api/site-alerts` · `/api/hygiene` · `/api/export` · `/api/onboarding` · `/api/sites` · `/api/dashboard` · `/api/leads` · `/api/campaigns` · `/api/saved-reports` · `/api/reports` · `/api/integrations/google-search-console` · `/api/integrations/ad-platforms` · `/api/integrations/capi` · `/api/integrations` · `/api/seo-revenue` · `/api/campaign-costs` · `/api/server` · `/api/billing` · `/api/admin` · `/api/jobs` · `/api/live` · `/api/analytics` · `/sp` · `/api/webhooks/incoming` · `/api/webhooks` · `/api/tracker/id` · `/api/gdpr` · `/tracker`.

---

## 27. DELTA LIST — PRs #425–#430 (`c9a4113` → `93da62d`) + PRs #528–#535 (`93da62d` → `44dd620`)

> ⚠️ **Scoped, not exhaustive.** Rows 1–6 are the 2026-07-26 pass; rows 7–11 are the 2026-07-31 pass. The `93da62d` → `44dd620` span is ~100 PRs (#431–#536) and **only the five in rows 7–11 were inventoried** — see the RANGE CAVEAT in the header. Absence from this table means *not looked at*, never *nothing changed*.

### Rows 1–6 — 2026-07-26 pass (`c9a4113` → `93da62d`; PRs #425–#430)

| # | PR | Component / File | Change Details & Impacts | Kind |
|---|---|---|---|---|
| 1 | #425 | `api/jobs/email-reports.js` | `import.meta.url` entrypoint guard added (`:267`); `writeJobRun` summary logged to `error_message` (`:256`). | job hygiene |
| 2 | #426 | `api/routes/dashboard.js` | Unresolved refunds (`refund_attribution: 'unresolved'`) bucketed separately to `Unattributed refunds` line (`:208`, `:235`), NEVER credited to `Direct` or gross revenue counts (`:211`). | attribution accuracy |
| 3 | #427 | `api/routes/install.js` · `platform-detector.js` · `Onboarding.jsx` | Onboarding Step 6 merged tabbed card + Setup Concierge platform detector (`platform-detector.js:31`); script detection returns 2 states (`Script detected` / `Not confirmed yet`). | onboarding UX |
| 4 | #428 | `api/lib/plan-features.js` | Raised default pageview limits in `PLAN_DEFAULT_PV_LIMIT` (`free: 10_000`, `starter: 250_000`, `growth: 1_000_000`, `scale: 5_000_000`) (`:19-23`); feature parity aligned across starter/growth/scale (`starter.revenue_attribution: true`). | pricing & tier limits |
| 5 | #429 | `api/lib/pageview-limits.js` | Quota model split into soft limit & hard cap (`HARD_CAP_MULTIPLIER_FREE: 3`, `HARD_CAP_MULTIPLIER_PAID: 10`) (`:22-23`). Events collect past soft limit and drop ONLY at hard cap (`state === 'hard_cap'`) (`:58`). Threshold email copy updated (`usage-threshold-emails.js:31-35`). Ingestion call sites updated (`track.js:331`, `server-events.js:145`, `proxy.js:74` & `:206`, `analytics.js:254`). | quota architecture |
| 6 | #430 | `api/lib/conversion-limits.js` | Conversions NEVER dropped on quota (`allowed: true` for all active plans; `allowed: false` ONLY for `limit === 0` inactive/archived) (`:48-85`). `ANOMALY_MULTIPLIER: 100` (`:28`) triggers alarm log without discarding revenue. Ingestion call sites updated (`track.js:440`, `server-events.js:99`, `stripe-webhook.js:88`, `shopify-webhook.js:242`, `conversion.js:378`, `conversion-offline.js:214`, `proxy.js:145`, `webhook-incoming.js:146`). | revenue truth & zero data loss |

### Rows 7–11 — 2026-07-31 pass (`93da62d` → `44dd620`; PRs #528–#535, the currency-labelling rail)

> All five are one rail delivered in dependency order: **formatter capability → schema + carriage → truth-fix on the label → ingestion rails → close the last two defaults.** Framed as currency-**accurate labelling**, NOT multi-currency: no FX, no cross-currency rollup, deliberately (see §10).

| # | PR | Component / File | Change Details & Impacts | Kind |
|---|---|---|---|---|
| 7 | #528 | `dashboard/src/utils/numbers.js` · `components/MetricTile.jsx` | `formatCurrency` / `formatCurrencyDecimal` / `fmtMoney` all hardcoded a literal `'$'`, and `MetricTile` hardcoded `currency: 'USD'` in its `Intl` call — one live prod site bills in **EUR** and rendered a dollar sign. Each formatter takes an optional currency **appended last**, so every positional call site keeps its meaning. **USD keeps the pre-existing string-concat path VERBATIM** (Intl groups thousands and moves the minus sign, so routing USD through it would have changed every money string in the dashboard); non-USD goes through `Intl.NumberFormat`. Branches on the **code**, not on "was an argument supplied". `normalizeCurrency` shared with `MetricTile` so the malformed-code guard cannot fork (a malformed code throws `RangeError` inside render = white screen). **Capability only — zero visible change on merge.** | formatter capability |
| 8 | #529 | `supabase/migrations/20260731000000_add_currency_to_attributed_conversions.sql` · `api/jobs/nightly-attribution.js` · `api/routes/dashboard.js` · `leads-server.js` · `campaigns.js` · `api/lib/currency.js` | `attributed_conversions` was the **only money table with a value and no unit**, so every customer-facing revenue figure derived from it rendered a hardcoded `'$'`. Currency was captured correctly at ingestion and typed on the Tinybird datasource — it was dropped only at attribution materialization. Column is **nullable with NO default, deliberately** (NULL = "unit unknown"; `subscription_revenue.currency`'s `NOT NULL DEFAULT 'USD'` is the fake-unit pattern being removed, not a precedent). Backfill key chosen **by measurement**: on prod `order_id` matched 2 of 5 rows while `external_event_id` / `payment_id` matched 0; ambiguous orders left NULL rather than guessed. Read side carries a **status alongside the code** on all three readers so callers can tell `ok` from `mixed` from `unknown`. `currency`/`currency_status` excluded from derived metric sets (a unit is not a quantity — otherwise `metric='currency'` would sort by `b.currency - a.currency`). **DDL is live on prod** — evidenced by #532 reading real per-row values off the column. | schema + end-to-end carriage |
| 9 | #532 | `api/lib/currency.js` · `attribution-engine.js` · `routes/dashboard.js` · `leads-server.js` | 🔴 **Truth bug in the label itself.** `collapseCurrencies()` dropped null units **before** checking agreement, so `[USD, USD, null]` reported `currency_status: 'ok'` with `currency: 'USD'` — a confident label over a sum containing an amount nobody can denominate. **Confirmed on prod, not hypothetical:** `www.techrupt.pk` has 3 revenue-bearing rows, 2 USD and one 777.77 carrying no unit. New status **`'partial'`** (one known currency, ≥1 amount with no usable unit), kept distinct from `'unknown'` because the two need different fixes — `unknown` = an integration never sends currency, `partial` = ONE ingestion path drops it while others carry it. `mixed` outranks `partial`; both suppress rendering. **Invariant now asserted as a property:** `currency` is non-null ONLY for `'ok'`. Two call sites were dropping nulls before the helper could see them, so fixing the helper alone would have changed nothing. Verified **non-vacuous** (restoring the old line fails the prod-case test). **Operational effect: prod's only revenue-bearing site now correctly reports `partial` and stops printing a symbol.** | revenue-label truth |
| 10 | #534 | `tracker/tracker.js` · `tracker.cookieless.js` (+ both `.min.js`) · `api/routes/conversion.js` · `server-events.js` | The browser rail had **no currency concept anywhere along its length** — not a handler dropping a value, but a field never offered: `sourcetrack.conversion()` had no such parameter and the string `currency` did not appear in `conversion.js`, `track.js` or `server-events.js` at all, so a browser-side purchase was recorded as an amount with no unit. Adds an **optional** `currency` on the browser + server-SDK conversion rails. | ingestion rails |
| 11 | #535 | `api/lib/shopify-refund.js` · `stripe-refund.js` | #529/#532 removed the `?? 'USD'` default from every money rail **except the two refund builders** (Shopify's was flagged in #529's own body and never fixed; Stripe's was flagged nowhere). **A fake unit is worse on a refund:** a refund is a signed **negative** conversion, so a manufactured `'USD'` silently agrees with the USD purchases it nets against and an undenominated amount disappears into a confident total instead of suppressing it. Both now go through the shared `normalizeCurrencyCode()` → well-formed ISO code or `null`; `null` verified representable end to end (`events.currency` is `LowCardinality(Nullable(String))`, not in `REQUIRED_COLUMNS`, reaches `revenue_ingestion_events.currency` as NULL). **Stripe is consistency, NOT a live gap** — Stripe types `currency` as required and non-nullable on the Refund object, so that default effectively never fired; Shopify's looser contract let `'US'` ride through as a bogus unit, now `null`. Verified non-vacuous (restoring both defaults fails 4 tests). | money-rail consistency |

- **#414** — doc-only (`KNOWN_ISSUES.md` #14). No map impact.
- **#530 · #531 · #533** — marketing-site scroll-reveal fail-open fixes (`marketing/` + two CI gates). **`marketing/` only; no app surface, no §10–§22 impact.** Not otherwise inventoried in this pass.
- **#536** — doc-only (`CLAUDE.md` §13 MCP-constraint corrections). No map impact.
- **#415** (channel classifier synced across 3 pipes / KI-13) — noted on **§20 row 15**. Relevant to §11's shared-classifier rule: `ORGANIC_SEARCH_*` stays the single source of truth across pipe SQL and `channelFromEvent`.
- **#416** (conversion taxonomy: 5 Stripe lifecycle types + `add_to_cart`; trial-start `$0` regression fix) — noted on **§20 row 1**. **Two NEW deferred items recorded here so they are not lost:**
  1. 🔻 **The `obj.subscription` gap** — carried as a known deferral out of #416. **What the code does @ `c9a4113`:** on `invoice.paid`, `stripe-subscription.js:29` takes the subscription id from the **flat** `obj.subscription` field (`out.subscriptionId = obj.subscription || null`); that id is what scopes the subscription-lifecycle idempotency keys. `⏸` **the precise failure mode is NOT stated here on purpose** — I could not confirm from the repo alone which condition makes `obj.subscription` absent or wrong (a Stripe API-version field relocation is the obvious candidate, but asserting that unverified is exactly the habit that made this doc untrustworthy). Read the #416 PR body before acting.
  2. ❓ **PRODUCT QUESTION (open, deliberately undecided in code):** a genuinely $0-priced plan has `subtotal === 0` and is therefore skipped by the trial-start discriminator, exactly like a trial-start invoice — so **a free-plan signup does not count as a "customer"** (`stripe-subscription.js:56-60`). Today's answer matches what `customers` means everywhere else, but it is a **founder call**, not a bug. Documented at the source.

---

## 28. STATE RECONCILIATION — 2026-08-06

Four buckets that the ✅/🚧/🧪 tags do not separate on their own. The distinction that matters to a
reader is **not** "is there code?" — it is **"has this ever produced a result for a real customer?"**
A feature can be fully built, fully wired, plan-gated correctly, and have fired **zero** times.

Provenance: code claims below are grepped against `origin/main @ 2e65b821` this session. Rows
marked *(prod)* rest on read-only prod inspection by the orchestrator, 2026-08-06 — CC has no prod
DB access and did not re-query them.

### 28.1 ⛔ DOES NOT EXIST — no code, no route, no table

Listed because each has been referred to as though it were built or nearly built. None is.

| Feature | Note |
|---|---|
| CRM sync | No integration, no route, no scheduled job |
| Warehouse streaming | No export path, no destination config |
| `lead_status` / `lead_score` | Columns do not exist; lead qualification does not score |
| White-label reports | No branding-override surface anywhere |
| Trial → paid funnel | Named in CLAUDE.md §7 as explicitly **not built** — do not assume it exists |
| Slack **delivery** | ⚠️ Distinguish: `health-agent` posts to a Slack webhook (§17). There is **no customer-facing Slack delivery** for reports or alerts |
| Install telemetry | Nothing reports whether a customer's snippet is live except the on-demand setup doctor |

### 28.2 🧪 BUILT, NEVER FIRED — code exists and is wired; zero real executions

**The most dangerous bucket**: it greps as ✅ and demos as working.

| Feature | Evidence |
|---|---|
| CAPI — **all four** platforms | Delivery code, config, event-id and dedup tests all present. No platform has delivered a real customer event *(prod)* |
| Ad-platform cost import | Corroborates §20 row 11's existing 🧪 — "no real ad account has run it" *(prod)* |
| Identity stitching | **3 tables, 0 rows** *(prod)*. The code path is exercised only by tests |
| Over-reporting detection | Built; never triggered on real data *(prod)* |
| Server-side event **API keys** | **0 rows** *(prod)*. ⚠️ Note this does **not** contradict §20 row 2 — that row corrected a stale *"no UI"* claim and is right: the UI exists and works. Both are true: fully built, never used |

### 28.3 ⚠️ RUNS, PRODUCES NOTHING — scheduled and executing, output empty or absent

| Job | State |
|---|---|
| `email-reports-weekly` | ⚠️ **Stopped entirely 2026-07-27** *(prod)*. Distinct from the older "sends 0 emails" defect — that one runs and produces nothing; this one does not run. Fixing either leaves the other live. `KNOWN_ISSUES` **KI-86** |
| `anomaly-watcher` | Runs, writes `job_runs`, surfaces nothing |
| `gsc-daily-sync` | **534 processed vs 56 stored** *(prod)* — a ~90% drop between fetch and persist, not a "no data" state. Relates to §20 row 4's 🧪 pending-first-sync note, but is a *different* problem: it is syncing and losing rows |
| `ai-crawler-range-refresh` | ✅ **Code-verified: scheduled NOWHERE.** No cron entry, no invocation. `dashboard/src/featureFlags.js:31` says so in its own comment — *"today nothing invokes it"*. Only its own file and two tests reference it |

### 28.4 ⚠️ CORRECTION — `data-quality-check` RUNS DAILY. Fix it wherever listed as dead

**305 reports across 79 distinct days** *(prod)*. Any document, audit or row calling it dead or
dormant is **wrong** — correct it in place.

**The inference that produced the error, so it is not repeated:** `data-quality-check` writes
**nothing** to `job_runs`, and an audit read that absence as "never ran". `job_runs` is **not a
reliable negative** — verified on `main`, its only writers are `nightly-attribution.js` (3 sites),
`anomaly-watcher.js` (1) and the `api/lib/job-runs.js` helper. `health-agent.js` and
`data-quality-check.js` reference it **only via `.select()` reads**, filtered to
`job_name = 'nightly-attribution'`; `proxy-domain-recheck.js` does not reference it at all.

So the table is a log about **one** job, consumed as if it were a registry of **all** jobs — by two
jobs that are themselves missing from it. Full detail: `KNOWN_ISSUES` **KI-83**. (§17 row 7 already
records the `health-agent` half — "Writes no `job_runs` row" — that observation was right and its
generalisation is what was missing.)

### 28.5 ⛔ AI Visibility — flagged OFF (#655), and it could not have been switched on

The page is flagged off. Recording **why deploying the pipes was never a one-step fix**:

- `tinybird/datasources/crawler_hits.datasource` is **authored in-repo but NEVER DEPLOYED** to the
  workspace — `SELECT count() FROM crawler_hits` returns `Resource 'crawler_hits' not found` *(prod
  workspace check, orchestrator)*.
- ✅ **Code-verified on `main`:** **both** dependent pipes read FROM it —
  `tinybird/pipes/crawler_pages.pipe` and `tinybird/pipes/crawler_agents.pipe`.
- Therefore **deploying those pipes would fail outright**, not merely return empty. The datasource
  must land first (founder-gated, CLAUDE.md §8).

Compounding: `ai-crawler-range-refresh` — the job that would populate it — is scheduled nowhere
(§28.3). Three stacked breakages, not one.

### 28.6 ✅ COUNTS FROM SOURCE — grepped this session, not carried forward

| Claim | Verified value | Source of truth |
|---|---|---|
| AI assistants | **16** | `marketing/src/lib/homeFixtures.js:147` (`AI_ASSISTANTS`), derived from the live classifier's label set. ⚠️ **`tracker/tracker.js:248` carries 13** distinct labels, and `homeFixtures.js:28` ships copy implying **22**. Three surfaces, three numbers — the classifier's 16 is correct. `KNOWN_ISSUES` **KI-94** |
| Report templates | **11** | `dashboard/src/pages/ReportBuilder.jsx:137` `PRESET_TEMPLATES` — counted: `univ_channel_rev`, `univ_campaign_rev`, `saas_trials`, `saas_demos`, `saas_signups`, `ecom_orders`, `ecom_revenue`, `ecom_aov`, `ecom_shopify`, `lead_leads`, `lead_forms` |
| Attribution models | **9** | `ALLOWED_MODELS` in `api/routes/campaigns.js`, stated as "all 9" by `api/tests/campaigns-model-guard.test.js:5` |
| Models on **Campaigns** | **2 — and that is CORRECT, not a gap** | ✅ Deliberate. The guard test explains it at `:24`: *"the UI hardcodes `model=last_touch` and narrows the tab bar."* The route validates against all 9 then fails closed on models it cannot answer honestly — narrowing the UI is the honest behaviour, not missing work. **Do not "restore" the other 7 here.** |
