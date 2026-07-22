# SourceTrack — Demo Seed Dataset Spec (for website screenshots)

**Goal:** a demo tenant whose data looks REAL — full journeys, not orphan conversions — so every
website screenshot (Part 8 of the sitemap doc) shows a credible, populated product.
**Target:** ST_Staging demo tenant (Option A — the existing seeder + guard). NOT prod.
**Execution:** extend `scripts/seed-attribution-fixture.mjs` + `scripts/lib/attribution-fixture.mjs`
(the seeder ALREADY writes valid journeys via `dualWriteEvent` → guarded staging Tinybird → nightly
attribution stitches them). This is an EXTENSION for volume + realism, not a new build.

## WHY REPLAY, NOT INSERT (the load-bearing constraint)
Do NOT hand CC raw `INSERT`s into `attributed_conversions`. That reproduces the 2 defective prod rows
(channel='Direct', NULL first_touch, 0 touchpoints) — orphan end-states with no journey. The Lead
Journey panel and `/explain` would be EMPTY, defeating the screenshots. Every conversion below MUST be
produced by firing its full pageview chain THEN its conversion through the real ingestion path, so the
pipeline stitches genuine touchpoints. The existing seeder does exactly this; we add records.

## DATASET SHAPE (what "looks real" requires)
- **~40–60 visitors**, ~25–35 of them converting, over a trailing ~30-day window (so time-series
  charts have shape, not a single spike).
