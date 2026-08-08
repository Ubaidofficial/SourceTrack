# SourceTrack - Complete Design & Product Spec

**Version:** 1.5 — v4 visual identity: new palette, new type system, new mark. §3 replaced wholesale.
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
- v1.4 (2026-08-05): §29.2 rewritten for **light-only**, closing the contradiction flagged but
  deliberately left unfixed by #644. The opening paragraph read *"light-first with a dark toggle,
  defaulting to the visitor's OS preference … render on warm ink in both themes"*; PR #643 deleted the
  toggle and collapsed marketing to a single light palette, so the spec Phase 2 builds from described
  behaviour that no longer exists. **The design intent is preserved, not deleted:** the warm-ink product
  band and final CTA stay, *and so does the stated reason* — they are what give the light page its
  structure and keep the product frame reading as a lit object rather than a flat screenshot. Only the
  theme mechanics (toggle, OS-preference default, "both themes", canvas inversion) are dropped. PR #643
  named as the shipped reference implementation.
- v1.4 (2026-08-05): §29.2's **"soft lime glow behind the product preview"** reconciled with §2.6 in the
  §29.2 text itself, so the homepage spec no longer has to be read alongside §2 to be applied safely.
  Both limits restated inline (~15% of visible area, never a full-bleed wash or glow behind primary
  content; computed WCAG AA verified, never eyeballed), and §2.6's **OPEN live-hero defect** —
  glow at ~70–80% of view, white-on-lime below AA — is cross-referenced explicitly as a defect and
  **not** a reference implementation, so Phase 2 cannot re-ship it by copying the current hero.
- v1.4 → **CLOSED 2026-08-06: glassmorphism is a full V1-WIDE BAN.** Was open pending a founder
  call between a V1-wide product ban and a guardrail scoped to AI-generated mockups only. **Ruled:
  V1-wide.** It is now listed in §26 (which is what makes it binding on shipped UI) and explained in
  §26.2; §25.1 is unchanged and still binds generation. Raised when a "liquid glass" card technique
  was considered and retracted without a clear answer either way.

---

## 0.4 V1.5 Change Log

**v1.5 (2026-08-08) replaces §3 wholesale.** Every prior version of this doc refined one visual
system; this one swaps it. Founder ruling, 2026-08-08: adopt the v4 design handoff **verbatim** —
its palette, its type system and its mark — rather than mapping it onto v1.4's tokens.

This is a rebrand, not a marketing refresh. It repaints the product as well as the site, and it
**reverses four standing rulings**. Each is listed here rather than folded into §3, because a reader
who remembers the old rule needs to find out here that it changed and why.

| Was | Now | Where |
|---|---|---|
| Accent `#D2EC2A` | `#CCF03F` | §3.1 |
| Bone `#F7F4ED`, warm neutrals | Paper `#FAFAF7`, **cool** neutrals | §3.1, §3.2 |
| Geist, single family | Schibsted Grotesk + **Instrument Serif italic** + JetBrains Mono | §3.1, §3.1.2 |
| Mark: three agent dots + one lime source disc | Two tilted capsule tracks with travelling signals | §3.1 |

### The four reversals, stated plainly

1. **§3.4's "no separate success green" is REVERSED.** v1.4 read: *"There must be no separate success
   green, no terminal green, no info blue, no purple, and no slate in the shipped app."* The handoff
   ships `--green #00AA57` for positive deltas and healthy status. Green is now admitted, **bounded**
   (§3.4) and **measured** (§3.6 — it fails AA as text on light and is fills-only there). No info
   blue, no purple and no slate — those three stay banned.

2. **§3.1's single-family mandate is REVERSED, narrowly.** v1.4 read *"Single family across app,
   marketing and docs."* Instrument Serif italic is admitted as a **display-only exception**, scoped
   in §3.1 to one emphasis phrase per headline. It is the handoff's signature device and Geist italic
   cannot carry it. The exception is scoped so it cannot spread: it is never body copy, never UI
   chrome, never a whole headline.

3. **§3.1's warm-neutral argument no longer describes the shipped palette.** v1.4 argued *"Cool black
   plus acid green is the most-copied AI-startup theme in circulation … warming the neutrals is what
   makes the same lime read as expensive."* The v4 neutrals are cool (`#FAFAF7`, `#EEF3F3`,
   `#C9D1D1`). **The argument is preserved in §3.1 as a recorded dissent rather than deleted** — it
   was the reasoning behind a deliberate choice, and a reader comparing v4 against a competitor needs
   to know the risk was named in advance and accepted, not overlooked.

4. **§3.7's dot system is INVALIDATED and rewritten.** It extended the geometry of the old mark
   ("The mark is a first touch and a last touch"). The new mark is two capsule tracks, so that
   sentence no longer describes anything. §3.7 is rewritten around the new geometry; the attribution
   trail, source chip, loader and empty state all survive as patterns, re-derived.

### What did NOT change

- **§0's Scope Gate**, and its authority over scope conflicts.
- **§2.6's accent-density ceiling (~15%).** The hex changed; the ceiling did not.
  ⚠️ **It could NOT be re-measured, and that is a defect, not a deferral** — see below.
- **§2.7's container-shape variety.**
- **§26's prohibited elements**, including the V1-wide glassmorphism ban — with one amendment
  recorded in §3.5, where the handoff's hero treatment meets §3.8's "no decorative blobs".
- **§29.8's one-disclosure-line rule.**
- The **`--violet-*` rejection stands.** The handoff still ships those aliases pointing at orange
  values. They were rejected in v1.4 because the names are a trap, and that reasoning is unaffected
  by the palette change. Use `--orange-*`. `api/tests/v3-lift-detection.test.js` still bars them.

### ⚠️ §2.6 IS CURRENTLY UNMEASURABLE — found during v1.5, pre-dates it

`marketing/scripts/accent-density.mjs` — which §2.6 names as *"THE single answer"* and which is
supposed to be the one place that answers the 15% ceiling — **exits 2 without producing a figure**:

```
token --paper not found in built css
```

**Verified pre-existing, not caused by v1.5.** The same command fails identically on unmodified
`origin/main` (ef4f7627). Cause: `--paper` is declared only in `home-design.css:69`, and the v3
homepage does not import that stylesheet — the same non-import that `v3-surfaces.css` documents as
"conflict 1". So the harness has been unable to read the homepage **since the #690 cutover**, roughly
fourteen PRs.

