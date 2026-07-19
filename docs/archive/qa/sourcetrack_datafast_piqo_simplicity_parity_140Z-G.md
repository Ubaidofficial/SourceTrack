# SourceTrack vs DataFast/Piqo — Simplicity & Parity Audit (Session 140Z-G, Revised)

**Date:** 2026-06-18
**Session:** 140Z-G — Simplicity & Parity Audit (revised with video frame observations)
**Branch:** main — no code changes, no commits
**Codebase commit:** 71c9d8b
**Scope:** Full codebase read · 52 page components · 42 API routes · all marketing pages · SEO infrastructure · 7 Piqo/DataFast video walkthroughs (26 frames extracted from `/tmp/vframes/`)
**Status:** PENDING REVIEW — documentation only

---

## 1. Brutal Executive Verdict

SourceTrack has a real attribution engine, honest privacy claims, and a codebase that holds up under scrutiny. It is not vaporware. The hard parts — nightly attribution jobs, identity stitching, multi-touch models, Stripe and Shopify webhook handling — are built and working.

**The product is not ready for paid beta on simplicity grounds.** Not because features are missing, but because the UX has not been compressed from "first implementation to engineers" to "product built for busy CMOs."

Here is what the code reveals:

- **Integrations.jsx is 2,865 lines.** This is the single largest page in the app — larger than the entire Dashboard. A non-technical founder connecting Stripe will encounter a wall of collapsible rows, webhook terminology, curl examples, and developer jargon.
- **Campaigns.jsx is 1,440 lines.** It renders a dimension tab system, 5 KPI tiles, a 10+-column table, a cost import modal with 2 tabs, and a slide-over detail panel — all on one screen.
- **Settings has 13 major sections.** Custom tracking domain, cross-domain tracking, UTM builder, API tokens, privacy erasure, and a danger zone are all on the same scroll.
- **The dashboard answers "what are my numbers" but not "what should I do next."** The Command Center nav bar (4 quick links below the KPI strip) is passive navigation, not actionable intelligence.
- **The attribution tab presents a 9-option model dropdown with no inline explanation.** "AI journey influence" appears in the list with no tooltip. A CMO will not know what this means.
- **The homepage sub-headline is 41 words.** The Measurement Flow section (5 numbered steps with full paragraphs) reads like documentation, not conversion copy.
- **There is no social proof on the homepage.** No customer logos, no testimonials, no verified setup count, no product demo. Real testimonials and logos require real customers — but truthful substitutes exist right now: product demo, verified setup states, privacy safeguards, founding customer program, transparent docs, real QA evidence.
- **PricingCards renders a `lg:grid-cols-4` grid with only 3 plan objects.** The fourth column is always empty. This is a visual bug.

Video analysis of Piqo and DataFast confirms: both competitors are simpler not because they have fewer features, but because each screen answers one question. DataFast's journey view answers "who is this customer and how did they convert?" Piqo's analytics page answers "who came and from where?" SourceTrack currently shows everything it can do on every screen, simultaneously.

The verdict: **fix the simplicity debt before taking money from customers who expect a simple tool.** The features are there. The communication and compression are not.

---

## 2. Video-Derived Piqo Simplicity Principles

*Source: `piqo-tour (1) (1).mp4`, `conversion-tracking.mp4`, `gsc-insights.mp4`, `piqo ai tools.mp4`, `visitor-journey.mp4` — 17 frames extracted and analyzed*

### Observation 1: Homepage — one headline, one CTA, no jargon

Piqo's homepage headline is **"Dead simple, affordable analytics."** The word "affordable" is highlighted in orange. The sub-headline is one sentence: "Accurate analytics for SaaS. Stitch every visitor from first click to paid customer — cookieless mode available." The single CTA is "Install analytics — 14-day free trial →" with "No credit card required." directly below it.

No feature list. No numbered steps. No "How it works" accordion above the fold. No developer terminology.

**SourceTrack adaptation:** The homepage H1 ("Know which sources actually make you money.") is strong. The 41-word sub-headline and the 5-step Measurement Flow section are the problem. Cut the sub to ≤20 words. Move the Measurement Flow to `/product`. One CTA above the fold, not two.

### Observation 2: Sites as cards with sparklines and 3 icon-labeled metrics

The Piqo sites overview is a 3-column card grid. Each card shows: site favicon + domain name, a small sparkline chart, then exactly 3 icon-labeled metrics in a row — person icon (visitors), eye icon (pageviews), $ sign (revenue). A trial countdown pill in the top right corner: "11d 2h left in trial | Add payment →".

No tables. No rows. No columns to show/hide. Three numbers, one sparkline, one domain, one action.

**SourceTrack adaptation:** The multi-site view doesn't exist at this fidelity yet. When building it, use the card pattern. Never default to a data-dense table for a sites overview.

### Observation 3: Analytics dashboard compression — everything on one screen without heaviness

Piqo's analytics page packs 6 KPI metrics with % deltas (Visitors, Pageviews, Revenue, Conversion rate, Bounce rate, Session time) into a single row. Below that: one combined line+bar chart (visitors as line, revenue as bars). Below that: two breakdown tables side by side, each with inline tabs — left table: Channel / Referrer / Campaign / Term / Content / Ad source; right table: Country / City / Continent.

The page does not feel heavy because the tables are side-by-side, not stacked. The tabs are inline, not a separate navigation. Nothing requires scrolling to see the core data.

**SourceTrack adaptation:** The Analytics page currently has 6 KPI tiles + 8 separate breakdown cards stacked vertically. Move to a 2-column layout for breakdown tables. Put the tab switching inline, not as separate cards.

### Observation 4: Conversion tracking as a visitor table + icon-only left sidebar

The "Journey for payment" view in Piqo is a customer table — each row is a visitor, clicking opens a right-side drawer. The left sidebar is icon-only (7 icons: analytics, real-time, pages, visitors, revenue, links, settings). No text labels. The sidebar takes ~40px of horizontal space. The entire remaining viewport is the content.

**SourceTrack adaptation:** The current left nav has text labels and takes significant viewport width. Consider icon-only mode with tooltips on hover. The "View Journey" CTA in Recent Conversions must open a right-side drawer, not navigate to /leads list — this is the core broken promise in the current codebase (`pages/Dashboard.jsx:419–421`).

### Observation 5: Visitor journey as table + right-side panel (preserves context)

Piqo's Users table shows: VISITOR (avatar + ID + source), COUNTRY (flag), DEVICE (browser + type), SESSIONS, PAGEVIEWS, TIME ON SITE, ENTRY → EXIT. Clicking any row opens a right-side drawer without leaving the table. The drawer header shows session summary ("1 session · 18 pageviews · 28m 32s on site"), then a metrics row (Time on site, Sessions, Pages viewed, Total events), then session groups with metadata (country flag, browser, device type, UTM source), then individual page events with timestamps.

The table stays visible on the left. The drawer is additive context, not a page replacement.

This frame captured a real UTM source on a visitor: `utm_chatgpt.com` — confirming Piqo stitches AI referrals to individual visitor journeys, not just aggregate counts.

**SourceTrack adaptation:** The current `pages/Dashboard.jsx:419–421` "View Journey" link navigates to `/leads` — the list, not the journey. Fix this to open a right-side drawer over the current screen. This is the pattern both Piqo and DataFast converge on for visitor-level detail.

### Observation 6: GSC as action buckets, not raw keyword tables

Piqo's GSC interface shows two levels. First: a multi-site card view — one card per connected site showing Clicks (+5066.7%), Impressions (+12000.0%), CTR, Avg Position with deltas, and an "Open dashboard" button. Second: a keyword interface with two views — a bucket nav ("↑ Winners (20)," "↓ Losers (14)," "○ Opportunities (0)," "✦ Quick wins (0)," "＋ New (1)," "× Lost (3)") with one-line descriptions per bucket, and below that a keyword accordion where each keyword row is expandable.

The "Quick wins" bucket description: "Ranking on page 1 but underclicked." This is an action instruction, not a data label.

**SourceTrack adaptation:** If/when GSC integration is built, do not default to a raw keyword table. Use the bucket pattern: Winners, Losers, Opportunities, Quick wins, New, Lost. Each bucket earns its place by telling the user what to do.

### Observation 7: AI sources are just another channel filter — not a separate section

Piqo's AI tools video shows a standard analytics dashboard (dark mode) with a dropdown labeled "AI | Campaign ▼" on the breakdown table. AI sources are not a separate page, not a dedicated section, not a special card. They are a filter option within the existing channel breakdown.

The top nav in this view: "Real-time, Pages, Users, Search, Conversions, Goals, Signups, Affiliates" — no "AI Sources" tab. AI referral traffic appears within the existing channel/source breakdown.

**SourceTrack adaptation:** The current Dashboard has an "AI Source Performance" card that renders conditionally. This is the right approach. Do not create a separate AI Attribution tab — AI sources belong in the existing source breakdown, surfaced as a highlighted row or filter option.

### Observation 8: Settings are grouped but written in plain language

Piqo's Settings page shows a "Cookieless" radio button with this description: "No cookies, no localStorage. Visitor identity is derived from a daily-rotating IP + user-agent hash, so the same person reading two..." — plainly written, technically accurate, non-jargon. Below: an "Excluded paths" section with a single glob pattern input and an example ("e.g. /admin/* or /preview"). A "Save changes" button. A "Danger zone" section.

The settings page does not show: attribution windows, custom UTM parameters, cross-domain tracking, API tokens, webhook configurations. Those are elsewhere or hidden.

**SourceTrack adaptation:** The current Settings page has 13 sections in a single scroll including things Piqo deliberately excludes from Settings (API tokens, custom params, attribution window). Group into 4 tabs: Site, Privacy, Integrations/API, Danger. Do not put attribution windows in the default settings view.

### Observation 9: Piqo's core lesson — decide what NOT to show

Every Piqo screen answers exactly one question:
- Sites page: "How are my sites performing at a glance?"
- Analytics page: "Who came to my site and from where?"
- Users page: "Who are my individual visitors?"
- GSC page: "What keywords should I act on?"
- Settings page: "How do I configure my tracking?"

