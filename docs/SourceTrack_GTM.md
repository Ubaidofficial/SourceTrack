# SourceTrack — GTM & Positioning (updated)

> **Provenance (added 2026-07-20 on first commit to git).** Content frozen **2026-06-28**. This
> document had **never been committed** — it was lost and re-derived from scratch **twice**
> (2026-07-07, 2026-07-20) before landing in git here. It belongs in the repo because
> `FEATURE_MAP.md` §5 gates a **public revenue claim** on it (the truth-gate for what may be said
> about revenue attribution publicly); losing it risks shipping an unverifiable marketing claim.
>
> **This is NOT the complete GTM picture.** A sibling lineage — `SOURCETRACK_GTM_v3→v5.md`
> ("Living Doc," 2026-06-26/27) — is **not in the repo and may be lost.** It held the locked ICP
> tiers, a 25-item moat backlog, and B2B displacement targets this file does not carry.
>
> A **corrections log** (verified against current code 2026-07-20) is appended at the end — read it
> before acting on any feature claim below.

**Built from:** full competitor legal/marketing teardowns (Cometly, SourceLoop, DataFast, Piqo, AnyTrack, Usermaven) + SourceTrack prod verification, this session + prior. Supersedes the "four moats vs everyone" framing.

---

## 1. The positioning spine (truthful, universal)

> **Cometly-grade attribution depth. DataFast-grade simplicity. Plus SEO-revenue attribution none of them offer.**

- **Simplicity = the delivery promise (the *feel*), NOT the moat.** Everyone claims it; it's copyable.
- **"Simplicity at Cometly level" was a contradiction** — Cometly is the heavy, complex incumbent. Corrected: *Cometly's depth WITHOUT Cometly's bloat* (no 70+ integrations, no CRM requirement, no quote pricing).
- Depth benchmark = Cometly. Simplicity benchmark = DataFast/Piqo. You sit between: their depth, that simplicity.

---

## 2. The defensible moat, stated honestly

**The ONE thing unique to you across ALL four competitors: GSC SEO-revenue attribution.** None of Cometly, SourceLoop, DataFast, Usermaven ship it. **This is the headline — especially vs SourceLoop, where it's the *only* clear edge.**

- **Primary moat: SEO-revenue attribution** — "see which organic search pages + queries drive *revenue*, not just clicks." (truth-label: estimated, matched by landing page + date range.)
- **Secondary (vs Cometly ONLY): privacy-by-default** — GPC/DNT honored, no fingerprinting, no data to an LLM. DOCUMENTED contrast vs Cometly. **NOT vs SourceLoop** (they match — see §3).
- **Tertiary: AI-source depth** (22 domains) — real but narrowing; competitors name ChatGPT too.
- **Delivery promise: simplicity** — copyable, so it's the feel.

---

## 3. Per-competitor truth table (claim ONLY what holds vs that competitor)

