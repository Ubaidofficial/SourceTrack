# SourceTrack - Complete Design & Product Spec

**Version:** 1.4 Agentic setup actions, accent-density ceiling, container variety, illustrative-data disclosure, brand-asset authenticity
**Base spec:** V1 Final, June 2026 + V1.1 design expansion
**Status:** Source of truth for product design, Stitch generation, implementation planning, public website direction, internal Ops Console design, and support-preview safety rules.

---

## 0.1 V1.2 Change Log

This version expands the prior V1.1 design system with the missing product surfaces required for paid-beta readiness and marketing execution:

- Public website and marketing page design direction
- Public no-login interactive product demo rules
- Admin / Ops Console design rules
- Support Preview / read-only operator mode
- Billing / plan screen states
- Production/test data labeling
- Status, incident, and support UI
- Design reference rules for using premium lime-glow SaaS inspiration without copying workflow-builder UI
- Updated V1 customer navigation to reflect the current app structure while preserving scope gates
- Updated required screen inventory for Stitch and implementation planning

## 0.2 V1.3 Change Log

- v1.3: website copy/positioning/SEO now owned by `docs/marketing/`; §29 defers.
- v1.3: §26 gains the lead-intelligence / enrichment prohibitions (§26.1), carried from the retired
  `docs/marketing/seo_content_backlog.md` — this doc's §0 Scope Gate is now the named scope authority
  in `CLAUDE.md` / `AGENTS.md`.
- v1.3: §35.3 logs a 2026-07-30 competitive pattern-validation pass (orchly.ai, sourceloop.ai,
  getsleek.io, Uny Elements). Additive only — it confirms existing §29.2/§35 rules and changes none of
  them. It also states the competitor logo/icon/screenshot prohibition explicitly as a trademark
  constraint, and cross-references a live competitor example of the §26 LLM-analyzer prohibition.

## 0.3 V1.4 Change Log

- v1.4: adds §36, Agentic Actions — MCP-Driven Setup Workflows. Scope: an agent (internal or
  external, via MCP) may *recommend* a setup/connection action (e.g. connect CAPI, connect Shopify);
  the action executes only after explicit owner approval, using the same human-in-the-loop pattern
  already governing every other write path in this codebase. This does **not** amend §26 — "New
  Campaign / ad campaign actions" and all ad-platform write actions remain prohibited exactly as
  written. §36 is additive and deliberately narrow; it is not a general license for agentic write
  access.
- v1.4: §23 Feature Flag Map gains two rows for the above — one for the connection-action capability
  itself, one restating that ad-platform financial actions stay prohibited, so this table remains
  authoritative on the point rather than requiring a cross-reference to §26 to resolve it.
- v1.4 (2026-08-03), doc-drift fix: §25.1's canonical Stitch prompt was still quoting three retired
  pre-v1.3 values — lime `#C8F000`, off-white `#F5F4F0`, and "Inter-style typography". All three
  corrected to match §3.1: `#D2EC2A`, `#F7F4ED` (bone), and Geist. No rule changed — the prompt was
  quoting tokens v1.3 had already replaced, and a generation prompt that names retired tokens
  reintroduces them on every run.
- v1.4 (2026-08-03): §2.6 adds an **accent-density ceiling** (lime ≤ ~15% of a screen, never a
  full-bleed wash or glow behind primary content, computed-contrast check when lime sits behind body
  text). Motivated by a confirmed live violation on the marketing hero — **open, not yet fixed**; see
  the note in §2.6.
- v1.4 (2026-08-03): §2.7 adds **container-shape variety** — consecutive sections may not repeat the
  identical container treatment. PR #583 is named as the shipped reference implementation.
- v1.4 (2026-08-03): §29.8 codifies the **illustrative-data disclosure** pattern already shipped in
  PR #581 — one small muted footer line per page, never a per-card badge — and §26 gains the
  corresponding removal bullet. The rule existed nowhere in this doc before v1.4; it is codified now
  so the per-card badges cannot be silently reintroduced. Enforced by
  `api/tests/key-features-mockups.test.js` and `api/tests/direct-rescue-mockup-fixture.test.js`.
- v1.4 (2026-08-03): §35.4 adds **brand-asset authenticity** — never reconstruct, approximate, or
  extract-and-repurpose a third-party mark; use a plain text label instead. Motivated by two incidents
  on 2026-08-03; resolution for issue #577 was a plain "Perplexity" text label (PR #583).
- v1.4 (2026-08-03): §37.1 gains a **duration-less motion row** for scroll-bound progress fills. Every
  prior row in that table specifies a fixed duration, so PR #582's scroll-scrubbed JourneyMockup trail
  had no citable precedent. §37.2/§37.3 were checked against that implementation and already covered
  it correctly — **no change was needed there**, only the missing row.