Complexity is hidden via: icon-only navigation (no visible text labels), right-drawer detail (no full-page navigation), bucket-based categorization (Winners/Losers replaces raw sort), and inline tab switching (not separate pages).

SourceTrack's problem is not that it has more features than Piqo. It's that it shows more features simultaneously on every screen.

---

## 3. DataFast Simplicity Principles

**Evidence attribution:**

| Evidence type | Source | How reviewed |
|--------------|--------|-------------|
| Frame-extracted | `datafast_dates_2s/5s/8s.png`, `datafast_journey_5s/15s/30s/45s.png` — extracted from MP4s via Swift/AVFoundation to `/tmp/vframes/` | Read tool — directly reviewed by Claude Code |
| Screenshots | Marc Lou tweet (DataFast referrer table) · DataFast multi-site portfolio dashboard | Provided as images — directly reviewed by Claude Code |
| Human-reviewed video | `i_was_always_curious_about_what_visitors_do_on_my_site_before_purchas_RwEgIp.mp4` · `added_custom_date_ranges_to_DataFast_____This_type_of_design_MWFPXz.mp4` | **Claude Code cannot ingest MP4 binary directly.** Full video observations below were reviewed by a human and provided to complete this section. Where frames were available they confirm the observations. |

---

### Observation 1: Weekly report card — core product surface, not optional email *(human-reviewed video + screenshot)*

DataFast's weekly email digest is a structured report card. Metrics visible in the report:
- Visitors with week-over-week delta
- Revenue with delta
- New Revenue (vs. Renewal Revenue — separately broken out)
- Revenue per visitor
- Conversion rate
- Bounce rate
- Session time
- **"How people found you?"** — top referrers and top campaigns with visitor + revenue counts

One-click return to the specific dashboard screen per metric. The product delivers the answer; the user does not need to log in to find it.

**Lesson for SourceTrack:** The weekly digest must be a designed product surface — not a notification settings checkbox. It should be ready before public launch. Subject line leads with an insight ("SourceTrack weekly: [top source] drove [X] leads this week"), body mirrors the KPI row with deltas, every metric links to the specific dashboard screen. Required content: visitors, leads, revenue/pipeline if real, best source this week, biggest source movement, top campaigns, top AI referrals, top SEO pages/search queries where available, one "what to do next" recommendation. Do not include every attribution model. Do not show fake revenue or cost placeholders. See Section 18 for full requirements.

### Observation 2: Docs as setup paths — not an encyclopedia *(human-reviewed screenshot)*

DataFast docs are grouped by jobs-to-be-done:
- Set up account
- Exclude visits (internal traffic filtering)
- Proxy guides (custom domain for ad-block reduction)
- Client-side tracking
- Server-side tracking / revenue attribution

No "concepts" section. Each group leads to the next step. Dead-ends do not exist.

**Lesson for SourceTrack:** Required SourceTrack docs IA — 10 setup paths, each ending with "Done? Next: →":

| Path | What it covers |
|------|---------------|
| Install | Script tag, GTM, verification |
| Verify | SetupDoctor, first event, troubleshooting |
| Exclude visits | IP exclusion, path glob exclusion |
| Track conversions | Custom events: form submissions, button clicks |
| Connect Stripe | Webhook recipe, signing secret, test mode |
| Manual Shopify webhook | Custom storefront, Shopify Plus, order event |
| Forms & bookings | Calendly, Typeform, contact form |
| Google Search Console | OAuth connect, keyword data |
| API / manual conversions | Server-side events for custom payment flows |
| Proxy / custom domain | CNAME setup for reduced ad-block impact |

### Observation 3: One dashboard, one primary chart — date range drives everything *(frame-confirmed: `datafast_dates_2s/5s/8s.png`)*

Every DataFast data screen uses the same top-of-page layout: site selector + date picker on one line. Presets in the dropdown: Today, Last 24 hours ✓, Last 7 days, Last 30 days, Last 12 months, Week/Month/Year to date, All time, Custom. "Custom" is the last item — not behind "Advanced." An interactive hover tooltip shows: date, Visitors, Revenue, Revenue/visitor, Conversion rate.

The chart format never changes: blue visitor line + orange revenue bars. No chart type selector, no toggle. The whole dashboard updates from one date range — there are no per-card date controls.

**Lesson for SourceTrack:** One screen-level date range should drive Dashboard, Analytics, Attribution, Campaigns, and Reports consistently. Scattering independent pickers per section creates the feeling of managing a tool rather than understanding a business. Chart tooltips should show simple metrics only: visitors, conversions, revenue/pipeline if real, and top source. No attribution math in default tooltip. See Section 21.

### Observation 4: Visitor/customer journey — plain-English event timeline *(frame-confirmed: `datafast_journey_30s/45s.png` + human-reviewed video)*

**Frame-confirmed:** DataFast's journey detail is a full page (URL changes to `/dashboard/[id]`). Left panel: visitor profile card — name, email, country, city, device resolution, OS, browser. Right panel: chronological events grouped by session date.

Plain-English event labels with icons (confirmed from frames):
- 🔍 "Found [site] via YouTube" — first touch with source named
- 👁 "Viewed page [/]" — pageview
- ↗ "Navigated to [external URL]" — outbound click
- 👤 "Signed up as [email]" — signup conversion
- 💳 "Paid $249 🎉" — revenue event

Directly observed (from extracted frames): a customer found a site via YouTube, returned across multiple sessions over ~15 days, browsed several pages, clicked outbound links, signed up, and completed a payment event. Multiple sessions, one payment — the full customer story visible in one view. (Specific names, emails, and exact amounts visible in the demo frames are not reproduced here.)

**Human-reviewed context:** The video shows the visitor/customer list first, then clicking a row opens the journey detail. Journey is readable by a founder, not an analyst. Events are grouped by time/session. It answers "What did this person do before purchasing?" without requiring knowledge of event schemas, attribution models, or raw analytics logs.

**Lesson for SourceTrack:** Fix "View Journey" on Dashboard Recent Conversions to open the specific journey (`pages/Dashboard.jsx:419–421`), not `/leads`. Standardize one journey detail pattern across Dashboard, Leads, Attribution, Campaigns, and AI Sources — either right-side drawer or full journey page, chosen once and used consistently. Journey view should show: first touch, last touch, conversion event, revenue/pipeline if real, time to convert, sessions/pages/events, source/campaign/AI/SEO context, and full raw path behind "Show full path."

Use plain event labels:
- "Came from Google" / "Came from ChatGPT"
- "Viewed pricing page"
- "Submitted form" / "Booked meeting"
- "Paid in Stripe" / "Shopify order received"
- "Identified lead"

Do not expose raw event names by default. Do not show real emails, names, exact journey details, or revenue publicly without explicit written approval and proper redaction.

### Observation 5: Conversion filtering is simple — outcomes first, attribution second *(human-reviewed video)*

DataFast frames conversion/journey exploration around simple conversion outcomes: purchase, payment. The user is not forced to choose an attribution model before understanding the journey.

**Why it works:** Founders think in outcomes — paid, signed up, booked, submitted form — not attribution-model terminology.

**Lesson for SourceTrack:** Primary journey/conversion filters should be outcome-based:
- All conversions
- Leads
- Revenue
- Bookings / Forms
- Manual/API conversions
- Shopify orders / Stripe payments

Attribution model comparison ("Compare all 9 models") should be a secondary expansion, not the first control a user encounters. Move the 9-model dropdown behind "Compare attribution models" — keep the default view showing one sensible default (last touch).

### Observation 6: Custom date ranges — first-class, not advanced *(frame-confirmed: `datafast_dates_5s.png`)*

Date range "Dec 10, 2024 → Jan 10, 2025" visible at top. The "Custom" option opens an inline calendar range picker within the same dropdown — not a modal, not an "Advanced" link. Site selector + date picker are a single persistent line on every data screen.

**Lesson for SourceTrack:** "Custom" is a first-class date option, not an advanced one. Any data screen without the standard date picker is a consistency bug. See Section 21.

### Observation 7: Product-led proof — real, verifiable, the founder's own portfolio *(screenshot-confirmed: multi-site portfolio dashboard)*

Header directly observed: a named greeting with aggregate visitor and multi-currency revenue totals for the period. Multi-currency (two currencies) shown simultaneously. Portfolio grid: 15 sites from the founder's own portfolio — each card shows a site-specific accent color for revenue bars, a blue visitor line, and "Xk visitors · $Y revenue." Cards are drag-reorderable ("Order" button). "+ Website" adds a site without leaving the view. (Exact business names, visitor counts, and revenue figures from the demo are not reproduced here.)

**Human-reviewed context:** DataFast uses real-looking dashboard/report screenshots and social reposts as trust proof. Feature announcements are phrased as: "I was always curious about what visitors do on my site before purchasing." User curiosity first, feature name second.

**Lesson for SourceTrack:** The most credible demo is SourceTrack tracking sourcetrack.ai itself. After a privacy/redaction review, a ShareDashboard read-only link for sourcetrack.ai's own data is more convincing than any testimonial. Do not publish this link without completing that review first. If live data is not ready, use static fixture data clearly labeled as demo-only — never present fixture data as real proof. Do not show real customer emails, names, or exact revenue publicly without explicit written approval and redaction.

### Observation 8: Tweet-level source attribution *(screenshot-confirmed: Marc Lou tweet)*

DataFast's referrer table (Channel / Referrer / Campaign / Keyword tabs, sorted by Revenue ↓) shows individual X post URLs as separate rows:
- `x.com/marc_louvion/status/197302972225595428` → $1.1k
- `x.com/marc_louvion/status/190701630994397194` → $890
- `x.com/marc_louvion/status/184580823899199900` → $363
- `t.co` (unresolved catch-all) → $303
- `t.co/3EDxln5mdi` (partial) → $156
- Other contributors' posts → $9–$19 each

DataFast resolves t.co shortlinks to exact post URLs. Instead of "$303 from Twitter," you see "$1.1k from this specific tweet."

