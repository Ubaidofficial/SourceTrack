# Marketing site UI/UX audit — current build vs. design.md + 2 reference patterns

**Date:** 2026-07-29
**Scope:** findings and options only. No live rebrand, no token changes, no site-wide animation shipped from this doc.
**Base:** `origin/main` @ `efd2744` (#498).
**One pending change assumed:** PR #500 deletes `/about` and `/features` (unreachable since #494). Section counts below exclude them.

---

## 0. Method — what is verified vs. what is inferred

Everything in Parts 1–2 was read from the current tree, not from prior scoping notes. The two reference
sites were **fetched independently for this audit** (2026-07-29) rather than taken from the dispatch
summary, specifically so the "premium = restraint" hypothesis in Part 3 could be confirmed or refuted
against what the pages actually do. Where the fetch contradicted the brief, that is called out.

Not verified: nothing here has been looked at in a browser. Layout, spacing and the new auto-cycle's
*feel* need the browser agent. Build-level facts (page counts, bundle contents) are verified.

---

## 1. Against design.md's own spec

### 1.1 §29.4 Hero product demo — **substantially MET.** Do not rebuild it.

The brief's first question was whether the hero meets its own spec before assuming change is needed.
It largely does, and this is the most important finding in Part 1 because it removes the biggest
imagined work item.

`marketing/src/layouts/components/DashboardMockup.astro` is a **markup-built product surface**, not a
stock illustration and not a raster screenshot. It renders a dark product card with Visitors / Conversions
KPIs, a **Revenue-by-source** table (ChatGPT · AI Search · $3,840 / Google Ads · Paid Search · $6,200 /
Organic · Search · $5,820) and an AI-referral share bar — carrying a literal **"Sample data"** badge in
its own header.

That satisfies §29.4's "show an attribution story, not a generic dashboard", its "fixture data only"
rule, and §6's no-fake-data rule simultaneously. It also already matches what both reference sites do
(real-feeling product UI with plausible numbers). The file's header comment shows this was a deliberate
replacement of a PowerAI-template screenshot.

**The one real gap:** §29.4 specifies the story as a **chain** —

> `Google Search -> Pricing page -> Lead -> Pipeline value`

The hero renders a **summary** (`Source | Channel | Value`) — three columns, no path. The chain does
exist on the homepage, but further down, in `JourneyMockup.astro` under the "Visitor Journey" section
(`ChatGPT -> /compare -> $conversion -> $240`).

So the spec's story is on the page, just not in the hero. **This is a row-shape change to one component,
not a redesign** — the fixture data already contains everything needed.

### 1.2 §29.3 Homepage structure — 3 concrete gaps

| §29.3 requires | Current homepage | Status |
|---|---|---|
| 1. Hero with product demo | `Hero` + `DashboardMockup` | ✅ |
| 2. Attribution product preview | `JourneyShowcase` + `JourneyMockup` | ✅ |
| 3. **How it works: Track → Connect → Know** | *absent* | ❌ **gap** |
| 4. **Use-case cards** | *absent from homepage* (Solutions are separate pages, nav dropdown only) | ❌ **gap** |
| 5. Pricing preview | `Pricing` | ✅ |
| 6. FAQ | `FAQ` | ✅ |
| 7. Final CTA | `CallToAction` | ✅ |
| 8. Footer w/ Docs, Guides, **Comparisons**, Legal, **Status** | Docs/Guides ✅, Legal ✅ — **Comparisons ✗, Status ✗** | ❌ **gap** |

Notes:

- **The three-step is genuinely missing.** `WhyChooseUs` is the closest candidate and is not it — it's a
  4-item value list ("Revenue by source", "AI referrals, named", "One script, no CRM", "Cookieless by
  default"), not an ordered Track → Connect → Know explanation. §29.2 and §35 *both* separately list
  "clear three-step explanation" / "simple three-step explanation" as things to borrow, so this is
  asked for three times in the spec and shipped zero times.
- **Footer has no Comparisons link** (`menu.json` `footer_resource` = Live Demo, Blog, Changelog,
  Docs & Guides, Developer API, Troubleshooting). This matters more than it looks — see 2.4.
- **There is no `/status` page at all**, so the footer link can't be added without building the page.
  Track as a separate item; §34 already specs customer-facing status UI.

---

## 2. Against the two reference patterns

### 2.1 Hero screenshot — **already at parity.** See 1.1.

Both reference sites lead with real-feeling product UI; so does SourceTrack. No gap.

### 2.2 Verb-led feature storytelling — **real gap, but it must stay claims-gated**

SourceLoop (verified by fetch) structures its pitch as **Track / Measure / Act**, each with its own
screenshots — "1–5 focused screenshots per capability rather than single monolithic images."

SourceTrack's homepage has **two product visuals total** (`DashboardMockup`, `JourneyMockup`).
`KeyFeatures` is one strip of four text features sharing a static image set; `WhyChooseUs` is four text
cards with no product visual at all. There is no per-capability visual story.

**Capability visibility, measured across `marketing/src`:**

| Capability | Marketing pages | Content files | Claims gate (GTM §5) |
|---|---|---|---|
| GSC / Search Console | 1 | 6 | ✅ safe to claim now (with "estimated" label) |
| Outbound webhook (HMAC, SSRF-guarded) | 6 | 6 | ✅ safe to claim now |
| Google Ads | 2 | 0 | ⚠️ click-ID capture only |
| **CAPI (Meta/Google/GA4/TikTok)** | **0** | **0** | ⚠️ **do not claim live forwarding** |
| **TikTok** | **0** | **0** | ⚠️ parked |

**The CAPI invisibility is correct, not a gap — do not "fix" it.** GTM §5 marks CAPI ⚠️ *"don't claim
'live forwarding' until a merchant uses it"*, and §5.2 states multi-platform CAPI is **PARKED**, to be
revisited *"on customer demand, not competitor parity."* #498 adding GA4 + TikTok senders does not move
that gate. Surfacing "CAPI across 4 platforms" on the marketing site would breach the claims gate.

(The one "Conversions API" hit on the site is `developers/offline-conversions.astro` — SourceTrack's
*own* offline-import API, unrelated to ad-platform CAPI. The 12 "Meta" hits are HTML `<meta>` tags;
only 3 are "Meta Ads", all as a fixture traffic source.)

**Where the real opportunity is:** the two capabilities that *are* cleared to claim — **GSC SEO-revenue**
and the **outbound webhook** — are also the two GTM §5 explicitly flags as differentiators (the webhook
is called out as a *"gap in all 4 competitors"*). Both are currently prose-only. A verb-led section with
a real product visual for GSC revenue would be the highest-value single addition on the site, and it
breaks no gate.

### 2.3 Integration showcase — partial

`sections/integration.md` lists **6** logos (Stripe, Shopify, GTM, WordPress, Webflow, Framer) rendered
as a ring/marquee, plus an "Explore Integrations" button to `/integrations` (which has `index` +
`[single]` pages). So integration depth *is* browsable — but on the homepage it is a **logo ring, not
individual cards**, and a logo ring communicates "we connect to things" rather than "here is what each
connection does." SourceLoop's per-surface cards carry a one-line function each.

Low-risk improvement, no claims-gate exposure: reuse the existing `/integrations/[single]` copy as card
subtitles.

### 2.4 Comparison table — **already MET, and better than the brief assumed. It's mislocated, not missing.**

Two corrections here.

**Correction to the brief:** SourceLoop does **not** avoid naming competitors. The fetch shows category
headings **with named exemplars underneath** — "GA4, Plausible" / "Attributer, Leadsource.io" /
"Ruler, Cometly, Heeet, Triple Whale, Northbeam". It is a hybrid, not category-only.

**Correction to the premise that SourceTrack lacks one:** `src/pages/compare/ga4.astro` **already ships
exactly that hybrid**, in a 4-card grid:

| Card | Named exemplars |
|---|---|
| Free Analytics | GA4, Plausible |
| Form Trackers | Attributer, LeadSources |
| Enterprise Platforms | Cometly, SourceLoop, Ruler |
| **SourceTrack** — "The Simple Private Middle" | *(accent-bordered)* |

This is arguably the single strongest asset on the marketing site, and it is **effectively buried**:
`/compare` 301-redirects to `/compare/ga4`, it is **not linked from the footer**, and it is **not on the
homepage**. The category framing also already complies with GTM §5.1 (it characterises categories rather
than making false claims about named products) and with §29.6's "no excessive comparison matrices" —
four cards, not a 30-row matrix.

**Recommendation: promote, don't build.** Surfacing the existing block is a link + a section include.

### 2.5 Trust/simplicity signals — **real gap, with one claim we must NOT copy**

visitors.now (verified by fetch) states three blunt facts directly under the hero:

> "Lightweight script. Under 1KB" · "5-minute setup. One script tag" · "Independent. No VC funding."

SourceTrack's equivalents exist but are **scattered and below the fold**: "5 minutes with one script tag"
lives in `call-to-action.md`, a `key-features.md` bullet, and `why-choose-us.md`. Nothing sits under the
hero. There is **no script-size claim anywhere**, and no independence claim.

**Measured tracker sizes (this tree), so any claim is truthful:**

| File | Minified | Gzipped |
|---|---|---|
| `tracker/tracker.min.js` | 20.7 KB | — |
| `tracker/tracker.cookieless.min.js` | 17.4 KB | **6.0 KB** |

⚠️ **Do not copy the "Under 1KB" framing.** SourceTrack's script is ~6 KB gzipped — six times that.
The honest, still-strong claim is **"~6 KB gzipped, one script tag."** Specificity is the mechanism
that makes these lines credible; borrowing a number we can't meet would be a §6 violation and trivially
falsifiable by anyone opening devtools.

Independence: no claim exists today. Whether "independent / no VC funding" is true is a founder fact,
not a repo fact — flagged, not asserted.

---

## 3. The branding / colour question

### 3.1 The hypothesis is **CONFIRMED**, from direct fetch of both sites

The brief asked whether the reference sites achieve "premium" through restraint or through
gradients/animation. Fetched independently:

| | SourceLoop | visitors.now |
|---|---|---|
| Distinct accent hues | **~2** (navy + teal/cyan) | **~1** highlight accent |
| Gradients / glows / glassmorphism | *"Minimal decorative effects"* — avoids heavy gradients, glows, glassmorphism | *"No evidence of glassmorphism or prominent glows… avoids gradient overlays"* |
| Motion | light–moderate (logo carousel, tab switches) | *"Restrained… the landing itself appears static"* |
| Hero | real product UI, plausible data | real product screenshots |
| Typography | 48–60px headlines vs 14–16px body; weight-driven hierarchy | *"Emphasis through weight rather than colour variation"* |

visitors.now's premium feel is summarised by the fetch as **"precision over decoration… Restraint itself
signals sophistication."** Neither site leans on gradients or animation. **Neither reference supports the
gradient/animation route to "premium."** They support the opposite: fewer hues, bigger type contrast,
more real product surface.

### 3.2 The design.md tension is **smaller than the brief assumed** — two factual corrections

**Gradients are not banned.** §3.5's do-not-use list says **"purple gradients"**, specifically — alongside
glassmorphism, decorative blobs, and multiple palettes. §25.1's generation prompt repeats it as *"avoid…
purple gradients, decorative blobs, glassmorphism."* It never prohibits gradients as a class.

And the site **already ships 37 gradient utility uses** (`bg-gradient-dark` ×14, `bg-gradient-primary` ×9,
`bg-gradient-black-grid` ×8, `bg-gradient-button` ×4, `bg-gradient-secondary` ×2). The hero badge and every
section badge are gradient-bordered pills today.

So "founder wants gradients" vs "design.md forbids gradients" is **not a real conflict.** The live
constraints are narrower: no *purple* gradients, no glassmorphism, no decorative blobs, no *heavy*
animation, no *excessive* decorative effects.

**The real constraint is different, and tighter:** §25.1 specifies **"lime (#C8F000) as signal only"**, and
§3.5 forbids **"multiple palettes"** / **"multiple design systems."** That is what a second brand accent
actually collides with — not gradients.

**And there is a concrete collision the brief could not have known about:** design.md §3.4 already assigns
an orange, **`--ai-claude: #D97706`**, as a *semantic channel colour* meaning "Claude" in charts and source
chips. Promoting orange to a brand accent would make the same hue mean both "our brand" and "this traffic
came from Claude", in a product whose entire value proposition is *reading source colour correctly*. Any
orange direction must either pick a hue clearly distinct from `#D97706` or re-map the Claude token — and
re-mapping a channel colour is a product-UI change, not a marketing one.

### 3.3 Blast radius — measured. This is **not** a contained token change.

| Surface | Hardcoded `#C8F000`/`#B8DD00` | Files |
|---|---|---|
| `marketing/src` | **159** | **42** |
| `dashboard/src` | **68** | **17** |
| **Total** | **227** | **59** |

Tokens *are* defined — `marketing/src/config/theme.json` (`primary: #C8F000`, `secondary: #B8DD00`) feeding
`generated-theme.css` — but **227 hardcoded literals bypass them.** `MarketingBeforeAfter.jsx` alone hardcodes
`#C8F000` in ~10 places.

**Consequence: changing `theme.json` alone would produce a half-recoloured site** — the worst possible
outcome, and one that would look like a bug rather than a rebrand. Any colour work must be sequenced:

1. **Migrate literals → tokens first**, as its own PR, changing *nothing* visually. Verifiable: the built
   CSS should be byte-identical apart from variable indirection.
2. Only then change token values.

Step 1 is the real cost and is worth doing regardless of whether the palette ever changes, because a
227-literal palette cannot be themed, dark-moded, or contrast-audited.

### 3.4 Three concrete options

Token values given so these are reviewable, not directional.

---

#### Option A — "Restraint" (stays fully within design.md)

Keep lime as the sole brand accent. Spend the effort on the things both reference sites actually use.

```css
--accent:         #C8F000;  /* unchanged */
--accent-hover:   #B8DD00;  /* unchanged */
--accent-subtle:  rgba(200,240,0,0.09);
/* no second brand hue */
```

Changes instead: raise headline size contrast toward the reference sites' 48–60px vs 14–16px; add the
missing three-step (§29.3); promote the comparison block; add the three blunt facts under the hero; add
one real product visual for GSC revenue.

- **Cost:** zero token migration. Content/layout work only.
- **Risk:** none against spec. **Does not deliver "orange + lime."**
- **Evidence for:** this is precisely what both reference sites do.

---

#### Option B — "Signal duality" (moderate; needs the §3.4 collision resolved)

Lime stays the *product/data* signal. A warm accent is introduced **for marketing-site CTAs and emphasis
only** — never in charts, never in the dashboard.

```css
/* marketing only */
--brand-accent:        #FF6A1A;  /* deliberately distinct from --ai-claude #D97706 */
--brand-accent-hover:  #E85D12;
--brand-accent-subtle: rgba(255,106,26,0.10);

/* unchanged, product-wide */
--accent:              #C8F000;  /* lime stays "signal only" per §25.1 */
```

`#FF6A1A` is chosen to sit far enough from `#D97706` in hue and chroma to not read as the Claude token.
Lime and `#FF6A1A` are both warm-bright and **will fight if used at equal weight** — the rule must be
one accent per viewport region: lime for data/product surfaces, orange for conversion CTAs.

- **Cost:** token migration (step 1 above, 42 marketing files) + a contrast pass. Computed ratios:

  | Pair | Ratio | Verdict |
  |---|---|---|
  | `#FF6A1A` on `#0F1012` (dark sections) | **6.64:1** | ✅ AA normal text |
  | `#FF6A1A` on `#161719` (card bg) | **6.26:1** | ✅ AA normal text |
  | `#FF6A1A` on `#FFFFFF` | **2.87:1** | ❌ **fails even the 3:1 non-text / large-text floor** |
  | `#C8F000` on `#0F1012` (today's lime) | 14.43:1 | ✅ |
  | `#D97706` (`--ai-claude`) on `#0F1012` | 5.98:1 | — for collision reference |

  **The white-background result is a hard constraint, not a caveat.** Orange text or orange icons on the
  light `#F5F4F0`/`#FFFFFF` surfaces of §3.1 are not available at any size — it would have to be
  orange-as-fill-with-white-text (button), never orange-as-foreground. That rules orange out of exactly
  the place a "premium accent" usually goes on a light page, and is the strongest practical argument
  against Option B/C as drawn.
- **Risk:** §3.5 "multiple palettes" is arguable. Needs an explicit written rule to not become two
  design systems. Dashboard untouched — which is itself a divergence to accept knowingly.

---

#### Option C — "Premium gradient" (leans into the founder's request)

Option B's palette, plus gradient and motion treatment on marketing only.

```css
--grad-cta:    linear-gradient(135deg, #FF6A1A 0%, #C8F000 100%);
--grad-surface: linear-gradient(180deg, rgba(200,240,0,0.06) 0%, transparent 60%);
```

Permitted by the letter of the spec (not purple, not glassmorphism, not blobs) and consistent with the 37
gradient utilities already shipping. **But:** a lime→orange CTA gradient passes through muddy yellow-olive
at its midpoint, which is where button text sits. If taken, the gradient should run orange→deep-orange and
let lime stay separate.

- **Cost:** Option B's cost + per-surface contrast verification on a *moving* background (harder to audit —
  contrast must hold across the whole ramp, not at one stop).
- **Risk:** highest. Directly against the audited evidence in 3.1 — **neither reference site does this**,
  and both read as premium. §29.2/§35's "heavy animation" and "excessive decorative effects" lines become
  live judgement calls rather than clear rules.
- **Honest read:** this is the option most likely to make the site look *less* premium than the two
  competitors it is benchmarked against.

---

### 3.5 Recommendation

**Option A now; Option B only after the token migration lands as its own no-visual-change PR.**

The audit does not support a rebrand as the highest-value work. The measured gaps — no three-step, the
strongest comparison asset buried behind a 301, capability depth invisible, trust facts below the fold,
two product visuals total — are **structural and copy gaps, not colour gaps.** Both reference sites beat
SourceTrack on structure while using *fewer* accent hues than SourceTrack already has.

If the palette does change, the 227-literal migration is the gate. Doing it in the same PR as a value
change is how you get a half-recoloured site.

---

## Appendix — measured facts

| Fact | Value | How |
|---|---|---|
| Marketing pages built | 50 (48 after #500) | `astro build` |
| Product visuals on homepage | 2 | `DashboardMockup`, `JourneyMockup` |
| Hardcoded accent literals | 227 across 59 files | `git grep -oiE '#(C8F000\|B8DD00)'` |
| Gradient utility uses (marketing) | 37 | `git grep -ohE '(bg\|text)-gradient-[a-z-]+'` |
| Tracker size | 20.7 KB min / 17.4 KB cookieless / **6.0 KB gzipped** | `ls -l`, `gzip -c` |
| CAPI mentions on marketing site | 0 | `git grep -il` |
| Comparison block location | `/compare/ga4` only; `/compare` 301s to it | `src/pages/compare/index.astro` |
| `/status` page | does not exist | `ls src/pages` |
| `#FF6A1A` contrast on white | **2.87:1** (fails 3:1) | WCAG relative-luminance calc |

## Appendix — MarketingBeforeAfter auto-cycle (shipped in this PR)

Separately greenlit, built here, and the only code change in this branch.

`MarketingBeforeAfter` auto-advances between its two verticals (SaaS/B2B ↔ eCommerce/Shopify) every
**7s**, with a **160ms** cross-fade. Four independent stops, because auto-rotating content is a WCAG
2.2.2 obligation, not a style choice:

1. **`prefers-reduced-motion: reduce` → does not cycle at all**, and swaps become instant (via the
   existing `usePrefersReducedMotion` hook, whose own docstring names `setInterval` auto-advance as its
   reason to exist).
2. **Clicking either pill pins it permanently** — manual choice always wins.
3. **Hover or keyboard focus pauses it** (`onFocusCapture`/`onBlurCapture`, so it covers tabbing in).
4. **Off-screen → paused** via `IntersectionObserver` at 0.35 threshold, so the visitor never arrives at
   a vertical chosen by how long they took to scroll.

It only runs where the pills are actually offered (`showToggle && !customData`) — i.e. `/compare/ga4`.
The two `/solutions` pages pass `showToggle={false}` with a fixed mode **because those pages are about
one vertical**; rotating there would argue against the page it sits on.

The fade is applied to the heading block and the card grid, never to the pills — controls must not blink
while you aim at them.