**What follows, and it is uncomfortable:** every §2.6 claim made about the v3 homepage since #690 —
including v1.4's "open hero violation at ~70–80%" — rests on a harness that has not run against that
page. The violation may still be real; the point is that **nothing has measured it either way**, and
§2.6 reads as though something had.

This is not fixed in v1.5, because fixing it means repointing the harness at the v3 token layer and
re-deriving its geometry, which is a change of its own. It is recorded here so the ceiling is not
read as verified. **Do not cite `accent-density.mjs` output as evidence until it runs.** It is also
why §3.5's hero atmosphere ships with its accent budget unconfirmed — stated there too, rather than
only here.

### Open defects recorded, not fixed

Three v4 token pairings fail WCAG AA as measured (§3.6). They are recorded here as **open**, with
proposed corrections, rather than silently shipped or silently altered — "verbatim" was a ruling
about which system to adopt, not a licence to ship an unmeasured contrast failure:

- `--f-ink-3` light `#8D949C` — 3.07:1 on card, 2.76:1 on app background, used as text on 43 rules.
- `--f-ink-3` dark `#7D8090` — 3.95:1 on card.
- `--red #E54545` — 3.81:1 on paper; AA-large only, not body text.

See §3.6 for the measurements and the minimum corrections that clear AA.

---

## 0.5 V1.6 Change Log — the design bundle outranks this document

**Founder ruling, 2026-08-08.** For **visual design**, the v4 design bundle is now the authority and
this document follows it. Where they disagree, the design wins and §3/§35 get amended to match —
which is the reverse of how every prior version worked.

> *"overrule our design md to make sure everything looks much better than what is in the screenshots;
> we don't need to follow current design md, instead we need to update our rules based on the new
> design."*

### What this covers, and what it does NOT

**COVERED — the design bundle wins:** palette, typography, the mark, container treatments, section
composition, accent density, motion, and third-party mark usage in a comparison (§35.3, amended).

**NOT COVERED — unchanged and still binding.** These are not visual-design decisions, and nothing in
the ruling touches them. Do not read "the design wins" as reaching any of them:

| Area | Why it is out of scope |
|---|---|
| **§0 Scope Gate** | V1 / V1.1 / V2 gating is a shipping decision, not a look |
| **§6 data truth** | No fake zeros, no fake revenue, cost-gated metrics stay gated. A design that *shows* a number we cannot source is a data defect, not a style choice |
| **§26 prohibited elements** | The truthfulness prohibitions — no LLM-narrated freeform numbers, no fake predictions |
| **§29.8** | One illustrative-data disclosure line per page |
| **Privacy** | Cookieless, no fingerprinting, DNT/GPC, no cookies |
| **CLAUDE.md §0 / §6.5** | Production safety, secrets, RLS, tenant isolation |
| **Licensing** | The ITF ruling stands — a design specifying an asset we cannot legally ship is still blocked (§3.1.2) |

If the design bundle ever requires something in the right-hand column, that is a genuine conflict and
needs its own ruling — it is not settled by this one.

### Applied in v1.6

- **§35.3 item 3 narrowed** — competitor marks may identify competitors in a truthful comparison
  table. The "presented as our own", screenshot and redraw prohibitions survive. A factual-accuracy
  condition is attached, because nominative use only protects an accurate comparison.
- **Hero emphasis colour settled** — the hero's second-line word renders `--orange-700`, consistent
  with the other eight headlines, rather than the olive-green in the screenshots. That green is in
  neither palette; lime cannot be a text colour on paper (1.25:1, §3.6), so shipping it would have
  meant inventing an untokenised value.

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
- Not a **shipped** native Shopify app in V1 — ⚠️ **corrected 2026-08-06: the app IS BUILT.** It is
  **not deployed** and **Shopify Level 1 approval has not been granted**, so it is not available to
  any customer and must not be claimed. The prohibition stands; the old wording implied the code did
  not exist, which is false. See §17.6.
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
- Native Shopify integration — ⚠️ **still unclaimable, but for a different reason than this list
  implies (2026-08-06): the app is BUILT, not deployed, and not Level 1 approved.** Do not claim it
  until it ships and is approved
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

> ⚠️ **RECORDED CONTRADICTION — NOT RESOLVED. Founder ruling 2026-08-06: record it, do not fix it.**
>
> **The heading and the rule disagree about scope.** This section is titled *"Accent-density
> **ceiling**"* — which reads as a cap on accents generally — but every sentence of the rule itself
> names **lime only**. §3.1 lists a second accent explicitly labelled *"Accent — counterweight"*.
>
> **The gap that follows: no rule caps TOTAL accent density.** A screen could hold 15% lime plus an
> unbounded amount of the counterweight and violate nothing written here, while plainly breaking the
> intent stated in the opening line — *"a signal stops signalling once it covers the screen."* Whether
> the ceiling should be per-accent or aggregate is an open design decision.
>
> **Do not silently reconcile this** by widening the rule text to "accents" or by narrowing the
> heading to "Lime-density ceiling". Either edit would look like a typo fix and would quietly decide
> the open question. It needs a ruling, not a wording pass.
>
> **v1.5 note — the contradiction is UNCHANGED and still unresolved; only dead hexes were removed.**
> This block used to cite `#FF7A33` (counterweight) and `#F2A93B` (gradient bridge). v1.5 retired both
> — the counterweight is now `#F0602A` and the bridge no longer exists (§3.5) — so the block was
> naming values that had ceased to exist, which would have made it unreadable rather than resolved.
> The wording is now hex-free and points at §3.1 instead, so a future palette change cannot rot it
> again. **The open question is untouched.**
>
> **v1.5 raises the stakes on it.** §3.5's hero atmosphere puts lime *and* orange on the same field —
> two orbs, a lime sweep, and seven tracers in both hues — which is precisely the "15% lime plus
> unbounded counterweight" case this block describes, now shipped rather than hypothetical.
> `accent-density.mjs` measures lime only. Until the ceiling is ruled per-accent or aggregate, that
> harness cannot answer whether the v4 hero passes, and **it should not be read as if it can.**

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
| Mark | Two tilted (28°) capsule tracks — a short peach one, a long lime one. A solid signal rides each track; the track **behind** the signal is lit and fades into a comet tail, the track **ahead** stays dim, and the signal cuts a clean gap as it passes. **Meaning: a first touch and a last touch, both still travelling.** Geometry and timings in §3.1.1. |
| Ink (structure / dark canvas) | `#1F2323` |
| Paper (light canvas) | `#FAFAF7` |
| Card surface, light | `#FFFFFF` |
| Accent — signal | `#CCF03F` |
| Accent — counterweight | `#F0602A` |
| Positive | `#00AA57` |
| Primary text, light | `#1F2323` |
| Primary text, dark | `#F2F4F3` |
| Border, light | `#DDE4E4` |
| Border, dark | `#303636` |
| Body font | Schibsted Grotesk (SIL OFL), weights 400–900. **Substituted for the handoff's Switzer — see §3.1.2.** |
| Display font | Schibsted Grotesk 800, headline tracking −0.078em at `h1`, −0.07em at `h2`. |
| Emphasis font | Instrument Serif *italic*, 400. **Display-only exception — see below.** |
| Mono font | JetBrains Mono. Code, IDs, amounts, latency. |
| Sidebar | 210px in the V1 app shell; **250px in the demo workspace** (§3.1.3) |