**Lesson for SourceTrack:** SourceTrack captures `document.referrer` on every pageview — this contains the full referrer URL when available. Display the full referrer URL in the Referrer breakdown tab with a "Group by domain" toggle. A source row reading "x.com/[specific post]: 8 leads, $1.1k" is far more actionable than "twitter.com: 8 leads." This is a display change, not a new data capture requirement.

### Observation 9: Multi-site portfolio with aggregate header *(screenshot-confirmed)*

The portfolio IS the dashboard for multi-site users — not a "switch site" dropdown. Aggregate header personalizes by name and shows cross-site, cross-currency totals. "+ Website" adds a site without leaving the view.

**Lesson for SourceTrack:** The multi-site card view is a V1.1 priority. Aggregate header ("you have X visitors across all sites, made $Y this month") is the hook that justifies plan upgrades for founders with multiple products.

### Do-Not-Copy Warnings from DataFast

| Claim or behavior | Why SourceTrack must not copy |
|------------------|-------------------------------|
| **"Nearly 100% accuracy"** | Daily-rotating IP+UA hash has structural limits: shared IPs, VPNs, corporate NAT, mobile carrier networks. "High accuracy for most sites" is defensible. "Nearly 100%" is not. |
| **Guaranteed ad-block bypass** | Cookieless tracking reduces ad-block impact; it does not guarantee full coverage. Do not claim bypass. |
| **Exact person-level keyword attribution** | Cookieless identity matching cannot reliably resolve the exact keyword a specific person searched before purchasing. Surface keyword trends, not individual keyword attribution per lead. |
| **Exact AI prompt attribution** | SourceTrack can detect that a visitor came from ChatGPT. It cannot attribute which specific prompt or conversation brought them. Do not claim prompt-level attribution. |
| **Showing third-party customer data publicly** | DataFast demos use Marc Lou's own products. SourceTrack's customers are third parties — displaying their customer names, emails, journey details, or exact revenue publicly requires explicit written approval and proper redaction. |
| **Real-time attribution claim** | SourceTrack's attribution runs nightly (`nightly-attribution.js`). Real-time pageview counts are accurate. Attribution results are not available until the nightly job completes. Do not conflate the two. |
| **Generic visitor analytics creep** | DataFast shows real-time presence, geo maps, browser breakdowns. SourceTrack's positioning is revenue and source attribution — not "see who is on your site right now." Avoid features that blur this positioning. SourceTrack stays attribution-first. |

---

## 4. What SourceTrack Must Not Copy

| Anti-pattern | Why to avoid |
|-------------|-------------|
| **Piqo's real-time visitor map** | Cosmetic. Adds infra cost and geolocation streaming. Conflicts with "simpler than Piqo in daily use." |
| **DataFast's ad-management UI** | SourceTrack is read-only attribution, not a campaign management tool. The line must never blur. |
| **Piqo's affiliate dashboard** | Separate product surface. Commissions, tracked links, and payouts require their own billing design. |
| **DataFast's cookie-first approach** | SourceTrack's privacy claims (cookieless, no fingerprinting, DNT) are a real differentiator. Do not backslide to cookie-based tracking for simplicity. |
| **Heavy funnel visualization UI** | Piqo has it Planned but not shipped. SourceTrack's multi-touch models already answer the "where did they drop off" question adequately for V1. |
| **AI chatbot inside the dashboard** | The AIChat page exists as dead UI. Do not expand this before the MCP server establishes a clean read-layer. |
| **DataFast's "nearly 100% accuracy" claim** | DataFast makes accuracy claims that cannot be independently verified and likely overstate what cookieless attribution can deliver. SourceTrack's approach — honest about what the daily-rotating hash does and doesn't capture — is the right position. Do not copy the overclaim. |
| **DataFast's guaranteed ad-block bypass claim** | Cookieless tracking reduces ad-block impact but does not guarantee full coverage. Do not claim bypass. |

---

## 5. Current SourceTrack UI/UX Gaps

These are findings from reading the actual code, not generic recommendations.

### 5a. Dashboard

**What the dashboard answers well:**
- What are my total leads/revenue/conversions this period? (KPI strip, 3 tiles)
- What are my top 5 traffic sources by conversions? (Top Sources card)
- What happened to my revenue over time? (Performance Trend chart)

**What the dashboard does not answer:**
- What changed since last week? (No delta on the Top Sources table)
- What should I do next? (Command Center nav is passive navigation, not insight)
- Why did revenue go up or down? (Chart shows what, not why)

**Specific problems:**
1. **"Recent visitors (5m): X"** — the "(5m)" qualifier is technical. Non-technical users don't know what "5m" means in this context. Label it "Active now" or "Visitors last 5 min."
2. **Dashboard tab navigation is URL-based** — switching between Overview (`/dashboard`) and Attribution (`/attribution`) navigates to different URLs rather than toggling an in-page tab. This means the browser back button exits the tab instead of the page.
3. **Attribution tab: 9-model dropdown with no explanation** — the dropdown shows all models including "AI journey influence" with no tooltip or plain-language description. Simplify to 3 named modes (First touch, Last touch, Full journey) with "Compare all models" expansion.
4. **Pinned Reports empty state** — "No pinned reports yet. Pin reports from the Report Builder." tells users what to do but not why they should.
5. **AI Source Performance card** — correct to show conditionally. On the attribution tab, the "No AI referrals detected yet" empty state should teach, not just placeholder: "No AI traffic detected yet. Once visitors arrive from ChatGPT, Claude, or Gemini, their attribution appears here."

### 5b. Campaigns

1. **"Campaigns & Attribution" with "Last Touch model badge"** — confusing when users view other models.
2. **4 dimension tabs (Campaign, Source, Medium, AI Source)** — "Medium" is UTM jargon. Rename to "Channel."
3. **The Cost Import modal is inside Campaigns** — two places for one concept (also on Integrations).
4. **"Advanced Report" link** — implies the current view is not advanced enough. Remove or rename.
5. **"Low Volume" status badge** — undefined threshold. Add tooltip.

### 5c. Leads / Journeys

1. **Bulk action bar** (sticky bottom, appears on checkbox select) — good pattern. Keep it.
2. **"View Journey" inside Recent Conversions on Dashboard** — clicking this navigates to `/leads`, not to the specific journey (`pages/Dashboard.jsx:419–421`). Broken promise. Must open the specific journey drawer/page.
3. **Status options** (Unqualified / MQL / SQL / Qualified) — "MQL" and "SQL" are enterprise CRM terminology. Replace with: "New," "Interested," "Sales ready," "Won."

### 5d. Integrations

1. **File is 2,865 lines.** Integrations should be a directory, not a control panel.
2. **"Stitch transaction, checkout, and email events back to user journeys"** — "stitch" is developer jargon. Replace with: "Connect your billing and email tools to see which campaigns created paying customers."
3. **Integration naming on homepage and in-app should use plain honest language.** Specific renames:
   - "Stripe Webhook (Developer Beta)" → **"Stripe revenue tracking"** (with honest note that it uses a webhook recipe, not a native OAuth app)
   - "Shopify Webhook (Custom script recipes)" → **"Manual Shopify webhook recipe"** (accurate: it is a manual recipe, not a Shopify app)
   - Google Search Console → **"Google Search Console visibility"**
   - Payments API → **"Manual Conversion API"** (for custom payment events not covered by Stripe/Shopify)
   - Do NOT claim native app status. Do NOT claim "production Stripe integration" unless the Stripe OAuth app is live and verified.
4. **Auto-expansion logic is good** — the page correctly opens the right section based on setup state. Keep this behavior.
5. **curl examples in the Payments API section** — move to Developers docs. Keep the UI clean with a "Copy webhook URL" button and a "View setup guide →" link.

### 5e. Settings

1. **13 major sections in a single scroll** — group into 4 tabs: Site, Privacy, Integrations/API, Danger.
2. **"Custom URL Parameters" section** — add a one-sentence explanation with an example.
3. **Attribution Window** — gate behind "Advanced" disclosure.
4. **Support & Feedback section** — link to docs and add a help option; do not just show an email address.

---

## 6. Website/SEO Gaps

### 6a. Homepage (Landing.jsx)

**5-second clarity test result: PASS on headline, FAIL on sub, FAIL on social proof, MIXED on CTA.**

- **H1: "Know which sources actually make you money."** — Strong. Keep this exactly.
- **Sub-headline (41 words):** Too long. Lists 7 things. Target ≤20 words. Proposed: "Connect every paid click, organic search, and AI referral to actual revenue — in minutes."
- **Primary CTA: "Find my best sources"** — Clever but not action-oriented. Proposed: "Start free — see your top sources" or "Get started free."
- **Secondary CTA: "See where to spend next" → /product** — Propose: "See how it works →"
- **Social proof: completely absent.** Do NOT add fake testimonials, unverified logos, or inflated customer counts. Truthful substitutes that work right now:
  - A product demo (authentic screen recording using real data, not placeholder numbers)
  - Verified setup count from actual signups, if any exist ("X domains tracking attribution")
  - Privacy safeguards highlighted ("Cookieless · No fingerprinting · DNT respected")
  - Founding customer program offer ("Join as a founding member — first 10 seats")
  - Links to transparent docs and QA audit evidence
  - A read-only ShareDashboard link showing SourceTrack's own attribution data — after privacy/redaction review only; do not publish without this step
- **Measurement Flow section (5 numbered cards)** — reads like internal documentation. Replace with a 3-step visual: "Install one script → Connect your billing tool → See which campaigns make money." Move the 5-step detail to /product.
- **Integration cards naming** — do not remove honesty qualifiers, but use plain language:
  - "Stripe Webhook (Developer Beta)" → "Stripe revenue tracking"
  - "Shopify Webhook (Custom script recipes)" → "Manual Shopify webhook recipe"
  - Do NOT present these as native OAuth apps. Do NOT remove the honest qualifier — rephrase it to be human-readable.
- **"How SourceTrack connects revenue to source" section** — uses technical vocabulary ("Capture First-Touch," "Preserve Signals," "Ingest Conversions"). Move to /product. Do not lead with this on the homepage.