### vs SourceLoop — your most dangerous competitor
Near-identical name, identical pricing, shipped CAPI roadmap, mature compliance.
- ✅ **SEO-revenue attribution** = your one clear edge.
- ⚠️ AI-source depth = weak edge (they name ChatGPT).
- ❌ Privacy = PARITY (they honor GPC, don't train on data, MCP is user-initiated). **DO NOT claim a privacy advantage — false + legally risky.**
- ⚠️ Cookieless = narrow edge only (they use cookies + local-storage 13mo fallback; you're cookieless-first). Frame carefully.
- ❌ CAPI / compliance = BEHIND (they ship 4-platform CAPI + full legal stack today).
- **Lead with: SEO-revenue. That's the play vs SourceLoop.**

### vs Cometly — the easy, documented contrast
- ✅ Privacy (GPC, no-fingerprint, no-OpenAI) — all documented in their own policy.
- ✅ Simplicity / no-CRM (they're CRM-dependent, 70+ integrations, quote-based).
- ✅ SEO-revenue.
- ⚖️ Attribution depth = parity (9 vs 8 models). ❌ CAPI = behind.
- **Lead with: privacy + simplicity + no-CRM + SEO-revenue. Best "vs" page.**

### vs DataFast — the simplicity bar, analytics-first
- ✅ Attribution depth + AI-source depth + CAPI (they're analytics-only).
- ⚖️ Simplicity = shared (match, don't claim to beat). ⚠️ Privacy = narrow (they're cookie-first).
- **Lead with: attribution depth. They're an analytics tool; you're attribution.**

### vs Usermaven — lowest-confidence intel
Likely edges: SEO-revenue, AI-depth, privacy specifics. Verify before claiming.

---

## 4. 🎯 THE UNSHIPPED QUICK-WIN MOAT (don't lose this)

Two tiers, both **unbuilt by all four competitors**, both leverage existing strengths:

### Tier 1 — the differentiated quick win: "Direct Rescue" (AI-source → synthetic UTM)
- **What:** turn a detected AI/paid referrer into a **synthetic `utm_source=chatgpt`** that flows into the hidden form field / CRM. A lead every competitor logs as **"Direct/Unknown"** shows up as **"ChatGPT"** in the customer's CRM.
- **Why it's a moat:** none of the four can do it — it requires your AI-source depth (22 domains), which they lack. It makes the narrow AI-depth moat **actionable**, not just observable.
- **Why it's a quick win:** the hard part (AI detection) is ALREADY BUILT. The unshipped piece is surfacing it into the form/CRM layer.
- **Why it's strategic:** SourceLoop's ENTIRE homepage hero is "Without: Unknown → With: Paid Social." **Your counter is "Unknown → ChatGPT"** — directly beats their demo on the AI dimension they can't match.
- ⚠️ "Easy" = relative: touches tracker + form layer, must respect DNT/GPC gating. Leveraged, not trivial.

### Tier 2 — the genuinely trivial play: free-tools SEO program
- **UTM builder:** AUDIT IN FLIGHT — may already exist in dashboard (settings/integrations). If yes → extract existing component to a public, no-auth, SEO-optimized landing page (faster, reuses tested code). If no → build. Public SEO page wanted regardless.
- **The broader play:** SourceLoop ships a whole free-tools suite as SEO/lead-gen magnets — UTM Campaign Builder, UTM Validator, CAC Calculator, Attribution Calculator, GA4 Channel Grouping Validator. Pure frontend, no backend/privacy risk. High-intent search terms matching your ICP's job.
- ⚠️ SEO reality: "UTM builder" is a competitive keyword (Google's own Campaign URL Builder ranks #1, plus SourceLoop/Cometly/dozens of free tools). A new page won't rank fast — it's a compounding medium-term asset + a conversion tool to link from your own content, not an instant traffic spike.

**Recommendation:** Tier 1 ("Direct Rescue") is the moat-grade quick win — it amplifies both AI-source AND SEO-revenue stories. Tier 2 (free tools, starting with the UTM builder once the audit resolves) is a cheap parallel SEO/content program.

---

## 5. Marketable features by truth-gate

### ✅ Safe to claim NOW (built + truthful)
Multi-touch attribution (9 models) · UTM/referrer/campaign/click-ID capture · visitor journey · cookieless journeys · **AI-source detection (22 domains: ChatGPT, Gemini, Claude, Perplexity, Copilot, DeepSeek, Grok)** · **GSC SEO-revenue attribution (est. label)** · lead qualification (no revenue needed) · Report Builder (template-first) · multi-site portfolio · manual conversion webhook (HMAC, replay-bound) · outbound webhook (HMAC, SSRF-guarded — gap in all 4 competitors) · lightweight analytics · **privacy: GPC/DNT honored, no fingerprinting, no data to LLM** *(re-verified `ab9fc7b` 2026-07-21 — see below)* · "core data stored in EU."

> ⚠️ **"no data to LLM" — verification note, do not repeat the claim without it.** This claim was **FALSE from the day `/api/attribution/verdicts` shipped until `ab9fc7b`** (2026-07-21): that endpoint sent real campaign names, revenue and conversion counts to a third-party model (`api.deepseek.com` by default, `api.moonshot.cn` under `AI_PROVIDER=kimi`). It sat in this "safe to claim NOW" list the whole time — see `KNOWN_ISSUES` **KI-47**.
>
> **It is true again as of `ab9fc7b`,** verified by grep across `api/`, `tinybird/`, `dashboard/src/` and `scripts/`: the only outbound model client is `api/lib/ai-client.js`, and it has **zero importers** — no code path can reach it. Every other `deepseek`/`anthropic`/`openai` hit is inbound AI-*referrer* detection (classifying visitors arriving **from** those tools), brand logos, or the secret scanner's key-name regex. `ai-client.js` and the `openai` npm dependency still exist but are dormant.
>
> **This is a point-in-time claim, not a permanent property.** It was falsified once by a feature added after it was written. Before repeating it in marketing copy, a DPA, or a security questionnaire, **re-run the grep against the current ref** and update the ref above.

### ⚠️ Marketable WITH caveat (beta / truth-gated)
CAPI (Meta+Google config landing via #60 — don't claim "live forwarding" until a merchant uses it) · GSC SEO-revenue ("estimated, matched by landing page + date") · Stripe ("test-mode beta," not production) · Shopify ("manual webhook," not native app).

### 🚫 CANNOT claim yet
Trial→paid / MRR-by-source (rail unbuilt — and this is your *sharpest stated ICP feature*, so closing it is high-value) · quality-filtered CAPI (Phase 3) · ROAS/CPL/CAC (V2) · "GDPR compliant" badge · native Shopify/Stripe · privacy advantage vs SourceLoop · full production Stripe.

---

## 6. ICP

**Founders + paid marketers/CMOs + small agencies (≤5 clients on the existing All-Sites portfolio view).**
- "Paid marketers/CMOs" = budget-owners accountable for revenue, not media-buyers-for-hire.
- Agencies = SMALL agencies on portfolio view; full white-label/workspaces stay V1.1 (the bloat doorway).
- **Anti-bloat test for every feature: "would a founder find this simple?"**
- **Delivery promise: "no setup tax, no enterprise tax."** CAPI config must hit "minutes not hours."
- ⚠️ Tension to hold: CMOs expect ROAS; it's V2. Position quality-filtered forwarding ("optimize on buyers, not signups") as the CMO value, hold the ROAS line unless beta CMOs demand it.

---

## 7. The truth-safe beta bundle (lead with this)

```
Install one script.
Capture leads, conversions, and revenue by source.
See which organic search pages and AI tools drive paying customers — not just visits.
Forward your real conversions to Meta & Google. Privacy-first: GPC honored, no fingerprinting.
```

Headline = **SEO-revenue + AI-source** (the unique moats). CAPI = "also." Privacy = "first" (true universally as a *feature*; a *contrast* only vs Cometly).

---

## 8. Marketing to-do (queued)
- vs-Cometly comparison page (strongest documented contrast).
- Homepage hero on the §1 spine (SEO-revenue headline; Cometly-depth/DataFast-simplicity).
- **"Without/With" demo countering SourceLoop's "Unknown→Paid Social" with "Unknown→ChatGPT"** (ties to Direct-Rescue quick win — a specific homepage component to build).
- **Rich dashboard mockups on homepage** — SourceLoop's homepage is dashboard-rich; ours is a gap (partly redesign-era, but a standalone marketing-asset gap).
- **Free-tools SEO program** — UTM builder (audit first) as public SEO page, then validator/calculator suite (SourceLoop precedent). Medium-term ranking play.
- **Per-form-builder docs library** — capability built, content NOT written. Table-stakes per 3 competitors. `/docs` currently redirects to homepage (partial infra).
- Antigravity prod visual pass on www.
- Hold all SourceLoop privacy contrasts. Hold "GDPR compliant." Carry all truth-gates into copy.

---

*All competitor claims reflect their stated public policies/marketing (2025-2026); implementation may differ but cannot be claimed-against beyond stated position. SourceTrack feature states from prod verification + memory; ⚠️ items are unproven-with-real-data. Not legal advice.*

---

## Corrections log (verified against code 2026-07-20)

Each row was re-verified by grep/read against the current codebase — not carried from memory.

| Section | Original claim | Correction (verified) |
|---|---|---|
| §4 Tier 2 | UTM builder "AUDIT IN FLIGHT — may already exist" | **RESOLVED — both exist.** Reusable component `dashboard/src/components/UTMBuilder.jsx` **and** a public standalone page `dashboard/src/pages/tools/UtmBuilder.jsx` routed at `/tools/utm-builder` (`App.jsx`). The "extract to a public SEO page" quick-win is already shipped. |
| §8 | "`/docs` currently redirects to homepage (partial infra)" | **RESOLVED.** `/docs` serves `DocsHome` with **11** real doc pages under `dashboard/src/pages/docs/`. It is a full docs section, not a redirect. |
| §5 (✅-safe) | "cookieless journeys" listed as safe-to-claim | **⚠️ Move to caveat.** The **served** `tracker.min.js` contains `document.cookie`: cookieless by default (localStorage), but a first-party cookie is written on the customer's opt-in `data-cookie-domain` path, and merchant `_fbp`/`_fbc` are **read** (never set) for Meta CAPI. A strictly-cookieless build exists but is **not served**. Do **not** claim "no cookies." |
| §5 | "core data stored in EU" | **Strengthened.** US-hosted PostHog was decommissioned 2026-07-19 (project 416017 deleted). Analytics now read from Tinybird (EU, Frankfurt region); Supabase is EU (Ireland). Still **no** "GDPR compliant" badge — that label is not claimable. |
| §5 | *(Funnels)* | **Do NOT market Funnels — but it is NOT a false sales claim: it's a dormant entitlement + dead code.** `funnels_cohorts` grants a plan entitlement (`api/lib/plan-features.js:36`) and the endpoint is live (`analytics.js:1022` `GET /funnel`), but the feature has **no UI** (`FunnelChart.jsx` deleted #317) and its endpoint reads the Supabase **`pageviews`** table (`analytics.js:1047`) which has **0 rows in prod (empty by design)** → returns nothing. **Nothing customer-facing promises it:** the `FEATURE_LABELS` "Funnels & cohorts" string (`dashboard/src/lib/planFeatures.js:58`) is **imported nowhere** (never renders), and `Pricing.jsx` doesn't mention it. **Resolve as cleanup, not as a claim to avoid.** (verified 2026-07-20) |

> Audit candidate (not corrected here): two UTM files with different casing coexist — `pages/tools/UtmBuilder.jsx` (page) and `components/UTMBuilder.jsx` (component).