**The serif is one phrase, never a headline.** Instrument Serif italic exists to carry a single
emphasised phrase inside an `h1` or `h2` — *"Stop guessing. Start **attributing**."* — at `1.04em`
relative to the headline, line-height `.9`, tracking `−0.045em`. It is the one deliberate exception to
what was a single-family mandate through v1.4, and the scope is the whole point:

- **Never** body copy, UI chrome, buttons, labels, table cells, or app surfaces.
- **Never** a complete headline — if the serif is not contrasting against Schibsted Grotesk in the same line,
  it is doing nothing and should be removed.
- At most **one phrase per headline**, and not on every headline on a page.

> **Recorded dissent, carried forward from v1.4 — read before "warming up" anything.**
>
> v1.4's §3.1 argued: *"Cool black plus acid green is the most-copied AI-startup theme in circulation.
> Warming the body, card, border and muted-text values is what makes the same lime read as expensive
> rather than cheap."* The v4 neutrals are **cool** (`#FAFAF7`, `#EEF3F3`, `#C9D1D1`, ink `#1F2323`),
> which is the thing that paragraph warned against.
>
> This is preserved rather than deleted because it was a reasoned position, and the risk it names was
> **accepted deliberately in the 2026-08-08 ruling, not overlooked**. What follows from that: v4 buys
> its distinctiveness from *type, motion and the mark* rather than from palette temperature, so those
> three carry more weight here than they did in v1.4. Weakening them to "simplify" removes the only
> differentiation the cool palette leaves.
>
> Do **not** resolve this by half-warming the neutrals. A palette that is neither cool nor warm is the
> one outcome worse than either. If the cool direction is ever reversed, reverse it wholesale and
> amend this section — do not drift.

### 3.1.1 Mark geometry

The mark is a web component (`<st-logo>`) rather than a static SVG, because the mask ids must stay
unique per instance. Shadow DOM.

```
viewBox 0 0 48 48,  transform: translate(2.9 2.7) rotate(28 24 24)

bar A   x 6.2   y 4.5   w 10.4  h 25    rx 5.2   dot r 4.7   travel 14.6   ink #FF8552   phase -1.35s
bar B   x 22.8  y 3.2   w 11.4  h 38.5  rx 5.7   dot r 5.2   travel 27.1   ink #CCF03F   phase 0
```

- Traverse `2.9s cubic-bezier(.62,0,.38,1)`, alternating. Hover accelerates to `1.25s`.
- The signal stretches along its axis while travelling (`scale(.93, 1.14)`) and rounds out at each end.
- On arrival a ring pulses out of it, once per cycle, offset between the two bars.
- Attributes: `size` (px), `on-dark` (raises track opacity to `.5`, lit to `.92`), `still` (freeze).
- **`prefers-reduced-motion` freezes to a composed end frame — never a blank one.** A mark that
  disappears for a reduced-motion user is a broken mark, not a respectful one.

Sizes: 44px in the header lockup, 48px in the footer.

### 3.1.2 Why the body font is not Switzer

The handoff specifies **Switzer** and says "self-host in production". We do not ship Switzer. This
is the one place v1.5 knowingly departs from the verbatim ruling, and the reason is legal, not
aesthetic — so it is recorded rather than quietly substituted.

**Switzer is Fontshare-only.** No npm package and no Astro font provider carries it (verified
2026-08-08: `@fontsource/switzer`, `@fontsource-variable/switzer`, `switzer` and `@fontshare/switzer`
all 404). Shipping it meant committing the `.woff2` into this repo.

**That breaches the ITF Free Font Licence here.** §02: *"The Fonts may not … be distributed,
duplicated, loaned, resold or licensed in any way … This includes … uploading them in a public
server."* `Ubaidofficial/SourceTrack` is **public** (verified `private=false`), so the file in the
source tree is redistribution. §01 does grant Web *use* — serving the font from our own site is
licensed — so the repo is the problem, not the serving. The same reasoning `.gitignore` already
applies to `research/`.

Three alternatives were considered and rejected by founder ruling, 2026-08-08:

| Option | Why not |
|---|---|
| Keep the file out of git, inject at build | Workable, but adds private-asset plumbing to every build for one font |
| Load from the Fontshare CDN (§09's sanctioned route) | Breaks the no-third-party-font-host stance — and §3.4's implementation note calls a privacy product making third-party requests "a contradiction a competitor will point at" |
| Block on written consent from ITF | §02 names consent as the route, but it stalls the type layer indefinitely |

**Schibsted Grotesk** was chosen because it is OFL (redistributable, no exposure), is on Google Fonts
so it routes through the same build-time provider as Instrument Serif and JetBrains Mono — no binary
in the repo, still self-hosted at runtime — and carries a full **400–900** variable range. That range
is a hard requirement, not a nicety: §3.1 sets display at 800 and the wordmark at 900, which is what
ruled out Instrument Sans (400–700) despite it being Instrument Serif's designed companion. It is a
neutral grotesque with strong heavy weights, which is what §3.2.1's headline setting (800 at
−0.078em) actually leans on. Manrope is banned by §3.8. Inter was rejected as too ubiquitous for a
system whose distinctiveness now rests on type and motion rather than palette temperature (§3.1's
recorded dissent).

**Instrument Serif and JetBrains Mono are unaffected** — both OFL, both shipped as the handoff
specifies. Only the body/display family changed.

### 3.1.3 Two sidebar widths, deliberately

§4.1's V1 app shell is **210px**. The demo workspace (§3.3's `.st-demo` tokens) is **250px**. These
are different surfaces and the difference is intentional — the demo carries three nav groups plus a
pinned "Back to site" link, and 210px truncates the group labels.

