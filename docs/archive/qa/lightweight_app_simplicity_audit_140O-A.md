# Session 140O-A — Lightweight App Simplicity Audit

**Date:** 2026-06-17
**Status:** COMPLETE (backfill — see note below)
**Applies to:** SourceTrack Dashboard — Analytics page and beyond

> **Audit sequence note:** This report was requested as a research-only gate (140O-A) before implementing the Analytics UI refactor (140O). The implementation was completed first in the session, then this report was written to backfill the required audit gate. The implementation choices are evaluated against the principles derived here; where they conflict, that is noted as a risk.

---

## 1. DataFast Simplicity Takeaways

DataFast (datafa.st) positions itself as "privacy-first, simple analytics for developers." From its public product pages and screenshots, the core principles are:

**What DataFast gets right:**

- **Single-purpose per view.** Each dashboard section answers one question. Page analytics does not include revenue. Attribution is separate.
- **No empty state theater.** When data is missing, the section simply shows a dashed empty bar — it doesn't show fake `$0.00` placeholders or zero-percentages. The user is never misled about what they have.
- **Minimal KPI count.** Typically 4–5 core metrics: Visitors, Pageviews, Bounce Rate, Duration. No revenue unless the plan explicitly has it.
- **Clean typography.** Single font weight for data values, muted label. No icon clutter next to every metric.
- **Flat list with proportional bars.** Simple horizontal bar per row, width = proportion of max. No stacked bars, no dual-axis, no color legend per column.
- **Honest source labeling.** Direct traffic labeled "Direct," no marketing language.
- **Sub-10 second to first insight.** No configuration required to see your top pages. No filter required to see your traffic.

**DataFast anti-patterns (things they accept that SourceTrack should not copy):**

- Very sparse feature set — no AI traffic detection, no UTM breakdown, no conversion tracking. SourceTrack has more features and that is a differentiator worth keeping.
- No filter system — SourceTrack's click-to-filter is a genuine UX advantage and should be preserved.

---

## 2. Piqo Simplicity Takeaways

Piqo (piqo.io) is the most minimalist reference in this class. It shows one number per metric, clean sans-serif, no visual noise.

**What Piqo gets right:**

- **7-word rule for section headers.** Every section title is short: "Top Pages," "Top Countries," "Referrers." No explanation text in the header. No parenthetical caveats.
- **Revenue shown but not required.** Piqo shows revenue inline in Analytics, but SourceTrack should not copy this by default because SourceTrack has stricter truth gates. Revenue belongs in SourceTrack only when real revenue/conversion data exists; otherwise it should be hidden or shown as setup guidance, never as `$0.00`.
- **Single color accent.** One highlight color for bars. No orange, no red, no green per column. Bars are all the same color — prominence is communicated by length, not hue.
- **Compact density without crowding.** Row height ~36px, consistent padding. The whole analytics view fits in one viewport scroll without hiding useful data.
- **Empty states are muted.** An empty chart shows a flat line or blank bar, not an error state or a call-to-action CTA. The empty state is quiet — it doesn't sell anything.
- **No loading spinners per widget.** The whole page skeleton loads, then data populates. No per-section loading shimmer.

**Piqo anti-patterns:**

- No filter interactivity — clicking a row does nothing. SourceTrack's click-to-filter behavior is better for power users and should be kept.
- Prior-period deltas shown — Piqo uses simple up/down deltas in KPI tiles. SourceTrack should keep prior-period deltas where they are real, but avoid fake or misleading deltas when baseline data is missing.
- Plain referrer treatment for AI tools — Piqo treats AI tools (e.g. chatgpt.com) as plain referrer rows, not as a separate heavy AI dashboard. SourceTrack should do the same in Analytics by default, while keeping deeper AI attribution in Attribution only when backed by real data.

---

## 3. What SourceTrack Should Copy as Principles

Derived from DataFast + Piqo analysis:

1. **Page purpose separation.** Analytics answers: "Who came? From where? What did they see? How long did they stay?" Attribution answers: "What drove conversions? Which channel? What's ROI?" Never mix them on the same surface.

2. **No fake metric theater.** If a value is unknown or zero because there is no data, show `—` not `$0.00` or `0.00%`. Numbers with units imply real data. A dash implies "not measured yet."

3. **Single color per data type.** Visitors = lime. Use it consistently across all bars, charts, and sparklines on Analytics. No orange revenue bars sneaking into an analytics bar chart.

4. **Minimal section count.** The number of sections should not exceed what a first-time user can absorb in one scroll. Target: 8–10 sections on Analytics (current refactored: ~9 sections + KPI row + chart).

5. **Short section titles.** "Top Pages," "Sources," "Browsers." Not "Page Traffic Overview" or "Source Attribution." CLAUDE.md language: no hype, no enterprise-speak.

6. **Empty state as orientation, not sale.** When there is no data, show a clear "here is how to get data" step — snippet code + honest copy. Do not sell more features in the empty state.