- v1.4 (2026-08-03): §37.1 gains the **product-mechanic animation** row — motion on a marketing mockup
  must depict a real, verifiable product behaviour, never decoration disconnected from what the product
  does. It is a constraint on the other §37.1 rows rather than a new motion type. JourneyTrail (PR #571)
  and ModelCompareMockup (PR #576) are named as the compliant-before-the-rule reference implementations.
- v1.4 (2026-08-05): §23's **Dark mode** row amended — the app keeps both themes with the top-bar
  toggle (§4), the **marketing site is light-only with no toggle**. PR #643 is named as the shipped
  reference implementation; it deleted `marketing/src/layouts/components/ThemeToggle.astro` and removed
  it from `Header.astro`. The row previously read *"Full, both app and marketing. Toggle in top bar."*,
  so §23 — which declares itself authority ("if anything conflicts, this table wins") — was asserting
  behaviour `main` no longer ships. §3.3's dark tokens are **unchanged** and remain live for the app;
  the app-side references in §4 (top-bar item 5) and §30.8 were checked and are **not** affected.
  **§29.2 still reads "light-first with a dark toggle" and is contradicted by the same PR — left
  unamended here deliberately, scoped to a follow-up so this row lands alone.**
- v1.4, **OPEN — founder decision required, deliberately not settled here:** glassmorphism. §25.1
  lists it under "avoid" as an AI-generation guardrail; §26, the master V1 prohibited list, does not
  address it in either direction. Needed call: a full V1-wide ban, or a guardrail scoped to
  AI-generated mockups only. Raised when a "liquid glass" card technique was considered and retracted
  without a clear answer either way. Until this is answered, treat §25.1 as binding on generation and
  do not read it as a V1-wide product ban.

---

## 0. Read First - Scope Gate

Every feature, screen, component, metric, and interaction in this document must be interpreted through the scope gate below.

| Scope | Meaning | UI rule |
|---|---|---|
| V1 | Build now. Verified or close to verified. Safe for beta when QA passes. | Active UI allowed. |
| V1.1 | Next milestone. Architecture exists or is planned soon, but needs cleanup, proof, or E2E validation. | Locked, hidden, or future-ready component only. Not active in V1. |
| V2 | Future product direction. Not verified for V1. | Future component library only. Not active V1 navigation or active UI. |

**Core rule:** Design may include V1, V1.1, and V2 components, but shipped UI must stay scoped, gated, and truthful.

**Implementation gate:** Routes, navigation items, cards, buttons, metrics, reports, and actions must be controlled by feature flags, data availability, integration status, account permissions, business type, and rollout scope.

**Do not confuse a designed component with a shipped feature.**

---

## 1. Product Positioning

SourceTrack is a privacy-conscious analytics and attribution product for founders, marketers, and growth teams who want to know what actually drives leads, revenue, and high-quality traffic.

### 1.1 Product pillars

SourceTrack has two major pillars:

1. **Attribution - primary differentiator**
   - Answers: Which sources, campaigns, AI tools, pages, and queries drove leads or revenue?

2. **Lightweight analytics - core secondary pillar**
   - Answers: What is happening on my site: visitors, sessions, pages, devices, countries, conversion events, trends, and recent activity?

### 1.2 Mental model

| Area | User question |
|---|---|
| Analytics | What happened? |
| Attribution | Where did it come from? |
| Journeys | How did it happen? |
| Report Builder | How do I investigate deeper? |
| Integrations | How do I connect more data? |

### 1.3 What SourceTrack is in V1

- Lightweight web analytics for founders and marketers
- Source, campaign, UTM, referrer, and AI-source attribution
- First-touch, last-touch, linear, time-decay, and multi-touch attribution views where supported
- Visitor journey before conversion
- Lead qualification workflow independent of revenue
- Report Builder for saved/pinned attribution and analytics views
- Manual conversion and webhook-based revenue import
- Stripe test-mode attribution beta
- Shopify manual webhook recipe
- Google Search Console SEO revenue attribution beta
- Multi-site portfolio health scan for users with 2+ sites

### 1.4 What SourceTrack is not in V1

- Not a GA4 replacement for exhaustive event exploration or raw analytics debugging
- Not a full BI tool
- Not a campaign management tool
- Not a heatmap/session-recording product
- Not a CRM
- Not a full SEO suite
- Not a native Shopify app in V1
- Not a public report-sharing platform in V1

### 1.5 Safe V1 claims

- See which traffic sources drive conversions
- Track UTMs, referrers, campaigns, click IDs, and AI referrers
- Compare first-touch, last-touch, and multi-touch attribution
- View the journey before each conversion
- Recognize cookieless visitor journeys
- Track AI referrals from ChatGPT, Gemini, Claude, Perplexity, Copilot, and similar sources
- Import conversions through webhooks
- Connect Stripe/payment events in beta/test-mode workflows
- Use manual Shopify webhook recipes
- Connect Google Search Console beta for SEO revenue attribution matched by landing page and date range
- Use lightweight analytics without GA4 complexity

### 1.6 Claims to avoid in V1

- No PII in transit
- Full Stripe production attribution
- Native Shopify integration
- CRM sync
- ROAS reporting unless ad cost data exists
- Full SEO suite
- Rank tracking
- Keyword research
- Site audit
- Backlink data
- Exact person-level Search Console query attribution

---

## 2. Design Principles

### 2.1 Personality

- Precise, not flashy
- Fast, not heavy
- Trustworthy, not inflated
- Minimal, not empty
- Premium, not decorative
- Founder-readable, not analyst-only

Copy voice = practitioner specificity, not hype — see the voice rule in `docs/SourceTrack_GTM.md`.

### 2.2 Visual target

SourceTrack should feel like a premium 2026 attribution and analytics cockpit:

- Calmer than GA4
- Lighter than Cometly/Usermaven
- As simple as DataFast/PiQo
- More distinctive through AI attribution, source chips, GSC revenue signals, journey stories, and clean analytics

### 2.3 5-second rule

Every primary screen must answer one main question in five seconds.

Examples:

- Dashboard Overview: Is growth working, and where did it come from?
- Attribution: Which source/page/query drove revenue or leads?
- All Leads: Who converted, from where, and are they qualified?
- Journey Panel: What path did this visitor take before converting?
- Report Builder: What custom view should I investigate or save?

### 2.4 Revenue and conversion hierarchy

When available, revenue and conversions visually dominate.

Secondary metrics like sessions, pageviews, clicks, impressions, CTR, position, device, and country should be quieter but still polished.

### 2.5 Analytics should be first-class

Analytics is not an afterthought.

Analytics components must be polished, compact, and useful. They should include traffic trends, top pages, source analytics, conversion events, devices, countries, browsers, recent activity, sparklines, inline bars, and Report Builder analytics templates.

### 2.6 Accent-density ceiling

Lime is a **signal**, and a signal stops signalling once it covers the screen. §3.1 already says the
warmth lives in the neutrals rather than the accent; this is the quantitative form of that rule.

> Lime may cover at most **~15% of any single screen's visible area**, and **never as a full-bleed
> background wash or glow behind primary content**. Acceptable uses: a badge, a button, a highlighted
> line, a chart's winning data point. If lime sits behind body text, **verify computed WCAG AA
> contrast before shipping — do not eyeball it.**

Note that §29.2 permits "soft lime glow behind the product preview" — behind the *product preview*, a
bounded object, is not the same as behind the page. A glow that reads as page background violates this
ceiling regardless of how soft it is.

**Open violation (confirmed via screenshot, 2026-08-03) — not yet fixed.** The live marketing hero's
background glow covers roughly 70–80% of visible area, and white text sits on a bright-lime highlight
block at a computed contrast below AA. This is the motivating case for the rule and is tracked as a
follow-up task; it is recorded here as an open defect, not as a shipped example.

### 2.7 Container-shape variety

> **Consecutive sections must not repeat the identical container treatment back-to-back.**

A page built from one repeated card shape reads as a template regardless of how good the individual
card is. Vary the frame, not just the contents.

**Reference implementation — PR #583, merged 2026-08-03.** Cite this ordering when building new
marketing sections:

| Order | Section | Container treatment |
|---|---|---|
| 1 | Hero | Window-frame card |
| 2 | TrustBar | Full-bleed contrast band |
| 3 | DirectRescueShowcase | Full-bleed dark section |
| 4 | JourneyShowcase | Window-frame mockup |
| 5 | ProofStrip | Frameless grid with accent border |
| 6 | IconTrio | Single divided feature band — **not** three discrete cards |
| 7 | ComparisonTable | Table card |

---

## 3. Canonical Design System

There must be one SourceTrack design system. Do not create alternate palettes, alternate typography systems, or duplicate design directions.

### 3.1 Core identity

| Token | Value |
|---|---|
| Product name | SourceTrack |
| Mark | Two lime discs on a warm-ink rounded square. Large disc upper-right, small disc lower-left. |
| Ink (structure / dark canvas) | `#12100C` |
| Bone (light canvas) | `#F7F4ED` |
| Paper (card surface, light) | `#FFFDF8` |
| Accent — signal | `#D2EC2A` |
| Accent — counterweight | `#FF7A33` |
| Bridge (gradient only) | `#F2A93B` |
| Primary text, light | `#161310` |
| Primary text, dark | `#F6F3EB` |
| Border, light | `#E7E0D2` |
| Border, dark | `#302B22` |
| Body font | Geist, self-hosted (SIL OFL 1.1). Single family across app, marketing and docs. |
| Display font | Geist, headings at −0.03em tracking. |
| Mono font | Geist Mono |
| Sidebar | Fixed 210px in V1 |

**The warmth lives in the neutrals, not the accent.** Cool black plus acid green is the most-copied AI-startup theme in circulation. Warming the body, card, border and muted-text values is what makes the same lime read as expensive rather than cheap. Do not "warm up" the accents to compensate — warm the surround.

### 3.2 Light mode tokens

```css
:root{
  --color-bg:#F7F4ED;
  --color-bg-2:#F1EDE3;
  --color-surface:#FFFDF8;
  --color-border:#E7E0D2;
  --color-divider:#F0EADC;

  --color-text:#161310;
  --color-text-muted:#6E675C;
  --color-text-faint:#A39B8C;

  --color-accent:#D2EC2A;
  --color-accent-hover:#BCD41C;
  --color-accent-text:#12100C;      /* only legal text colour on a lime fill */
  --color-accent-subtle:rgba(210,236,42,.13);

  --color-spend:#FF7A33;            /* cost, paid media, caution */
  --color-spend-text:#B4420E;       /* orange as TEXT, light backgrounds only */
  --color-spend-subtle:rgba(255,122,51,.10);
  --color-bridge:#F2A93B;           /* gradient midpoint only — never a solid */

  --color-danger:#C4381C;
  --color-danger-subtle:rgba(196,56,28,.08);

  --shadow-sm:0 1px 2px rgba(30,24,12,.04);
  --shadow-md:0 8px 20px -10px rgba(30,24,12,.18);
  --shadow-lg:0 22px 48px -28px rgba(30,24,12,.26);

  --radius-sm:5px; --radius-md:9px; --radius-lg:13px; --radius-full:999px;

  --font-body:'Geist','Inter',system-ui,sans-serif;
  --font-display:'Geist','Inter',system-ui,sans-serif;
  --font-mono:'Geist Mono','JetBrains Mono',monospace;

  --text-xs: 0.6875rem;
  --text-sm: 0.75rem;
  --text-base: 0.8125rem;
  --text-md: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.125rem;
  --text-2xl: 1.375rem;
  --text-3xl: 1.75rem;
  --text-hero: 2rem;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
}
```

Type scale and spacing scale from v1.2 §3.2 are unchanged and carry over.

### 3.3 Dark mode tokens

```css
[data-theme="dark"]{
  --color-bg:#12100C;
  --color-bg-2:#1B1811;
  --color-surface:#1B1811;
  --color-border:#302B22;
  --color-divider:#241F17;

  --color-text:#F6F3EB;             /* never #FFFFFF over warm ink */
  --color-text-muted:#A79E8C;
  --color-text-faint:#6E6656;

  --color-accent:#D2EC2A;
  --color-accent-hover:#BCD41C;
  --color-accent-text:#12100C;
  --color-accent-subtle:rgba(210,236,42,.12);

  --color-spend:#FF7A33;
  --color-spend-text:#FF7A33;       /* orange IS legal as text on ink */
  --color-danger:#F0563A;

  --shadow-sm:0 1px 3px rgba(0,0,0,.45);
  --shadow-md:0 10px 26px -12px rgba(0,0,0,.6);
  --shadow-lg:0 28px 64px -32px rgba(0,0,0,.7);
}
```

### 3.4 Four hues, and only four

This supersedes the source/channel colour block in v1.2 §3.4.

| Meaning | Token | Applies to |
|---|---|---|
| Revenue, earned, organic, positive, brand | `--color-accent` | KPI emphasis, revenue series, primary buttons, active-nav rule |
| Spend, cost, paid media, caution, negative delta | `--color-spend` | Spend series, paid chips, cost-metric labels, warning states |
| Destructive only | `--color-danger` | Delete, erase, danger zone. Nothing else. |
| Everything else | warm neutrals | All structure, text, borders, and volume metrics |

**Success is lime, not green.** You already own a colour that means "good"; a second one is pure noise. There must be no separate success green, no terminal green, no info blue, no purple, and no slate in the shipped app.

Third-party **brand** colours are the one exception and are not part of this palette: source rows and integration cards use the real logo of the service (Google, ChatGPT, Stripe, Shopify, LinkedIn, and so on). Those are identity, not styling.

> **Implementation note.** Bundle third-party logos as local SVG or PNG assets. Do not hot-link a favicon service. A privacy-conscious product making a third-party request per table row is a contradiction a competitor will point at.

### 3.5 Gradient

The gradient is ambient light, not a colour ramp. It is the highest-risk element in the system.

**Correct:** three overlapping radial gradients, lime → amber → orange, peak opacity ≈ 22%, long falloff, bleeding off the top edge of a warm-ink band.

**Wrong:** a two-stop `linear-gradient(lime, orange)`. It crosses the muddy zone between the two hues, has a visible direction, and reads as a sports drink.

```css
--gradient-ambient:
  radial-gradient(44% 42% at 17% 0%, rgba(210,236,42,.22) 0%, rgba(210,236,42,0) 65%),
  radial-gradient(42% 40% at 48% -6%, rgba(242,169,59,.15) 0%, rgba(242,169,59,0) 69%),
  radial-gradient(40% 40% at 79% 3%, rgba(255,122,51,.13) 0%, rgba(255,122,51,0) 71%);
```

Rules:

- **Warm ink only.** On bone it reads as a stain.
- **One instance per viewport.** Two visible at once is clutter.
- Permitted: marketing hero, one product band, the final CTA, the in-app AI attribution card, OG images.
- Forbidden: behind body text, inside cards, on buttons, on charts, or as a text fill.
- Never a hard edge, never a visible angle.

### 3.6 Contrast rules

Lime and orange are surfaces you place dark text on, or inks you use on warm ink. **They are never text colours on a light canvas.**

| Pair | Ratio | Verdict | Use |
|---|---|---|---|
| ink on lime | ~14.4:1 | AAA | Primary button, KPI emphasis |
| lime on ink | ~14.4:1 | AAA | Eyebrows, accents on dark |
| lime on paper | ~1.3:1 | **Fail** | Never — fills only |
| orange on paper | ~2.6:1 | **Fail as text** | Bars, dots, marks only |
| orange on ink | ~6.7:1 | AA | Orange text is legal here |
| `#B4420E` on paper | ~5.2:1 | AA | Orange text on light |

Ratios are WCAG 2.1 relative-luminance calculations, not output from an audit tool. Re-run them before they inform an accessibility statement.

### 3.7 The dot system

The mark is a first touch and a last touch. Extend that geometry rather than decorating around it.

- **Attribution trail** — touchpoints render as dots on a hairline. First touch small, last touch large. Only the converting touchpoint takes lime; earlier touchpoints keep their channel identity.
- **Source chip** — a dot prefix where no brand logo exists. Paid sources take orange, matching the chart rule.
- **Loader** — two dots, the small one settling toward the large. Suppressed under `prefers-reduced-motion`.
- **Empty state** — one dot on a hairline: one touchpoint, no path yet.

### 3.8 Do not use

- `#C8F000` (superseded by `#D2EC2A`), `#C5E838` (stale), `#8F2FFE`, `#DF53FE`, `#0E0912`
- Pure `#FFFFFF` text or pure `#000000` surfaces
- Cool greys (`#E5E7EB`, `#B9B7BA` and similar) anywhere
- White-alpha borders (`rgba(255,255,255,.06)`) over warm ink — they read blue
- Purple gradients, glassmorphism, decorative blobs, multiple palettes
- Manrope as the product font, 260px sidebar, "Attribution Cockpit" or any other product name
- Gradient applied to text
- Case sensitivity: any mechanical colour or token replacement must be
  case-insensitive. `#1a1d1d` and `#1A1D1D` are the same colour and a
  case-sensitive pass silently misses the lowercase sites.

---

## 4. Layout, Navigation, and Shell

### 4.1 V1 shell

```text
TOP BAR: 56px sticky
SIDEBAR: 210px fixed/sticky
MAIN CONTENT: scrollable content region
```

Sidebar is fixed at 210px in V1. It does not collapse, auto-hide, or become an icon rail. Auto-hide rail is V2.

### 4.2 Top bar V1

Left to right:

1. Search box - opens filtered lead search in V1
2. Spacer - no breadcrumbs in V1
3. Date range selector
4. Export CSV button - contextual per page
5. Dark mode toggle
6. User avatar and dropdown

Do not show in V1:

- Notification bell
- Command palette UI
- Breadcrumb stack
- Top-bar tabs

### 4.3 Date range options

- Today
- Yesterday
- Last 24h
- Last 7 days
- Last 30 days
- Last 90 days
- This month
- Last month
- Custom range

### 4.4 V1 customer sidebar

The active V1 customer shell should stay lightweight, but it must reflect the current product reality: setup, analytics, attribution, leads, campaigns, reports, integrations, and settings are all first-class customer workflows.

```text
SourceTrack [logo]
[Site switcher dropdown]
-------------------------
SETUP
  Setup
-------------------------
INSIGHTS
  Dashboard
  Analytics
  Attribution
  All Leads
  Campaigns
  Report Builder
-------------------------
CONNECT
  Integrations
  Settings
-------------------------
  Log out
```

Final V1 customer navigation:

1. Setup
2. Dashboard
3. Analytics
4. Attribution
5. All Leads
6. Campaigns
7. Report Builder
8. Integrations
9. Settings

Rules:

- Dashboard remains the command-center home.
- Analytics is lightweight site behavior analytics.
- Attribution is conversion/source attribution.
- Journeys live inside lead/person-level detail and dashboard journey surfaces, not as a heavy default sidebar item.
- AI Sources should remain an attribution/source surface unless there is a strong product reason to promote it.
- Setup may remain visible because installation health is a core paid-beta support workflow.
- Keep navigation labels plain and founder-readable.

Do not add V1 sidebar items for:

- SEO
- Live map
- Alerts
- Team
- API playground
- Funnels
- Cross-site reports
- Public reports
- CRM
- Cost imports
- AI assistant
- Agency command center
- Notification center
- Command palette

### 4.5 All Sites access

All Sites is account-level, not a permanent site-level sidebar item.

- 1 site: skip All Sites and go directly to site Dashboard
- 2+ sites: show All Sites after login
- Accessible later from site switcher dropdown via "All Sites"

---

## 5. Data Truth and Feature Gating

### 5.1 Universal data truth rules

Always obey:

- Do not show revenue unless revenue data exists
- Do not show event value unless event value exists
- Do not show ROAS, CPL, or CAC unless cost data exists
- Do not show fake zeros
- Hide AI metrics when AI attribution data does not exist
- Hide GSC metrics when GSC is not connected
- Lead qualification works without revenue
- Qualified, MQL, SQL, and Unqualified are workflow signals, not revenue signals
- GSC query revenue must be labeled as estimated
- No raw technical errors in user-facing UI by default

### 5.2 Revenue visibility

Revenue may appear only when one of these exists:

- Stripe beta/test-mode data
- manual webhook conversion value
- manual conversion API value
- Shopify manual webhook order value
- verified revenue source
- imported event value

When revenue does not exist:

- hide revenue cards
- hide revenue columns
- hide AOV/MRR where not computable
- use leads/conversions as primary outcome
- never show `$0` as a placeholder

### 5.3 Cost metric visibility

Cost metrics require ad cost data for the selected date range.

Cost-gated metrics:

- ROAS
- CPL
- CAC
- Ad spend
- Budget
- Spent
- Net profit
- Payback period

When cost data does not exist:

- hide columns entirely by default
- show a one-line explanation only if user tries to select the metric
- do not show disabled clutter
- do not show zero or dash placeholders

### 5.4 GSC truth labels

Required wherever GSC query/page revenue appears:

> Matched by landing page and date range. Query revenue is estimated.

Additional GSC truth labels:

- Revenue data requires SourceTrack conversions or Stripe/webhook revenue.
- Search Console data is matched by landing page and date range, not exact visitor identity.
- Query-level revenue is estimated from matched landing-page conversions, not direct visitor identity.
- Search Console data may lag by 2-3 days.
- Google may omit anonymized or rare queries.
- Daily Search Console data may use Google's reporting timezone; SourceTrack conversions use your site timezone.

---

## 6. Metrics Catalog

This is the canonical metrics catalog for dashboards, tables, Report Builder, and component design.

### 6.1 Traffic analytics metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Visitors | Unique visitors detected for the selected period | Always when tracking data exists | Prefer for founder-facing overview |
| Sessions | Grouped visits by time window | When sessionization exists | Keep logic consistent across Dashboard and Report Builder |
| Pageviews | Total page views | Always when tracking data exists | Secondary metric |
| Unique pages viewed | Distinct pages viewed | When pageview data exists | Useful in page analytics |
| Bounce rate | Sessions with one page/action only | If computed | Do not overemphasize |
| Avg session duration | Average session length | If session timing available | Hide if unreliable |
| Returning visitors | Visitors seen before | If visitor ID persists | Can be percent or count |
| New visitors | First-time visitors | If visitor history exists | Use with returning visitors |
| Live/recent visitors | Visitors/events in recent window | If supported | No live map in V1 |

### 6.2 Attribution metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| First-touch source | First known source in visitor journey | Verified | Good for awareness |
| Last-touch source | Last source before conversion | Verified | Default for many founders |
| Linear attribution | Equal credit across touchpoints | If journey data supports | Report Builder/deeper views |
| Time-decay attribution | More credit closer to conversion | If supported | Explain with tooltip |
| Multi-touch attribution | Weighted credit across journey | Verified/where supported | Avoid fake precision |
| Source | Normalized source/channel | Verified | Primary table dimension |
| Medium | UTM/referrer medium | Verified if captured | Secondary dimension |
| Campaign | UTM campaign | Verified if captured | Read-only tracking, not campaign management |
| Search term | UTM/ad search term | If captured | Not same as GSC SEO Query |
| SEO Query | Search Console query | GSC only | Requires truth label |
| Landing page | First/important page in conversion path | Verified | Core dimension |
| Exit page | Last page before leaving | If pageview data exists | Secondary |
| Touchpoint count | Number of journey touchpoints | If journey exists | Useful for journey length |
| Time to convert | Time from first touch to conversion | If journey + conversion exist | Avg days/hours |

### 6.3 Conversion metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Conversions | Count of tracked conversion events | Verified | Generic outcome |
| Leads | Count of lead events | Verified | Lead Gen primary |
| Purchases/orders | Count of purchase/order events | When purchase/order events exist | eCommerce primary |
| Free trials | Trial start events | SaaS/trial events only | SaaS primary |
| Signups | Signup events | If configured | SaaS/general |
| Booked demos | Book demo events | If configured | SaaS/Lead Gen |
| Contact forms | Contact form events | If configured | Lead Gen |
| Add to cart | Add to cart events | eCommerce if configured | Not necessarily a conversion |
| CVR% | Conversions divided by visitors/sessions | When numerator/denominator exists | Tooltip required |
| Event value | Value attached to event | If captured | Hide if blank |

### 6.4 Revenue metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Revenue | Total verified/captured revenue | Revenue source required | Primary when available |
| MRR | Monthly recurring revenue | SaaS subscription data required | Hide if not available |
| AOV | Average order value | Orders + revenue required | Does not require cost data |
| Revenue per visitor | Revenue divided by visitors | Revenue + visitors required | Useful for eCommerce/SaaS |
| Revenue per lead | Revenue divided by leads | Revenue + leads required | Use carefully |
| Trial-to-paid % | Paid conversions divided by trials | Trial + paid events required | SaaS |
| Order count | Purchase/order events | Purchase/order events required | eCommerce |

### 6.5 Lead quality metrics

Lead quality does not require revenue.

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Qualified count | Leads marked Qualified | V1 | Manual/workflow signal |
| MQL count | Leads marked MQL | V1 | Manual/workflow signal |
| SQL count | Leads marked SQL | V1 | Manual/workflow signal |
| Qualified % | Qualified leads divided by total leads | V1 | No revenue required |
| MQL % | MQL leads divided by total leads | V1 | No revenue required |
| SQL % | SQL leads divided by total leads | V1 | No revenue required |
| Unqualified count | Leads marked Unqualified | V1 | Default or user-selected |

### 6.6 AI attribution metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| AI visitors | Visitors referred by AI tools | AI referrer detection | Hide if none |
| AI leads | Leads from AI source journeys | AI + lead events | Lead Gen/SaaS |
| AI revenue | Revenue from AI-source journeys | AI + revenue data | Hide if no revenue |
| AI source share | AI visitors/leads as share of total | AI + total data | Use compact bars |
| AI CVR% | AI conversions divided by AI visitors/sessions | AI + conversions | Useful in AI Sources tab |
| AI source detail | ChatGPT, Gemini, Claude, Perplexity, etc. | Detected sources | Source chips |

Supported AI source chips:

- ChatGPT
- Gemini
- Claude
- Perplexity
- Copilot
- DeepSeek
- Grok
- Other AI

### 6.7 GSC/SEO metrics

GSC is V1 Beta and only for SEO revenue attribution.

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Clicks | Search Console clicks | GSC connected | Imported field |
| Impressions | Search Console impressions | GSC connected | Imported field |
| CTR | Clicks divided by impressions | GSC connected | GSC metric |
| Average position | Average search result position | GSC connected | Use quietly |
| SEO query | Search query | GSC connected | May omit rare queries |
| SEO landing page | Landing page from GSC | GSC connected | Matched to SourceTrack pages |
| SEO leads | Leads matched to SEO landing pages/date range | GSC + conversions | Estimated matching |
| SEO revenue | Revenue matched to SEO landing pages/date range | GSC + revenue | Estimated matching, truth label required |

### 6.8 Campaign metrics

Campaigns are read-only performance tracking. No ad actions in V1.

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Campaign visitors | Visitors with campaign param | UTM/campaign data | V1 |
| Campaign conversions | Conversions tied to campaign | Campaign + conversion data | V1 |
| Campaign revenue | Revenue tied to campaign | Campaign + revenue | Hide if no revenue |
| Campaign leads | Leads tied to campaign | Campaign + leads | V1 |
| Campaign CVR% | Campaign conversions/visitors | Campaign data | V1 |
| Ad spend | Imported spend | Cost data required | Hide if absent |
| ROAS | Revenue/ad spend | Cost + revenue required | Hide if absent |
| CPL | Ad spend/leads | Cost + leads required | Hide if absent |
| CAC | Ad spend/customers | Cost + customer conversion required | Hide if absent |

### 6.9 Device, browser, country metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Country | Visitor country | If captured | Compact bars |
| Region/city | More specific location | If captured and privacy-safe | V1 optional |
| Device | Desktop/mobile/tablet | If captured | Compact module |
| Browser | Browser family | If captured | Compact module |
| OS | Operating system | If captured | Secondary |
| Language | Browser language | If captured | Secondary |

### 6.10 Session/journey metrics

| Metric | Definition | Availability | Notes |
|---|---|---|---|
| Session count | Number of sessions | Sessionization | V1 if supported |
| Avg touchpoints | Average events/touches before conversion | Journey data | Useful for Journeys |
| Avg time to convert | Average duration from first touch to conversion | Journey + conversion | Tooltip required |
| Journey duration bucket | Same day, 1-7d, 8-30d, 30d+ | Journey data | Report Builder dimension |
| Top conversion paths | Common source/page paths | Journey data | Keep compact |
| First vs last touch comparison | Differences between models | Attribution data | Attribution tab or Report Builder |

---

## 7. Filters Catalog

### 7.1 Global filters

- Date range
- Attribution model
- Site
- Business type context
- Source/channel
- Campaign
- Event type

### 7.2 Dashboard filters

- Date range
- Attribution model on Attribution/Journeys/AI tabs
- Source filter where useful
- AI source filter on AI Sources tab
- GSC property/page/query filters only when GSC connected

### 7.3 All Leads filters

Filter bar:

```text
[Attribution Model] [All Sources] [All Events] [Date Range] [More Filters] [Export Leads CSV]
```

More Filters:

- Device
- Browser
- Country
- Campaign
- Landing page
- Journey duration bucket
- Touchpoint count
- Qualification status
- Event value min/max only if event value exists
- Revenue min/max only if revenue exists

### 7.4 Campaign filters

- Date range
- Campaign status label
- Source
- Medium
- Landing page
- Event type
- Revenue present/no revenue
- Cost data present/no cost data

### 7.5 Report Builder filters

Basic filters:

- Date range
- Attribution model
- Source
- Campaign
- Landing page
- Event type
- Device
- Country

Advanced filters behind More Filters:

- Medium
- Search term
- SEO query if GSC connected
- GSC property if connected
- GSC landing page if connected
- Browser
- OS
- Visitor type
- Journey duration bucket
- Touchpoint count
- Revenue/value range if revenue/value exists
- Qualification status
- Business type

### 7.6 Integrations filters

Integrations page should not become a marketplace wall.

Allowed grouping:

- Active / connected
- Setup needed
- V1.1 locked
- V2 future hidden from app by default unless product team chooses a future component board

### 7.7 Filter UX rules

- Use simple dropdowns and pill selectors
- Keep advanced filters collapsed
- Show active filters as removable chips
- Provide Clear filters
- Never reload full page; use skeleton state for data refresh
- Explain no-result states with one next action

---

## 8. Core Components

### 8.1 Cards

All content lives in calm cards.

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  box-shadow: var(--shadow-sm);
}
```

Card rules:

- One clear purpose per card
- No decorative cards
- One primary insight per section
- Core dashboard cards are protected
- Pinned custom report cards appear below core dashboard cards

### 8.2 KPI tile

KPI tile structure:

- label
- primary value
- delta
- period/comparison
- optional source chip

KPI rules:

- Overview shows max 3 KPIs
- Secondary KPIs appear in deeper tabs or Report Builder
- Hide unavailable metrics entirely

### 8.3 Tables

Default table behavior:

- Sortable columns
- `aria-sort`
- Row hover
- Row click opens detail when applicable
- Header tooltip for jargon
- Compact density
- Tabular numbers
- More columns behind More toggle

Important table components:

- Source cell with icon/chip
- Qualification badge
- Event type badge
- Revenue value cell
- Trend delta
- Inline contribution bar
- Sparkline
- Row action menu

### 8.4 Badges

Event badges:

- Lead
- Purchase
- Free Trial
- Sign Up
- Book Demo
- Contact Form
- Add to Cart
- MQL
- SQL

Qualification badges:

- Unqualified
- Qualified
- MQL
- SQL

Integration badges:

- Connected
- Not detected
- Beta
- Manual webhook
- Test mode only
- Coming soon
- Locked
- Data pending

### 8.5 Source chips

Pattern:

```text
[icon] Source name · type
```

Examples:

- ChatGPT · AI
- Google · Organic
- LinkedIn · Paid
- Perplexity · AI
- GSC · SEO
- Direct · Direct
- Email · Owned

Rules:

- Compact
- Inline
- Low-noise
- Hover tooltip may show first/last touch summary
- Avoid giant colorful circles

### 8.6 Attribution trail

Used in:

- Journey Panel
- AI hero
- GSC SEO revenue card
- source attribution rows

Pattern:

```text
[Source chip] -> [Landing page] -> [Event] -> [Revenue/Lead]
```

Rules:

- Thin connectors
- Compact arrows
- No spaghetti flowcharts
- Story first, details expandable

### 8.7 Tooltips

Tooltip required for:

- MQL
- SQL
- SQL%
- CAC
- CPL
- CVR%
- ROAS
- AOV
- MRR
- Trial-to-paid
- GSC query revenue
- Attribution models

Tooltip style:

- small
- plain language
- no raw formulas unless useful
- no jargon without explanation

### 8.8 Toasts

Position: top-right, below top bar.

Types:

- Success
- Error
- Info
- Warning

Copy rules:

- Two lines max
- Mention specific action
- No raw error codes

Examples:

- CSV exported - 1,247 leads.
- Lead marked as SQL.
- Tracking script copied.
- Search Console data may take 2-3 days.

### 8.9 Confirmation dialogs

Required for destructive actions:

- Delete report
- Delete lead if supported
- Delete site data
- Remove site
- Delete conversion event

Rules:

- Specific title
- Clear permanence statement
- Dangerous primary action
- Escape cancels
- Enter does not confirm destructive actions

### 8.10 Empty states

Every empty state needs:

- icon or tiny illustration
- warm explanation
- one primary CTA
- optional secondary link

Examples:

| View | Message | CTA |
|---|---|---|
| Dashboard no data | Waiting for your first visitor | Open install guide |
| No conversions | No conversions in this date range | Change date range |
| All Leads filtered empty | No leads match these filters | Clear filters |
| Report Builder empty | Build your first custom report | Pick a template |
| GSC pending | Search Console data may take 2-3 days | Check again later |

### 8.11 Skeleton loaders

Skeletons mirror actual layout:

- KPI skeleton tiles
- chart skeleton block
- table row skeletons
- journey panel skeleton
- report builder preview skeleton

No loading text unless necessary.

### 8.12 Dropdowns and pickers

Required picker components:

- Date range dropdown
- Site switcher dropdown
- Attribution model dropdown
- Source filter
- Event filter
- More filters drawer/dropdown
- Dimension picker
- Metric picker
- Qualification dropdown
- Dashboard tab chooser for pinned reports

### 8.13 Modals and drawers

Required modals/drawers:

- Add Site flow
- Journey Panel
- Campaign detail panel
- Report save modal
- Pin to Dashboard modal
- Delete confirmation modal
- GSC property select modal/step
- API token reveal confirmation if needed
- Conversion event editor if not inline

---

## 9. Analytics Visualization System

Charts must feel custom, calm, and editorial. Do not allow default chart-library styling.

### 9.1 Universal chart rules

Every chart should include:

1. Clear title
2. One-sentence insight
3. Calm visualization
4. Custom tooltip
5. Empty state
6. No fake data

Example insight:

> Traffic rose 18% this week, mostly from Google and ChatGPT.

### 9.2 Line charts

Use for visitors, sessions, revenue, conversions, AI traffic, and page trends over time.

**A chart must never draw a shape that needs more data than it has.** This rule outranks every aesthetic consideration in this document; a chart that implies readings it doesn't have makes an analyst distrust every other number on the page.

- **Fewer than 3 points:** do not draw a chart. Render the numbers.
- **3 to 6 points:** straight segments only, with a visible marker at every real reading, and a caption naming what the points are.
- **7 or more points:** smoothing is permitted. Area fill is permitted.
- **Never** interpolate a curve between sparse points.
- Days with no reading are not zero. Say so in the caption where it could be misread.
- One primary line by default. Soft lime. Horizontal gridlines only. Custom tooltip.

### 9.3 Bar charts

Use for:

- Top sources
- Top pages
- Top countries
- Devices
- Browsers
- Event counts
- Campaign comparison

Rules:

- Horizontal bars for ranked lists
- Compact labels
- Visible values
- Use channel colors selectively
- Avoid rainbow charts unless comparing channel groups

Sparse-data rules:

- Fewer than 3 non-zero series: render a ranked list with inline bars, not a chart.
  A single-bar bar chart is a stat, not a visualisation.
- Do not draw empty slots for zero-value series — it draws the eye to the emptiness.

### 9.4 Segmented bars

Use for:

- Traffic mix: paid, organic, AI, direct, referral
- Device split
- New vs returning visitors

Rules:

- Subtle segments
- Label only the meaningful segments
- Avoid clutter for tiny shares

### 9.5 Sparklines

Use in:

- All Sites cards
- Top source rows
- Top page rows
- Campaign rows
- Saved report cards
- Pinned report cards

Rules:

- Tiny
- Calm
- No decorative noise
- Tooltip optional

### 9.6 Inline table bars

Use for:

- Source contribution
- Page contribution
- Country/device/browser share
- Conversion contribution

Preferred when a full chart would add bloat.

### 9.7 Donut/pie charts

Avoid by default.

Allowed only for small compositions like device split when bars are less clear.

### 9.8 Heatmaps

V1.1/future only:

- Activity heatmap
- Day/hour activity
- Journey activity heatmap

Do not place heatmaps in active V1 UI unless feature-flagged.

### 9.9 Combination charts

Dual-axis combination charts are not permitted in V1. Two units on one plot is
enterprise-BI clutter, and the reader cannot honestly compare the series.

Instead:

- Split into two stacked charts sharing an x-axis, or
- Mark the secondary event on the primary series — an orange bar among lime bars
  for conversion days — rather than adding a second axis.

---

## 10. Dashboard

Dashboard uses four tabs:

```text
Overview | Attribution | Journeys | AI Sources
```

### 10.1 Dashboard principle

Dashboard answers. Report Builder investigates. Saved Reports remember. Pinned Reports personalize.

Defaults stay curated. Core dashboard cards are protected. Pinned reports appear below core cards.

### 10.2 Overview tab

Purpose:

> Is growth working, and where did it come from?

Final order:

1. KPI Bar - full width, max 3 values
2. AI Attribution Hero - full width
3. Main analytics trend chart - full width
4. Top Sources table - full width
5. Top Pages or Recent Conversions/Leads - full width
6. Pinned Reports - below core cards only

### 10.3 Overview KPI rules

| Slot | SaaS | eCommerce | Lead Gen |
|---|---|---|---|
| 1 | Revenue | Total Revenue | Total Leads |
| 2 | MRR | Revenue Growth % | Lead Growth % |
| 3 | AI Revenue | AI Revenue | AI Leads |
| 4 | Trial-to-Paid % | AOV | Qualified % |
| 5 | Top Source or Best CAC if cost exists | Top Revenue Source or Best ROAS if cost exists | Top Lead Source or Best CPL if cost exists |

Overview shows only top 3 KPI slots by default.

If revenue does not exist:

- SaaS: show Trials, Signups, Leads, AI Leads
- eCommerce: show Orders/Conversions only if available; otherwise Visitors, Conversions, CVR
- Lead Gen: show Leads, Lead Growth, AI Leads, Qualified %

If cost data does not exist:

- do not show CAC/ROAS/CPL
- use Top Source/Top Revenue Source/Top Lead Source fallback

### 10.4 AI Attribution Hero

Purpose:

> Show the product's AI attribution advantage without adding a chatbot.

Structure:

- one plain-English headline
- 3-5 AI source chips
- small sparkline or delta
- CTA: View AI sources

Example:

> AI tools influenced 42 leads this month. ChatGPT and Perplexity were the strongest sources.

Rules:

- no fake recommendations
- no model version labels
- no LLM analyzer
- no chatbot UI
- hide when no AI data exists or show calm empty state if appropriate

### 10.5 Main analytics trend chart

This chart must feel first-class, not filler.

Possible primary metric by data availability:

- Revenue if revenue exists
- Conversions/leads if conversion data exists
- Visitors/sessions if no conversions yet

Required:

- one-sentence insight
- polished line chart
- quiet gridlines
- custom tooltip
- date range control

### 10.6 Top Sources table

Default columns:

- Source
- Visitors or Leads/Revenue depending on business type/data
- Conversions/Leads
- CVR%
- More toggle for secondary metrics

Optional with data:

- Revenue
- Orders
- Trials
- SQL%
- AOV
- ROAS/CPL/CAC only when cost data exists

### 10.7 Top Pages module

Top Pages should be a first-class analytics component.

Columns:

- Page
- Visitors
- Sessions
- Conversions/leads
- CVR%
- Revenue only if exists
- Top source chip
- Trend sparkline

### 10.8 Recent Conversions/Leads

Columns:

- Visitor/profile
- Source
- Event type
- Qualification status
- Revenue/value only if exists
- Time
- View Journey

### 10.9 Attribution tab

Purpose:

> Source -> page/query -> visitor/conversion -> revenue.

Order:

1. Source Attribution table
2. Main revenue/conversion trend chart
3. Landing Page Performance
4. Search Terms / SEO Queries when relevant data exists
5. Recent Conversions/Leads

Rules:

- no chart wall
- no separate GSC dashboard
- GSC appears as compact SEO revenue surface only when connected and data exists
- keep PiQo/DataFast-simple

### 10.10 Journeys tab

Purpose:

> How do visitors become customers?

Order:

1. Recent Leads table
2. Conversion Events detail
3. Landing Page Performance expanded
4. Journey analytics summary when available

Journey analytics summary may include:

- avg touchpoints
- avg time to convert
- journey duration buckets
- top conversion paths

### 10.11 AI Sources tab

Purpose:

> Which AI platforms send high-quality traffic?

Order:

1. Expanded AI Attribution card
2. AI Source Detail table
3. AI vs Paid vs Organic comparison
4. AI landing pages
5. Search Terms filtered to AI-referred sessions if available

Default columns:

- AI Source
- Visitors/leads/revenue depending on data
- Conversions/leads
- CVR% or Qualified/SQL%
- Trend

Hide revenue if unavailable.

---

## 11. All Sites / Portfolio View

Scope: V1 for users with 2+ sites.

Purpose:

> I can see all my sites are working, then open the one I need.

### 11.1 Visibility

- 1 site: skip All Sites
- 2+ sites: show All Sites after login
- Accessible through site switcher
- Not a permanent sidebar item inside selected site

### 11.2 All Sites top bar

- Page title: Sites
- Status pill: N Live
- Trial/payment pill if relevant
- Primary CTA: Add Site

### 11.3 Site card

Each card includes:

1. favicon/icon
2. site name
3. domain
4. tracking status badge
5. 7-day sparkline
6. visitors
7. conversions/leads
8. revenue only if exists
9. AI leads/revenue only if exists
10. last event timestamp
11. overflow: Open Dashboard, Copy tracking script, Site Settings

Primary action: Open Dashboard.

Do not use View Journey on site cards.

### 11.4 Site health badges

| Badge | Condition | Copy |
|---|---|---|
| Live | Recent event received | Tracking live |
| Not detected | No tracking event yet | Script not detected |
| Warning | No events in 24h or conversion missing | No events in 24h / Conversion event missing |
| Revenue connected | Revenue source active | Revenue connected |
| GSC connected | GSC data flowing | GSC connected |
| GSC delayed | GSC connected, no data yet | GSC data pending (2-3 days) |

### 11.5 Add Site flow

Use shortened onboarding:

1. Site name + domain
2. Business type
3. Install tracking script
4. Conversion events
5. Verification

### 11.6 All Sites boundaries

Do not add in V1:

- portfolio-level Report Builder
- cross-site attribution blending
- agency white-label reports
- client permissions
- client reporting dashboards
- client comments
- agency billing
- live map
- complex account hierarchy
- agency CRM language

---

## 12. Onboarding / Install Sequence

Scope: V1.

5-step wizard. Centered card layout. No sidebar during onboarding.

### Step 1 - Create account

- Email
- Password
- Google OAuth option

### Step 2 - Site and business type

Fields:

- Site name
- Domain
- Business type:
  - Software or subscriptions -> SaaS
  - Physical products or eCommerce -> eCommerce
  - Services, consulting, or lead generation -> Lead Gen

### Step 3 - Install tracking script

Toggle:

- GTM
- Standard HTML

Include:

- copyable snippet
- unique `data-site` ID
- Skip for now link
- persistent not-detected banner until first event

### Step 4 - Conversion events

Suggested by business type:

- SaaS: Free Trial, Book Demo, Sign Up, Purchase
- eCommerce: Purchase, Add to Cart optional
- Lead Gen: Lead Form Submit, Book Demo, Contact Form

Fields:

- event name
- event type
- revenue capture toggle
- property/value name if revenue capture on

### Step 5 - Verification

States:

- checking
- verified
- not detected
- send test event success
- go to dashboard anyway

---

## 13. All Leads

Scope: V1.

### 13.1 Lead qualification principle

Revenue answers what became money. Qualification answers what looks worth following up.

Users can mark any lead/conversion as:

- Unqualified
- Qualified
- MQL
- SQL

This works even if:

- no revenue exists
- Stripe is not connected
- webhook revenue is not connected
- manual conversion value is missing
- lead has no email/name
- event value is blank

Lead qualification is a workflow signal, not a revenue signal.

### 13.2 Filter bar

```text
[Attribution Model] [All Sources] [All Events] [Date Range] [More Filters] [Export Leads CSV]
```

### 13.3 Default table columns

- Checkbox
- Profile ID
- Name
- Email
- Source
- Event Type
- Qualification Status
- Event Value only if exists
- Date
- View Journey

### 13.4 Row actions

- View Journey
- Mark as Qualified
- Mark as MQL
- Mark as SQL
- Mark as Unqualified

### 13.5 Bulk actions

- Mark selected as Qualified
- Mark selected as MQL
- Mark selected as SQL
- Mark selected as Unqualified
- Export selected CSV

### 13.6 Required states

- with revenue/value
- without revenue/value
- no email/name
- qualification dropdown open
- bulk selected
- filtered empty state
- export success toast
- loading state

---

## 14. Journey Panel

Scope: V1.

Right-side panel on desktop. Full-screen sheet on mobile.

Width: 480px desktop.

### 14.1 Structure

1. Header
   - Back to leads
   - Visitor name/profile ID
   - Export
   - Mark as Qualified dropdown

2. Human-readable story card
   - Example: Found you via Perplexity -> read comparison page -> returned from Google -> booked demo.

3. Profile facts card
   - Location
   - Device
   - Browser
   - Touchpoints
   - Journey duration
   - First touch
   - Current event type
   - Conversion value only if exists

4. Attribution trail
   - First touch
   - Last touch
   - Multi-touch summary where available
   - Source chips + thin connectors

5. Timeline
   - chronological
   - expandable events
   - page/referrer/campaign details
   - conversion event detail

### 14.2 Allowed actions

- Export
- Mark as Qualified/MQL/SQL/Unqualified

### 14.3 Not allowed in V1

- Sync to CRM
- Assign to Sales
- CRM Profile
- Predictive score
- Conversion probability
- Activity heatmap

### 14.4 Required states

- no revenue state
- qualification dropdown open
- event expanded
- loading skeleton
- mobile full-screen sheet

---

## 15. Campaigns

Scope: V1.

Campaigns are read-only performance tracking. SourceTrack does not control ad platforms in V1.

### 15.1 KPI bar

Always available if data exists:

- Total conversions
- Total revenue if revenue exists
- Leads
- CVR%

Only if cost data exists:

- Ad spend
- Avg ROAS
- Avg CPL
- CAC

### 15.2 Campaign table columns

Default:

- Campaign Name
- Status label
- Visitors
- Conversions/leads
- Revenue only if exists
- CVR%

Hidden unless cost data exists:

- Budget
- Spent
- Net Profit
- ROAS
- CPL
- CAC

### 15.3 Campaign detail panel

Shows:

- campaign trend chart
- top landing pages
- top sources
- conversion events
- recent leads
- revenue only if exists
- cost metrics only if cost exists

### 15.4 Not allowed in V1

- pause campaign
- enable campaign
- scale campaign
- change budget
- bid management
- ad platform write actions

---

## 16. Report Builder

Scope: V1.

Report Builder is critical. It must be complete, powerful, and still simple.

### 16.1 Principle

Templates first. Builder second. Always preview before saving. Never show fake zeros or disabled metric clutter.

Not allowed in V1:

- SQL editor
- formula builder
- BI canvas
- drag-and-drop dashboard builder
- public sharing
- PDF export as active V1
- cross-site reports

### 16.2 Required full sequence

1. Report Builder landing
2. Starter template gallery
3. Analytics templates
4. Attribution templates
5. Blank report start state
6. Template selected state
7. Dimension picker
8. Metric picker
9. Revenue metric locked state
10. Cost metric locked state
11. GSC metric locked state
12. Filters closed
13. Advanced filters open
14. Preview table with data
15. Preview chart with one-sentence insight
16. Empty preview state
17. Save report modal
18. Pin to Dashboard modal
19. Saved Reports gallery
20. Pinned Reports management
21. Duplicate report state
22. Delete confirmation
23. Export CSV success toast
24. V1.1 PDF export locked state
25. V2 public sharing locked state

### 16.3 Landing page sections

1. Starter templates
2. Saved reports
3. Pinned reports

### 16.4 Starter templates

Always shown when data supports:

- Traffic Overview
- Top Pages
- Top Sources
- Conversion Events
- Device Breakdown
- Country Breakdown
- Campaign Performance
- AI Source Compare
- Top Channels
- Landing Page Winners
- Keyword Performance
- Journey Length
- Start from blank

Conditional:

- Free Trial Performance - SaaS or trial events only
- Revenue by Source - revenue required
- Revenue by Landing Page - revenue required
- Revenue Trend - revenue required
- AOV by Campaign - revenue/order data required
- SEO Pages by Revenue - GSC connected + revenue/leads matching
- SEO Queries by Revenue - GSC connected + revenue/leads matching
- SEO Landing Page CVR - GSC connected
- ROAS by Campaign - cost + revenue required
- CPL by Source - cost + leads required
- CAC by Campaign - cost + customers required

### 16.5 Dimensions

Group dimensions in picker.

Traffic:

- Source
- Medium
- Channel
- Referrer domain
- Visitor type

Campaign:

- Campaign
- Term
- Content
- Click ID if available

Page:

- Landing Page
- Exit Page
- Page path
- Page title if available

Visitor:

- Device
- Browser
- Country
- Region/city if available
- Language

Journey:

- Attribution Model
- Date
- Journey Duration bucket
- Touchpoint Count
- First touch source
- Last touch source

Event:

- Event Type
- Conversion Event
- Qualification Status

GSC only:

- SEO Query
- GSC Landing Page
- GSC Property
- Search date

### 16.6 Metrics

Always available:

- Visitors
- Sessions
- Pageviews
- Leads
- Conversions
- CVR%
- Touchpoints avg
- Time to Convert avg
- MQL count
- SQL count
- SQL%
- Qualified count
- Qualified%
- MQL%
- Free Trials if trial events exist
- Trial-to-Paid% if trial and paid events exist

Analytics metrics:

- New visitors
- Returning visitors
- Bounce rate if computed
- Avg session duration if reliable
- Top pages
- Top countries
- Device share
- Browser share

Order-event metrics:

- Orders
- Purchases
- Add to Cart if configured

Revenue-required:

- Revenue
- MRR
- AOV
- Revenue per visitor
- Revenue per lead

Cost-gated:

- Ad spend
- ROAS
- CPL
- CAC
- Net profit
- Payback period

GSC-gated:

- Clicks
- Impressions
- CTR
- Average Position
- SEO leads
- SEO revenue

### 16.7 Locked-state copy

Revenue metric locked:

> Revenue requires Stripe, webhook, or manual conversion values.

Cost metric locked:

> Connect ad cost data to unlock ROAS, CPL, and CAC.

GSC metric locked:

> Connect Search Console to use SEO Query.

### 16.8 Filters

Basic:

- Date range
- Attribution model
- Source
- Campaign
- Landing page
- Event type
- Device
- Country

Advanced:

- Medium
- Search term
- Browser
- OS
- Visitor type
- Journey duration
- Touchpoint count
- Qualification status
- Revenue/value range if available
- GSC property/query/page if connected

### 16.9 Preview rules

- Always preview before saving
- Table first by default
- Chart only when clearer
- Empty preview explains why and gives one next action
- No fake zeros
- Inline bars preferred over extra charts when possible

### 16.10 Saved reports

Saved report card includes:

- name
- one-line description
- dimensions
- metrics
- last viewed/updated
- pin status
- Open
- Duplicate
- Export CSV
- Delete

### 16.11 Pinned reports

Pinned reports:

- appear below protected dashboard core cards
- max 6 pinned reports
- choose Dashboard tab: Overview, Attribution, Journeys, AI Sources
- can unpin
- can move tab
- can reorder only within Pinned Reports section

No drag handles, resize controls, custom grid canvas, or widget marketplace in V1.

---

## 17. Integrations

Scope: V1 active integrations + V1.1 locked cards only.

### 17.1 V1 integrations shown as cards

| Integration | Status | Label |
|---|---|---|
| Tracking Script / GTM | Verified | Install your tracking code |
| Stripe | Beta - test mode only | Connect Stripe |
| Shopify | Manual webhook | Shopify via manual webhook |
| Manual Conversion API | Verified | Import conversions via webhook |
| Google Search Console | Beta | SEO revenue attribution |

### 17.2 V1.1 locked integrations

Allowed locked cards:

- Slack weekly digest notifications - Coming soon
- HubSpot CRM sync - Coming soon

### 17.3 V2 not in active app UI

- Google Ads cost import
- Meta Ads cost import
- TikTok Ads cost import
- Salesforce
- Zapier

These may appear in a future component board, roadmap, or controlled preview, not active V1 UI.

### 17.4 GSC setup flow

1. Connect Google account via OAuth
2. Select verified Search Console property
3. Confirm property/domain match
4. Connected success
5. Data pending state
6. Mismatch warning/block

### 17.5 GSC V1 boundaries

GSC is SEO revenue attribution only.

Do not build:

- SEO sidebar page
- rank tracking
- keyword research
- search volume
- site audit
- backlink tool
- URL inspection
- technical crawler
- SEO chart wall

### 17.6 Shopify V1 boundary

Shopify is manual webhook only in V1.

Required copy:

- Manual webhook recipe
- HMAC verification guidance
- order ID dedupe guidance
- line item handling docs
- no native app claim

---

## 18. Settings

Tabs:

1. Install & Connect
2. Conversion Events
3. General
4. Advanced

### 18.1 Install & Connect

- GTM / Standard HTML toggle
- copyable script block
- script status
- connected integrations list
- developer accordion:
  - webhook URL
  - API token blurred/reveal

### 18.2 Conversion Events

Per row:

- event name
- event type
- revenue capture toggle
- property name/value field if revenue on
- delete

Add Conversion Event button.

### 18.3 General

- Site name
- Domain read-only
- Business type
- Timezone
- Currency
- Date format
- Danger Zone

### 18.4 Advanced

- API token
- Webhook secret
- IP exclusion list
- Bot filtering toggle
- Data retention selector
- GDPR export all data

### 18.5 Danger Zone

- Delete all data
- Remove site
- Type site name to confirm
- Clear permanence warning

---

## 18.9 Setup & Health page (added 2026-07-24, C4)

**Route:** `/setup` (alias `/snippet`). The page a customer uses to confirm the install works and to see what SourceTrack is receiving. Composed of `SetupDoctorCard` (the "Tracking Doctor"), `AttributionCoverageCard`, `CapiDeliveryStatus`, an embedded live event feed (`EventDebugger`), and a $0 test-conversion button. Data: `GET /install/doctor` → `getSetupDiagnostics` (`api/lib/setup-doctor.js`), which reads six deployed Tinybird `doctor_*` pipes.

**What each check means (all over a trailing 30-day window unless noted):**
- **Tracker events** — have we received any event, and how recently (`last_seen_at`). "Passed" means events are arriving; it does NOT mean *all* of them are.
- **Domain match** — the domain sending events matches the registered domain (catches "installed on the wrong site / staging").
- **Conversion tracking** — has a `$conversion` been received in 30 days, and its last type.
- **Paid tracking parameters** — have UTM / ad-click IDs (`gclid`, `fbclid`, …) been seen.
- **Privacy signals (GPC/DNT)** — a **floor of unique browser-days** where a browser sent GPC/DNT on the tracker-script GET and was not tracked. The script is cached `max-age=86400`, so this is at most one signal per browser per day — a floor, never a per-visit count.
- **Pageviews received (last 30 days)** — the `doctor_pageviews_30d` count. It counts **`$pageview` only** (not conversions/identify/custom), so it is labelled "Pageviews", not "Events".
- **Verify a live pageview** — an active check: the user fires a tokenised pageview / a $0 test conversion and the page confirms receipt.

**What this page CANNOT claim (hard truth boundary — §5.1):**
- It **cannot show completeness.** The server only knows what *arrived*. Events dropped by ad blockers, browser privacy features, or network failures are **undetectable by design** — so every count is a **floor, not a guaranteed total.** No copy on this page may imply "nothing was lost."
- All doctor windows are **30 days**, not all-time.
- **Cold start is genuinely empty.** A new install has no history, and visitor **journeys before install cannot be backfilled** (orders can be; journeys cannot). The Dashboard shows a live event feed during cold start to prove the install works, and it disappears once real aggregates exist.
- Privacy-signal counts are **browser-days**, not suppressed pageviews.

**Explicitly NOT on this page (see KNOWN_ISSUES):** a separate "per-event status" block (the doctor checks already do this job; if it returns it is per-event-*type* presence only — pageview/conversion/identify seen yes/no — never per-event *delivery success*, which cannot be known).

## 19. Global States

### 19.1 Script not detected banner

Persistent warning banner:

> Your tracking script has not been detected yet.

Actions:

- View Install Guide
- Dismiss

Auto-clears after first pageview/event received.

### 19.2 Partial data warning

Shown when selected date range has fewer than 10 conversions:

> Only 3 conversions in this period - data may not be representative.

### 19.3 No data yet

Use when site has no tracking data:

> Waiting for your first visitor...

CTA: Open Install Guide.

### 19.4 No data in date range

> No conversions in this date range.

CTA: Change date range.

### 19.5 Cost metrics unavailable

Do not show ROAS/CAC/CPL columns.

If selected in Report Builder:

> Connect ad cost data to unlock ROAS, CPL, and CAC.

### 19.6 Revenue unavailable

If selected in Report Builder:

> Revenue requires Stripe, webhook, or manual conversion values.

### 19.7 GSC unavailable

If selected in Report Builder:

> Connect Search Console to use SEO Query.

### 19.8 404

Centered page, no sidebar:

- SourceTrack logo
- Page not found
- Back to Dashboard

---

## 20. Responsive Behavior

SourceTrack is desktop-first. Mobile is read-optimized.

| Breakpoint | Layout |
|---|---|
| Desktop 1280px+ | Fixed 210px sidebar, 2-column grid |
| Laptop 1024-1279px | Fixed 210px sidebar, 1-column grid |
| Tablet 768-1023px | Sidebar hidden, hamburger, 1-column cards |
| Mobile <768px | Bottom tab nav, stacked cards |

Mobile bottom tabs:

- Dashboard
- Leads
- Campaigns
- Settings

Report Builder and Integrations accessible via hamburger overlay on mobile.

Journey Panel mobile: full-screen sheet.

---

## 21. Accessibility

Requirements:

- Semantic HTML
- One h1 per page
- No skipped heading hierarchy
- WCAG AA contrast
- Icon-only buttons need aria-label
- Sortable table headers need aria-sort
- Status badges use role=status where appropriate
- Images have alt text
- Decorative images use empty alt
- Touch targets at least 44x44px
- Keyboard accessible dropdowns/modals
- Escape closes panels/modals/dropdowns
- Focus ring visible
- prefers-reduced-motion respected

Keyboard shortcuts V1:

| Shortcut | Action |
|---|---|
| Escape | Close modal/panel/dropdown |
| Up/Down | Navigate table rows |
| Enter | Open Journey for focused row |
| G then D | Dashboard |
| G then L | All Leads |
| G then C | Campaigns |
| G then R | Report Builder |
| G then S | Settings |
| T | Toggle theme |
| ? | Keyboard shortcuts overlay |

Command palette is V2. Do not use Cmd+K UI in V1.

---

## 22. Export

V1 export is CSV only.

| Page | Button label | Export |
|---|---|---|
| Dashboard | Export CSV | Current tab primary table |
| All Leads | Export Leads CSV | Filtered leads |
| Campaigns | Export Campaigns CSV | Campaign table |
| Report Builder | Export Report | Custom report data |

Rules:

- Export hidden on empty states
- Empty state CTA replaces export
- PDF export is V1.1 locked
- Public share links are V2 locked

---

## 23. Feature Flag Map

This table is authority. If anything conflicts, this table wins.

| Feature | Status | UI visibility |
|---|---|---|
| UTM/referrer/source capture | V1 verified | Full |
| First/last/multi-touch attribution | V1 verified | Full |
| Visitor journey panel | V1 verified | Full |
| Pageview/event tracking | V1 verified | Full |
| Conversion tracking | V1 verified | Full |
| Lightweight analytics | V1 core | Full, simple |
| AI source attribution | V1 verified | Hero feature |
| Campaign tracking | V1 verified | Read-only |
| Search term reporting | V1 verified | Full when data exists |
| Landing page performance | V1 verified | Full |
| Cookieless visitor ID | V1 verified | Full |
| Privacy-minimized tracking | V1 verified | Full |
| Dark mode | V1 (app only) | **App: both themes, toggle in the app top bar (§4).** **Marketing site: light-only, no toggle.** Reference implementation — PR #643, merged 2026-08-05, which deleted `marketing/src/layouts/components/ThemeToggle.astro` and removed it from `Header.astro`. §3.3's dark tokens remain live for the app and are unchanged. |
| Manual lead qualification | V1 verified | Full |
| Lead quality metrics | V1 | No revenue required |
| Manual conversion webhook | V1 verified | Full |
| Report Builder | V1 verified | Full |
| Saved Reports | V1 | Full |
| Pinned Reports | V1 | Below core cards |
| All Sites | V1 | 2+ sites only |
| Stripe test mode | V1 beta/partial | Beta badge |
| Stripe production | V1.1 | Hidden/locked |
| Shopify | V1 manual webhook | Manual label |
| GSC SEO revenue attribution | V1 beta | Integrations + Report Builder + compact Attribution surface |
| ROAS/CPL/CAC | Cost-gated | Hidden unless cost exists |
| Revenue metrics | Revenue-gated | Hidden unless revenue exists |
| Slack digest | V1.1 | Locked card only |
| HubSpot sync | V1.1 | Locked card only |
| PDF export | V1.1 | Locked state only |
| Activity heatmap | V1.1 | Locked. Currently shipping in the journey panel and must be gated. |
| CSV/API cost import | V1 live | Unlocks ROAS/CPL/CAC when cost data exists. `api/lib/ad-cost-imports.js` + `/api/campaign-costs`; UI is Campaigns "Import Costs" and the Integrations CSV card. This is the ONLY shipped cost path. |
| Google Ads cost import | V2 · backend built, no connect UI | Backend real (`api/lib/google-ads.js` GAQL, `runGoogleSync`), but `POST /google/save-account` has zero dashboard callers, so no customer can complete a connection. End-to-end unproven. |
| Meta Ads cost import | V2 · backend built, no connect UI | Backend real (`api/lib/meta-ads.js` `/insights`, `runMetaSync`), but `POST /meta/connect` has zero dashboard callers. End-to-end unproven. |
| TikTok Ads cost import | V2 · not built | No lib, route, or worker exists. TikTok is CAPI-export only (`conversion-sync.js`). "Not active V1 UI" previously implied something was being withheld — nothing is. |
| LinkedIn Ads cost import | V2 · not built | No lib, route, or worker exists. LinkedIn is CAPI-export only (`conversion-sync.js`). |
| Team roles | V2 | Future component |
| API playground | V2 | Future component |
| Alerts/notification bell | V2 | Not V1 top bar. Currently shipping and must be removed. |
| Cross-domain tracking | V2 | Future component |
| Command palette | V2 | Not active V1 |
| Auto-hide sidebar rail | V2 | Not active V1 |
| Annotation pins | V2 | Future component |
| Public reports | V2 | Future component |
| Standalone Funnel Builder | V2 | Future component |
| Cross-site Report Builder | V2 | Future component |
| Agency white-label | V2 | Future component |
| Live visitor map | V2 | Not active V1 |
| MCP-driven connection actions (CAPI, Shopify) | V1.1 | Human-approval required per action (§36); no new UI surface — approval happens via the existing tool-call confirmation pattern |
| Ad platform budget/bid/campaign actions (agentic or otherwise) | Prohibited | Not active V1 UI, not planned — see §26 and §36.3 |

---

## 24. Future Component Library

The design system may include future components. They must be clearly labeled and must not look active in V1.

### 24.1 V1.1 locked components

- PDF export
- Slack weekly digest
- HubSpot CRM sync
- Stripe production attribution
- Activity heatmap
- Expanded payment attribution

### 24.2 V2 future components

- Public report sharing
- Cross-site Report Builder
- Team roles/permissions
- API playground
- Cross-domain tracking
- Alerts center/notification bell
- Command palette
- Auto-hide sidebar rail
- Annotation pins
- Standalone Funnel Builder
- Google Ads cost import
- Meta Ads cost import
- TikTok Ads cost import
- Salesforce
- Zapier
- Agency white-label reports
- Client permissions
- Portfolio-level reporting
- Live visitor map

### 24.3 Future component state requirements

For every future component, design these states where relevant:

- hidden
- locked
- empty setup
- connected
- unavailable/error
- data unavailable

---

## 25. Stitch / AI Design Generation Rules

### 25.1 Primary generation prompt

Use this prompt for new design generation:

> Design SourceTrack as a premium 2026 attribution and lightweight analytics product for founders and marketers. It should feel calmer than GA4, lighter than Cometly/Usermaven, as simple as DataFast/PiQo, and more distinctive through AI attribution, SEO revenue signals, source chips, analytics charts, top pages, and conversion story panels. Use warm off-white surfaces (#F7F4ED), white cards, subtle borders, lime (#D2EC2A) as signal only, compact data density, premium Geist typography, and custom-feeling charts. Avoid generic admin dashboards, purple gradients, decorative blobs, glassmorphism, enterprise BI clutter, and fake data.

### 25.2 Consolidation prompt

Use this when refining existing screens:

> Use the selected SourceTrack designs and this design/product spec as source material. This is a finalization and consolidation pass, not a new concept pass. Do not create duplicate alternatives. Do not create multiple palettes. Do not rename the product. Do not create multiple versions of the same screen. Choose one strongest base screen per product area and improve it. Create new screens only for genuinely missing states, modals, drawers, or required sequence steps. Finalize one canonical SourceTrack design system and one implementation-ready screen set.

### 25.3 No-duplicate rules

Do not create:

- multiple dashboard variants
- multiple All Sites variants
- multiple All Leads variants
- multiple Report Builder variants
- alternate design systems
- alternate color palettes
- rough wireframes
- incomplete placeholder screens
- renamed product systems

Create one canonical screen per product area plus required states only.

### 25.4 Required screen inventory

Core V1 customer app screens:

1. Onboarding / Install
2. All Sites
3. Setup Guide
4. Dashboard Overview
5. Analytics
6. Attribution
7. Dashboard Journeys / journey surfaces
8. Dashboard AI Sources / AI source surfaces
9. All Leads
10. Journey Panel
11. Campaigns
12. Campaign Detail Panel
13. Report Builder Landing
14. Report Builder Builder Flow
15. Report Builder Preview / Save / Pin
16. Integrations
17. Settings
18. Billing / Plan card or page

Public website screens:

1. Homepage hero
2. Public product demo
3. Pricing page
4. Use-case page template
5. Comparison page template
6. Docs/guides entry page
7. Legal/trust footer area
8. FAQ
9. Final CTA
10. Mobile homepage

Internal V1 Ops screens:

1. Ops Console overview
2. Companies tab
3. Members tab
4. Sites tab
5. Site Inspector
6. Feature Status
7. QA Notes
8. Audit Log
9. Support Preview route state
10. Support Preview read-only banner
11. Ops endpoint loading/error/empty states

Required customer states:

1. Empty state
2. Loading/skeleton
3. No revenue data
4. No cost data
5. GSC not connected
6. GSC connected
7. Script not detected
8. Lead qualification dropdown
9. Report Builder metric picker
10. Report Builder dimension picker
11. Report Builder save modal
12. Report Builder pin modal
13. Delete confirmation
14. Mobile journey sheet
15. Export success toast
16. Support preview read-only state
17. Support preview mutation blocked state
18. Billing unavailable/error state
19. Limit exceeded state

Future component board:

- one board only
- clearly label V1.1 locked and V2 future
- no active V1 navigation for future features

---

## 26. Active V1 Prohibited Elements

Remove from active V1 UI:

- notification bell
- command palette
- CRM Profile
- Assign to Sales
- Sync to CRM
- predictive score
- conversion probability
- LLM analyzer
- model version labels
- Add Formula
- SQL editor
- BI canvas
- drag-and-drop dashboard builder
- public sharing
- PDF export as active V1
- New Campaign / ad campaign actions
- agency command center language
- API Error copy on site cards
- fake AI predictions
- fake recommendations
- fake revenue
- fake cost metrics
- fake zeros
- rank tracker
- keyword research
- SEO audit
- backlink tool
- URL inspection
- live map
- per-card "Sample data" badges on marketing mockups — disclosure is one footer line per page, see §29.8

### 26.1 Lead intelligence & enrichment — not built, not planned pre-paid-beta

Carried from the retired `docs/marketing/seo_content_backlog.md` on its consolidation into
`docs/marketing/`. These are a **product-scope + privacy** rule, not a UI-removal list: do not build
them, and do not write website copy that implies them.

- company reveal / IP enrichment
- contact enrichment
- prospect database
- target account lists
- CRM account intelligence
- technographic / firmographic enrichment
- enrichment APIs
- sales-intelligence suite
- audience builder
- automated sales workflows / sales outreach automation
- browser extension
- native Salesforce integration
- production HubSpot sync
- production Google Ads / Meta native sync
- agency white-label public reporting
- CAPI payload attribution enrichment — sending an ad platform (Meta/Google/etc.) our first-touch source, AI-source, journey, or channel, i.e. more than the match/value fields (`event_id`, hashed email, click IDs, value/currency) their own pixel already collects

*(Already prohibited above and deliberately not repeated here: predictive score, conversion
probability, LLM analyzer, CRM Profile / Assign to Sales / Sync to CRM, public sharing, New Campaign /
ad campaign actions.)*

**CAPI payload note (2026-07-23).** The senders read only match/value fields; no sender reads
`first_touch_source`, `ai_source`, `journey`, or `channel` (`props` carries `ai_source` at
`api/routes/conversion.js:249`, but every formatter drops it at the payload boundary). Enriching the
payload is prohibited on two grounds: **(a) positioning conflict** — sending Meta *more* than its own
pixel could collect contradicts the privacy-first/cookieless wedge (PII is redacted on ingest, a
tested guarantee); and **(b) value is UNVERIFIED** — it is not established that Meta meaningfully uses
arbitrary `custom_data` for optimization (standard fields drive it; extra keys may be ignored). (b)
must be verified against Meta's current docs *before* any build; absent that, enrichment trades the
privacy position for nothing. The sanctioned alternative — invert it and show the customer what the
platform can't see — is a reporting surface, not a payload change; it is a GTM differentiator idea,
not a prohibited element, and is recorded in `docs/SourceTrack_GTM.md` §5.2.

**Product rule:** any future lead-quality feature must use **first-party SourceTrack data only**,
unless a separate privacy, legal, vendor, accuracy, and pricing review is approved first.

**Allowed direction** (first-party only): lead-quality insights · journey summaries · source-quality
explanations · campaign-quality notes · conversion-path summaries · simple qualification signals
derived solely from captured SourceTrack data.

Copy consequence — safe: *"See which sources bring qualified leads."* Unsafe: *"Reveal anonymous
companies." · "Enrich every lead with contact data." · "Score leads automatically with AI." ·
"Identify your ideal customer profiles automatically."* The copy-facing form of this rule is
`docs/SourceTrack_GTM.md` §5.1; this section is the scope-facing form.

---

## 27. Final Design Approval Checklist

A design pass is not approved until every answer is yes:

- Does it look like SourceTrack, not a template?
- Can a founder understand each screen in 5 seconds?
- Are analytics and attribution both strong?
- Is revenue/conversion visually dominant where available?
- Are secondary metrics quieter?
- Are unavailable metrics hidden or calmly explained?
- Is Report Builder powerful but not BI?
- Are V1, V1.1, and V2 scopes clearly separated?
- Does it feel lighter than Cometly/Usermaven?
- Does it feel at least as simple as DataFast/PiQo?
- Does it avoid generic 2020 SaaS dashboard styling?
- Does it avoid enterprise BI density?
- Does it look polished enough for a top-tier landing-page screenshot?
- Are all charts custom-feeling and useful?
- Are Report Builder states complete?
- Are data truth labels present where required?

If any answer is no, redesign before implementation.

---

## 28. Implementation Handoff Notes

When this design is implemented in code:

- Start with audit of current routes/components/data availability
- Do not trust design screens as feature scope by themselves
- Implement feature flags before surfacing V1.1/V2 UI
- Enforce revenue/cost/GSC gating in code, not just copy
- Hide unavailable metrics entirely by default
- Keep core dashboard simple
- Keep Report Builder template-first
- Keep future components locked/hidden
- Validate with real browser QA, not screenshots only
- Test empty/loading/no-data/locked states
- Test mobile journey sheet
- Test accessibility states
- Test internal Ops Console states separately from customer app states
- Test support preview read-only behavior on every customer route
- Test public demo in no-auth/no-API mode
- Test billing and plan states with Stripe feature gates

---

## 29. Public Website / Marketing Site

Scope: V1 marketing surface.

The public website must sell SourceTrack within five seconds without looking like a heavy analytics platform.

### 29.1 Website positioning

Website positioning, hero copy, and voice are owned by `docs/SourceTrack_GTM.md` (canonical) and
`docs/marketing/website_seo_plan.md`. Do not maintain a competing hero here.

### 29.2 Website visual direction

> The marketing site is **light-first with a dark toggle**, defaulting to the visitor's OS preference. Both themes share the same warm neutrals; only the canvas inverts. The product band and the final CTA render on warm ink in **both** themes — that is what gives the light theme its structure and keeps the product frame reading as a lit object rather than a flat screenshot.

Borrow the premium lightweight SaaS feel from modern lime-glow landing pages:

- product-first hero
- soft lime glow behind the product preview
- clean rounded cards
- clear three-step explanation
- simple pricing cards
- calm FAQ
- strong final CTA
- mobile-first stacking

Do not borrow:

- automation workflow canvas UI
- generic AI automation language
- fake logo strips
- excessive neon/lime backgrounds
- heavy animation
- decorative blobs
- workflow-builder metaphors

### 29.3 Homepage structure

1. Hero with product demo
2. Attribution product preview
3. How it works: Track -> Connect -> Know
4. Use-case cards
5. Pricing preview
6. FAQ
7. Final CTA
8. Footer with Docs, Guides, Comparisons, Legal, and Status

### 29.4 Hero product demo

The hero visual should show an attribution story, not a generic dashboard.

Example rows:

- Google Search -> Pricing page -> Lead -> Pipeline value
- ChatGPT -> Blog post -> Signup -> Trial started
- LinkedIn -> Demo page -> Booking -> Qualified lead

Use fixture data only. Do not imply exact attribution where unsupported.

### 29.5 Public interactive demo

The homepage may include a public no-login interactive demo.

Rules:

- static fixture data only
- no auth
- no API calls
- no Supabase
- no PostHog
- no fetchApi
- no real customer data
- fast loading
- safe for public indexing

Demo should show:

- visitors
- leads/conversions
- revenue or pipeline only if fixture-labeled
- top sources
- AI referrals
- campaigns
- top pages
- recent conversion journey
- attribution explanation panel

### 29.6 Website SEO and conversion rules

Public pages should be product-led landing pages, not thin content-farm pages.

Required standards:

- clean URLs
- one clear H1
- strong above-the-fold value proposition
- one primary CTA per screen section
- internal links to docs, guides, pricing, comparisons, and use cases
- schema where appropriate
- no fake claims
- no unsupported compliance or integration claims
- no excessive comparison matrices
- page speed and Core Web Vitals discipline
- mobile readability

### 29.7 Public site safe claims

Allowed:

- privacy-conscious analytics
- first-party attribution
- AI referral detection
- UTM/campaign tracking
- form/booking/conversion attribution
- Stripe beta/test-mode attribution where truthful
- manual Shopify webhook recipe
- Search Console landing-page/query visibility where connected

Avoid:

- SOC 2 certified unless true
- GDPR compliant unless legally verified
- native Shopify app
- native Stripe app
- automatic Meta/Google Ads sync unless built and verified
- perfect attribution
- exact keyword-to-customer attribution
- exact AI prompt attribution

### 29.8 Illustrative-data disclosure

§29.4 and §29.5 already require fixture data on every marketing mockup. This section governs how that
is *disclosed*.

> Illustrative/sample data on marketing mockups is disclosed via **ONE small muted-text line per
> page** (e.g. in the page footer), **never a per-card badge.**

Per-card badges compete visually with real content and read as a defensive sticker rather than a quiet
disclosure. One line, stated once, is both more honest and less noisy — it discloses the page rather
than apologising for each card.

This does not weaken §6 data-truth or the fake-data prohibitions in §26. Disclosure is in addition to
using fixture data, never a substitute for it, and never a licence to show a number the product cannot
produce.

**Shipped implementation — PR #581 (Option A), 2026-08-03.** Per-card "Sample data" pills were removed
from all six homepage mockup components and replaced with a single footer line:
*"Product visuals shown use illustrative data."* (`marketing/src/layouts/partials/Footer.astro`).

**Enforced in CI.** `api/tests/key-features-mockups.test.js` asserts the per-card badge is **absent**
and the footer line is **present**; `api/tests/direct-rescue-mockup-fixture.test.js` asserts the same
for the DirectRescue mockup. A reintroduced badge fails the build.

---

## 30. Admin / Ops Console

Scope: Internal operator-only. V1 minimum for paid-beta readiness.

Admin/Ops is not a customer dashboard. It must be boring, safe, readable, and operational.

### 30.1 Purpose

The Ops Console answers:

- Which customer/site needs support?
- Is tracking installed?
- Is onboarding complete?
- Can an operator safely preview the customer context?
- What changed recently?
- What did operators do?

### 30.2 Admin shell

Bare `super_admin` users see only:

- SourceTrack logo
- INTERNAL
- Ops Console
- Sign out

Do not show customer navigation outside support preview.

Do not show:

- Dashboard
- Analytics
- Attribution
- Campaigns
- Report Builder
- Integrations
- Settings
- Active Site dropdown
- Add New Site

### 30.3 Ops Console overview

Top metrics:

- Companies
- Members
- Sites
- Verified sites
- Needs attention if available

Tabs:

- Companies
- Members
- Sites
- Site Inspector
- Feature Status
- QA Notes
- Audit Log

### 30.4 Companies tab

Columns:

- Company/workspace name
- Members
- Sites
- Created
- Status if available

### 30.5 Members tab

Label as Members or Workspace Members, not Users, unless the backend returns unique auth users.

Columns:

- Email if available
- Masked user ID if email unavailable
- Company
- Role
- Joined

Rules:

- Do not show raw long UUIDs as if they are emails.
- Mask fallback IDs.
- Add search/pagination once member count exceeds 50.
- Keep operator readability higher priority than database completeness.

### 30.6 Sites tab

Columns:

- Domain
- Company
- Plan
- Onboarding
- Tracking status
- Actions

Rules:

- Do not show raw `site_key`.
- `site_key_redacted` may be used only if needed.
- Preview action must use `site_id`.
- Test/internal sites must be labeled.

### 30.7 Site Inspector

Use for support diagnostics.

Preferred lookup:

- Site ID
- Domain

Avoid encouraging raw site-key workflows. If site-key lookup remains, label it as advanced/internal.

### 30.8 Feature Status

Internal truth panel only.

Allowed states:

- live
- partial
- internal-only
- dormant
- not implemented

Rules:

- Keep internal only.
- Never expose to customers.
- Use high-contrast rows in dark mode.

### 30.9 QA Notes

Internal notes for support and truth tracking.

Rules:

- Notes are operator-only.
- Notes must not expose secrets.
- Notes should show author and timestamp where available.
- Editing/deleting notes should be audited.

### 30.10 Audit Log

Audit log must be legible and high contrast.

Columns:

- Time
- Admin
- Action
- Target

Rules:

- Never show tokens, JWTs, cookies, raw site keys, or secrets.
- Operator actions must be timestamped.
- Preview launches should be logged.

### 30.11 Admin empty/error/loading states

Every admin tab needs:

- loading state
- empty state
- endpoint-specific error state
- retry action

No blank admin pages.

---

## 31. Support Preview / Read-Only Operator Mode

Scope: V1 internal support safety.

Support Preview allows a `super_admin` to view a selected customer site context without impersonating the customer identity.

### 31.1 Preview session storage

`sessionStorage.sourcetrack_admin_preview` may contain only:

- site_id
- site_name
- site_domain

Do not store:

- raw site_key
- customer JWT
- cookies
- refresh token
- access token
- API token
- webhook secret

### 31.2 Preview shell

In support preview:

- customer nav may appear
- active site card is locked to one site
- no site dropdown
- no global customer list
- Internal -> Ops Console remains visible
- operator email remains visible
- Exit Preview is always available

### 31.3 Global preview banner

A support preview banner must appear on every customer route.

Routes:

- Dashboard
- Setup
- Settings
- Integrations
- Campaigns
- Report Builder
- All Leads
- Attribution / Analytics pages

Banner copy:

> Support Preview Mode: [site/domain] · Read-only

Primary action:

> Exit Preview

### 31.4 Read-only UI rules

In support preview, hide or disable write actions.

Disable/hide:

- Save buttons
- toggles that persist settings
- billing management
- domain changes
- API token reveal/create/copy
- webhook secret reveal
- Danger Zone
- Delete Account
- erase/export visitor data if sensitive or mutating
- Import Costs
- CSV uploads
- Connect integration buttons
- setup mutation actions
- saved report mutations
- pin-to-dashboard actions
- report delete/duplicate/save actions if persisted

Allowed:

- read-only filters
- date range changes
- local-only visual exploration
- docs links
- non-mutating view actions
- Exit Preview

### 31.5 Setup in preview

Setup must not show broken snippets.

If support preview lacks raw site key:

> Install snippet is hidden in support preview. Use Ops Console or Site Inspector for setup diagnostics.

Do not show:

- `data-site-key="undefined"`
- copyable broken install code
- Verify installation mutation controls

### 31.6 Backend accidental mutation guard

The frontend should send a preview header when support preview is active:

`X-Sourcetrack-Support-Preview: true`

Backend should reject non-GET/HEAD customer-app mutations with:

> Support preview is read-only.

Do not block `/api/admin/*` operator endpoints.

This is an accidental-mutation guard, not a substitute for real authorization.

### 31.7 Preview exit behavior

Exit Preview must:

- clear `sessionStorage.sourcetrack_admin_preview`
- return to `/ops`
- restore bare operator shell
- remove customer navigation
- preserve the operator's own authenticated session

---

## 32. Billing / Plan Screen

Scope: V1 paid-beta readiness.

Billing should be app-native and simple.

### 32.1 Billing page/card

Show:

- Current plan
- Usage
- Limit
- Renewal/billing period if available
- Manage billing
- Upgrade/change plan
- Payment status
- Stripe environment status when relevant

### 32.2 Billing states

Required states:

- Free/trial
- Active paid plan
- Early-bird annual offer
- Past due
- Canceled
- Cancel at period end
- Limit exceeded
- Stripe portal unavailable
- Test mode only
- Production Stripe not ready/blocked

### 32.3 Billing truth rules

Do not imply:

- production Stripe attribution is fully ready
- billing is live if Stripe catalog is incomplete
- limits are enforced unless verified
- plan changes are available if blocked

Use clear operational copy.

### 32.4 Billing UI simplicity

Billing should not become a sales page inside the app.

Rules:

- one current-plan card
- one usage/limits card
- one billing management CTA
- one upgrade/change plan CTA if available
- no heavy plan matrix inside authenticated app
- link to public pricing for full plan comparison when needed

---

## 33. Production / Test Data Labeling

Scope: V1 operator and support readiness.

Production admin surfaces must clearly distinguish:

- production customer site
- internal test site
- local/dev site
- staging/demo site

### 33.1 Site badges

Allowed badges:

- Production
- Internal
- Test
- Local
- Staging
- Demo

### 33.2 Rules

- Localhost sites should not look like real customer production sites.
- Internal/test data must not pollute customer-facing views.
- Ops Console may show test data only if clearly labeled.
- Paid-beta screenshots should avoid test pollution unless the purpose is internal QA.

> Test and internal data is **labelled, not hidden**. Any source, campaign or lead originating from a verification run carries a `TEST` chip in the spend colour, in every surface where it appears. Removing it from customer-facing views would make the totals disagree with the underlying data.

---

## 34. Status / Incident / Support UI

Scope: V1 minimum readiness.

### 34.1 Customer-facing status

Include a simple status/incident plan in design and docs.

Possible surfaces:

- footer status link
- support docs page
- in-app incident banner if major outage

### 34.2 In-app support card

Settings or Help area may include:

- support email
- docs link
- installation help
- billing help

Do not add chat widget unless actually supported.

### 34.3 Incident banner

If shown in app:

- short title
- plain-language impact
- status link
- dismiss only if non-critical
- no raw provider errors

---

## 35. Design Reference Rule

SourceTrack may borrow visual quality from premium SaaS websites, but product UI must remain attribution-specific.

Borrow:

- product-first hero
- soft lime glow
- premium cards
- clean pricing
- simple three-step explanation
- strong mobile stacking

Do not borrow:

- automation workflow canvas
- generic AI automation claims
- fake logos
- excessive decorative effects
- heavy animations
- enterprise dashboard density

### 35.1 Stitch usage

When using external inspiration in Stitch:

- treat screenshots as visual references only
- use this spec as source of truth
- generate one canonical design system
- do not create duplicate alternatives
- do not introduce new product scope
- keep V1/V1.1/V2 gates visible
- mark future components as locked or hidden

### 35.2 Admin/Ops visual exception

Do not apply marketing glow heavily to Admin/Ops.

Ops must stay:

- readable
- boring
- high contrast
- safe
- operational
- internal-only

### 35.3 Competitive pattern validation (2026-07-30)

Research pass over orchly.ai, sourceloop.ai, getsleek.io and Uny Elements. **Nothing below changes a
rule.** Every finding CONFIRMS a rule this doc already states, so this subsection is a log of external
validation, not a spec revision. Recorded so a future contributor can see that these patterns were
independently arrived at rather than copied, and does not re-litigate them.

**1. Three-step "how it works" — validated twice, still unbuilt.**
Already required by §29.2 ("clear three-step explanation") and §35 Borrow ("simple three-step
explanation"). Two direct/adjacent competitors ship it: SourceLoop's *Track / Measure / Act*, and
Sleek's *"Three steps, that is all"* with numbered 01/02/03. Two independent arrivals at the same
structure raises the PRIORITY of actually building ours — it does not change the spec, which was
already correct.

**2. Comparison table — validated a third time, and the fix is promotion not construction.**
Already built at `/compare/ga4`. Sleek ships an identical grid (Sleek / Google / Plausible / Datafast).
The #501 UI audit flagged ours as under-promoted, not missing. So the action stays **promote, don't
rebuild** — the footer link added in #505 is that promotion, not a new page.

**3. Competitor brand assets are OFF LIMITS — trademark, not taste.**
Stated explicitly because §35's existing "do not borrow: fake logos" reads as a style rule and this is
not one:

- Competitor **logos**, **icon sets**, and product **screenshots** may never be reused, embedded, or
  presented as SourceTrack's own. This is a trademark / misrepresentation exposure, not a design
  preference, and no visual-polish argument overrides it.
- Layout, composition, information architecture and copy PATTERNS may be studied and adapted freely —
  that is what §35 Borrow already permits, and what this subsection is a record of.
- The line: a pattern is an idea about arrangement; a logo or a UI screenshot is someone else's
  property. §35.1's "treat screenshots as visual references only" governs how they may be *looked at*
  during design; it is not permission to ship one.

**4. Sleek's "AI Chat — ask questions in plain English" is a live example of what §26 already bans.**
Cross-referenced so the pattern is recognisable in the wild instead of re-derived from scratch: it is
LLM-narrated freeform data over the customer's own numbers, i.e. §26's prohibited **LLM analyzer** plus
CLAUDE.md §6's *"no LLM-narrated freeform revenue/ROAS/attribution numbers… Deterministic,
cite-the-rows only."* A competitor shipping it is not evidence it is safe for us — our position is that
a confident narrated number we cannot verify is worse than no number, and that is a positioning choice,
not a capability gap. Seeing it on a competitor's site is expected; treating that as a reason to
reconsider is the mistake this note exists to prevent.

### 35.4 Brand-asset authenticity (asset sourcing)

§35.3 item 3 governs whether a third-party mark may be used at all. This governs where it comes from
when it may.

> **Never reconstruct, approximate, or extract-and-repurpose a brand asset or logo when the official
> source is blocked or unavailable. Use a plain text label instead.** When sourcing IS available,
> confirm the URL is the **company's own domain** — not an aggregator, icon library, or resale site.

A blocked press kit is a signal to stop, not a puzzle to route around. An approximated mark is a
misrepresentation of someone else's identity even when the approximation is well-intentioned, and a
plain text label is always a correct, shippable answer — it costs a little polish and no exposure.

**Two motivating incidents, 2026-08-03:**

- An agent hit a 403 on an official press-kit link, then extracted a single letterform from an
  unrelated animated SVG and fabricated a `viewBox` around it to stand in for the real mark. Fabricating
  a mark from unrelated art is the failure mode this rule names explicitly, because it does not look
  like copying at the moment it is done.
- Issue #577's Perplexity mark was a **generic hexagon approximation**, not sourced from
  `perplexity.ai`. No official brand page exists there — confirmed via search — which under this rule
  means the answer was a text label from the start. **Resolution: replaced with a plain text label
  "Perplexity" (PR #583).**

---

**Status:** Complete SourceTrack design.md for product design, public website design, Stitch generation, Ops Console design, support preview safety, and implementation planning.


---

## 36. Agentic Actions — MCP-Driven Setup Workflows

Scope: V1.1. Governs any action an agent (internal or an external agent connecting via MCP) can
trigger against a customer's SourceTrack account. This section does not change §26 — it defines a
narrow, explicitly-scoped exception process for setup/connection actions only.

### 36.1 Principle

An agent may **recommend** an action. An agent may **never execute** an action without the account
owner's explicit approval, given at the moment of that specific action — not a standing blanket
permission granted once and reused silently. This mirrors the same discipline already governing every
write this product's own engineering process uses internally: nothing destructive or state-changing
happens without an explicit human go-ahead, requested and given per action, not assumed from context.

### 36.2 What's in scope now

Setup and connection actions only:

- Connect Stripe (test mode, per existing §17 rules)
- Connect Meta CAPI / Google Ads CAPI (OAuth handshake, once each platform's own review status allows it — see §17.4/§17.6-equivalent integration rules)
- Connect Shopify (native app or manual webhook path)
- Connect Google Search Console

These are configuration actions with no financial consequence and a trivial undo (disconnect). That
low-stakes, reversible profile is what makes human-approved agentic execution appropriate for this
category specifically — it is not a general argument for agentic execution elsewhere.

### 36.3 What's explicitly out of scope — still prohibited, unchanged from §26

- Any ad platform budget, bid, or spend action
- Pausing, enabling, or scaling a campaign
- Creating a new campaign
- Any action with an unbounded or unclear blast radius
- Any action without a clean reversal path

An agent may **surface information** relevant to these (e.g. "campaign X has had zero conversions in
14 days") as a factual, non-narrated data point — consistent with §26's existing ban on fake AI
predictions and fake recommendations. Recommending or executing a change in response to that
information is not authorized by this section and requires a separate, dedicated policy pass — action
whitelist, confidence gating tied to §19.2's partial-data-warning pattern, a durable audit and reversal
trail, and an explicit §26 amendment — before any design or engineering work begins. Until that pass
happens, this category stays fully governed by §26 as currently written.

### 36.4 UI consequence — none

This section adds no new screen, no chat surface, no notification center. The approval step for an
agent-recommended connection action uses the same tool-call confirmation pattern already in place for
every other agent-triggered write in this project — it is a protocol-level gate, not a product
surface. If a customer-facing approval UI is ever needed beyond what the existing Settings/Integrations
pages already provide (§17, §18), that is a new design pass, not an extension of this section.

### 36.5 Explicitly not this

Per the same reasoning that ruled out an in-product LLM analyzer (§26) and a chatbot surface: this
section does not authorize an in-product AI assistant, chat window, or conversational interface of any
kind. The agent lives outside the product (an external MCP client, or an internal automation acting
through the same MCP surface) — SourceTrack exposes tools; it does not host the reasoning.

---

## 37. Motion

Motion signals quality when it is restrained and signals AI-generated filler when it is not. The distinction is whether the motion tells you something.

### 37.1 Permitted

| Where | Motion | Duration |
|---|---|---|
| Page or section entry | Fade up 16px, stagger 60–110ms between siblings | 600ms |
| Bar chart entering view | Grow from baseline, staggered left to right | 700ms |
| Meters and contribution bars | Fill from 0 to value | 800ms |
| KPI value on first paint | Count up, cubic ease-out | 900ms |
| Attribution trail | Dots scale in sequentially along the path | 450ms each |
| Buttons and cards | 1–3px lift on hover | 180–300ms |
| Theme switch | Background and text colour transition | 350ms |
| Nav hairline | Appears only once scrolled past 8px | 300ms |
| Loader | The two-dot drift — the only permitted loop | 1.6s loop |
| Scroll-scrubbed connector/progress fill | Fill proportional to scroll position within the element's own viewport window, latching at 100% and never resetting on re-scroll | Bound to scroll, not time — must still render fully revealed under `prefers-reduced-motion` |
| Product-mechanic animation | Motion depicts a real, verifiable product behaviour — attribution stitching, credit redistribution across touch models, a revenue or count figure resolving to its actual computed value — never decorative particles, glows, or abstract motion disconnected from what the product does | Duration per whichever row above the motion is built from; must remain fully legible and complete under `prefers-reduced-motion`, and the story the motion tells must be factually true of the underlying data, not illustrative-only, unless it carries the §29.8 illustrative-data disclosure |

Standard easing: `cubic-bezier(.22,.72,.28,1)`.

The scroll-scrubbed row is the one **duration-less** entry in this table: its progress is a function of
scroll position, not elapsed time, so a fixed duration cannot describe it. It is still bound by §37.2
and §37.3 — latching at 100% is what satisfies "reveals fire **once**", and the reduced-motion
requirement is not relaxed by the absence of a duration. Reference implementation: the JourneyMockup
attribution trail, PR #582, verified with a 5-step visual check (4-frame progress burst, settled-state
idempotency, reduced-motion, dark/light, single-trigger non-replay).

**The product-mechanic row is a constraint on the other rows, not a tenth kind of motion.** A count-up
is permitted by the KPI row; what this row adds is that the number must count up to a value the product
actually computed. It is the §37 opening line — "the distinction is whether the motion tells you
something" — made testable for marketing mockups, where the temptation to animate for its own sake is
strongest and where nothing on screen is a live reading. Decorative motion is not merely weaker here,
it is a truth problem: motion that dramatises a mechanic the product does not have is a claim, and §6
governs claims.

Reference implementations, both already compliant before this row existed:

- **JourneyTrail** (Hero, PR #571) — the dot-to-dot trail *is* the first-touch-to-converted mechanic
  playing out. Remove the animation and you remove the explanation, which is the test: decorative
  motion can be deleted with no loss of meaning.
- **ModelCompareMockup** (PR #576) — one real $240 conversion redistributing across three real
  attribution models with the real arithmetic (100% / 100% / 33-33-33), captions quoted verbatim from
  `MODEL_SUMMARY` in `attributionModels.js`. The verbatim coupling is enforced by
  `api/tests/key-features-mockups.test.js`, so the depicted mechanic cannot drift from the shipped one
  without reddening CI.

Cite these two the way §2.7 cites PR #583: as the shape to match, not as a style to admire.

### 37.2 Forbidden

- Any looping animation other than the loader
- Parallax, scroll-jacking, marquees, auto-rotating carousels
- Motion that repeats when an element re-enters the viewport — reveals fire **once**
- Animating anything other than `transform` and `opacity` in a list or table
- Motion on a data value that is still loading, which implies a reading that isn't there yet
- Entrance animation on the app shell. Chrome appears instantly; only content animates.

### 37.3 Accessibility

Every animation above must sit inside `@media (prefers-reduced-motion: no-preference)`. Under `reduce`, elements render in their final state immediately — including meters at full width and KPIs at their final value. Reduced motion must never mean missing data.

---

## 38. Data-poor mode

Most SourceTrack accounts will spend their first weeks with very little data. A dashboard designed for 50,000 visitors rendered over 5 conversions looks broken, and that first impression sets the customer's opinion of the product's quality.

### 38.1 Thresholds

| Condition | Behaviour |
|---|---|
| 0 events ever | Full install-guide state. No dashboard chrome at all. |
| Events but 0 conversions | Traffic surfaces render. Revenue, attribution and journey surfaces collapse to a single explanatory line with one action. |
| Fewer than 3 conversions | Charts become ranked lists. Deltas and percentages are suppressed rather than shown against a base of 1. |
| Fewer than 10 conversions in range | Show the §19.2 partial-data notice above the primary table. |

### 38.2 Rules

- An empty module is **one line with a link**, never a full-height card. Multiple empty full-height cards on one page is the single clearest signal that a product is not being used.
- Empty and populated states on the same screen must not appear to contradict each other. "No conversions in the recent window" beside a table showing four conversions reads as a bug — name the window explicitly ("Nothing in the last 30 minutes").
- Never render a percentage whose denominator is under 10 without a caveat.
- Suppress a delta entirely if it has no value. A `vs prior` label with nothing beneath it reads as broken, not as empty.

---

## Change log — v1.3

- §3 rewritten: warm neutral system, four-hue palette, gradient specification, contrast table, dot system.
- Accent updated `#C8F000` → `#D2EC2A`; `#FF7A33` added as the spend counterweight; `#F2A93B` added as a gradient-only bridge.
- Purple, all secondary greens, info blue and slate removed from the system.
- §9.2 rewritten, §9.3 amended and §9.9 added: charts may not draw shapes their data cannot support; dual-axis charts prohibited in V1.
- §37 Motion added.
- §38 Data-poor mode added.
- §23: heatmap and notification bell flagged as shipping against their gate; dark mode confirmed V1.
- §33: test-data labelling made explicit.
- §29.2: marketing site set to light-first with dark toggle and theme-independent ink bands.
- Typography standardised on Geist across app and marketing; Switzer removed.