Do not "fix" one to match the other. If they are ever unified, it is a layout decision for both
surfaces, not a token cleanup.

### 3.2 Light mode tokens

Two layers, and the distinction is load-bearing. The **ramp** is raw palette. The **semantic layer**
is what components reference. Components use semantics; only the semantic layer names a ramp step.
That is what lets a palette change flow through one file instead of 351 call sites — which is exactly
what the v1.4 → v1.5 repaint cost, because v1.4's lime was hardcoded rather than referenced.

```css
:root{
  /* ── RAMP. Raw palette. Referenced by the semantic layer, rarely by components. ── */
  --black:#1F2323;   --black-900:#141818; --black-850:#1B1F1F;
  --black-800:#242929; --black-700:#303636; --black-600:#4B5353;

  --gray-700:#586161; --gray-600:#647070; --gray-500:#7D8090; --gray-400:#9DA7A7;
  --gray-300:#C9D1D1; --gray-200:#DDE4E4; --gray-100:#EEF3F3; --gray-50:#F7FAFA;

  --paper:#FAFAF7;   --white:#FFFFFF;

  --lime:#CCF03F; --lime-400:#D9FA64; --lime-200:#E8FF9A;
  --lime-100:#F1FFC8; --lime-50:#F8FFE0;

  --orange:#F0602A; --orange-700:#B83D10; --orange-600:#D44A18; --orange-400:#FF8552;
  --orange-200:#FFC7A8; --orange-100:#FFE1D2; --orange-50:#FFF3EC;

  --green:#00AA57; --green-100:#DDF6EA;
  --red:#E54545;

  /* ── SEMANTIC. What components reference. ─────────────────────────────────── */
  --color-bg:var(--paper);
  --color-bg-2:var(--gray-50);
  --color-surface:var(--white);
  --color-border:var(--gray-200);
  --color-divider:var(--gray-100);

  --color-text:var(--black);
  --color-text-muted:var(--gray-600);
  --color-text-faint:var(--gray-400);

  --color-accent:var(--lime);
  --color-accent-hover:var(--lime-400);
  --color-accent-text:var(--black);   /* only legal text colour on a lime fill */
  --color-accent-subtle:var(--lime-100);

  --color-spend:var(--orange);        /* cost, paid media, caution */
  --color-spend-text:var(--orange-700); /* orange as TEXT, light backgrounds only */
  --color-spend-subtle:var(--orange-50);

  --color-positive:var(--green);      /* NEW in v1.5 — see §3.4 */
  --color-positive-subtle:var(--green-100);

  --color-danger:var(--red);

  /* ── STRUCTURE ────────────────────────────────────────────────────────────── */
  --max:1320px;      /* page container */
  --gutter:24px;     /* 12-col grid gap */

  --radius-sm:12px;  /* chips, inputs, small controls */
  --radius-md:18px;  /* standard cards */
  --radius-lg:28px;  /* large cards */
  --radius-xl:36px;  /* hero panels, CTA box */
  --radius-full:999px;

  --shadow-card:0 12px 38px rgba(31,35,35,.055);
  --shadow-soft:0 24px 80px rgba(31,35,35,.12);
  --shadow-deep:0 32px 110px rgba(31,35,35,.32);
  --shadow-lime:0 18px 52px rgba(204,240,63,.32);
  --shadow-orange:0 18px 52px rgba(240,96,42,.35);

  --ease-out:cubic-bezier(.16,.8,.25,1);
  --ease-in-out:cubic-bezier(.6,0,.2,1);

  /* ── TYPE ─────────────────────────────────────────────────────────────────── */
  --font-body:'Schibsted Grotesk',system-ui,sans-serif;
  --font-display:'Schibsted Grotesk',system-ui,sans-serif;
  --font-serif:'Instrument Serif',Georgia,serif;   /* display-only — §3.1 */
  --font-mono:'JetBrains Mono',ui-monospace,monospace;

  /* App UI step scale. Fixed steps, because product chrome does not fluidly scale. */
  --text-xs:0.6875rem; --text-sm:0.75rem;  --text-base:0.8125rem;
  --text-md:0.875rem;  --text-lg:1rem;     --text-xl:1.125rem;
  --text-2xl:1.375rem; --text-3xl:1.75rem; --text-hero:2rem;

  --space-1:0.25rem;  --space-2:0.5rem;   --space-3:0.75rem;  --space-4:1rem;
  --space-5:1.25rem;  --space-6:1.5rem;   --space-8:2rem;
  --space-10:2.5rem;  --space-12:3rem;
}
```

**`--shadow-orange` was `--shadow-violet` in the handoff.** Renamed on the way in. The value is
orange; only the name said violet. See §0.4 — the `--violet-*` rejection carries forward unchanged and
is CI-enforced.

### 3.2.1 Marketing type scale

Marketing headlines are **fluid**; app chrome uses the fixed steps above. Two scales, because a
dashboard label that grows with the viewport is a bug and a hero headline that does not is a missed
opportunity.

| Element | Desktop | ≤740px |
|---|---|---|
| `h1` | `clamp(52px,7.1vw,104px)` / lh `.88` / ls `−0.078em` / 800 | `clamp(34px,9.6vw,46px)` / lh `.94` / ls `−0.05em` |
| `h1 .serif` | `1.04em` / lh `.9` / ls `−0.045em` / 400 italic | `1.02em` / lh `.96` |
| `h2` | `clamp(38px,5vw,76px)` / lh `.94` / ls `−0.07em` / 800 | `clamp(29px,8.4vw,40px)` / lh `.98` / ls `−0.045em` |
| `.section-copy` | 18px / lh 1.55 / ls `−0.02em` / `--color-text-muted` / max 580px | 16px |
| `.eyebrow` | 12px / 800 / ls `.14em` / uppercase / `--gray-700` | same |
| Body | 16px / lh 1.35 | same |
| Wordmark | 23px / 900 / ls `−0.05em` | 21px |

`text-wrap: pretty` on prose. `font-variant-numeric: tabular-nums` on every numeral in a table or KPI —
figures that shift width while updating read as unstable, which is the opposite of what a revenue
number should read as.

**Section rhythm:** `section { padding:96px 0 }`, `.tight { 64px }` → 68px ≤900 → 54px ≤740 → 46px ≤440.
`.wrap` padding `0 32px` → `0 20px` ≤740 → `0 18px` ≤440.

### 3.3 Dark mode tokens

