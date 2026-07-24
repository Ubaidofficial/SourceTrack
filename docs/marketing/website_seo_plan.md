# SourceTrack — Website & SEO Plan (LOCKED)

**Purpose:** the single execution spec for every public page — what to build, in what order, with what
title/meta/schema, and the competitor traffic evidence behind every ranking here.
**Status:** LOCKED. Changes require new traffic data, not opinion.

**Positioning lives elsewhere.** The customer-facing hero, the internal spine, the VOICE RULE, the
claims-gates and the ICP are owned by [`docs/SourceTrack_GTM.md`](../SourceTrack_GTM.md). Every page
spec in this doc inherits that spine — do not restate or drift from it here.

**Companions:** [`fast_acquisition_90day.md`](fast_acquisition_90day.md) (customers 1–200, the
manual motion) · [`demo_seed_spec.md`](demo_seed_spec.md) (the seeded tenant that gates every real
screenshot in Part 8).

**Confidence key:** 🟢 data-backed (multiple competitor exports agree) · 🟡 reasoned (fits the data
but not directly measured) · 🔴 bet (emerging/unproven — build small, prove, then expand).

**Evidence tags:** `[C]` confirmed (fetch/data) · `[I]` inferred · `[U]` unverified · `[DATA]` from a
competitor CSV export.

---

## PART 1 — LOCKED DECISIONS (stop reversing these)

These are settled by the 7-CSV analysis in Appendix A. Do not relitigate without new data.

1. 🟢 **Architecture: Astro static marketing site + separate React app.** Marketing pages are
   brochureware that never needed React. Astro ships zero JS, renders real HTML to crawlers, embeds
   React "islands" only for the 1–2 interactive tools. This is what SourceLoop does and why their site
   renders and ours doesn't.
2. 🟢 **CMS: markdown content collections in the Astro repo. NO Sanity yet.** One author, zero posts
   today — a CMS is overhead now and *enables* the volume-without-review that produced competitors'
   67% dead-weight pages. Add Sanity only when a non-technical person publishes weekly.
3. 🟢 **The traffic engine is educational blog content, NOT tools or alternatives.** For every
   attribution competitor with non-brand traffic, blog/guide content is 68–89% of it; tools are
   0–1.7%; alternatives ~1%. (Attribution.app, our closest analog, is 89% blog.)
4. 🟢 **Never measure this plan by page count.** 48–67% of every competitor's pages capture zero
   traffic. Measure ranked position on the target clusters (Part 4).
5. 🟢 **Every claim is truth-gated** against `docs/SourceTrack_GTM.md` §5. No "GDPR compliant", no
   native Shopify/Stripe, no production-Stripe implication, no ROAS without cost data, no exact
   keyword/prompt attribution, no fabricated review schema.
6. 🟢 **Foundation (Astro render + llms.txt fixes) blocks everything.** No page's SEO value exists
   until it renders to crawlers. Phase 0 is non-negotiably first.

---

## PART 2 — THE COMPLETE SITEMAP (every page, every silo)

Status: **[LIVE]** ships today · **[FIX]** ships but needs work · **[BUILD]** new.
Phase letter = build order (Part 3). Pages with a full title/meta/schema spec are in Part 9.

### SILO 1 — Core / brand  `/`
| URL | Status | Phase | Note |
|---|---|---|---|
| `/` (homepage) | [FIX] | A | Hero = Lead Journey touch-chain (the `/explain` output). Needs seeded screenshot (Part 8). |
| `/product` | [LIVE] | A | Keep as overview; feature depth moves to Silo 2. |
| `/pricing` | [FIX] | A | Add seat policy + "cheapest attribution, from $49". `Product`+`Offer` schema. 🟢 |
| `/demo` | [LIVE] | — | Interactive demo (fixture-only). |
| `/about` | [BUILD] | A | Trust gap. Both competitors have it. |
| `/contact` | [BUILD] | A | Trust gap. |

### SILO 2 — Features  `/features/*`  🟢 (data supports; small but high-intent)
Pattern: `[Feature] | SourceTrack`, `SoftwareApplication`+`FAQPage`, meta leads with outcome.
One real hero screenshot each (blocked on demo seed, Part 8).

| URL | Status | Phase |
|---|---|---|
| `/features/multi-touch-attribution` | [BUILD] | B |
| `/features/ai-referral-tracking` (currently `/ai-referral-tracking`) | [FIX] | B |
| `/features/seo-revenue-attribution` | [BUILD] | B · 🔴 gated on GSC sync landing |
| `/features/lead-journey` | [BUILD] | B |
| `/features/conversion-tracking` | [BUILD] | B |
| `/features/offline-conversions` | [BUILD] | B |
| `/features/report-builder` (currently `/report-builder`) | [FIX] | B |
| `/features/cookieless-attribution` | [BUILD] | B · 🟢 genuine edge, ranked term |
| `/features/campaign-attribution` | [BUILD] | C |

### SILO 3 — Integrations  `/integrations/*`
Hub exists. Each integration gets its own indexable page (SourceLoop has one per integration).
Pattern: `[Tool] Attribution & Tracking | SourceTrack`, `SoftwareApplication`+`HowTo`+`FAQPage`.

| URL | Status | Phase | Truth-gate |
|---|---|---|---|
| `/integrations` (hub) | [LIVE] | A | — |
| `/integrations/stripe` | [FIX] | B | "test-mode beta" only |
| `/integrations/shopify` | [FIX] | B | "manual webhook recipe", not native app |
| `/integrations/google-search-console` | [BUILD] | B | 🔴 gated on sync; "estimated" label required |
| `/integrations/google-tag-manager` | [FIX] | B | (doc exists, needs marketing page) |
| `/integrations/webhooks` | [BUILD] | C | manual conversion API |
| `/integrations/google-ads` | [FIX] | C | click-ID capture, not native sync |
| `/integrations/hubspot` | [BUILD] | D | 🟡 "coming soon" locked card if not shipped |
| `/integrations/slack` | [BUILD] | D | 🟡 "coming soon" |

### SILO 4 — Use cases (business model) + Solutions (industry)
🟢 business-model pages (exist, ranked). 🟡 industry pages (competitors have them; lower traffic in
data — build after the engine).

| URL | Status | Phase |
|---|---|---|
| `/use-cases/saas` | [LIVE] | B |
| `/use-cases/ecommerce` | [LIVE] | B |
| `/use-cases/lead-generation` | [LIVE] | B |
| `/use-cases/agencies` | [LIVE] | B |
| `/use-cases/shopify` | [LIVE] | B |
| `/solutions/founders` | [BUILD] | C |
| `/solutions/marketers` | [BUILD] | C |
| `/solutions/content-seo` | [BUILD] | C |
| `/solutions/home-services` | [BUILD] | D · 🟡 |
| `/solutions/healthcare` `/legal` `/financial-services` `/real-estate` | [BUILD] | D · 🟡 low priority |

### SILO 5 — Category (pSEO landing) pages  🟢 the small high-intent pool
Highest-traffic category terms across all exports. `SoftwareApplication`+`FAQPage`.

| URL | Primary keyword | Status | Phase |
|---|---|---|---|
| `/marketing-attribution-software` | `marketing attribution software` (1,060) | [BUILD] | **A** — pull forward, top term |
| `/revenue-attribution-software` | `revenue attribution` | [BUILD] | B |
| `/lead-attribution-software` | `lead attribution` | [BUILD] | B |
| `/conversion-tracking-software` | `conversion tracking` | [BUILD] | C |
| `/attribution-modeling` | `attribution modeling tools/software` | [BUILD] | C |