- **Realistic names + companies** (like SourceLoop's Alex Morgan / Acme Inc.), not `test_user_01`.
- **Round-ish but varied revenue** ($49, $99, $149, $249, $1,200 annual, $2,000) — one hero large sale.
- **A ChatGPT / AI touch in EVERY hero journey** — it's the wedge and the money-shot. At least 30% of
  journeys include an AI-source touch (ChatGPT, Perplexity, Claude, Gemini).
- **Channel mix** matching a real SaaS: Organic Search ~30%, Paid Search ~20%, Paid Social ~15%,
  AI referral ~15%, Direct ~10%, Referral/Email ~10%.
- **Multi-touch chains of 2–6 touchpoints** — the thing that makes the journey panel look premium.
- **GSC keyword→revenue rows** — the uncontested surface; the SEO-revenue screenshot needs real
  keyword→landing→conversion rows (seed via the GSC sync path or the gsc fixture tables).

## HERO JOURNEYS (the ones that must be screenshot-perfect)
These are the specific journeys the priority screenshots (Part 8.5) frame. Each must be flawless.

### HERO-1 — the money shot (home hero + og:image + Before/After closer)
The Direct-Rescue story made real. One visitor, a full chain ending in a ChatGPT-sourced sale:
1. `ChatGPT referral` → lands on `/blog/how-to-track-chatgpt-traffic` (day -8)
2. `Organic search` "sourcetrack attribution" → `/` (day -5)
3. `Direct` → `/pricing` (day -2)
4. Converts → **$2,000 annual**, day 0
- First-touch: **ChatGPT** (the wedge — a tool that logs this as "Direct" is the villain of the story).
- Persona: "Maya Chen, Growth Lead, Northbeam Labs" (fictional).
- This is what `/explain` narrates and what the Before/After "With SourceTrack" panel shows.

### HERO-2 — SEO keyword→revenue (the uncontested-surface screenshot)
A GSC keyword tied through to revenue — the screenshot NO competitor can produce:
- Keyword `marketing attribution software` → `/marketing-attribution-software` → 3 return visits →
  $249/mo conversion. Shows keyword → landing page → revenue in one row.
- Needs GSC-side seed rows (keyword, clicks, impressions, landing_url) joined to a converting visitor.

### HERO-3 — multi-touch spread (the attribution dashboard screenshot)
The "conversions by channel" + model-selector view. Needs the full 25–35 conversion spread above so
every channel bar is populated and the first-touch/last-touch/linear toggle visibly changes the split.

### HERO-4 — AI sources tab (the AI-referral screenshot)
Several journeys with distinct AI sources (ChatGPT ×5, Perplexity ×3, Claude ×2, Gemini ×2) so the AI
Sources panel shows a populated, varied breakdown — proof the 22-domain classification is real.

## PERSONAS (sample — CC generates ~40–60 in this style)
| Name | Company | First touch | Journey | Revenue |
|---|---|---|---|---|
| Maya Chen | Northbeam Labs | ChatGPT | AI→organic→direct→buy | $2,000/yr |
| Alex Rivera | Fold Studio | Google organic | organic→blog→pricing→buy | $99/mo |
| Sam Okafor | Trellis HQ | Perplexity | AI→direct→buy | $149/mo |
| Priya Nair | Cadence.io | Google Ads | paid→retarget→buy | $249/mo |
| Jordan Kim | Latch | LinkedIn | paid social→organic→buy | $49/mo |
| … (35 more, same realism) | | | | |

## GATES / SAFETY (CC dispatch must honor)
- STAGING ONLY — the existing guard (`staging-seed-guard.mjs`) must remain intact and pass. Do NOT
  weaken it. If it refuses, that's a finding — STOP, don't bypass.
- Dry-run first (`node scripts/seed-attribution-fixture.mjs`), inspect the plan, THEN
  `--confirm --i-am-targeting-staging`.
- Names/companies are FICTIONAL — no real people, no real customer data.
- The nightly attribution job must run after seeding so touchpoints stitch (or invoke the same path
  the seeder already triggers). Verify a seeded conversion has >0 touchpoints + non-NULL
  first_touch_source before declaring done — the exact defect check from this morning's finding.
- Revenue/AI-source realism is the point; do not seed a $0-carrier as a hero (revenue-exclusion rules).

## VERIFICATION (before "done")
1. `attributed_conversions` for the demo site: 25–35 rows, ALL with >0 touchpoints, non-NULL
   first_touch_source (NOT the defective-Direct shape).
2. HERO-1 visitor: chain of ≥3 touchpoints, first_touch = ChatGPT, revenue = $2,000.
3. GSC rows exist for HERO-2's keyword.
4. AI Sources panel: ≥4 distinct AI sources populated.
5. Time series spans ~30 days (not one spike).
6. Load each priority screen (Part 8.5) in the staging dashboard and confirm it renders populated.

---

## APPENDIX — the `/demo` fixture component (a DIFFERENT surface, same goal)

> **Provenance:** carried forward from `docs/seo/marketing_site_copy_audit_2026-06-16.md` on retirement
> of that doc. **Re-verified against `origin/main` @ `d92308a` (2026-07-22) — still accurate.**

Everything above concerns the **seeded staging tenant** used for real product screenshots. The public
`/demo` page is a **separate surface**: `dashboard/src/components/MarketingInteractiveDemo.jsx`, driven
by static fixtures in `dashboard/src/lib/marketingDemoData.js` — no API, no auth, no Supabase, no seed
dependency. It needs no seed, and it is not fixed by one.

**Verified current state** — the component ships two tab strips:

| Strip | Tabs | Source |
|---|---|---|
| Table A | `Sources` · `AI Sources` · `Top Pages` | `MarketingInteractiveDemo.jsx:209-211` |
| Table B | `Country` · `Browser` · `Device` | `MarketingInteractiveDemo.jsx:289-291` |

**The gap:** those are **web-analytics** dimensions, not **attribution** dimensions. Table B in
particular (Country/Browser/Device) makes the demo read as a Google Analytics clone — which
undercuts the positioning spine on the one page where a prospect is actively evaluating the product.
There is no Campaigns drilldown, no Journeys view, no Conversions breakdown, and no Overview trend.

**Recommended tab set** (attribution-first, replacing the six above):
`Overview` (visitor + conversion trend) · `Sources` · `Campaigns` (UTM performance) · `Journeys`
(chronological multi-touch path) · `AI Sources` · `Conversions` (purchases / lead forms / bookings).

**Also missing:** interactive install-snippet simulation · a verify-tracking simulation · any
empty/loading state (the demo pops in fully rendered, which reads as canned).

**Constraint (unchanged):** fixture data only. No API calls, no auth imports, no Supabase. The
isolation is a feature — keep it.

> ⚠️ **Truth-gate:** a `Campaigns` tab here is *fixture* data and safe, but do **not** screenshot the
> real Campaigns dashboard until KI-53/KI-51 resolve (it serves 1 of 4 dimension tabs on UTC, 0 on
> non-UTC). Fixture demo and real capture are different risks — see Part 8 of the website SEO plan.