**Dark mode is the app only.** The marketing site is light-only with no toggle — ruled in v1.4 (PR
#643, which deleted `ThemeToggle.astro`) and unchanged by v1.5. §23's Dark mode row remains
authoritative.

```css
[data-theme="dark"]{
  --color-bg:#171A1A;
  --color-bg-2:#1B1F1F;
  --color-surface:#212525;
  --color-border:#2E3333;
  --color-divider:#282C2C;

  --color-text:#F2F4F3;             /* never #FFFFFF over ink */
  --color-text-muted:#A8AFAF;
  --color-text-faint:#7D8090;       /* ⚠️ 3.95:1 — see §3.6, open defect */

  --color-accent:#CCF03F;
  --color-accent-hover:#D9FA64;
  --color-accent-text:#1F2323;
  --color-accent-subtle:#22280F;

  --color-spend:#F0602A;
  --color-spend-text:#FF8552;       /* orange IS legal as text on ink — 6.60:1 */

  --color-positive:#00AA57;
  --color-danger:#E54545;

  --shadow-card:0 1px 3px rgba(0,0,0,.45);
  --shadow-soft:0 10px 26px -12px rgba(0,0,0,.6);
  --shadow-deep:0 28px 64px -32px rgba(0,0,0,.7);
}
```

### 3.3.1 The workspace token set (`.st-demo`)

The demo workspace themes off **one class on one element**, not a component-level branch. Light and
dark are the same token names carrying different values, so no component anywhere reads the theme.

**These `--f-*` names ARE the workspace's semantic layer** — they map one-to-one onto §3.2's
semantics. They exist as a separate set because the workspace is a self-contained surface that must
theme independently of the page hosting it (it renders embedded inside a light marketing page and can
still be dark). **Do not build a third naming system**; if a workspace component needs a colour not
below, add it here and state its §3.2 equivalent.

| `--f-*` | §3.2 equivalent | Light | Dark |
|---|---|---|---|
| `--f-bg` | `--color-bg` | `#F1F3F5` | `#171A1A` |
| `--f-card` | `--color-surface` | `#FFFFFF` | `#212525` |
| `--f-line` | `--color-border` | `#E7EAEC` | `#2E3333` |
| `--f-line-2` | `--color-divider` | `#EEF0F2` | `#282C2C` |
| `--f-ink` | `--color-text` | `#1F2323` | `#F2F4F3` |
| `--f-ink-2` | `--color-text-muted` | `#5A6169` | `#A8AFAF` |
| `--f-ink-3` | `--color-text-faint` | `#8D949C` ⚠️ | `#7D8090` ⚠️ |
| `--f-head` | — (table header fill) | `#F7F8F9` | `#1B1F1F` |
| `--f-soft` | — (inset fill) | `#F3F5F6` | `#1B1F1F` |
| `--f-lime-w` | `--color-accent-subtle` | `#F4FBDF` | `#22280F` |
| `--f-lime` | `--color-accent` | `#CCF03F` | same |
| `--f-lime-2` | — (accent fill, muted) | `#E4F79C` | same |
| `--f-green` | `--color-positive` | `#00AA57` | same |
| `--f-red` | `--color-danger` | `#E54545` | same |
| `--f-orange` | — (workspace warning) | `#FF8800` | same |

⚠️ **`--f-ink-3` fails AA as text in both themes.** It is used as a text colour on 43 rules. See
§3.6 — open defect, correction proposed, not yet ruled.

**`--f-bg` light is `#F1F3F5`, not `--paper #FAFAF7`.** The workspace canvas is deliberately a
half-step cooler and darker than the marketing page, so an embedded workspace reads as a distinct
object rather than bleeding into the page around it. This is intentional, not drift.

### 3.4 Five hues, and only five

This supersedes v1.4's "four hues" and v1.2 §3.4's source/channel colour block.

| Meaning | Token | Applies to |
|---|---|---|
| Identity, revenue, earned, organic | `--color-accent` (lime) | Brand mark, primary buttons, active nav, revenue series, KPI emphasis, the winning data point |
| Spend, cost, paid media, caution | `--color-spend` (orange) | Spend series, paid chips, cost-metric labels, warning states |
| Positive **direction** or healthy **state** | `--color-positive` (green) | Delta-up arrows, "healthy" status pips, completed steps. **Nothing else.** |
| Destructive, and negative direction | `--color-danger` (red) | Delete, erase, danger zone, delta-down, alert dot |
| Everything else | cool neutrals | All structure, text, borders, and volume metrics |

**Lime and green are not the same "good", and the split is the whole reason green is admitted.**
Lime names *the subject* — this is revenue, this is the brand, this is the winner. Green names *a
direction or a state* — this went up, this is working. A revenue figure is lime. The `▲ 12%` beside
it is green. Colour them the same and the eye can no longer separate "how much" from "which way".

If you cannot state which of those two a new element is, it gets **no colour**.

Still banned, unchanged from v1.4: **no info blue, no purple, no slate.** Green is admitted by name
and by the bounded role above — that is not a precedent for admitting a fifth or sixth.

> **Read the handoff's own colour line carefully before applying it to the product.** Its README says
> *"Lime = identity. Orange = revenue, AI surfaces and outbound pushes."* That describes the
> **marketing site**, where it is a *typographic* rule, not a metric semantic: lime is 1.25:1 on paper
> (§3.6) and therefore cannot be a text colour, so every emphasised figure on a light page — prices,
> stat numerals, links, the serif phrase — falls to `--orange-700`. Verified in the handoff's own
> `style.css`: `--orange-700` styles `a`, `.pill`, `.stat-num`, `.price`, `summary` and `.serif`.
>
> **Do not carry that into the product as "orange means revenue."** In the app, lime is used as a
> *fill* (bars, chips, series) where its contrast is irrelevant, so lime keeps revenue and orange
> keeps spend. Inverting them would recolour every spend chart as revenue — the one colour error in
> this system that changes what a number appears to say.

**`--f-orange #FF8800` is declared by the handoff and never used.** Zero references across its
workspace CSS. It is carried in §3.3.1 for completeness but is **not** adopted as a live token: either
a workspace element earns it and this line records the use, or it is deleted. v1.4 already made this
call once — it dropped 10 of the handoff's 25 ramp steps as dead — and the reasoning holds. Do not
give it a meaning just because it exists; there is no gap in the five above for it to fill.

Third-party **brand** colours are the one exception and are not part of this palette: source rows and integration cards use the real logo of the service (Google, ChatGPT, Stripe, Shopify, LinkedIn, and so on). Those are identity, not styling.

> **Implementation note.** Bundle third-party logos as local SVG or PNG assets. Do not hot-link a favicon service. A privacy-conscious product making a third-party request per table row is a contradiction a competitor will point at.

### 3.5 Hero atmosphere

**v1.4's three-radial ambient gradient is retired.** It was built on the warm palette and its
midpoint, `--color-bridge #F2A93B`, does not exist in v4 — there is no amber between v4's lime and
orange. It was never implemented in code (doc-only through v1.4), so nothing is being removed from the
product. `--color-accent-warm` in `theme.json` is repointed to `--orange-400 #FF8552`, its one
consumer being `ModelCompareMockup.astro`.

v4 replaces it with a **layered hero atmosphere** — motion, not a colour ramp. Composition:

| Layer | Behaviour |
|---|---|
| Grid | Slow continuous drift |
| Two blur orbs | Lime top-right, orange bottom-left, "breathing" scale/opacity |
| Scan sweep | A lime sweep across the field every **9s** |
| Tracers | Five vertical lime, two horizontal orange, running the grid lines |
| Headline | Word-by-word entrance; a lime rule draws under the final phrase |
| Primary button | A 7s sheen sweep |

> **§3.8's "no decorative blobs" is AMENDED, narrowly, to admit the two orbs.**
>
> That ban was written against untethered decorative shapes scattered as filler. These two are neither
> untethered nor filler: they are the hero's only light source, they sit at fixed opposite corners,
> and their colours are the product's two semantic accents rather than arbitrary. The ban stands
> everywhere else — **orbs are hero-only, exactly two, and never appear in a card, a section, or the
> app.**
>
> This is the one §3.8 line v1.5 relaxes. It is not a general softening of §3.8.

Hard limits, all inherited unchanged:

- **§2.6's ~15% accent-density ceiling applies to the orbs and the sweep.** An orb pair that reads
  as page background is a violation however soft it is — that was v1.4's open hero defect, and
  re-shipping it under a new palette does not make it new.
  ⚠️ **The harness that would measure this does not currently run** — `accent-density.mjs` exits 2
  on the v3 homepage and has since #690 (see §0.4). So this hero's accent budget is **asserted, not
  verified**. Treat that as a live risk on the section with the most accent area in the system, and
  fix the harness before claiming the hero passes.
- **Never behind body text.** The headline sits above the field; paragraphs do not.
- **One hero per page.** Not a section treatment.
- **`prefers-reduced-motion` stops all six layers** and leaves a composed static field — never a blank
  one, and never a hidden headline. Same guarantee as §3.1.1's mark.
- Glassmorphism remains banned V1-wide (§26). A blurred orb *behind* a solid surface is not
  glassmorphism; a translucent frosted panel *is*, and is still prohibited.

### 3.6 Contrast rules

Lime, orange and green are surfaces you place dark text on, or inks you use on ink. **None of them is
a text colour on a light canvas.**

All figures below are **WCAG 2.1 relative-luminance calculations**, computed 2026-08-08 against the
v4 hexes in §3.2/§3.3. They are not an audit tool's output. Re-run them before they inform an
accessibility statement, and re-run them if any hex moves.

**Site — light**

| Pair | Ratio | Verdict | Use |
|---|---|---|---|
| ink `#1F2323` on paper | 15.18:1 | AAA | Body, headlines |
| ink on lime | 12.17:1 | AAA | Primary button, KPI emphasis |
| lime on ink | 12.17:1 | AAA | Eyebrows, accents on dark |
| ink on lime-200 `#E8FF9A` | 14.51:1 | AAA | Chip |
| **lime on paper** | **1.25:1** | **Fail** | Never — fills only |
| gray-700 `#586161` on paper | 6.09:1 | AA | Eyebrow, secondary ink |
| gray-600 `#647070` on paper | 4.91:1 | AA | Body copy — **the floor; do not lighten** |
| gray-500 `#7D8090` on paper | 3.74:1 | AA-large | ≥24px or ≥19px bold only |
| gray-400 `#9DA7A7` on paper | 2.36:1 | Fail | Disabled, arrows — never live text |
| orange-700 `#B83D10` on paper | 5.41:1 | AA | **The orange text colour on light** |
| orange-600 `#D44A18` on paper | 4.19:1 | AA-large | Link hover at ≥24px; not body |
| orange `#F0602A` on paper | 3.13:1 | Fail as text | Bars, dots, marks only |
| **green `#00AA57` on paper** | **2.92:1** | **Fail as text** | Pips, arrows, fills only |
| **green on green-100 `#DDF6EA`** | **2.68:1** | **Fail as text** | Ink on the wash, never green |
| ink on green-100 | 13.94:1 | AAA | The legal pairing for a positive chip |
| **red `#E54545` on paper** | **3.81:1** | **AA-large only** | ⚠️ open defect — see below |

**Site — on ink `#1F2323`**

| Pair | Ratio | Verdict | Use |
|---|---|---|---|
| white on ink | 15.87:1 | AAA | Footer, dark panels |
| gray-400 on ink | 6.44:1 | AA | Muted text on dark |
| orange-400 `#FF8552` on ink | 6.60:1 | AA | Orange text is legal here |
| orange `#F0602A` on ink | 4.85:1 | AA | Legal, but prefer orange-400 |
| black-600 `#4B5353` on ink | 2.01:1 | Fail | Borders and dividers only |

**Workspace (§3.3.1)**

| Pair | Light | Dark |
|---|---|---|
| `--f-ink` on `--f-card` | 15.87:1 AAA | 14.02:1 AAA |
| `--f-ink` on `--f-bg` | 14.27:1 AAA | 15.85:1 AAA |
| `--f-ink-2` on `--f-card` | 6.27:1 AA | 6.94:1 AA |
| **`--f-ink-3` on `--f-card`** | **3.07:1 Fail** | **3.95:1 Fail** |
| **`--f-ink-3` on `--f-bg`** | **2.76:1 Fail** | 4.47:1 AA-large |
| `--f-green` on `--f-card` | 3.05:1 AA-large | 5.08:1 AA |
| `--f-red` on `--f-card` | 3.99:1 AA-large | 3.89:1 AA-large |
| `--f-orange` on `--f-card` | 2.39:1 Fail | 6.47:1 AA |
| `--f-ink` on `--f-lime-w` | 14.90:1 AAA | 13.79:1 AAA |

#### Open defects — measured, recorded, not yet ruled

Adopting the handoff verbatim was a ruling about **which system**, not a licence to ship an unmeasured
contrast failure. These three are real and are logged here rather than quietly patched or quietly
shipped. **A fix changes a v4 hex and therefore needs a founder call.**

1. **`--f-ink-3` fails AA as text in both themes** — and it *is* a text colour, on **43 rules** in the
   handoff's workspace CSS (nav group labels, search placeholder, row metadata, latency figures),
   most at 10.5–12.5px where AA requires 4.5:1. This is the most consequential of the three because
   it is small text a user has to read.
   **Minimum corrections that clear 4.5:1 on both surfaces**, walking the same hue darker/lighter:
   light `#8D949C` → **`#686E73`** (5.16 card / 4.64 bg); dark `#7D8090` → **`#878A9C`** (4.53 card /
   5.13 bg). Alternative, if the greys must not move: restrict `--f-ink-3` to non-text use and
   promote those 43 rules to `--f-ink-2`.

2. **`--red #E54545` is 3.81:1 on paper** — AA-large only. Legal for an alert dot or a delta arrow,
   **not** for the error-message body text a danger colour usually carries. v1.4's `#C4381C` cleared
   AA; v4's does not. Either accept red as fills-only on light (and say so wherever error copy is
   specified), or darken it.

