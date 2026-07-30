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

The spine above is **team-facing** — it names competitors and belongs in internal docs, not on the
site. §1.1 is its **customer-facing** counterpart: the same position, in the buyer's words.

### 1.1 The customer-facing hero (CANONICAL — this is the live site)

**The live homepage ALREADY carries a strong spine — this canonicalizes it so the ~90 new pages
inherit it instead of drifting.** Verified verbatim against `dashboard/src/pages/Landing.jsx:57-66`
on `origin/main` @ `d92308a`, 2026-07-22. *(A prior plan drafted a replacement hero; that was a
mistake — the site's is better. Align to it.)*

> **Know which sources bring your leads — and which bring revenue.**
> See exactly where your traffic, leads, and customers come from: search, referral, campaigns, and AI
> tools like ChatGPT. One lightweight script. No CRM. No tag-manager maze. No "book a demo" wall.
>
> Kicker: *Attribution for founders* · Proofs: *No credit card required · One script or GTM ·
> Cookieless & privacy-first*

**Why this is the spine (and why it already works):**
- **"leads — and which bring revenue"** = the wedge, in the buyer's words. Most tools stop at leads;
  the revenue tie is the differentiator. Sharper than any rewrite.
- **"No CRM. No tag-manager maze. No 'book a demo' wall."** = the anti-Cometly position done right —
  the "$750 + sales call" contrast without naming anyone or sounding cheap. Three specific noes, each
  killing a named competitor's friction.
- **"AI tools like ChatGPT"** = correctly an *example in a list*, not the headline (data: AI-referral
  is table stakes and drives 0 search traffic — see `docs/marketing/website_seo_plan.md` Appendix A).
- **"Attribution for founders"** = ICP flag in three words (see §6).

**Every page's title/meta ladders up to this hero's logic:** lead with the outcome (which sources make
money), prove with the path (the `/explain` touch-chain), fold SEO-revenue in as proof not headline,
price + "no sales call" as a closer under the hero — never the opener.

> ⚠️ **This block is a mirror of code, not a source.** If `Landing.jsx`'s `HERO` changes, this is
> stale until re-synced. Verify against the live constant before quoting it anywhere public.

### 1.2 VOICE RULE — specificity, NOT hype (locked) 🟢

Do **not** inflate copy with marketing buzzwords ("revolutionary", "AI-powered intelligence",
"supercharge", "10x", "next-gen"). Three reasons, all specific to SourceTrack:

1. **It breaks the §26 truth-gate.** The product refuses to fabricate revenue numbers or invent
   recommendations; a hyped homepage writes a check the honest product won't cash. Prospects feel the
   gap instantly.
2. **The buyers don't respond to it.** The competitor pages that actually earn traffic are plain and
   educational (Attribution.app 89% blog); the hyped, content-less ones (Hyros) have no organic engine.
   Technical founders researching attribution are skeptical and allergic to marketing-speak.
3. **Honesty IS the position vs Observix** (whose hyped "AI chat" visibly errors). You cannot adopt the
   voice of the competitor you're positioned against.

**What creates real pull for this audience = specificity that sounds like a practitioner wrote it:**
- ❌ "Revolutionary AI-powered revenue intelligence" → ✅ "See the exact 4-touch path behind a $2,000
  sale — ChatGPT referral, two blog visits, then direct."
- ❌ "Supercharge your attribution" → ✅ "The lead your other tools log as 'Direct'? We show it came
  from ChatGPT." *(this is the Direct-Rescue story — §4 Tier 1)*

The live hero already writes in this register. **Sharpen it; never inflate it.** This voice rule
applies to every page, title, and meta across the site.

**Truth-gate:** revenue language renders only where revenue data exists (§5.1–5.2 design.md).

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

### 5.1 Copy constraints — the hard DO-NOTs for every public page

> **Provenance:** consolidated from `docs/marketing/seo_content_backlog.md` ("Communication & Claims
> Constraints") and `docs/seo/marketing_site_copy_audit_2026-06-16.md` ("Overclaim/truthfulness
> risks") on retirement of both docs, 2026-07-22. **This table is the authoritative claims-gate** —
> `docs/marketing/website_seo_plan.md` Part 1 #5 and Part 9 both defer to it.

These bind **all** marketing copy, page specs, sales decks, security questionnaires and DPAs. The
"say instead" column is not a softener — it is the accurate description.

| ❌ Never claim | ✅ Say instead | Why |
|---|---|---|
| SOC 2 certified / compliant | *(say nothing — omit entirely)* | No certification exists. An uncertified SOC 2 claim is a material misrepresentation. |
| "GDPR compliant" | "privacy-conscious", "consent-aware", "PII-minimized", "GPC/DNT honored", "EU-resident data" | Compliance is a legal determination we have not obtained. Also a place we're **more** honest than SourceLoop, who assert it flatly — on-brand. |
| Native Shopify app / Shopify App Store plugin | "manual Shopify webhook recipe", "installed via custom script tag in Shopify Admin or Google Tag Manager" | No App Store listing exists. The claim sends users hunting for an app that isn't there. |
| Native Stripe app / production Stripe sync | "Stripe webhook adapter", "test-mode beta" | Stripe ingestion is test-mode/beta and requires webhook setup. |
| Automatic Google Ads / Meta sync | "click-ID capture", "CAPI config" — and only once production-verified | Not production-verified. See §5 ⚠️ (CAPI landing via #60). |
| Native CRM sync / bidirectional Salesforce-HubSpot database sync | "attribution stitching that captures click history and forwards attribution metadata to form fields" | Limited to UTM capture in hidden form fields, forwarded on submit. No database-level sync. |
| Exact AI prompt attribution / "see what they asked ChatGPT" | "AI referral **domain** detection" | We parse referrer domains (`chatgpt.com`, `claude.ai`). Private prompts inside AI engines are inaccessible — architecturally, not just currently. |
| Exact keyword-to-customer attribution | "Search Console query visibility", "**estimated**, matched by landing page + date range" | GSC query→revenue is estimated by landing-page + date join. The estimate label is mandatory, not optional. |
| Multi-client permissions / guest-invite agency workflows | "multi-site portfolio view" | The permissions layer isn't ready. Small agencies get the All-Sites view only (§6). |
| "Reveal anonymous companies" · "Enrich every lead with contact data" · "Score leads automatically with AI" · "Identify your ICP automatically" | "See which sources bring qualified leads." | Company-reveal / IP-enrichment / contact-enrichment / AI lead scoring are **not built and not planned pre-paid-beta**. See the enrichment-stance note below. |

> **Product-scope note — now homed.** The full "Lead Intelligence / AI Enrichment Stance" (the
> allowed/not-allowed enrichment lists, and the rule that *any* future lead-quality feature must use
> **first-party SourceTrack data only** absent a separate privacy/legal/vendor/accuracy/pricing
> review) is a **product-scope + privacy rule, not marketing copy.** It lives in
> `docs/design/design.md` **§26.1**, under the Scope Gate that `CLAUDE.md` §12 names as the scope
> authority. The row above is its copy-facing form; §26.1 is the whole rule.

### 5.2 CAPI: parked scope, and the real differentiator (2026-07-23)

The positioning already says CAPI is **"also,"** not the wedge (§7 truth-safe bundle: *"Headline =
SEO-revenue + AI-source… CAPI = 'also.'"*). Two decisions from a 2026-07-23 architecture read make
that concrete. *(There is no separate "CAPI is a proof-point, not a position" guardrail — that line
is the whole of it; don't cite a section that doesn't exist.)*

**Multi-platform CAPI is PARKED — and stays cheap to park.** The CAPI code is already
normalized-event + per-platform-formatter shaped: one internal `evt` built at
`api/routes/conversion.js:447` / `conversion-offline.js:254`, self-contained senders sharing an
identical `(site, evt)` signature, zero Meta-vs-Google branching in shared code. Adding a platform
(e.g. TikTok) is a ~35-line sender plus the four-touchpoint lockstep and a `sites` migration (S for
code, M with migration ceremony — see the `KNOWN_ISSUES` "Dead CAPI senders" checklist). It's
commodity work (Cometly ships ~10 platforms), we have open launch gates, and because the shape is
already adapter-clean the option stays cheap indefinitely. **Revisit on customer demand, not
competitor parity.**

**The differentiator is a comparison surface, NOT a richer payload.** The tempting move — enrich the
CAPI payload with our attribution signal — is **prohibited** (`design.md` §26.1: positioning conflict
+ unverified value). Invert it instead: don't send attribution *to* the platform, **show the customer
what the platform can't see.** e.g. *"Meta reports 10 conversions from this campaign. SourceTrack
shows 4 started on ChatGPT — Meta can't see that, and neither can your pixel."* It uses our unique
signal, sends the platform nothing extra, **strengthens** the privacy story, and is more compelling
to a marketer than "our CAPI has extra fields." **V1.1 idea — logged, not built.**

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
| §5 | *(Funnels)* | **Do NOT market Funnels — but it is NOT a false sales claim: it's a dormant entitlement + dead code.** `funnels_cohorts` grants a plan entitlement (`api/lib/plan-features.js:36`) and the endpoint is live (`analytics.js:1022` `GET /funnel`), but the feature has **no UI** (`FunnelChart.jsx` deleted #317) and its endpoint reads the Supabase **`pageviews`** table (`analytics.js:1047`) which has **0 rows in prod (empty by design)** → returns nothing. **Nothing customer-facing promises it:** the `FEATURE_LABELS` "Funnels & cohorts" string (`dashboard/src/lib/planFeatures.js:58`) is **imported nowhere** (never renders), and `Pricing.jsx` doesn't mention it. **Resolve as cleanup, not as a claim to avoid.** (verified 2026-07-20) **⚠️ STALE as of 2026-07-30 — kept as the historical record, do not act on it.** Every premise above has since been fixed: `FunnelChart.jsx` was rebuilt and IS rendered (`dashboard/src/pages/Analytics.jsx`), `GET /funnel` no longer reads the empty Supabase `pageviews` table — it reads Tinybird via `dispatchPageviews` — and #502 added truncation honesty so a capped read is disclosed instead of silently reported as complete. Funnels are live on every paid tier and are listed as **Shipped** on the public roadmap (#504). The "do NOT market Funnels" instruction no longer applies; the "dormant entitlement + dead code" framing described 2026-07-20, not today. |

> Audit candidate (not corrected here): two UTM files with different casing coexist — `pages/tools/UtmBuilder.jsx` (page) and `components/UTMBuilder.jsx` (component).