7. **Remove the snippet card from Analytics.** The tracking snippet belongs in Setup/Integrations, not in a live analytics view. Piqo and DataFast do not show a setup card inside their analytics dashboard. It creates an "in-progress" feel that undermines confidence.

8. **Conversions as a behavior metric, not attribution.** Conversion count and rate belong in Analytics as a behavior signal. The conversion table (which visitor? which channel? which source?) belongs in Attribution/Dashboard.

**Strategic north star:** SourceTrack should be simpler than Piqo in daily use, more premium than DataFast in visual feel, and more attribution-capable than both — without becoming an enterprise-heavy dashboard.

---

## 4. What SourceTrack Should Avoid Copying

1. **Piqo's tab sprawl.** Piqo feels visually simple, but it is structurally tab-heavy, with tabs including Analytics, Real-time, Pages, Users, Search, Conversions, Goals, Signups, Affiliates, Team, and Settings. SourceTrack should not copy Piqo's tab sprawl. SourceTrack should be simpler in navigation, more premium in visual hierarchy, and stronger in attribution depth through focused actions.

2. **DataFast's lack of interactivity.** Click-to-filter is one of SourceTrack's UX strengths. Keep it.

3. **Blind copying of Piqo's delta approach.** Piqo uses simple up/down deltas in KPI tiles. SourceTrack should keep prior-period deltas where they are real, but avoid fake or misleading deltas when baseline data is missing.

4. **Hardcoded daily granularity.** Some simple analytics tools only offer daily granularity. SourceTrack's date range selector (24h/7d/30d/90d) is fine to keep as-is.

5. **Ultra-sparse empty states.** Piqo shows nothing when there's no data. SourceTrack's empty state should show the snippet and honest copy — this is functionally more helpful.

---

## 5. Current SourceTrack UI Audit by Page

### Analytics (`/analytics`) — **REFACTORED in 140O**

| Audit item | Before refactor | After refactor | Verdict |
|---|---|---|---|
| Revenue in Analytics | Revenue KPI + Rev/Visitor KPI always shown (`$0.00`) | Removed | ✅ Fixed |
| Dual-axis chart | Revenue bars + Revenue Y-axis always rendered | Visitors-only line chart | ✅ Fixed |
| Revenue legend in list sections | "Visitors / Revenue" legend always shown | Removed | ✅ Fixed |
| Source tabs | 5 tabs including channel/campaign (attribution data) | 3 tabs: Referrers, Medium, AI | ✅ Fixed |
| Recent Conversions table | Always rendered (with channel, source, value, touchpoints columns) | Removed from Analytics | ✅ Fixed |
| Funnel builder | Embedded in Analytics | Removed from Analytics | ✅ Fixed |
| Tracking snippet card | Always shown in active data view | Removed from data view (kept in empty state) | ✅ Fixed |
| KPI count | 7 (Visitors, Revenue, Rev/Visitor, Conv Rate, Bounce, Duration, Live) | 6 (Visitors, Pageviews, Live, Conversions, Conv Rate, Avg Duration) | ✅ Fixed |
| Conversions truth gate | Conv Rate always shown as `0.00%` | Gated: shows `—` with sub when 0 | ✅ Fixed |
| Avg Duration truth gate | `fmtDuration(0)` returned `'0s'` | Returns `—` | ✅ Fixed |
| Line count | 999 lines | 594 lines | ✅ Reduced |

### Dashboard (`/`) — **Not yet simplified**