3. **`--f-orange` is 2.39:1 on light card** — but it has **zero usages** (§3.4), so nothing renders
   wrong today. It becomes a real defect the moment something adopts it. Resolve it by deleting the
   token rather than by fixing its value.

Until these are ruled: **do not use `--f-ink-3` for any new text**, and do not introduce red or
`--f-orange` body copy on a light surface.

### 3.7 The signal-on-track system

**Rewritten for the v4 mark.** v1.4's version opened *"The mark is a first touch and a last touch"* and
derived four patterns from the old three-dots-and-a-disc geometry. That mark no longer exists, so the
sentence described nothing. **The four patterns survive** — they were good patterns — re-derived from
the new geometry.

The v4 mark is **a signal travelling a track**: the track behind it is lit, the track ahead is dim
(§3.1.1). That is the product's own claim in miniature — a path is only bright where you have
evidence. Extend *that* rather than decorating around it.

- **Attribution trail** — touchpoints on a hairline track. The segment **behind** the converting touch
  is lit; the segment ahead stays dim. First touch small, converting touch large. Only the converting
  touch takes lime; earlier touches keep their channel identity.
- **Source chip** — a dot prefix where no brand logo exists. Paid sources take orange, matching §3.4's
  chart rule.
- **Loader** — a signal traversing a short track, not a spinner. Under `prefers-reduced-motion` it
  freezes on a composed frame (§3.1.1), never blank.