### SILO 6 — Blog / educational  🟢 THE ENGINE (68–89% of competitor non-brand traffic)
Attribution-concept explainers — where practitioner depth beats a content mill. `Article`+`FAQPage`
+`BreadcrumbList`. Full specs for the first 6 in Part 9 Tier 1.

**Wave 1 (proven-pattern, mirror Attribution.app's actual winners):**
- `/blog/first-touch-vs-last-touch-attribution`
- `/blog/multi-touch-attribution-models`
- `/blog/probabilistic-vs-deterministic-attribution`  *(their #2 page)*
- `/blog/revenue-attribution`
- `/blog/how-to-track-chatgpt-traffic`  *(🔴 differentiation, 0 search volume — brand/emerging play)*
- `/blog/cookieless-attribution`

**Wave 2 (expand once Wave 1 earns):**
- `/blog/what-is-a-good-conversion-rate`  *(Triple Whale top earner — gate: no fake benchmarks)*
- `/blog/data-driven-attribution`
- `/blog/position-based-attribution-model`
- `/blog/full-funnel-attribution`
- `/blog/lead-source-tracking`
- `/blog/utm-tracking-guide`  *(hub for Silo 7)*
- `/blog/first-party-vs-third-party-attribution`
- `/blog/whats-a-good-roas`  *(🟡 gate: must not imply we compute ROAS without cost import)*

### SILO 7 — Forms / UTM pSEO cluster  🟡 (SourceLoop's play — build DEEP not WIDE)
SourceLoop ran 64 near-identical form-builder posts; that pattern IS the 67% dead-weight. Do the
opposite: one strong hub + real guides for the builders our ICP actually uses. Expand to the long tail
only if the first dozen earn. `HowTo`+`FAQPage`.

- `/guides/utm-tracking` (hub)
- `/guides/track-utms-in-wpforms`
- `/guides/track-utms-in-gravity-forms`
- `/guides/track-utms-in-typeform`
- `/guides/track-utms-in-webflow-forms`
- `/guides/track-utms-in-hubspot-forms`
- `/guides/track-utms-in-calendly`  *(booking attribution)*
- `/guides/track-utms-in-contact-form-7`
- `/guides/track-utms-in-elementor-forms`

> ⚠️ 🟡 Uncertainty owned: this reasons about *which* form builders the ICP uses (WordPress-heavy
> guess). Before building 8, confirm from real signups/ICP research which 4–5 matter. Building the
> wrong builders is the dead-weight trap.

### SILO 8 — Free tools  🟡 high volume, hard to rank — build the 2 best as internal-link hubs
Tool *terms* have big volume (`utm builder` 22,970) but convert poorly to ranked page-traffic for
competitors (0–1.7%). Build the differentiated ones, not commodity calculators Google already owns.

| URL | Status | Phase | Note |
|---|---|---|---|
| `/tools/utm-builder` | [LIVE] | — | Exists. Keep; make it the Silo-7 hub's tool. |
| `/tools/attribution-model-comparator` | [BUILD] | C · 🟢 | Paste a journey, see all **9** models split it. Differentiated (theirs cover fewer). |
| `/tools/ai-referral-checker` | [BUILD] | D · 🔴 | Paste a URL/referrer, classify AI source. On-theme. |
| `/tools/roi-calculator` `/tools/cac-calculator` | [BUILD] | D · 🟡 | Only if truthful, no email gate. Commodity — low priority. |

### SILO 9 — Knowledge base / Docs  `/docs/*`
Largely LIVE (7 platform guides + quickstart/install/troubleshooting + developer portal). Fixes +
expansion. Serve each as `.md` too. `TechArticle`/`HowTo`+`BreadcrumbList`.

| URL | Status | Phase |
|---|---|---|
| `/docs` (home) | [FIX] | A · real brand SVGs, fix 9 truncations, split glossary out |
| `/docs/quickstart` `/docs/install` `/docs/troubleshooting` | [LIVE] | — |
| `/docs/platforms/{google-ads,gtm,webflow,wordpress,framer,shopify,stripe}` | [LIVE] | — |
| `/docs/platforms/nextjs` | [BUILD] | C · only gap in the platform list |
| `/docs/conversions` `/docs/manual-conversion-api` | [BUILD] | B |
| `/docs/google-search-console` | [BUILD] | B · 🔴 gated |
| `/docs/privacy-and-consent` `/docs/cookieless-tracking` | [BUILD] | C · truth-relevant |
| `/docs/attribution-models` `/docs/source-definitions` | [BUILD] | C |
| `/developers/*` (api, tracker, conversions, offline, identify, webhooks, campaign-costs, security) | [LIVE] | — |

### SILO 10 — Glossary  🟡 (SourceLoop has dedicated ranking pages per concept)
Split the buried `/docs` glossary into indexable pages. `DefinedTerm`+`FAQPage`. Cheap, each ranks.

`/glossary` (hub) + `/glossary/{attribution, first-touch, last-touch, multi-touch, utm-parameters,
click-id, pageview, conversion, session, site-key, webhook, cookieless-tracking, ai-referral}`

### SILO 11 — Comparison  `/compare/*`  🟡 low traffic (~1%) but high intent; pricing-opacity validated
| URL | Status | Phase | Note |
|---|---|---|---|
| `/compare/ga4` | [FIX] | A | Rebuild as 5-column (add EU/GSC column). Top term `google analytics alternative` (610). |
| `/compare/cometly-pricing` | [BUILD] | D | 🟢 opacity play — Cometly hides its price; publish yours. |
| `/compare/hyros-pricing` `/compare/ruler-pricing` | [BUILD] | D | 🟡 |
| `/compare/cometly` `/compare/usermaven` `/compare/attributer` `/compare/whatconverts` | [BUILD] | D | 🟡 cheap, easy, low-traffic — do, don't lead |

### SILO 12 — Trust / legal / status
| URL | Status | Phase |
|---|---|---|
| `/security` `/privacy` `/terms` `/dpa` `/subprocessors` `/do-not-sell` | [LIVE] | — |
| `/faq` | [BUILD] | A · cheapest SEO surface, `FAQPage` |
| `/changelog` | [BUILD] | A · proves the product is alive |
| `/status` | [BUILD] | C |
| `/cookies` | [BUILD] | C |

---

## PART 3 — BUILD SEQUENCE (the order you follow)

**Phase 0 — Foundation (BLOCKS ALL; first, no exceptions)** 🟢
Astro migration (marketing site renders to HTML) · fix `llms.txt` (3 private-repo 404s + stale
US-hosting line) · add `llms-full.txt` · `.md` serving for docs · fix soft-404 catch-all route.
*This is the biggest single build in the plan and needs its own architecture decision (separate repo
vs monorepo subdir; `www.` vs `app.` split). Scope separately before starting.*

**Phase A — Low-hanging fruit** 🟢 (cheap, high-trust, no dependencies)
`/about` · `/contact` · `/faq` · `/changelog` · `/pricing` upgrade · `/docs` fixes (logos, truncations,
glossary split) · `/compare/ga4` 5-column · **`/marketing-attribution-software`** (the one category
page pulled forward — top term, highest confidence).

**Phase B — Feature + core integration + business-model pages** 🟢
9 feature pages · Stripe/Shopify/GSC/GTM integration pages · the 5 use-case pages (polish) · the next
category pages (`revenue-`, `lead-attribution-software`) · core docs (conversions, GSC).

**Phase C — Blog engine + solutions + glossary** 🟢 (the proven engine)
Blog Wave 1 (6 attribution explainers) · glossary split · solution pages (founders/marketers/
content-seo) · attribution-model-comparator tool · remaining docs.

**Phase D — pSEO clusters + competitors + long tail** 🟡🔴
Forms/UTM cluster (deep, ICP-confirmed builders) · blog Wave 2 · pricing-opacity comparisons ·
alternatives pages · industry solution pages · remaining tools.

> **Sequence rule:** never start a later phase's pSEO while Phase 0 is incomplete. Pages in a
> non-rendering SPA earn nothing, and per the data most pSEO pages earn little even when they do render
> — so front-loading them is doubly wrong.

---

## PART 4 — SUCCESS METRIC (how "we beat SourceLoop" is judged)
🟢 NOT page count. Ranked position on three clusters:
1. **Educational/attribution-concept blog** (the engine) — top-10 on 6+ Wave-1 terms
2. **Attribution category** (`marketing attribution software` et al.) — top-5, the winnable pool
3. **GSC keyword-revenue + EU-residency** — page-1 presence, gated on the sync landing

Monthly: re-pull competitor **top-pages** exports (traffic, not rankings) · check own position on 1–3
· verify SourceLoop counts in-browser (`llms.txt` is not a reliable index).

---

## PART 5 — DELIBERATELY NOT BUILT (so scope doesn't creep)
🟢 From the repo do-not-build list + the traffic data:
- 64-page form-builder volume dump (dead weight — Silo 7 is the deep version instead)
- Industry pages as a *first* move (low traffic; Phase D at earliest)
- Commodity calculators Google already owns (only differentiated tools)
- `aggregateRating`/`Review` schema (no real reviews — fabrication risk)
- Company-reveal / IP-enrichment / prospect-DB content (see the do-not-build list)
- Sanity CMS (until a non-technical publisher exists)
- PPC/agency-services content (Cometly's top lane — not our buyer, commodity trap)
- Public report-sharing, white-label pages (V2)

---

## PART 6 — WHERE I AM NOT CERTAIN (honest seams)
Confidence demands naming these rather than papering over them:
1. 🟡 **Which form builders the ICP uses** (Silo 7) — reasoned as WordPress-heavy; confirm from real
   signup data before building 8 pages.
2. 🔴 **AI-crawler directory** (a strategy-source idea, deliberately NOT in this sitemap yet) — 0
   current search volume; it's a category bet, not an SEO play. Hold until there's a reason.
3. 🔴 **GSC-dependent pages** (`/features/seo-revenue`, `/integrations/google-search-console`, the
   estimator tool) — gated on the automated sync landing one clean run. If it fails, this branch is
   unsellable and drops.
4. 🟡 **Exact industry-page value** — competitors have them but they're not in the traffic clusters;
   sequenced late deliberately.

Everything else in Parts 1–5 is 🟢 — backed by agreement across 7 competitor exports. Those are the
ones to build without second-guessing.

---

## PART 7 — HOMEPAGE COPY & VISUALS PLAYBOOK (learned from SourceLoop + Cometly)

Teardown of SourceLoop's full homepage (fetched 2026-07-22) + Cometly's known patterns. These are the
**structural moves that work**, adapted to SourceTrack's truthful capabilities. The VOICE RULE in
`docs/SourceTrack_GTM.md` still governs: steal the *structure*, not the hype, and NEVER copy a claim
we can't back.

### 7.1 The section sequence that converts (SourceLoop's, and it's good)
1. **Hero** — outcome headline + one-script/no-friction subhead + trial proof chips (you HAVE this).
2. **Product screenshot immediately under hero** — a real dashboard, not an illustration.
3. **Social-proof logo strip** — "Used by 750+ teams" + brand logos. ⚠️ **You have zero customers;
   do NOT fake this.** Substitute the DataFast-style *live "users in last 30 min"* widget (your own
   honest traffic) OR omit until you have logos. A fake logo wall is a §5-class lie.
4. **Three verb-sections: Track → Measure → Act.** SourceLoop's spine. Each = a headline + one real
   screenshot + supporting mockups. Adapt to **Track → Attribute → Prove** (Prove = SEO-revenue + the
   `/explain` chain, your wedge).
5. **Feature mockup grid** — the hand-built HTML cards (form, chat, payment) — NO data needed.
6. **Comparison table** — the four-column "fourth option" table (§7.4).
7. **"Things you won't hear anymore"** — the objection-as-chat-bubbles section (§7.5). Brilliant, cheap.
8. **Pricing** — with the seat/no-sales-call wedge.
9. **FAQ** — inline, `FAQPage` schema.
10. **Before/After closer** — "Without SourceTrack: Unknown / With: full journey" (§7.6). Their
    strongest single section; ours is stronger because our "With" shows the ChatGPT touch.

### 7.2 Copy patterns worth stealing (structure, not words)
- **Verb-led section headers.** "Track every conversion's source." "Measure the impact of every
  channel." Imperative + specific noun. NOT "Powerful analytics."
- **Subhead names the pain, then the fix.** "Know the complete journey behind every lead. SourceTrack
  captures each visit and shows which efforts drive conversions, even for direct and organic traffic."
- **Feature names are outcomes, not features.** "Tie every booking back to the original source" beats
  "Meeting integration."
- **The "fourth option" frame** (SourceLoop): name 3 inadequate categories (free analytics / form
  trackers / enterprise), then be the escape. Devastatingly effective. §7.4.
- **Cometly's contribution:** eyebrow → massive headline typography, dark closing sections, "What you
  actually get" framing. Your `design.md` already specs this; make sure the rebuild uses it.

### 7.3 What to DELETE from SourceLoop's playbook (traps)
- **"GDPR compliant: Yes."** They assert it flatly in their FAQ. **You CANNOT** (§5 / repo do-not-build).
  Use "privacy-conscious, GPC/DNT honored, EU-resident data" — and note this is a place you're MORE
  honest, which is on-brand.
- **Favicon hotlinking** (`google.com/s2/favicons`) — self-host brand SVGs in `dashboard/public/logos/`.
  For a privacy product, sending every visitor's request to Google is a screenshot-able contradiction.
- **Fake-scale social proof** if you can't back it.
- **CRM-sync / call-tracking / chat-tracking hero real estate** — they have these; you don't. Don't
  build sections around capabilities you lack. Your Track→Attribute→Prove must feature what you SHIP.

### 7.4 The comparison table — build this, five columns
SourceLoop's four (Free analytics / Form trackers / Enterprise / SourceLoop). **Add the fifth they
can't occupy.** Rows: lead source on every conversion · full multi-touch journey · **SEO keyword→
revenue** (only you) · **EU data residency** (only you) · AI-referral detection · privacy (GPC/DNT) ·
setup in minutes · starting price. SourceTrack column wins on the two bold rows nobody else has.

### 7.5 "Things you won't hear anymore" — steal this exactly (it's format, not claim)
Scrolling chat bubbles of real internal pain: *"Where did the Acme deal come from??"* · *"This lead
has no source... again 🙃"* · *"What's our true cost per qualified lead?"* Zero data, pure empathy,
instantly relatable to a founder. Cheap to build, high emotional hit. **Adapt with founder-specific
pain:** *"Is my SEO actually making money or just traffic?"* *"That signup says Direct — but from
where?"* *"Did ChatGPT send that customer?"* (the last one is your wedge, as a pain nobody else answers).

### 7.6 Before/After closer — yours beats theirs
SourceLoop: "Without → Unknown / With → Paid Social." **Yours: "Without → Direct / With → ChatGPT →
2 blog visits → $2,000 sale."** Same format, but your "With" shows the AI touch + the revenue + the
chain — the three things their version doesn't. This is the single highest-leverage visual on the site
and it IS the Direct-Rescue story (`docs/SourceTrack_GTM.md` §4 Tier 1). Build it as a hand-coded
mockup (no seed needed).

---

## PART 8 — SCREENSHOT SYSTEM (make the app look 10x better on the web)

SourceLoop's "screenshots" are the reason their site feels premium. The trick, dissected:

### 8.1 They use TWO kinds of visual, and only one is a real screenshot
- **Real dashboard captures** (`user-journey-tracking.webp`, `traffic-attribution.webp`,
  `path-to-conversion.webp` …) — actual product, but **seeded with clean fake data** (Alex Morgan,
  Sarah Chen, $1,247.00 Stripe payments, 1,209 leads). The data is fabricated-for-demo but the UI is
  real. **This is why they look good: real UI + curated data + one hero number.**
- **Hand-built HTML/CSS mockups** (the form card, the chat card, the payment card, the CRM
  field-mapping) — NOT screenshots at all. Pure markup. Always crisp, no seed, editable in code.

### 8.2 The hard dependency (unchanged, decisive)
You have **5 test conversions, 2 defective.** You CANNOT screenshot the real dashboard credibly today.
SourceLoop's captures work because of a **seeded demo tenant** with dozens of clean journeys. **The
seed is the gating asset for every real screenshot.** Reconsider it as a standalone task (it's
separable from the no-login demo UI you skipped). Full spec: [`demo_seed_spec.md`](demo_seed_spec.md).

### 8.3 The 10x-polish recipe (what makes a raw capture look premium)
Applies once the seed exists:
1. **Seed clean, realistic data** — recognizable names, round-ish revenue numbers, a ChatGPT touch in
   every hero journey (it's your differentiator — put it in frame).
2. **One big hero number per shot** — "1,209 leads captured", "$24,180 revenue" — SourceLoop leads
   every capture with one bold metric. Draws the eye.
3. **Crop tight to the story** — never a full browser chrome. Show the panel that proves the point.
4. **Consistent frame treatment** — rounded corners, soft shadow, the lime radial glow your hero
   already uses (`HeroSection` has it). One visual language across all shots.
5. **Annotate sparingly** — a single callout arrow/label on the touch that matters ("← ChatGPT
   referral"). SourceLoop does this on the journey panel.
6. **Retina/2x export**, `.webp`, lazy-loaded. SourceLoop serves `.webp` throughout.
7. **`og:image`** = the best of these (currently `og-image.png` — refresh it with a real seeded shot).

### 8.4 Build order for visuals
1. **Mockups first (unblocked TODAY):** Before/After (§7.6) · Track/Attribute/Prove feature cards ·
   install-snippet card · comparison table. All hand-coded, no seed.
2. **Seed the demo tenant** (gating task — decide separately).
3. **Real captures (after seed):** home hero journey panel (the money shot) · SEO keyword→revenue
   table (your uncontested surface — most important real screenshot) · attribution dashboard · AI
   sources tab · Report Builder.
4. **Refresh `og:image`** with the hero journey capture.

### 8.5 Priority shot — the one that sells
The **home-hero Lead Journey panel** showing a full touch chain ending in a ChatGPT-sourced sale with
revenue. It's your `/explain` output, it's what Observix can't do, it's the Before/After payoff, and
it's the `og:image`. If only one real screenshot gets made, it's this one. **Blocked on the seed.**

> ⚠️ **Do NOT screenshot Campaigns** until KI-53/KI-51 resolve (it serves 1 of 4 dimension tabs on
> UTC, 0 on non-UTC).

---

## PART 9 — PAGE-BY-PAGE SEO SPEC (keywords · title · meta · structured data)

Derived from the top-pages data (Appendix A.3): the pages below are ordered by the **priority the
competitor traffic evidence supports**, not by ease. Titles ≤60 chars, descriptions ≤155 chars
(Google's practical truncation points — verify against current SERP rendering, these limits drift).

> **Truth-gate every claim against `docs/SourceTrack_GTM.md` §5 before publishing.** No "GDPR
> compliant", no "native Shopify/Stripe", no production-Stripe implication, no exact
> keyword/prompt attribution. Where a page below implies a metric (revenue, ROAS), the data-truth
> rules (§5.1–5.4 of design.md) gate whether it renders.

### Tier 1 — Educational blog (the proven non-brand engine)

These mirror Attribution.app's and Triple Whale's actual top earners. Each is an attribution-concept
explainer where practitioner depth beats volume content.

**`/blog/first-touch-vs-last-touch-attribution`**
- Primary kw: `first touch vs last touch attribution` · secondary: `attribution models comparison`
- Title: `First-Touch vs Last-Touch Attribution: Which to Use (2026)`
- Meta: `See how first-touch and last-touch attribution split the same sale differently — with a worked example across all 9 models. No jargon.`
- Structured data: `Article` + `FAQPage` (3–4 Q&As) + `BreadcrumbList`

**`/blog/multi-touch-attribution-models`** (mirrors Attribution.app `/blog/position-based-attribution-model`, 43)
- Primary: `multi-touch attribution models` · sec: `position based attribution`, `time decay attribution`
- Title: `Multi-Touch Attribution Models Explained (With Real Math)`
- Meta: `Linear, time-decay, position-based, U-shaped — how each credits a real 5-touch journey, and when each is honest to use.`
- Structured: `Article` + `FAQPage` + `HowTo` (choosing a model)

**`/blog/probabilistic-vs-deterministic-attribution`** (Attribution.app's #2 page, 205)
- Primary: `deterministic vs probabilistic attribution`
- Title: `Deterministic vs Probabilistic Attribution: A Clear Guide`
- Meta: `What each method actually knows, where each guesses, and why "probabilistic" often means "modeled." Written by people who build it.`
- Structured: `Article` + `FAQPage`

**`/blog/revenue-attribution`** (Attribution.app 117)
- Primary: `revenue attribution` · sec: `marketing revenue attribution`
- Title: `Revenue Attribution: Tie Marketing to Actual Dollars`
- Meta: `Connect campaigns, sources, and journeys to real revenue — not clicks. How revenue attribution works and where it breaks.`
- Structured: `Article` + `FAQPage`

**`/blog/how-to-track-chatgpt-traffic`** (differentiation, not volume — AI-referral = 0 search traffic)
- Primary: `how to track chatgpt traffic` · sec: `ai referral tracking`, `perplexity traffic`
- Title: `How to Track ChatGPT & AI Traffic to Your Site (2026)`
- Meta: `AI tools send traffic your analytics logs as "Direct." Here's how to detect ChatGPT, Perplexity, Claude, and Gemini referrals.`
- Structured: `Article` + `FAQPage` + `HowTo`

**`/blog/cookieless-attribution`** (genuine SourceTrack strength; `cookieless attribution` ranked for both keyword competitors)
- Primary: `cookieless attribution` · sec: `cookieless tracking`
- Title: `Cookieless Attribution: Track Journeys Without Cookies`
- Meta: `How first-party, cookieless attribution follows the path to conversion while honoring GPC/DNT — no fingerprinting.`
- Structured: `Article` + `FAQPage`

*(Then expand: `/blog/what-is-a-good-conversion-rate`, `/blog/whats-a-good-roas` — Triple Whale's top
earners — only if truthful without cost data; ROAS content must not imply SourceTrack computes ROAS
without ad-cost import. Gate per §5.3.)*

### Tier 2 — Attribution category pages (small high-intent pool, Part 4 target #2)

**`/marketing-attribution-software`** (the category's single highest-traffic term across all exports)
- Primary: `marketing attribution software` (1,060 vol) · sec: `attribution software`, `attribution tools`
- Title: `Marketing Attribution Software — Revenue by Source | SourceTrack`
- Meta: `See which sources, campaigns, and AI tools drive real revenue. Multi-touch attribution with a full path for every conversion. From $49/mo.`
- Structured: `SoftwareApplication` + `Product`(offers $49) + `FAQPage` + `BreadcrumbList`

**`/revenue-attribution-software`**
- Primary: `revenue attribution` · sec: `revenue attribution software`
- Title: `Revenue Attribution Software — Campaign to Cash | SourceTrack`
- Meta: `Attribute revenue, not just clicks. Connect Stripe, webhooks, and conversions to the exact source and journey behind each sale.`
- Structured: `SoftwareApplication` + `FAQPage`

**`/lead-attribution-software`**
- Primary: `lead attribution` · sec: `lead source tracking`, `lead attribution software`
- Title: `Lead Attribution Software — Know Every Lead's Source`
- Meta: `Capture form, booking, and signup leads with their true source — even cookieless journeys. Qualify leads without revenue data.`
- Structured: `SoftwareApplication` + `FAQPage`

**`/cookieless-attribution`** (product page variant of the blog post; genuine edge)
- Primary: `cookieless attribution` · Title: `Cookieless Attribution Software | SourceTrack`
- Meta: `First-party attribution without cookies or fingerprinting. GPC/DNT honored. Track the full journey privately.`
- Structured: `SoftwareApplication` + `FAQPage`

### Tier 3 — Feature pages (Silo 2; one hero shot each)

Pattern for all: Title `[Feature] | SourceTrack`, `SoftwareApplication` + `FAQPage`, meta leads with
the outcome not the mechanism. Nine: multi-touch-attribution · ai-referral-tracking (exists) ·
seo-revenue · lead-journey · conversion-tracking · offline-conversions · report-builder · shopify ·
stripe.

**`/ai-referral-tracking`** (exists — upgrade its meta)
- Primary: `ai referral tracking` · sec: `ai search attribution`, `chatgpt traffic tracking`
- Title: `AI Referral Tracking — ChatGPT, Perplexity, Gemini | SourceTrack`
- Meta: `Detect visitors from ChatGPT, Perplexity, Claude, Gemini, Copilot and more. See which AI tools drive leads and revenue.`
- Structured: `SoftwareApplication` + `FAQPage`

### Tier 4 — Commercial / comparison

**`/pricing`**
- Primary: `sourcetrack pricing` · Title: `Pricing — From $49/mo | SourceTrack`
- Meta: `Multi-touch attribution from $49/mo — the lowest entry price in the category. No sales call, no per-seat surprises. 14-day trial.`
- Structured: `Product` + `Offer` (×3 plans) + `FAQPage`. **This is the page that earns "cheapest
  attribution" — state seat policy here.**

**`/compare/ga4`** (exists — rebuild as 5-column, §7.4)
- Primary: `google analytics alternative` (610 vol) · sec: `ga4 alternative`, `ga4 alternatives`
- Title: `SourceTrack vs GA4 — Attribution GA4 Can't Do`
- Meta: `GA4 shows traffic; SourceTrack shows revenue by source with a full path per sale. Compare attribution, privacy, and EU residency.`
- Structured: `Article` + `FAQPage` (comparison tables don't have a clean schema type; use Article)

**Pricing-opacity cluster** (validated — Cometly already runs it): `/compare/cometly-pricing`,
`/compare/hyros-pricing`, `/compare/ruler-pricing`. Title `[Competitor] Pricing Explained (2026)`,
meta publishes the real number, `Article` + `FAQPage`.

### Structured-data rules (apply site-wide)

- **`Organization`** on the homepage: name, logo, sameAs (social), founding info. One per site.
- **`SoftwareApplication`** on every product/feature/category page: `applicationCategory:
  BusinessApplication`, `offers` with the $49 price, `aggregateRating` ONLY if you have real reviews
  (you don't yet — omit until G2/Capterra listings exist; a fake rating is a §5-class lie and a
  Google penalty risk).
- **`FAQPage`** on nearly everything — it's the highest-ROI schema (rich-result eligible, cheap). 3–5
  real Q&As per page, answers ≤ 2–3 sentences.
- **`BreadcrumbList`** on all nested pages (blog, compare, use-cases).
- **`Article`** on blog/guide/compare with real `datePublished`/`dateModified` (keep `dateModified`
  honest — it feeds freshness signals and a stale-but-claimed-fresh date is detectable).
- **`Product` + `Offer`** on `/pricing` only.
- **DO NOT** add `Review`/`aggregateRating` schema until real reviews exist. **DO NOT** add `HowTo`
  to pages that aren't genuinely step-by-step.

### Meta-tag discipline (all pages)

- One `<title>`, one `<h1>`, they may differ (title = SERP, h1 = on-page).
- `<meta name="description">` unique per page — never templated/duplicated (duplicate descriptions are
  a common thin-content signal).
- `og:title`, `og:description`, `og:image` (needs the seeded screenshots, Part 8), `og:type`.
- `twitter:card = summary_large_image`.
- Canonical URL on every page (the SPA→prerender migration is a prime spot for accidental dupes).
- **These only reach crawlers after Phase 0 pre-rendering** — a CSR SPA emits none of this to the
  initial HTML. Part 3 Phase 0 is the hard prerequisite for this entire section.

---

## PART 10 — INTERNAL LINKING (how the silos become topical authority)

> **Provenance:** consolidated from `docs/marketing/seo_content_backlog.md` §10 ("Internal Linking
> Clusters") and `docs/seo/keyword_intent_url_mapping_2026-06-16.md` ("Internal linking plan") on
> retirement of both, 2026-07-22. **Cluster members are re-expressed against the Part 2 silo names** —
> the source docs cited a pre-sitemap URL scheme (`/product/*`, `/guides/lead-source-tracking`,
> `/ecommerce-attribution`) that no longer exists.

~90 pages across 12 silos earn nothing as isolated documents. Clusters are what turn a page count into
topical authority — and per Part 1 #4, ranked position is the only metric that counts.

### 10.1 The linking rule that follows from the data

Appendix A.3 shows the blog is 68–89% of competitor non-brand traffic, while category and feature
pages are the small high-intent pool that converts. So the traffic and the conversion live on
different pages, and the link between them is the whole mechanism:

- **Every Silo 6 blog post links UP to its category page** (Silo 5) and its feature page (Silo 2).
  A blog post that earns traffic and links nowhere commercial is a dead end.
- **Category and feature pages link DOWN to 2–3 supporting blog posts** as depth proof.
- **Never orphan a page.** Anything reachable only from the sitemap is Part 1 #4's dead weight.

### 10.2 The clusters (link every member to every other member)

| Cluster | Members |
|---|---|
| **B2B / lead-gen** | `/use-cases/saas` ↔ `/use-cases/lead-generation` ↔ `/lead-attribution-software` ↔ `/features/lead-journey` ↔ `/features/conversion-tracking` ↔ `/blog/lead-source-tracking` ↔ `/guides/track-utms-in-hubspot-forms` |
| **eCommerce** | `/use-cases/ecommerce` ↔ `/use-cases/shopify` ↔ `/integrations/shopify` ↔ `/integrations/stripe` ↔ `/revenue-attribution-software` ↔ `/blog/revenue-attribution` |
| **AI referral** *(the wedge)* | `/features/ai-referral-tracking` ↔ `/blog/how-to-track-chatgpt-traffic` ↔ `/tools/ai-referral-checker` ↔ `/glossary/ai-referral` |
| **SEO-revenue** *(uncontested — 🔴 gated on the GSC sync)* | `/features/seo-revenue-attribution` ↔ `/integrations/google-search-console` ↔ `/docs/google-search-console` |
| **Cookieless / privacy** | `/features/cookieless-attribution` ↔ `/cookieless-attribution` ↔ `/blog/cookieless-attribution` ↔ `/docs/cookieless-tracking` ↔ `/glossary/cookieless-tracking` |
| **Attribution concepts** *(the engine's spine)* | All Silo 6 Wave-1 posts ↔ `/marketing-attribution-software` ↔ `/attribution-modeling` ↔ `/tools/attribution-model-comparator` ↔ the Silo 10 glossary terms |
| **UTM / forms** | `/guides/utm-tracking` (hub) ↔ all 8 builder guides ↔ `/tools/utm-builder` ↔ `/blog/utm-tracking-guide` ↔ `/glossary/utm-parameters` |
| **Compare / commercial** | `/compare/ga4` ↔ `/marketing-attribution-software` ↔ `/pricing` ↔ the pricing-opacity pages (Silo 11) |

### 10.3 Fixed placements

- **Footer navigation** — direct links to the category pages and the live tool:
  `/marketing-attribution-software` · `/revenue-attribution-software` · `/lead-attribution-software` ·
  `/features/ai-referral-tracking` · `/use-cases/ecommerce` · `/tools/utm-builder`.
- **Homepage features section** → `/features/ai-referral-tracking` and `/marketing-attribution-software`.
- **Solutions/use-cases nav** → `/lead-attribution-software` and `/use-cases/ecommerce`.
- **`/tools/utm-builder` secondary CTA** → `/conversion-tracking-software` (and the Silo 7 hub).
- **Glossary terms** (Silo 10) link out to the feature or blog page that explains them in depth — this
  is what makes the cheap glossary pages worth building.

---

# APPENDIX A — COMPETITOR TRAFFIC EVIDENCE

*The data behind every ranking above. Seven competitor exports (Ahrefs/Semrush, 2026-06-16 / 2026-07-22 / 2026-07-24).*

## A.1 The finding that reframes everything — real traffic data

The Usermaven Ahrefs export is the first **actual traffic** evidence in any of these plans.
Everything prior ranked clusters by "uncontested" or by raw search volume. Neither predicts traffic.
The CSV does. Two numbers change the strategy:

**67% of Usermaven's ranking keywords capture ZERO organic traffic.** `[DATA]`
1,183 of 1,765 keywords rank but pull nothing. Their entire organic footprint — a company with a
years-old content operation — is **3,709 monthly organic visits** across all 1,765 keywords. That is
small. **Ranking is not traffic.** A plan measured in "pages shipped" or "keywords targeted" is
measuring the wrong thing; 67% of the competitor's pages are dead weight.

**Their traffic concentrates in a handful of clusters.** Total organic traffic by cluster: `[DATA]`

| Cluster | Real organic traffic/mo | Top earner |
|---|---:|---|
| Attribution (category terms) | **697** | `marketing attribution software` (83) |
| Calculators / tools | **417** | `ctr calculator` (107), `roi calculator` (44) |
| "X pricing" | 219 | `mixpanel pricing` (66), `amplitude pricing` (53) |
| "X alternatives" | **41** | `ga4 alternatives` (18) |
| AI referral / chatgpt traffic | **0** | *(no such keyword ranks for them at all)* |

**This overturns two earlier conclusions and confirms one:**

1. **"Lead with the pricing cluster" — DOWNGRADED.** Pricing pulls 219, and most of it is *adjacent*
   tools (Mixpanel, Amplitude, Heap), not attribution competitors. Real, but not the lead. The
   *mechanism* (opacity asymmetry — attribution vendors hide prices) still holds and is still worth
   exploiting; it's just not the top traffic source.
2. **"Alternatives is the compounding engine" — DOWNGRADED HARD.** Alternatives pulls **41 total**.
   SourceLoop's 21 alternatives pages and Usermaven's whole alternatives cluster are mostly the 67%
   dead weight. This is a real correction: alternatives pages are cheap to write and rank easily
   *because nobody clicks them*.
3. **Calculators/tools — CONFIRMED as a real volume pool** (but see A.3, which demotes them on
   *ranked* traffic). `utm builder` alone is 22,970 volume; `ctr calculator` drives 107 actual visits;
   `roi calculator` 44; `cpm calculator` 12,390 volume. This matches the independent keyword analysis
   in Appendix B (UTM Builder 23,990, Calculators 18,130) — two separate data sources agree.

## A.2 Cometly's export (3,416 keywords) — a second data source, and it agrees `[DATA]`

Cometly captures **14,259 organic visits/mo** — ~4× Usermaven — but the shape is the lesson, not the
size. **48% ranking-but-zero-traffic** (1,643 of 3,416): the dead-weight pattern holds at a second,
larger competitor.

**Where Cometly's traffic actually comes from — and most of it is NOT attribution:** `[DATA]`

| Cometly cluster | Real traffic/mo | Note |
|---|---:|---|
| **PPC / ad management** | **2,582** | `ppc management services` (932) is their #1 term by 2× |
| Attribution (our category) | 1,709 | `marketing attribution software` (180) |
| Reporting / dashboards | 978 | `client reporting dashboard` (101) |
| SEO / keyword | 746 | |
| Pricing | ~110 | `cometly pricing` (73) — their OWN brand |
| Alternatives | 114 | |
| Calculators/tools | 197 | far weaker than Usermaven's 417 |

**Three things this settles:**

1. **Even Cometly's biggest traffic driver is off-category** (`ppc management services`, 932 —
   agency/services intent, not attribution software). Their real attribution-category traffic (1,709)
   is only marginally above Usermaven's (697) despite 4× total footprint. **The attribution category
   itself is low-traffic across the board** — which means Part 4 target #2 (attribution category pages)
   is about *winning a small, high-intent pool*, not chasing volume. Set expectations accordingly:
   these pages convert, they don't flood.

2. **The GSC / AI gap is now confirmed at BOTH competitors.** `[DATA]` Cometly ranks for **zero**
   chatgpt / AI-referral / search-console / SEO-revenue terms — the single hit is `ai search
   visibility` at position ~40 pulling 1 visit. Two independent exports, same void. The one
   uncontested surface (GSC keyword revenue) is uncontested in the *keyword data*, not just the UI.

3. **The pricing-opacity play is VALIDATED by their own footprint.** `[DATA]` Cometly ranks for
   `wicked reports pricing`, `rockerbox pricing`, `northbeam pricing`, `triple whale pricing`,
   `adobe analytics pricing` — i.e. **Cometly already farms competitors' pricing keywords.** A
   sophisticated competitor is doing exactly this play. That's corroboration the mechanism works —
   but also means it's not unclaimed; you'd be entering a lane Cometly already runs. Still worth it
   (different competitor set, and you can publish YOUR number where they won't), just not virgin.

**Net:** the two exports agree on everything that matters. Attribution category = small but ours to
win. AI/GSC = genuinely empty in the data, not just the product. Alternatives = near-worthless.
Nobody should measure this plan in page count.

## A.3 Top-PAGES exports (4 competitors) — this CORRECTS A.1/A.2 `[DATA]`

The keyword CSVs showed which *terms* rank. These four top-pages exports (Triple Whale, Mixpanel,
Hyros, Attribution.app — 1,300+ pages with per-page traffic + dollarized value + page type) show which
*page structures* actually earn. They are more decision-relevant, and they move the conclusion.

**Traffic by page type, per competitor:** `[DATA]`

| Competitor | Total/mo | Homepage/brand | Blog/guide | Pricing | Tools | Compare/alt |
|---|---:|---:|---:|---:|---:|---:|
| Mixpanel | 182,591 | 74.5% | **17.4%** | 0.7% | 0.1% | 0.2% |
| Triple Whale | 23,599 | 53.9% | **35.0%** | 2.8% | 1.7% | 0% |
| Hyros | 10,246 | 88.4% | 0% | 4.4% | 0% | 0.1% |
| Attribution.app | 3,232 | 62.0% | **33.8%** | 0.2% | 0% | 0.6% |

**The correction: for the three that have any non-brand traffic at all, BLOG/GUIDE content is 68–89%
of it — not tools.** `[DATA]`

- Triple Whale: blog = 76% of non-brand traffic. Their top non-brand pages are educational, NOT tools:
  `/blog/what-is-a-good-conversion-rate` (650), `/blog/whats-a-good-roas` (371),
  `/blog/marketing-efficiency-ratio` (387), `/blog/customer-retention-rate` (224).
- Attribution.app (closest analog to us — a pure attribution tool): blog = **89%** of non-brand.
  Winners: `/blog/probabilistic-vs-deterministic` (205), `/blog/mobile-attribution` (138),
  `/blog/revenue-attribution` (117), `/blog/data-driven-attribution` (49),
  `/blog/position-based-attribution-model` (43). **Every one is an attribution-concept explainer.**
- Mixpanel: blog = 68% of non-brand; `/blog/churn-analytics` alone pulls **14,705** — more than Triple
  Whale's entire site.
- Hyros: 88% brand, near-zero content, and correspondingly tiny non-brand traffic (1,185). The
  no-content strategy = no organic engine.

**This does NOT fully negate the tools finding — it reframes which data to trust for what:**
- The *keyword* CSVs (Usermaven/Cometly) showed high *volume* on tool terms (`utm builder` 22,970).
  Volume is real, but these top-PAGES exports show tools rarely convert that volume into *ranked
  traffic* for these competitors (0–1.7%). Tool terms are contested by Google's own free tools and
  dozens of incumbents, so ranking is hard even when volume is high.
- The **educational blog cluster is where attribution competitors actually earn non-brand traffic**,
  and it's specifically **attribution-concept explainers** — the exact content a practitioner-led
  product can write with genuine depth, and the exact content a volume mill produces badly.

**Revised priority (this supersedes A.1's ordering, and is what Part 1 #3 locks):**
1. **Educational blog — attribution-concept explainers.** The proven non-brand engine (68–89%).
   Highest confidence, directly plays the practitioner-depth advantage.
2. **Attribution category pages** (still target #2; small high-intent pool).
3. **Tools/calculators** — high volume but hard to rank and low observed page-traffic; build the
   1–2 best (UTM builder exists; add attribution-model comparator as a *differentiated* tool, not a
   commodity calculator). Demoted from "engine" to "supporting asset + internal-link hub."
4. Pricing cluster, then cheap alternatives — unchanged, low.

**Two structural facts worth carrying:**
- **Homepage/brand is 54–88% of ALL competitor traffic.** Once you have brand demand, the homepage is
  the biggest single earner. At zero brand awareness you have none of this — which is *why* the blog
  engine matters: it's the only non-brand traffic source that works, and it seeds brand over time.
- **Hyros is the control case:** 88% brand, no blog, no tools → no organic engine beyond its name.
  Proof that skipping content caps you at brand-demand traffic. Do not be Hyros.

## A.4 Attributer's export (1,370 keywords) — a seventh source, and it corroborates `[DATA]`

Attributer.io's organic keyword export adds a seventh competitor, and it moves nothing — which is the point. It makes three points, none redundant with A.1–A.3.

1. **The ranking≠traffic pattern holds a SEVENTH time.** `[DATA]` Attributer ranks for **1,370 keywords** and captures just **329 organic visits/mo** total — the same shape as Usermaven (67% zero-traffic) and Cometly (48%): a large ranked footprint pulling almost nothing. This *strengthens* the locked A.1/A.3 finding; it does not change it. Seven exports, one verdict — nobody measures this plan in page count.

2. **First direct ranked-traffic evidence that Silo 7's hidden-fields play earns.** `[DATA]` Silo 7 previously rested on SourceLoop's *pattern* plus inference. Attributer actually RANKS on the hidden-field sub-cluster with tiny pages: `typeform hidden fields` (12, pos 5.9), `contact form 7 hidden field` (9, pos 4.5), `hidden fields typeform` (4). Small but real — and it maps directly onto a SourceTrack capability that is **shipped and verified live** (form auto-fill into hidden fields, confirmed on prod 2026-07-24), so the guide topic and the product back each other. Build the hidden-field guides knowing they earn.

3. **A weak-but-real signal on Silo 7's ICP-builder question — still UNCONFIRMED (Part 6 #1).** `[DATA]` Part 6 flags "which form builders the ICP uses" as a WordPress-heavy *guess*, to confirm from real signups. Attributer earns on **enterprise MAP/CRM** terms the current Silo-7 list omits: `pardot seo` (22, pos 1), `activecampaign google ads integration` (9), `marketo utm tracking` (7). This does **not** resolve the question — confirm it from signup data as the doc already says — but it's a data point to weigh: the ICP may skew more MAP/CRM than WordPress-forms. Hold `pardot` / `marketo` / `activecampaign` UTM-tracking guides as CANDIDATES pending that confirmation, not additions.

*Source: Attributer Ahrefs/Semrush export, 2026-07-24 (summarized in the doc's own words, not committed — licensed SEO-tool export, handled the same as A.1–A.3).*

---

# APPENDIX B — KEYWORD-VOLUME EVIDENCE (raw)

> **Provenance:** the raw cluster table below is retained verbatim from
> `docs/seo/keyword_intent_url_mapping_2026-06-16.md` on that doc's retirement. Its *URL-mapping*
> conclusions are superseded by Part 2 (sitemap) and Part 9 (page specs); the **raw volume data is
> kept because data outlives the doc that interpreted it.** Appendix A supersedes any priority
> ordering implied here — these are search *volumes*, not observed traffic.

**Data sources:** `cometly.com-organic-keywords-subdomains-all_2026-06-16` (Cometly organic keyword
profile) · `usermaven.com-organic-keywords-subdomains-a_2026-06-16` (Usermaven organic keyword
profile).

> [!NOTE]
> **Volume Caveat**: These volumes are raw matched volumes from the uploaded Cometly/Usermaven
> competitor keyword exports. They are not deduplicated total market demand. Some clusters overlap,
> and some keywords are competitor-branded or informational.

**Method:** organic search keywords from primary attribution and analytics competitors were analyzed.
Keywords were grouped into semantic clusters, filtered for search intent, commercial intent (CPC/value
indicators), product relevance to SourceTrack, and product capability truthfulness.

| Cluster | Example keywords | Raw matched volume | Intent | Commercial value | Product fit |
|---|---|---:|---|---|---|
| **UTM Builder** | `utm builder`, `utm creator`, `campaign url builder` | 23,990 | Transactional / Tool | Very High (Lead generation hook) | 🟢 Excellent |
| **Marketing Attribution** | `marketing attribution`, `attribution software`, `attribution tools` | 22,240 | Commercial | Extremely High | 🟢 Excellent |
| **Calculators (ROAS/ROI)** | `roi calculator`, `ctr calculator`, `roas calculator` | 18,130 | Informational / Tool | High (Lead magnet / viral) | 🟡 Good (Ad marketing relevance) |
| **Agency Dashboard** | `client reporting dashboard`, `analytics for agencies`, `client reporting` | 4,960 | Commercial | Very High | 🟢 Excellent |
| **Lead Attribution** | `lead sources`, `lead tracking`, `lead attribution` | 3,490 | Commercial | High | 🟢 Excellent |
| **Conversion Tracking** | `pixel tracking`, `conversion tracking`, `shopify conversion tracking` | 2,520 | Commercial | High | 🟢 Excellent |
| **Revenue Attribution** | `revenue attribution`, `marketing revenue attribution` | 1,110 | Commercial | Very High | 🟢 Excellent (Core Focus) |
| **Ecommerce/Shopify** | `ecommerce attribution`, `shopify tracking` | 820 | Commercial | Very High | 🟡 Moderate (No native Shopify app) |
| **AI Referral Tracking** | `ai referral tracking`, `chatgpt traffic tracking`, `perplexity referral tracking`, `ai search attribution` | 100 | Informational / Emerging | High (Differentiator) | 🟢 Excellent |
| **Calendly/Booking** | `calendly tracking`, `booking attribution` | < 100 | Commercial | High | 🟢 Excellent |

> [!IMPORTANT]
> **AI Referral Cluster Note**: Unrelated competitor-branded keywords (e.g. `maven ai`) have been
> removed from the AI volume calculation to prevent volume inflation. The `/ai-referral-tracking` URL
> stays in the roadmap as a strong differentiation page rather than a volume-first page.

### Durable URL-selection rationale (kept — the reasoning outlives the URL list)

**URLs to avoid, and why:**
1. **`/shopify-attribution`** or **`/shopify-tracking`**: avoid dedicated "Shopify app" pages to
   prevent users from searching the Shopify App Store for an app we don't have. Frame as
   `/ecommerce-attribution` with GTM/snippet installation guides instead.
2. **`/calendly-attribution`**: avoid a standalone landing page; document as a section under
   `/lead-attribution-software` or `/docs` to prevent thin content.

**Deferred, and why:**
1. **`/client-reporting-dashboard`** & **`/agency-attribution-software`**: deferred until agency
   multi-client workspace permissions and client-invite dashboards are fully ready.
2. **`/roas-calculator`** & **`/roi-calculator`**: deferred. Requires standalone interactive math
   components. Only build if implemented as fully functioning tools.

**Risks / truth gates** (these duplicate `docs/SourceTrack_GTM.md` §5 — that doc is authoritative):
- **Shopify Gate**: do **not** claim a "Shopify App Store plugin". All Shopify attribution must be
  described as "installed via custom script tag in Shopify Admin or Google Tag Manager."
- **CRM Sync Gate**: do **not** claim "native Salesforce/Hubspot bidirectional database sync".
  Describe as "attribution stitching that captures click history and forwards attribution metadata to
  form fields."
- **AI Prompt Gate**: we only parse AI referrer domains (e.g. `chatgpt.com`, `claude.ai`). We
  **cannot** access private user prompts inside AI search engines. Frame strictly as "AI referral
  domain attribution."

---

# APPENDIX C — COMPETITOR PRICING & DIFFERENTIATION EVIDENCE

> **Why this is here:** Part 9's `/pricing` spec instructs a writer to publish *"the lowest entry
> price in the category"*, and Part 7.4 specs a five-column comparison table. Both are **claims that
> need evidence**. This appendix carries it so nobody publishes a competitive claim from memory.
> Claims-gating itself stays with `docs/SourceTrack_GTM.md` §5/§5.1 — that doc is authoritative.

## C.1 Pricing (complete) `[C]`

| Tool | Entry | Attribution from | Model |
|---|---|---|---|
| **SourceTrack** | **$49/mo** ($99/yr Founder) | **$49** | flat |
| SourceLoop | $49/mo | $49 | pageview tiers |
| Usermaven | $84/mo | **$199 (Scale only)** | event volume |
| Observix | $149/mo | $149 | unstated |
| Cometly | **$750/mo** | $750 | session |
| Ruler | $400/mo | $400 | visits |
| Hyros | custom | quote | tracked revenue |

**Cheapest multi-touch attribution in the category, tied with SourceLoop.** Factual, defensible,
currently nowhere on the site. Cometly bundles **5 seats into every plan including the $750 floor** —
structurally absurd for a solo founder; state your seat policy on `/pricing` and you win that
comparison without naming anyone.

> ⚠️ Competitor prices are point-in-time (2026-07-22). **Re-verify before publishing** — a stale
> competitor price in public copy is the same class of error as a stale product claim.

## C.2 Confirmed table stakes — NOT differentiators

Do not build a page, section, or comparison row around these as if they were edges.

| Claimed edge | Reality |
|---|---|
| AI referral detection | SourceLoop ships `AI Search · ChatGPT` `[C]`; Observix ships chatgpt/perplexity/gemini as named sources `[C]`. **Table stakes.** And it drives **0 real search traffic** `[DATA]` — a differentiation page, never a volume page. |
| Touchpoint chains | SourceLoop markets a full journey timeline + Paths dashboard `[C]`. **Wedge vs Observix only** (verified absent there), NOT vs SourceLoop. |
| MCP | SourceLoop ships it on the $49 entry tier `[C]`. Catch-up, not a lead. |
| Privacy | **Do NOT publish a privacy advantage vs SourceLoop** — they honor GPC, don't train on data, and their MCP is user-initiated. The Cometly privacy contrast IS safe and documented. (Mirrors `docs/SourceTrack_GTM.md` §3.) |
| "AI insights" chat | Cometly, Usermaven, Observix all claim it; **Observix's returns "Sorry, I encountered an error"** on a basic revenue question `[C]`. Contested and visibly broken — and barred anyway by design-spec §26. |

## C.3 What genuinely survives — verify before publishing

These are the rows that earn the fifth column in the Part 7.4 comparison table.

1. **GSC keyword-level revenue attribution.** No Search Console in SourceLoop's 150-article corpus,
   none in Observix `[C]`. **The only uncontested surface.** 🔴 **GATE:** as of 2026-07-22 the
   automated daily sync works after a reconnect (in-production OAuth app; manual + first daily sync
   succeeded, 39 records) — one clean automated run from "verified automatic." Until that run lands,
   do not build the SEO cluster on top of it.
2. **9 attribution models vs their 7** — verify all 9 actually *serve* before claiming the number
   (KI-53 proves shipped ≠ served).
3. **EU data residency, end to end** — Supabase Ireland + Tinybird europe-west3 + Railway
   europe-west4 `[C]`; competitors' regions unstated. This is the fifth column's second bold row.
   ⚠️ `llms.txt` currently disclaims it with a stale "US-hosted event store" line — fix before
   publishing the claim.
4. **AI *crawler* tracking** (≠ AI referral) — not shipped by anyone but DataFast `[I]`. A category
   bet, not an SEO play (Part 6 seam #2).

### SourceLoop specifics `[C]` — the closest competitor

Astro static · Outrank→Sanity content pipeline `[I]` · ~50 blog posts (a prior teardown recorded 111
posts + 64 form-builder recipes + 29 alternatives + a 500-conversion cap on the $49 plan — **`llms.txt`
may be a curated subset, not a full index; do not trust it for monitoring until verified** `[U]`) ·
14 feature pages · 12 solution pages · 21 alternatives pages · 7 free tools · `llms.txt` +
`llms-full.txt`. Two test posts live in production (`sample-article-title-for-testing`,
`webhook-test-post`) `[C]` — the machine outruns review.

Their four-column comparison table (Free analytics / Form trackers / Enterprise / SourceLoop) is their
sharpest asset. **Build the five-column version** (Part 7.4) — the added column is EU-resident + GSC
keyword revenue, which C.3 #1 and #3 are the evidence for.