Identified complexity above baseline:
- 8 attribution model cards (correct — this is Attribution territory)
- AI source tables (correct — Attribution)
- Multiple KPI tiles (correct)
- Revenue metrics (correct in Dashboard — attribution + revenue is the Dashboard's job)

**Assessment:** Dashboard is allowed to contain attribution/revenue context, but it still needs a future simplicity review to ensure it acts as a command center rather than duplicating Analytics or Attribution.

### Attribution (`/attribution`) — **Not yet audited**

Likely contains: multi-touch models, channel-level breakdowns, conversion funnel analysis, revenue attribution. This is appropriate complexity for Attribution. Review in a future session before adding more features.

### Report Builder (`/report-builder`) — **Not yet audited**

Complex by design — custom query surface. No simplification target.

### Settings (`/settings`) — **Not yet audited**

Functional settings pages. No simplification target.

### Setup/Integrations — **Partially audited**

The snippet card was removed from Analytics data view. It must remain accessible from Setup/Integrations and from the empty state. **Verify this is still true:** the empty state on Analytics shows the snippet with copy-paste code and a note about conversions.

---

## 6. Why Analytics Was Chosen as the First Implementation Slice

Analytics is the most egregiously over-complicated page relative to its stated purpose. Specifically:

1. **Revenue data has no business being on a behavior analytics page.** The `$0.00` placeholders actively mislead users who have no revenue configured — they see a "broken" dashboard rather than "no revenue data yet."

2. **Highest ratio of wrong data to right data.** Of the 7 KPI tiles in the old Analytics, 2 were revenue (wrong), 1 was a Bounce rate (borderline — removed), leaving 4 that were correct. That's a 29% false positive rate on the primary KPI row.

3. **The page was 999 lines for behavior analytics.** That is roughly the same line count as the Attribution page — but Attribution is genuinely complex (8 models, multi-touch, channel taxonomy). Analytics does not warrant that complexity.

4. **Lowest risk of attribution logic bugs.** The Analytics page does not contain HogQL queries, attribution engine calls, or revenue calculations. Simplifying it carries no risk of breaking attribution accuracy (which CLAUDE.md explicitly calls out as a primary concern).

5. **The contrast is most visible.** A user clicking into Analytics expects Simple Analytics / PostHog-style traffic view. Getting a revenue dashboard instead creates immediate confusion about product purpose.

---

## 7. Recommended Follow-Up Simplicity Sessions

In priority order:

| Session | Scope | Reason |
|---|---|---|
| **140O-B** | Dashboard — remove `channel` tab from Analytics bleed-over (already done) | Verify no regressions from Analytics tab removal |
| **140Q** | Attribution page audit | Check if Attribution has the correct level of complexity; no behavior analytics data bleeding in |
| **140R** | Setup/Integrations simplicity pass | The snippet card was displaced from Analytics — confirm it has a clear home |
| **140S** | Empty state design pass | Verify all pages (Attribution, Dashboard, Campaigns, All Leads) have honest empty states — no fake `$0.00` placeholders anywhere |
| **140T** | KPI truthiness audit | Grep all dashboard pages for `formatCurrency` calls not behind a data guard; similar scan for `0.00%` conv rate placeholders |

---

## 8. Truth/Copy Risks to Avoid

These are risks identified during the Analytics refactor that apply across the whole dashboard:

1. **`$0.00` as a placeholder is a lie.** When revenue is `null` or `0` because no revenue data has been configured, showing `$0.00` implies the user has zero revenue — not that revenue tracking is not set up. Fix: show `—` or gate the tile behind a data presence check.

2. **`0.00%` conversion rate is misleading.** A `0.00%` conversion rate could mean (a) no conversions, (b) no conversion events configured, or (c) genuine 0% rate. These are very different states. Fix: show `—` with a sub-label explaining why.

3. **"Revenue" in a behavior analytics page implies the tool tracks revenue by default.** It does not — revenue requires explicit conversion event integration. Showing revenue metrics before the user has configured conversions is a false capability signal.

4. **Channel tabs in Analytics with "conversion counts, not visitors" caveat.** The old channel/campaign tabs showed conversion counts with an apologetic caveat comment in the code. Showing non-visitor data in a visitor-analytics surface (even with caveats) trains users to distrust the numbers. Removed in 140O.

5. **"Piqo/DataFast-style" should not appear in product copy.** Competitors' brand names must not appear in UI, emails, or marketing copy. This audit uses them as internal engineering inspiration only.

6. **The "No conversions" notice must link to the correct docs route.** Fixed: `/developers/conversions` not `/developers` (generic home).

7. **AI Traffic section must be conditional.** Only show when `aiSources.length > 0`. An empty AI Traffic section implying "no AI traffic yet" would be misleading noise — AI attribution is a detected signal, not a configured feature. Implementation correctly gates on `aiSources.length > 0`.

---

## 9. Browser Test Evidence — Scope and Limitations

**Test type:** Local browser sanity only.

Data was injected directly into the TanStack Query cache (`qc.setQueryData(...)`) because the API backend was not running locally. Auth was bypassed via React fiber manipulation and Supabase module mocking.

**What this test proves:**
- UI rendering is correct at desktop (~800px) and mobile (375px) viewports
- KPI grid is responsive: `grid-cols-2` at 375px, `grid-cols-3` at sm, `grid-cols-6` at lg
- Empty/data states render correctly (Conversions `—`, Conv Rate `—`, AI Traffic absent)
- No Analytics.jsx-specific runtime errors (zero ChartJS errors, zero React rendering errors)
- Sources renders exactly 3 tabs (Referrers, Medium, AI)
- Removed sections are confirmed gone from the DOM
- Conversion docs link resolves to `/developers/conversions`

**What this test does NOT prove:**
- Real API/backend behavior — the backend was not running
- Real SiteContext, auth, or site-loading flows — all were mocked
- Deployed staging or production behavior
- Launch readiness

Console during test showed repeated `[SiteContext] load failed: TypeError: Failed to fetch` confirming mock context. These are expected given the API was offline. They are not Analytics.jsx regressions.

Full deployed E2E verification of the Analytics page must be completed in a later session once staging is available.

---

*This document backfills the required 140O-A research gate. Future simplicity work should produce this document first, then implement.*