- **Empty state** — one dim track, no signal: a path exists, no evidence on it yet. Never an empty
  circle.

The lit/dim distinction is **semantic, not decorative**. Do not light a segment the data does not
support — that is the visual form of the §6 data-truth rules.

### 3.8 Do not use

- **Retired accents:** `#C8F000`, `#C5E838`, and — new in v1.5 — **`#D2EC2A`** (superseded by
  `#CCF03F`) and **`#F2A93B`** (the retired gradient bridge, §3.5). Also `#8F2FFE`, `#DF53FE`,
  `#0E0912`.
- **Retired neutrals:** the v1.4 warm ramp — `#F7F4ED`, `#FFFDF8`, `#12100C`, `#E7E0D2`, `#161310` and
  the `#6E675C` / `#A39B8C` muted pair. See §3.2 for replacements.
- **Near-collision hexes.** `#B4420E` (was `--color-spend-text`) and `#C4381C` (was `--color-danger`)
  are retired; v4 uses `#B83D10` and `#E54545`. These differ by ~two characters and mean the same
  thing, so the wrong one is invisible in review and silently changes a ratio §3.6 then certifies.
  **The direction of the ban is now reversed from v1.4** — the v1.4 values are the stale ones.
  `api/tests/v3-lift-detection.test.js` enforces the current direction; check it before assuming.
- Pure `#FFFFFF` text over ink (use `--f-ink #F2F4F3`) or pure `#000000` surfaces
- `--violet-*` / `--shadow-violet` as token **names** — they carry orange values. Use `--orange-*`.
- Purple gradients, glassmorphism, multiple palettes
- **Decorative blobs — except the two hero orbs**, which §3.5 admits by name, bounded to the hero and
  to §2.6's ceiling. Anywhere else, still banned.
- Manrope as the product font, 260px sidebar, "Attribution Cockpit" or any other product name
- Gradient applied to text
- Instrument Serif outside a headline emphasis phrase (§3.1) — never body, chrome, or app UI

> **v1.4's "no cool greys anywhere" is DELETED, not narrowed.** It banned `#E5E7EB`, `#B9B7BA` *and
> similar* because v1.4's neutrals were warm. **v4's entire neutral ramp is cool** — `#C9D1D1`,
> `#DDE4E4`, `#EEF3F3`, `#F7FAFA`. Keeping the line in any form would ban the shipped palette.
> The related v1.4 line about white-alpha borders "reading blue over warm ink" goes with it for the
> same reason. §3.1's recorded dissent is where the cool-palette risk is now argued.
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

Shopify is manual webhook only in V1 — **as the shipped surface.**

> ⚠️ **CORRECTED 2026-08-06 — "manual webhook only" describes what CUSTOMERS CAN USE, not what exists.**
> **A native Shopify app IS BUILT** (see `Ubaidofficial/sourcetrack-shpfy-app`). It is **not
> deployed**, and **Shopify Level 1 approval has not been granted.**
>
> **Both halves matter and neither cancels the other.** The customer-facing boundary is unchanged:
> manual webhook is the only path a customer can take today, and the no-native-app claim rule below
> **stands exactly as written**. What was wrong is the *reason* — this section read as "the app does
> not exist", and a reader planning work from it would have scoped a build that is already done.
>
> **Founder ruling, recorded: rewrite the claims, DO NOT deploy the app.** Deployment is not a
> follow-up implied by this correction.

Required copy:

- Manual webhook recipe
- HMAC verification guidance
- order ID dedupe guidance
- line item handling docs
- no native app claim — **unchanged; built-but-undeployed is still unclaimable**

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