### 6b. Pricing page (Pricing.jsx)

- **Visual bug: PricingCards renders `lg:grid-cols-4` with 3 plans** — fix to `lg:grid-cols-3`.
- **Early Bird card pricing copy** — current: "First Month Free / Then $99/year." Safer copy: **"First month free, then $99 for your first year. Founding price availability is limited."** Do not say "Only 10 seats available" four times. Once is urgency. Four times is noise. And "limited" is factually true and less gameable than a hard seat count.
- **FAQ attribution model answer** — lists technical model names. Replace with: "All plans show which source sent each customer. Paid plans let you compare across 9 attribution methods — so you can see the full picture, not just the last click."
- **No "what counts as a tracked visit" explanation** — Starter plan says "25,000 tracked visits/mo" but no FAQ entry explains this vs. pageviews. Required before paid beta.

### 6c. Technical SEO

**What's working:**
- sitemap.xml: exists, 34 URLs, correct priorities
- robots.txt: exists, correctly blocks app routes
- JSON-LD schema: Organization, WebSite, SoftwareApplication on homepage
- react-helmet-async: used on all pages with title, description, canonical, OG tags
- URL structure: clean, no query string duplication

**What's missing:**
- **No product-led SEO landing page architecture — this is the largest SEO gap.** There is no structured content hub, no comparison pages for high-intent alternatives searches, no tool pages for UTM builders or attribution guides. Zero of the 14 high-intent landing pages listed in Section 17 exist. This is not a blog problem — it's a product-led SEO problem. The tool cannot rank for "Attributer alternative," "Cometly alternative," "UTM tracking guide," or "Stripe revenue attribution" without pages that exist.
- **FAQ schema markup** — The Pricing page FAQSection has no `FAQPage` JSON-LD. Adding it could trigger rich results.
- **HowTo schema** — Docs install pages describe step-by-step processes. HowTo schema is appropriate for `/docs/install`, `/docs/platforms/*`.
- **BreadcrumbList schema** — No breadcrumb schema on docs or developer pages.
- **SoftwareApplication schema on non-homepage pages** — Only the homepage has it. `/product`, `/attribution`, `/ai-referral-tracking` should also carry SoftwareApplication schema with Offer.
- **Open Graph image** — Verify `/og-image.png` exists in `/public` and is 1200×630px.
- **Core Web Vitals unknown** — React + Vite SPA with heavy initial bundle. No SSR. Run Lighthouse before paid beta.

---

## 7. App Dashboard Gaps (Summary)

| Screen | Key gap | Severity |
|--------|---------|----------|
| Dashboard Overview | No "what changed?" delta on sources table | Medium |
| Dashboard Overview | Command Center nav is passive, not prescriptive | Medium |
| Dashboard Attribution | 9-model dropdown with no inline explanation | High |
| Dashboard Attribution | "AI journey influence" model label is opaque | High |
| Analytics | 6 KPI tiles + 8 breakdowns on one screen — too much at once | High |
| Campaigns | "Campaigns & Attribution" with "Last Touch model badge" creates confusion | Medium |
| Campaigns | "Medium" tab should be labeled "Channel" | Low |
| Leads | "View Journey" on Dashboard goes to Leads list, not specific journey | High |
| Leads | MQL/SQL labels are enterprise jargon | Medium |
| Integrations | 2865-line file signals scope creep per screen | High |
| Integrations | "Stitch... events" is developer language | Medium |
| Integrations | curl examples should be in Developers docs, not main UI | Medium |
| Settings | 13 sections in one scroll | High |
| Settings | Attribution Window should be Advanced/hidden | Low |

---

## 8. Onboarding/Install Gaps

### What works well
- 6-step wizard with clear progress stepper
- Resume-from-URL support (`?site_id=`, `?site_key=`)
- Auto-seeded reports by business type after completion
- "Verify Later (Skip for now)" escape hatch

### What needs fixing

1. **Step 3 is mislabeled.** The step title says "Install Tracking Script" but the content is METHOD selection (pixel vs GTM). This should be titled "Choose your install method." (`pages/Onboarding.jsx:16` — STEP_TITLES)

2. **Step 4 shows numbered list instructions with no visual.** A single GIF or screenshot of where to paste the snippet would convert more users than any copy change.

3. **No time estimate on the wizard.** Adding "Takes about 5 minutes" at Step 1 sets expectations and reduces abandonment.

4. **No "Install on behalf" escape path.** A "Send to my developer" mailto link with the snippet pre-formatted would prevent stalls.

5. **SetupDoctorCard polling is opaque.** Add "Still checking... visit your site in another tab to trigger verification" instruction during polling.

6. **"Connect Domain" label (Step 1)** — "Connect" implies an OAuth flow. "Enter your domain" is clearer.

7. **Business type step description** — "Select your website business type" is redundant. Replace with: "What does your website sell or do?"

---

## 9. Pricing/Billing Gaps

### PricingCards (on website)
1. **Visual bug: `lg:grid-cols-4` grid with 3 plans** (`components/PricingCards.jsx:26`) — fix to `lg:grid-cols-3`.
2. **"Get Starter" → /signup** — No Stripe checkout direct from pricing page. Acceptable for early beta.
3. **Feature bullets are feature names, not benefits** — "CSV export + saved reports" → "Export any table to CSV and save custom reports for later."
4. **No annual/monthly toggle** — At minimum add "Annual saves 30%" note.

### Early Bird card (Pricing.jsx:33–34)
Current copy: "First Month Free / Then $99/year." — Can be misread as "first month free then $8.25/month recurring."

**Required change:** "First month free, then $99 for your first year. Founding price availability is limited."

Do not say the seat count more than once. "Limited" is accurate and safer than a specific seat number that may need to be updated.

### In-app Billing page
1. **Trial countdown as red when ≤3 days** — Good urgency signal. Keep.
2. **Usage bar** — Good. Keep.
3. **Plan comparison cards** — Could be richer in-app with actual usage context shown.

---

## 10. Attribution/Journey Simplification Gaps

### Attribution model complexity
- **9 models is too many options on a single dropdown.** Default view shows Last Touch. "Compare attribution models" button expands to the full table. Label the 3 non-obvious ones with one-line tooltips.
- **"AI journey influence"** — rename to "AI-assisted conversions" or "AI source credit."

### Journey reconstruction
- **"View Journey" on Dashboard Recent Conversions links to /leads list** — broken promise. Fix: navigate to the specific journey modal or drawer, not the list (`pages/Dashboard.jsx:419–421`).
- **Journey Modal** — consider progressive disclosure: show the first and last touchpoint prominently, with "Show full path" to expand.

### Source naming
- **"Direct" traffic label** needs the DirectInfo tooltip — verify it renders on mobile.
- **Source chips** show recognizable brand icons for known sources — verify all 22 AI referrer domains have human-readable labels.

---

## 11. Must-Fix Before Paid Beta

These are true blockers — correctness or trust failures that no paying customer should encounter.

| # | Fix | Location | Why |
|---|-----|----------|-----|
| 1 | Fix PricingCards grid (`lg:grid-cols-4` → `lg:grid-cols-3`) | `components/PricingCards.jsx:26` | Visual bug visible to every prospect on the pricing page |
| 2 | Fix "View Journey" to link to specific journey, not leads list | `pages/Dashboard.jsx:419–421` | Broken promise — clicking "View Journey" goes to list |
| 3 | Fix Dashboard tab navigation to true in-page tabs | `pages/Dashboard.jsx:116` | URL-based tabs break the browser back button |
| 4 | Rename Onboarding Step 3 title from "Install Tracking Script" to "Choose install method" | `pages/Onboarding.jsx:16` | Mislabeled step confuses users at the hardest onboarding point |
| 5 | Add "Takes about 5 minutes" to top of Onboarding Step 1 | `pages/Onboarding.jsx` | Sets expectations; reduces wizard abandonment |
| 6 | Simplify attribution model dropdown to 3 named modes + "Compare all models" expansion | `pages/Dashboard.jsx:35–47` | 9-option unexplained dropdown is intimidating for non-analysts |
| 7 | Add "what counts as a tracked visit" FAQ to Pricing page | `pages/Pricing.jsx` | Prospects will leave when they can't interpret plan limits |
| 8 | Remove/simplify Measurement Flow 5-step section from homepage | `pages/Landing.jsx:139–167` | Documentation content in marketing position kills conversion |
| 9 | Add product-proof or truthful social proof substitute to homepage | `pages/Landing.jsx` | Zero trust signals on homepage; real testimonials OR product demo, QA evidence, founding program |
| 10 | Rename integration cards to honest plain language on homepage | `pages/Landing.jsx` | Current "(Developer Beta)" labels undermine confidence; plain honest language is better |

---

## 12. Pre-Launch Polish

These are real improvements but not blockers. They should land before public launch, not before paid beta.

| # | Fix | Location |
|---|-----|----------|
| 1 | Shorten homepage sub-headline from 41 words to ≤20 words | `pages/Landing.jsx:56` |
| 2 | Replace "Recent visitors (5m): X" with "Active now: X" | `pages/Dashboard.jsx:289` |
| 3 | Rename "Medium" tab in Campaigns to "Channel" | `pages/Campaigns.jsx` |
| 4 | Fix Early Bird pricing copy to safer language | `pages/Pricing.jsx:33–34` |
| 5 | Replace primary CTA "Find my best sources" with action-oriented variant | `pages/Landing.jsx` |
| 6 | Ship weekly digest email as core product surface (see Section 18) | — |

---

## 13. Should-Fix After Paid Beta