> Design SourceTrack as a premium 2026 attribution and lightweight analytics product for founders and marketers. It should feel calmer than GA4, lighter than Cometly/Usermaven, as simple as DataFast/PiQo, and more distinctive through AI attribution, SEO revenue signals, source chips, analytics charts, top pages, and conversion story panels. Use cool off-white surfaces (#FAFAF7), white cards, subtle borders (#DDE4E4), ink (#1F2323), lime (#CCF03F) as signal only — never as text — with orange (#F0602A) as the counterweight and green (#00AA57) reserved for positive deltas and healthy status. Compact data density, premium Schibsted Grotesk typography, and custom-feeling charts. Avoid generic admin dashboards, purple gradients, decorative blobs, glassmorphism, enterprise BI clutter, and fake data.

> **Keep this prompt in step with §3.1/§3.2 — it is the one place a retired token silently comes back.**
> v1.4 had to correct this prompt for exactly this reason: it was still quoting `#C8F000`, `#F5F4F0`
> and "Inter-style typography" long after §3.1 replaced them, and *a generation prompt that names
> retired tokens reintroduces them on every run.* v1.5 updates it again for the v4 palette. The prompt
> deliberately omits Instrument Serif: it is a display-only exception (§3.1) applied by hand to one
> headline phrase, and naming it here would scatter it through generated screens.

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
- **glassmorphism / "liquid glass" surfaces — V1-WIDE BAN (founder ruling, 2026-08-06)**
- **any "edge compute" claim — see §26.2**

### 26.2 Two additions ruled on 2026-08-06

**Glassmorphism — the open question is CLOSED as a full V1-wide ban.**

The changelog previously carried this as *"OPEN — founder decision required"*: §25.1 listed
glassmorphism under "avoid" as an AI-generation guardrail, while this section — the master V1
prohibited list — did not address it in either direction. That gap meant §25.1 bound *generation*
only, and a hand-built glass surface was prohibited by nothing.

**Ruling: full V1-wide product ban, not a generation-only guardrail.** It now appears in the list
above, which is what makes it binding on shipped UI. §25.1 is unchanged and still applies to
generation. Raised originally when a "liquid glass" card technique was considered and retracted
without a clear answer either way.

**"Edge compute" is unclaimable — all four investigations returned NEGATIVE.**

⚠️ **Recorded as a prohibition rather than a removal, and the difference is deliberate: there was
never an edge-compute claim in this document to delete.** A repo-wide grep on 2026-08-06 found
**zero** such claims in `design.md` and zero in the marketing site. The findings that settled it
live in `SESSION_HANDOFF_2026-08-06.md:209-215`; the only surviving related claim is
**"first-party subdomain"**, which is accurate and stays.

**Nothing runs at the edge.** Bunny is a pull-zone CDN in front of the origin — caching and TLS
termination, not execution. Any existing or proposed "edge compute" / "runs at the edge" /
"edge worker" phrasing is false until something actually executes there.

*(Not in scope of this ban: the path-allowlisted Cloudflare Worker and Next.js rewrite templates in
the self-hosted proxy docs. Those are examples a CUSTOMER runs on their own infrastructure, not a
claim about SourceTrack's, and they remain correct.)*

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

> The marketing site is **light-only**. There is no dark theme, no toggle, and no OS-preference switching — the page renders the same for every visitor. The product band and the final CTA render on **ink** (`#1F2323` — cool as of v1.5, §3.1); that contrast against the light canvas is what gives the page its structure and keeps the product frame reading as a **lit object rather than a flat screenshot**. Those ink bands are structural, not a dark-theme artefact — dropping them would flatten the page, so they stay. Reference implementation — PR #643, merged 2026-08-05, which deleted `marketing/src/layouts/components/ThemeToggle.astro`, removed it from `Header.astro`, and collapsed the marketing theme to a single light palette.

Borrow the premium lightweight SaaS feel from modern lime-glow landing pages:

- product-first hero
- soft lime glow behind the product preview — **bounded to the product-preview object, never the page.**
  See the constraint below.
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

**The lime glow is bounded by §2.6 — read that before building the hero.** "Behind the product
preview" means behind a **bounded object**; a glow that reads as page background violates the
accent-density ceiling no matter how soft it is. Both §2.6 limits apply here in full:

- **~15% of any single screen's visible area**, and **never** a full-bleed background wash or a glow
  behind primary content.
- If lime ends up behind body text, **verify computed WCAG AA contrast before shipping — do not
  eyeball it.**

⚠️ **This is an OPEN defect on the live site, not a solved problem** (§2.6, confirmed via screenshot
2026-08-03, still unfixed): the live marketing hero's background glow covers roughly **70–80% of
visible area**, with white text on a bright-lime highlight block at a **computed contrast below AA**.
That hero is the motivating case for the ceiling — it is **not** a reference implementation and must
not be copied forward. Any Phase 2 homepage work has to measure the glow's coverage and run the
computed-AA check rather than inheriting the current hero's treatment.

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
- native Shopify app — ⚠️ **2026-08-06: the app is BUILT but not deployed and not Level 1 approved.**
  It stays on this Avoid list until both change. "We built it" is not "it ships"
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

> ⚠️ **AMENDED BY FOUNDER RULING, 2026-08-08 (v1.6). Read this before applying the bullets below.**
>
> The blanket ban is **narrowed**, not deleted. The v4 comparison table renders competitor marks in
> its column headers, and the ruling is that it ships that way.
>
> **NOW PERMITTED — identification in a truthful comparison.** A competitor's name and mark may appear
> in a comparison table, where the whole purpose is to say *which product is which*. This is nominative
> use: the mark identifies the competitor, not us.
>
> **STILL PROHIBITED, and these are the ones that carried the actual exposure:**
> - Presenting a competitor's logo, icon set or UI **as SourceTrack's own** — the "presented as our
>   own" clause was always the core of this rule and is untouched.
> - Competitor product **screenshots**, shipped anywhere. §35.1 still governs those as look-only
>   references.
> - Restyling, recolouring or redrawing a competitor mark. §35.4 applies to competitors exactly as it
>   applies to partners: use the official asset or a plain text label, never an approximation.
>
> **THE CONDITION THAT MAKES THIS DEFENSIBLE, and it is a real constraint, not a formality:**
> nominative use protects an *accurate* comparison. Every claim in a row carrying a competitor's mark
> must be true and current, must not imply endorsement or partnership, and must use no more of the
> mark than identification requires (the mark, not their trade dress or their page design). **A stale
> or overstated row beside a competitor's logo is the thing that turns a defensible comparison into a
> disparagement claim** — so the comparison table's factual accuracy is now a shipping requirement,
> not a copy-quality nicety. Re-verify each row against the competitor's current public pricing and
> feature pages before shipping a change to it.

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