| # | Fix | Priority |
|---|-----|----------|
| 1 | Group Settings into 4 logical tabs instead of 13-section scroll | High |
| 2 | Move curl examples from Integrations UI to Developers docs page | High |
| 3 | Add "Send to my developer" mailto link in Onboarding Step 4 | High |
| 4 | Replace MQL/SQL labels in Leads with plain-language alternatives | Medium |
| 5 | Add FAQ schema JSON-LD to Pricing page FAQSection component | Medium |
| 6 | Add HowTo schema to docs install and platform pages | Medium |
| 7 | Rename Integrations subtitle from "Stitch... events" to plain language | Medium |
| 8 | Move Attribution Window setting behind "Advanced" disclosure | Low |
| 9 | Add platform screenshot or GIF to Onboarding Step 4 install instructions | High |
| 10 | Add annual/monthly toggle or "Annual saves X%" note to Pricing page | Medium |
| 11 | Surface "Next step:" callout on Dashboard (the Integrations page already has it — port it) | High |
| 12 | Add "ignore my visits" one-click button to Settings (instead of requiring path exclusions) | Medium |
| 13 | Add SoftwareApplication JSON-LD schema to /product, /attribution, /ai-referral-tracking | Low |
| 14 | Verify og-image.png exists in /public and is 1200×630px | Medium |
| 15 | Add BreadcrumbList schema to docs and developer pages | Low |
| 16 | Rename "AI journey influence" model to "AI-assisted conversions" | Medium |
| 17 | Progressive disclosure on Journey Modal (show first+last touchpoint by default, expand for full path) | Medium |
| 18 | Publish read-only ShareDashboard link for SourceTrack's own attribution data (after privacy/redaction review) | High |

---

## 14. Do-Not-Build-Yet List

| Feature | Reason |
|---------|--------|
| Real-time visitor map | Cosmetic. Infra cost. Conflicts with "simpler than Piqo." |
| Full affiliate dashboard | Separate product surface requiring commission billing design. |
| Brand mention monitoring | Social listening is a different product category entirely. |
| Native CRM sync (Salesforce, HubSpot) | Requires bidirectional webhooks, field mapping, dedicated support. |
| Google Ads CAPI / Meta Conversions API push | Different from pulling cost data IN. Requires privacy review. |
| Funnel visualization suite | Multi-touch models already tell attribution stories adequately for V1. |
| Predictive analytics / ML forecasts | No customer demand signal. Not a trust-building feature for V1. |
| AI chatbot expansion inside dashboard | AIChat exists as dead UI. Do not expand before MCP establishes a clean read layer. |
| Embeddable public widgets | Build after ShareDashboard is fully hardened. |
| Real-time Slack bot with two-way queries | Notifications (one-way) first. Two-way requires MCP architecture. |

---

## 15. Piqo/DataFast Simplicity Benchmark Backlog

### Website changes

| Item | Description | Effort |
|------|-------------|--------|
| W1 | Fix PricingCards grid bug (`lg:grid-cols-4` → `lg:grid-cols-3`) | XS |
| W2 | Shorten homepage sub-headline to ≤20 words | XS |
| W3 | Replace "Find my best sources" CTA with action-oriented variant | XS |
| W4 | Add product-proof or truthful social proof substitute to homepage | M |
| W5 | Remove Measurement Flow 5-step section from homepage (move to /product) | S |
| W6 | Rename integration cards to plain honest language | S |
| W7 | Add "what counts as a tracked visit" to Pricing FAQ | XS |
| W8 | Fix early bird copy: one urgency mention, safer seat language | XS |
| W9 | Add FAQ schema JSON-LD to Pricing page | S |
| W10 | Add annual/monthly pricing toggle or note | M |

### App dashboard changes

| Item | Description | Effort |
|------|-------------|--------|
| A1 | Replace "(5m)" with "Active now" on visitor count pill | XS |
| A2 | Fix "View Journey" link to open specific journey, not leads list | S |
| A3 | Simplify attribution model dropdown to 3 modes + "Compare all" expansion | M |
| A4 | Rename "AI journey influence" to "AI-assisted conversions" | XS |
| A5 | Add delta indicators (vs. last period) to Top Sources table | M |
| A6 | Add "What to do next" prescriptive card to Dashboard after data loads | M |
| A7 | Remove "Advanced Report" link from Campaigns header | XS |
| A8 | Rename "Medium" tab in Campaigns to "Channel" | XS |
| A9 | Add status badge definitions tooltip (what triggers "Low Volume"?) | S |
| A10 | Convert Dashboard tab navigation to true in-page tab UI | M |
| A11 | Group Settings into 4 tabs instead of 13-section scroll | L |
| A12 | Move curl examples from Integrations UI to Developers docs | M |
| A13 | Add "Next step:" prescriptive callout to Dashboard after tracking verified | S |
| A14 | Replace MQL/SQL labels in Leads with plain-language alternatives | S |

### Onboarding/install changes

| Item | Description | Effort |
|------|-------------|--------|
| O1 | Fix Step 3 title from "Install Tracking Script" to "Choose install method" | XS |
| O2 | Add "Takes about 5 minutes" to Step 1 | XS |
| O3 | Add "Send to my developer" mailto link to Step 4 | S |
| O4 | Add screenshot or GIF to Step 4 (where to paste in HTML head) | M |
| O5 | Rename "Connect Domain" to "Enter your domain" | XS |
| O6 | Replace "Select your website business type" with "What does your website sell or do?" | XS |
| O7 | Add "Still checking... visit your site in another tab" during SetupDoctor polling | S |
| O8 | Add "ignore my visits" one-click button to IP exclusion in Settings | M |

### Pricing changes

| Item | Description | Effort |
|------|-------------|--------|
| P1 | Fix PricingCards `lg:grid-cols-4` to `lg:grid-cols-3` | XS |
| P2 | Rewrite plan feature bullets as benefits, not feature names | S |
| P3 | Fix early bird copy: "First month free, then $99 for your first year. Founding price availability is limited." | XS |
| P4 | Add annual/monthly toggle with "Save X%" label | M |
| P5 | Add "what counts as a tracked visit" FAQ | XS |

### Attribution/Journey simplification

| Item | Description | Effort |
|------|-------------|--------|
| J1 | Default attribution view to Last Touch; add "Compare models" expansion | M |
| J2 | Rename "AI journey influence" to "AI-assisted conversions" | XS |
| J3 | Progressive disclosure on Journey Modal (first+last touchpoint visible, expand for full path) | M |
| J4 | Fix "View Journey" in Recent Conversions to link to specific journey | S |
| J5 | Add plain-language tooltip to each attribution model name in dropdown | S |

### Docs/copy changes

| Item | Description | Effort |
|------|-------------|--------|
| D1 | Add "why" context to empty states (not just what to do, but why it matters) | S |
| D2 | Move technical Integrations language (curl, webhook recipes, signing secrets) behind "Advanced" disclosure | M |
| D3 | Add HowTo schema to /docs/install and /docs/platforms/* | S |
| D4 | Add BreadcrumbList schema to docs and developer pages | S |
| D5 | Add SoftwareApplication JSON-LD to /product, /attribution, /ai-referral-tracking | S |
| D6 | Verify og-image.png exists and is 1200×630px | XS |

---

## 16. Top-1% SaaS SEO Requirements

### Information Architecture & Internal Linking

The current site has 52 page-level components but no structured content hub. The IA is flat: marketing pages link to each other, docs link within docs, but there is no linking strategy connecting:
- Use case pages → specific feature pages → pricing
- Attribution model pages → how-it-works → signup
- Comparison pages → feature pages → pricing

**Required IA improvements:**
1. Every marketing page must link to at least one conversion destination (pricing or signup) above the fold and once more at the bottom.
2. Use case pages must link to relevant integration docs (SaaS → Stripe integration, ecommerce → Shopify recipe).
3. The docs hub must interlink: "Installed the script? Next: track a conversion event →"
4. Comparison pages must link to pricing with a specific CTA.

### Metadata

**What's working:**
- Title tags on all pages (react-helmet-async)
- Meta descriptions on all pages
- Canonical tags on all pages
- OG title/description on all pages

**What's missing or needs improvement:**
- Title format is inconsistent: standardize to one format across all pages.
- Meta descriptions on solution pages should include the primary keyword and a conversion hook.
- The `/compare/ga4` page title should include the target keyword.

### Schema Markup

| Page | Current schema | Required schema |
|------|---------------|-----------------|
| Homepage | Organization, WebSite, SoftwareApplication | (No aggregateRating — no real reviews exist) |
| Pricing | None | FAQPage |
| /docs/install | None | HowTo |
| /docs/platforms/* | None | HowTo, BreadcrumbList |
| /developers/* | None | TechArticle, BreadcrumbList |
| /compare/ga4 | None | FAQPage, BreadcrumbList |
| /use-cases/* | None | BreadcrumbList |
| /attribution | None | SoftwareApplication |

**Note:** Do not add `aggregateRating` schema to any page. No real reviews exist. Fake or estimated review counts in schema markup are a Google spam policy violation and will result in manual actions.

### Crawlability & Sitemap

**What's working:** sitemap.xml exists with 34 URLs, robots.txt correctly blocks app routes.

**Issues:**
- The sitemap lastmod dates should be dynamic (updated on each deploy), not static strings.
- `/attribution` is listed in robots.txt as disallowed (it's an app route) BUT there is also a public marketing page `/attribution` — verify the marketing page is not being blocked.
- `/integrations` (public marketing page) vs `/app/integrations` (app route) — verify the robots.txt does not block the marketing page.

### Canonical Strategy

All pages appear to have canonical tags set. Verify:
- The Early Bird pricing card at `/pricing` doesn't create a duplicate with any `/signup?plan=early_bird_annual` URL that might be indexed.
- The `/share/*` public dashboard routes are blocked in robots.txt (they should be).

### Core Web Vitals / Performance

The app is a React SPA with no SSR. Key risks:
- **LCP:** Hero images/text may load slowly if the JS bundle is large. Run Lighthouse on the homepage.
- **CLS:** Charts and conditional content loading could cause layout shift. Test with real data.
- **INP:** Heavy pages (Campaigns at 1440 lines, Integrations at 2865 lines) may have slow interaction response. Profile in DevTools.

### Accessibility Basics

From code inspection, lucide-react icons are used throughout without visible `aria-label` attributes on icon-only buttons. Minimum requirements before paid beta:
- All icon-only interactive elements must have `aria-label`
- All form inputs in Onboarding must have associated `<label>` elements
- Color contrast on gray text (`text-st-gray`) against white backgrounds — verify 4.5:1 ratio

---

## 17. High-Intent SEO Pages Worth Building

These are conversion-focused pages that exist because specific people search for specific things before buying an attribution tool. None should be written unless SourceTrack can genuinely serve the user behind the search query.

| # | Page | Target keyword cluster | Reason |
|---|------|----------------------|--------|
| 1 | `/compare/datafast` | "DataFast alternative," "DataFast pricing" | Direct competitor. Founders who find DataFast will search for comparisons. SourceTrack's AI attribution is a genuine differentiator vs DataFast. |
| 2 | `/compare/cometly` | "Cometly alternative," "Cometly pricing" | Cometly is $99–$499/mo. Budget-constrained founders search for alternatives. |
| 3 | `/compare/attributer` | "Attributer alternative," "attributer.io" | Nearest competitor in price and simplicity. First product many founders find. |
| 4 | `/compare/usermaven` | "Usermaven alternative," "Usermaven pricing" | Usermaven targets the same SaaS/founder audience. Comparison page captures evaluation traffic. |
| 5 | `/utm-tracking-guide` | "UTM tracking," "UTM parameters guide," "how to set up UTM parameters" | UTM builder exists in Settings. A standalone guide captures top-of-funnel traffic from marketers who need to set up UTMs before choosing an attribution tool. |
| 6 | `/utm-builder` | "UTM builder," "UTM link builder free" | A standalone UTM builder tool page (not just the Settings widget) captures high-intent searches from marketers who don't know SourceTrack yet. |
| 7 | `/webflow-form-attribution` | "Webflow form tracking attribution," "Webflow lead attribution" | Webflow is the primary platform for marketing sites in the SaaS/founder audience. Form attribution is the #1 question Webflow users have about analytics. |
| 8 | `/wordpress-form-attribution` | "WordPress form attribution," "Contact Form 7 attribution" | WordPress still drives massive search volume for form tracking questions. |
| 9 | `/stripe-revenue-attribution` | "Stripe revenue attribution," "track Stripe payments by source" | Shopify merchants and SaaS founders with Stripe want to know which campaign drove each payment. Directly relevant to SourceTrack's Stripe webhook recipe. |
| 10 | `/shopify-manual-webhook-setup` | "Shopify order attribution tracking," "Shopify UTM attribution" | Shopify merchants who can't use a native app (custom storefronts, Shopify Plus) search for manual webhook setups. SourceTrack's manual recipe is a real answer. |
| 11 | `/ai-referral-tracking` | "track traffic from ChatGPT," "AI referral tracking," "chatgpt traffic analytics" | SourceTrack's differentiator. This page is the only one in the market that can honestly answer this query and offer a working tool. The existing `/ai-referral-tracking` page likely needs expansion. |
| 12 | `/seo-page-attribution` | "SEO attribution," "organic search attribution," "track organic conversions" | Every business running SEO wants to know if it's working. The GSC integration directly addresses this. |
| 13 | `/booking-attribution` | "booking form attribution," "Calendly attribution," "track bookings by source" | B2B service businesses and SaaS with demo-driven funnels need to attribute bookings. |
| 14 | `/campaign-attribution` | "campaign attribution," "UTM campaign tracking," "how to track campaign performance" | Broad-intent keyword cluster for any business running paid or organic campaigns. |
| 15 | `/compare/google-analytics-4` | "GA4 alternative for attribution," "GA4 revenue attribution" | The `/compare/ga4` page likely exists — expand it to rank for the full keyword set. GA4's complexity is the #1 reason this market exists. |
| 16 | `/multi-touch-attribution-models` | "multi touch attribution models," "first touch vs last touch," "w-shaped attribution" | Educates prospects on the 9 models SourceTrack supports. Positions SourceTrack as the authority on attribution methodology. |
| 17 | `/cookieless-analytics` | "cookieless analytics," "cookieless tracking" | SourceTrack's privacy positioning is a real differentiator. Captures GDPR-sensitive European audiences and privacy-conscious US teams. |

**Hard rule for all pages:** Every page must include what SourceTrack claims to do, how to verify that claim in the product, and a real CTA. No keyword-stuffed placeholder pages.

---

## 18. Weekly Digest as Core Product Surface

The weekly digest is not an optional notification setting. It is the minimum viable re-engagement loop for a SaaS analytics tool where most users are not daily-active.

**What Piqo and DataFast both do:** Email arrives weekly with: what changed (metric row with deltas), what to look at (one key insight), and one-click return to the relevant dashboard screen.

**Why this matters for SourceTrack specifically:**
- Founders and CMOs who install SourceTrack are not checking the dashboard every day.
- A weekly email with "Your top source changed: Google overtook ChatGPT this week" is higher-value than a passive dashboard that requires login to discover the same insight.
- The digest is the hook that makes the product sticky without requiring habit formation.

**Requirements for the weekly digest:**
1. Show the 3 KPIs with the largest delta vs. the prior week (visitors, revenue, top source change).
2. Include the top source that drove the most conversions this week — linked directly to that source's attribution breakdown.
3. One-click back to the specific dashboard screen for each metric.
4. Plain-language subject line: "SourceTrack weekly: [top source] drove [X] leads this week."
5. Sent Monday morning, 9am in the user's timezone (or UTC if unknown).

---

## 19. Homepage Demo Guidance

Piqo and DataFast both use the "product is the proof" pattern: the homepage demo shows the actual product with real or realistic data, not placeholder numbers or animated wireframes.

**Current state:** The HeroPreviewCard component exists. Whether it uses real or placeholder data is not confirmed from code inspection alone — verify in the live app.

**Required approach:**
- The demo card should show realistic data: a visitor count that looks like a real indie SaaS ($10k MRR scale), a top source that users recognize (Google, ChatGPT, direct), and a revenue number that's not round ($2,847 is more credible than $3,000).
- If the demo is animated or fake, replace it with a real screenshot or screen recording of SourceTrack tracking actual sourcetrack.ai traffic.
- The demo should show what the weekly digest shows: "here's what changed, here's where it came from."
- Do not show an empty or loading state in the demo. An empty dashboard tells prospects the product is for someone else.

---

## 20. Exclude My Visits — Parity Requirement

Both Piqo and DataFast offer internal traffic filtering. Piqo's Settings page shows an "Excluded paths" glob input. DataFast offers IP-based exclusion. This is Piqo's most-voted customer feature request.

**Current state:** SourceTrack's Settings page has an excluded paths glob input (matching Piqo). IP-based "ignore my visits" one-click is not confirmed from code inspection.

**Required:**
- Add a one-click "Ignore my visits" button that adds the user's current IP to an exclusion list. The current excluded paths glob is correct for path-level exclusions but insufficient for "don't count my own visits."
- Label it plainly: "Ignore my visits" with a sub-label: "Traffic from your current IP won't appear in your dashboard."
- This must be in the main Settings view, not hidden behind an advanced section.

---

## 21. Consistent Date Picker

Both Piqo and DataFast use a single persistent date picker at the top of every data screen. SourceTrack must match this or exceed it.

**Confirmed in DataFast video frames:** Identical date picker UI appears on every screen — site selector + date picker, always at the top, always with the same preset list: Today, Last 24 hours, Last 7 days, Last 30 days, Last 12 months, Week/Month/Year to date, All time, Custom.

**Requirement:** Verify that a consistent date picker with the same preset list appears on all of these screens:
- Dashboard Overview
- Dashboard Attribution
- Analytics
- Campaigns
- Report Builder
- Billing usage chart

If any screen uses a different date range control or no date range at all, that is a parity bug. Date ranges that exist on one screen must carry over as context when navigating to another screen (or at minimum remember the user's last-used range per session).

---

## 22. Consistent Journey Drawer/Modal Pattern

Piqo uses a right-side drawer that opens over the current table. DataFast uses a full-page detail view (URL changes). Both are correct — the important requirement is that SourceTrack picks one pattern and uses it consistently across all screens where journey detail is accessible.

**Current state:** The "View Journey" on Dashboard Recent Conversions navigates to `/leads` (the list). This is neither a drawer nor a full journey page — it's a navigation away from context.

**Requirement:** Define and implement one journey detail pattern:
- **Option A (recommended):** Right-side drawer, identical to Piqo's pattern. Table stays visible. Drawer opens on click. Header shows: visitor ID, session count, total pageviews, time on site. Timeline shows events grouped by session with metadata (source, device, country, UTM) and individual events with timestamps.
- **Option B:** Full-page detail, identical to DataFast's pattern. URL changes to `/journey/[lead_id]`. Left panel: visitor profile card. Right panel: chronological event timeline with event-type icons.

Apply the chosen pattern consistently across:
- Dashboard Recent Conversions "View Journey"
- Leads table row click
- Campaigns dimension table row click (if applicable)

---

## 23. Docs IA as Setup Paths

The current docs structure is unknown from code inspection (docs pages may be separate from the app). What is known is that the onboarding wizard terminates after verification without a clear handoff to "what to do next."

**Required docs IA — minimum 10 setup paths:**

| Path | Title | What it covers |
|------|-------|---------------|
| 1 | Install | Paste the script tag, GTM setup, and verification |
| 2 | Verify | How to confirm tracking is working (SetupDoctor + first event) |
| 3 | Exclude visits | IP exclusion + path exclusion |
| 4 | Track conversions | Custom conversion events (form submissions, button clicks) |
| 5 | Connect Stripe | Webhook recipe for revenue attribution |
| 6 | Manual Shopify webhook | Step-by-step for custom Shopify storefronts |
| 7 | Forms & bookings | Calendly, Typeform, contact form attribution |
| 8 | Google Search Console | OAuth connect + keyword data |
| 9 | API / manual conversions | Server-side events for payments not covered by Stripe/Shopify |
| 10 | Proxy / custom domain | Custom tracking domain to reduce ad-blocker impact |

Each doc path must end with: "Done? Next: [link to next logical setup path]." No dead-ends in documentation.

---

## 24. Mobile/Responsive Simplicity Audit

SourceTrack is a React SPA. Mobile behavior requires testing in a real browser — not just desktop viewport narrowing. These screens have specific mobile risks that require a dedicated QA pass:

| Screen | Mobile risk | Test requirement |
|--------|------------|-----------------|
| Homepage | 41-word sub-headline on mobile is fatal | Test iPhone 12 viewport; sub must render in ≤4 lines |
| Pricing | PricingCards grid on mobile | Verify `grid-cols-1` applies on phones; no horizontal scroll |
| Onboarding | Code snippet in Step 4 | Verify snippet is scrollable/copyable on touch |
| Dashboard | KPI strip with 3 tiles | Verify tiles stack or scroll horizontally without clipping |
| Integrations | curl examples, collapsible rows | Verify accordions work on touch; code blocks scroll horizontally |
| Journey drawer | Right-side drawer on mobile | A right-side drawer on mobile should be full-screen with a back button |

The homepage sub-headline length is not just a conversion problem — on mobile, 41 words at 16px is ~7 lines of text above the fold. Most users will not read it.

---

## 25. Performance / Core Web Vitals as a Simplicity Requirement

Performance is not separate from simplicity — a slow dashboard makes the product feel complex even when the UI is clean.

**Required before paid beta:**
1. Run Lighthouse on the homepage. LCP must be ≤2.5s on a simulated 4G connection.
2. Run Lighthouse on the Dashboard. INP must be ≤200ms for the primary interaction (opening the attribution tab).
3. Run Lighthouse on Integrations.jsx (2,865 lines). Verify the page does not hang on initial render.
4. CLS score on the homepage must be ≤0.1. The HeroPreviewCard loading state can cause layout shift — verify it uses a fixed height skeleton.

**SourceTrack-specific risks:**
- The Integrations page is the largest file in the app. If it renders all 2,865 lines synchronously, it will be perceptibly slow on mobile.
- Charts (Performance Trend, attribution timeline) that load data asynchronously can cause CLS if the chart container doesn't reserve height before data arrives.
- No SSR: the first contentful paint depends entirely on JS bundle download + execution. Bundle splitting is required for acceptable mobile LCP.

---

## 26. Empty-State Quality Requirements

Every empty state in SourceTrack must do two things: (1) explain what's missing and why it matters, and (2) provide exactly one next step.

**Current failures observed in code:**

| Screen | Current empty state | Required improvement |
|--------|--------------------|--------------------|
| Dashboard Pinned Reports | "No pinned reports yet. Pin reports from the Report Builder." | "Your most important report, always visible. Go to Report Builder → pin any report → it appears here." |
| Dashboard AI Source | "No AI referrals detected yet." | "Once visitors arrive from ChatGPT, Claude, or Gemini, their attribution appears here. Already have AI traffic? Verify your tracking is installed." |
| Campaigns table | Implied empty | "No campaign data yet. Add UTM parameters to your links to start tracking campaigns → [UTM Builder link]." |
| Leads | Implied empty | "Leads appear here after your first conversion event. Set up a conversion in [Conversions settings link]." |

**Rule:** No empty state should make the user wonder what they did wrong. Every empty state should make them feel one step away from value.

---

## 27. Pricing Trust Requirements

Pricing pages fail trust in two ways: by being confusing about what you get, and by using scarcity tactics that feel fake. Both kill conversion.

**Required pricing page trust signals:**

1. **Define "tracked visit" before the plan limit.** Current plans say "25,000 tracked visits/mo" — but nowhere on the page is "tracked visit" defined. Is it a pageview? A unique visitor? A session? A prospect who doesn't know will assume the worst.

2. **Early Bird annual terms must be explicit.** Required copy: "First month free, then $99 for your first year. After year one, standard pricing applies ($29/month for Starter). Cancel before your annual renewal to pay nothing." Do not require users to find this in fine print.

3. **Cancellation policy must be scannable.** "Cancel anytime" as a proof pill is not enough. One sentence in the FAQ: "You can cancel your plan at any time from Settings → Billing. No cancellation fee."

4. **Plan limits must be human-readable.** "500,000+ tracked visits/mo" (Scale plan) — what happens when you go over? Soft overage? Hard cutoff? Email warning? Required: one sentence per plan explaining overage behavior.

5. **No fake scarcity.** "Only 10 public early-bird seats available" appeared 4 times in the original pricing page. If this is a real hard limit, one mention is correct. If it's perpetually "10 seats available," it is fake scarcity — prospects will figure this out and the trust cost is permanent.

---

## 28. DataFast Overclaims — Do Not Copy

DataFast's marketing includes claims that SourceTrack must not replicate:

| DataFast claim | Why not to copy |
|----------------|----------------|
| "Nearly 100% accuracy" | Cookieless attribution via IP+UA hash has structural accuracy limits: shared IPs, VPNs, corporate networks, and mobile carrier NAT all reduce accuracy. "High accuracy for most sites" is defensible. "Nearly 100%" is not. |
| Guaranteed ad-block bypass | Cookieless tracking reduces but does not eliminate ad-block impact. No script-based tracker can guarantee bypass. |
| "Real-time" attribution | If SourceTrack's attribution runs nightly (confirmed from codebase: nightly-attribution.js), do not claim real-time attribution. Real-time pageview counts are fine; real-time attribution is not accurate until the job runs. |

SourceTrack's honest positioning — "cookieless, no fingerprinting, DNT respected, daily-rotating hash" — is defensible and differentiated. Do not dilute it with overclaims borrowed from competitors who are less rigorous.

---

## 29. Social Proof — Real or Truthful Substitutes

SourceTrack cannot and should not fabricate social proof. The options before real customers exist:

**If no paying customers yet (most likely at early beta):**

| Substitute | How to implement | Trust level |
|------------|-----------------|-------------|
| Product demo with real data | Screen recording of SourceTrack's own dashboard tracking sourcetrack.ai traffic — real pageviews, real sources, real attribution | High — verifiable |
| Verified setup count | "X domains tracking attribution with SourceTrack" — use actual count from database, even if small | High — specific and specific is credible |
| Privacy safeguards badge row | "Cookieless · No fingerprinting · DNT respected · No third-party data sharing" | High — verifiable claims |
| Founding customer program | "Join 10 founding members — locked pricing, direct roadmap input" — honest, creates urgency without fake testimonials | Medium — honest urgency |
| Transparent docs + QA audit link | Link to the public onboarding docs and a summary of what was QA'd — "tested across [N] browsers" | Medium — unconventional but honest |
| ShareDashboard read-only link | Publish SourceTrack's own attribution data as a live public dashboard — after privacy/redaction review only | High — real and verifiable, but requires review before publishing |

**What never to do:**
- Add `rating: 4.9/5` badges with no underlying reviews
- Use stock photography as "customer testimonials"
- Display logos of companies who haven't signed up
- Add `aggregateRating` JSON-LD schema without real verified reviews (Google spam policy violation)

---

## 30. Postiz Benchmark — Trust & Conversion Patterns

*Source: Postiz pricing page screenshot provided 2026-06-18. Used conceptually only — no visual borrowing.*

**Brutal honest comparison:** Postiz converts because it shows proof and takes action fast. SourceTrack has a stronger attribution-specific promise — multi-touch models, cookieless identity, AI referral detection — but weaker trust proof. A visitor who lands on SourceTrack today cannot verify the product works. A visitor who lands on Postiz can see it working in seconds. That gap is the conversion gap.

### What Postiz does right (borrow conceptually)

| Pattern | What Postiz does | SourceTrack adaptation |
|---------|-----------------|----------------------|
| **"See it in action" placement** | Product demo appears immediately after the hero — not gated, not below the fold, not a "Book a demo" form. Prospects understand the product before they sign up. | The HeroPreviewCard exists but may show placeholder data. Use real sourcetrack.ai data only after a privacy/redaction review. If that review is not complete, use static, clearly demo-only fixture data that illustrates real product behavior (realistic non-round numbers, real-looking source names). Never present fixture data as real proof. |
| **Wall-of-love social proof** | Real customer quotes with names, company context, and specific outcomes — "I finally know which campaigns are working," not "Great tool!" Quotes appear near the CTA, not buried in a testimonials page. | Until real customers exist: use founding member program copy ("First 10 founding members — direct roadmap input"), QA verification evidence, and approved anonymized real screenshots or static demo fixture screenshots. Do not present fake numbers as proof. When first real customers sign up, collect specific outcome quotes ("I saw ChatGPT sending 30% of my signups"), not general satisfaction. |
| **Low-friction single CTA** | "Start for $0" on every plan card — no ambiguity about what happens when you click, no competing CTAs on the same screen. | Replace "Find my best sources" (vague) and the competing "See where to spend next" CTA. One primary: "Start free." One secondary: "See how it works →". Pricing page: one CTA per plan, consistent label per action type. |
| **Comparison-page SEO hub** | Structured comparison pages — each answers "why Postiz instead of [tool]?" with specific feature comparisons and honest limitations. | Build first-wave comparison pages: `/compare/datafast`, `/compare/attributer`, `/compare/cometly`, `/compare/usermaven`, `/compare/google-analytics-4`. Future comparison pages only if they can be high-quality and commercially useful — no thin-content comparison spam. Each page: what SourceTrack does that the competitor doesn't, what the competitor does that SourceTrack doesn't (honesty builds trust), a real CTA. |
| **High-intent problem/alternative pages** | Pages targeting "best [X] alternative" and "[problem] tool" — specific search intent at decision time, not generic features pages. | The 17 pages in Section 17 are this pattern. Build first: `/ai-referral-tracking` (unique, low competition), `/stripe-revenue-attribution` (direct integration), `/utm-tracking-guide` (top of funnel), `/shopify-manual-webhook-setup` (specific, honest). |
| **Pricing FAQ clarity** | Specific questions answered directly. Each FAQ answers one real objection: "Can I cancel?", "What happens to my data?", "Is there a free trial?" | The current Pricing FAQ has 6 questions but misses the 7 highest-anxiety ones listed in action item #6 below. |
| **Trust through transparency and docs** | Open-source code, public changelog, public roadmap. Postiz's trust does not come from logos — it comes from being verifiable. | SourceTrack cannot open-source its core, but it can: maintain a public changelog/product updates page (see action #7), make install docs and Stripe/Shopify setup guides publicly accessible before signup, link to the privacy architecture explanation (cookieless hash, no third-party data), publish the QA audit summary. Transparency substitutes for reviews when reviews don't exist. |
| **Public changelog / product updates page** | Postiz ships frequently and documents it visibly — active shipping is trust without social proof. | A simple `/changelog` page updated after every deploy shows SourceTrack is actively maintained. "Shipped: AI referral tracking for 22 domains — 2026-06-18" is more credible than any badge. |
| **Open docs before signup** | Install docs, integration guides, pricing terms, and API docs are publicly accessible without an account. | Install docs, Stripe setup, manual Shopify recipe, privacy safeguards explanation, pricing terms (including Early Bird renewal terms), and API docs must be inspectable before signup. Hiding docs behind a login creates friction and reduces trust at the exact moment a prospect is evaluating whether to convert. |

### What Postiz does wrong (do not copy)

| Anti-pattern | Why it fails | SourceTrack risk |
|-------------|-------------|-----------------|
| **Feature-heavy homepage density** | Postiz's homepage lists features in long scrolling sections. By the time a prospect reaches the CTA they've absorbed 80 items and understood 0. | SourceTrack's Measurement Flow section is this pattern. 5 numbered cards with "Capture First-Touch," "Preserve Signals," "Ingest Conversions" is documentation in a marketing position. Remove it. |
| **Giant SaaS pricing comparison matrix** | 35+ checkbox rows communicate "we have more features" but not "you'll get this outcome." Prospects feel confused rather than confident. | SourceTrack's PricingCards are lean (5 bullets per plan). Do not expand them into a feature matrix. Comparison tables work only when every row answers a question the prospect is already asking. |
| **AI/agentic over-positioning** | Positioning around AI capabilities that are not clearly differentiated creates skepticism. | SourceTrack's "AI referral tracking" is genuinely differentiated — 22 AI referrer domains that other tools misclassify as direct. That is a specific, verifiable claim. Do not generalize it to "AI-powered attribution" or add AI labels to non-AI features. |
| **Generic comparison-page spam** | Comparison pages for every tool in the category, regardless of whether prospects actually search for those comparisons, are treated as thin content by Google. | Build only the first-wave comparison pages listed above. Each must include specific feature comparison data from the actual product — not generic "SourceTrack is easier" claims. |

### The 6 required SourceTrack actions from the Postiz benchmark

**1. Homepage proof section — real proof only, no fake signals**

Replace the current absence of social proof with a proof strip that is honest and specific. All of the following are verifiable:

```
[Cookieless · No fingerprinting · DNT respected]
[Verified setup in 5 minutes — confirmed in staging QA]
[22 AI referrer domains — ChatGPT, Claude, Gemini, Perplexity + 18 more]
[Built on open attribution standards — multi-touch, cookieless, privacy-first]
```

**Hard rule:** No fake wall-of-love. No stock photography testimonials. No fake star ratings. No logos of companies who haven't signed up. No `aggregateRating` schema without real verified reviews. If a founding customer exists and approves a quote, use it. Otherwise use the proof strip above until real customer quotes are available.

**2. Product demo immediately after hero**

The demo appears within one scroll of the headline. Requirements:
- Use sourcetrack.ai's own live attribution data, after privacy/redaction review. If not ready, use static demo-only fixture data with realistic non-round numbers — labeled clearly as "Demo data."
- Show the attribution output (top source, recent conversion, revenue) — not the setup flow. Prospects want the answer, not the configuration.
- Do not present fixture data as real. A labeled demo is more credible than undisclosed fake data.

**3. One clear CTA — everywhere**

Current: two competing CTAs above the fold, inconsistent labels across pricing. Required:
- One primary CTA label: **"Start free"** — used consistently across homepage, pricing, and all marketing pages
- One secondary CTA label: **"See how it works"** — links to /product or a demo section
- Pricing CTAs: "Get Starter," "Get Growth," "Talk to sales" — already correct

**4. Comparison-page SEO hub — first-wave pages only**

Build in this order:
1. `/compare/attributer` — nearest price/simplicity competitor, high search intent
2. `/compare/datafast` — direct attribution competitor
3. `/compare/cometly` — mid-market overlap
4. `/compare/usermaven` — same SaaS founder audience
5. `/compare/google-analytics-4` — expand the existing page for full keyword coverage

Structure per page: What [competitor] does well. What SourceTrack does instead. The honest difference. Who should pick which. One CTA. Future pages only if commercially useful and high-quality.

**5. Product-led SEO pages — 4 priority pages**

Build these first (highest intent, lowest competition, most directly tied to real SourceTrack features):
1. `/ai-referral-tracking` — expand existing page; this keyword cluster is nearly uncontested
2. `/stripe-revenue-attribution` — directly answers the Stripe webhook recipe use case
3. `/utm-tracking-guide` — captures top-of-funnel marketers before tool selection
4. `/shopify-manual-webhook-setup` — honest and specific; the exact answer for storefronts without a native app

**6. Pricing FAQ — 7 questions that eliminate conversion-killing anxiety**

Add or update the Pricing page FAQ to include all of the following:

- **"What counts as a tracked visit?"** — One tracked visit = one unique visitor session per day. A visitor who loads 10 pages in one session = 1 tracked visit, not 10. This is different from pageviews.
- **"What happens when I hit my plan limit?"** — [Add the actual behavior from the codebase/billing logic: soft warn at 80%, hard cutoff at 100%, overage billing, or pause — whichever is true. Do not leave this blank.]
- **"How does the Early Bird annual billing work?"** — "Your first month is free with no card required. After that, you're billed $99 for your first full year, paid annually. After year one, standard Starter pricing ($29/month) applies. You can cancel before your annual renewal date from Settings → Billing with no penalty."
- **"What are the renewal terms?"** — Renewal terms must be shown explicitly before checkout, not discovered in a settings page after billing. "Annual plans renew at standard pricing after the first year" must appear on the checkout confirmation page.
- **"Can I cancel anytime?"** — "Yes. Cancel from Settings → Billing at any time. No cancellation fee. Your access continues until the end of the current billing period."
- **"What happens to my data if I cancel?"** — [Add the actual retention policy: 30-day download window, immediate deletion, or permanent deletion — whichever is true. Leaving this unanswered creates anxiety.]
- **"What's included in each plan?"** — Each plan feature gate must be explained in one sentence with a specific example: "Journey timeline" → "See every page a visitor viewed before converting, in order." Not just a checkmark.

---

## Validation

### git diff --check
```
No code changes made — audit is documentation only.
```

### git status --short --untracked-files=all
```
?? docs/qa/sourcetrack_datafast_piqo_simplicity_parity_140Z-G.md
```

Untracked: this audit document only. No staged changes. No modifications to any source file.

---

## Audit Summary

| Area | Verdict | Key finding |
|------|---------|------------|
| Homepage clarity | 🟡 Partial | Strong H1, weak sub (41 words), no social proof, vague primary CTA |
| Product demo | 🟡 Partial | HeroPreviewCard exists; must use real or realistic data, not placeholders |
| Above-the-fold | 🟡 Partial | Headline is clear; sub-headline fails mobile readers |
| CTA clarity | 🔴 Fail | "Find my best sources" is clever but not action-oriented |
| Pricing simplicity | 🟡 Partial | Early bird copy needs safer language; PricingCards has grid bug; "tracked visit" undefined |
| Trust/claims | 🟡 Partial | Honest limitations disclosed; no fake social proof; but no real proof exists yet |
| Mobile | 🔴 Untested | SPA with no SSR; 41-word sub-headline is fatal on mobile; requires dedicated QA pass |
| Technical SEO | 🟡 Partial | Sitemap/robots/schema exist; FAQ/HowTo schema missing; no product-led SEO architecture |
| Dashboard | 🟡 Partial | Answers "what" not "what next"; attribution model UX too complex |
| Analytics | 🔴 Heavy | Too many breakdowns on one screen for non-technical users |
| Attribution | 🟡 Partial | 9-model dropdown needs simplification; "AI journey influence" unclear |
| Campaigns | 🟡 Partial | Table complexity acceptable; "Medium" tab needs renaming |
| Leads/Journeys | 🔴 Broken | "View Journey" navigates to leads list not specific journey — broken promise |
| Integrations | 🔴 Heavy | 2865-line page; developer language in non-developer product; naming misleads |
| Settings | 🔴 Heavy | 13 sections; needs grouping into 4 tabs |
| Onboarding | 🟡 Partial | Step 3 mislabeled; no time estimate; no developer handoff path |
| Billing | 🟡 Partial | PricingCards grid bug; feature bullets are names not benefits; Early Bird copy unsafe |
| Weekly digest | 🔴 Missing | Core product surface not shipped; required before public launch |
| Empty states | 🟡 Partial | Most empty states tell users what to do but not why it matters |
| Consistent date picker | 🟡 Unknown | Not verified across all screens; must be tested |
| Journey pattern | 🔴 Broken | No consistent journey detail pattern; current "View Journey" is wrong destination |
| DataFast parity | 🟡 Partial | Attribution engine stronger; install verification and payment OAuth weaker |
| Piqo parity | 🟡 Partial | AI attribution is a differentiator; Piqo has 5 payment providers vs. 2 |
| Must-fix count | **10 blockers before paid beta** | See Section 11 |
| Pre-launch polish | **6 items before public launch** | See Section 12 |
| Should-fix count | **19 items after paid beta** | See Section 13 |

**Overall verdict: Not ready for paid beta on simplicity grounds alone.** The attribution engine and core tracking are solid. The communication, compression, and user experience need 10 specific fixes before charging customers who expect a "simple" tool. Most fixes are XS–S effort. The most impactful single change is fixing "View Journey" to actually show the journey.
