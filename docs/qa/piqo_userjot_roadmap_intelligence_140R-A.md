# Session 140R-A — Piqo UserJot Roadmap Intelligence Audit

**Date:** 2026-06-17
**Type:** Research only — no code changes
**Sources:**
- `https://piqoanalytics.userjot.com/?cursor=1&order=top&limit=10` (feedback board, top-voted)
- `https://piqoanalytics.userjot.com/roadmap` (roadmap, all columns)

---

## 1. Top Piqo Customer-Demand Themes

Raw signals from the feedback board and roadmap, ranked by vote count and roadmap stage:

### Highest-voted feedback items (feedback board, top-order)

| Votes | Item | Status |
|-------|------|--------|
| 4 | Internal traffic filtering (ignore own visits) | **Done** |
| 4 | Weekly email reports | **Done** |
| 2 | Plausible import | **In Progress** |
| 2 | Slack integration (conversion alerts) | Planned |
| 2 | Public share links / configurable per-link visibility | **Done** |
| 2 | Custom time zones | **Done** |
| 1 | GA4 import | **In Progress** |
| 1 | Chart annotations | Planned |
| 1 | Saved segments / filter presets | Planned |
| 1 | Revenue currency selection | Planned |
| 1 | Brand mention monitoring (social + AI search) | Pending |
| 1 | Per-event custom properties / breakdowns | Pending |
| 0 | X post attribution | **In Progress** |
| 0 | Funnels | Planned |
| 0 | Returning vs new visitors / retention | Planned |
| 0 | Period comparison ("vs previous period") | Planned |
| 0 | Alerts (traffic spike/drop/revenue) | Planned |
| 0 | CSV export + public Stats API | Planned |
| 0 | Subscription metrics: MRR/churn/LTV/ARPU | Planned |
| 0 | Goal value / revenue per goal | Planned |
| 0 | Embeddable public widgets | Planned |
| 0 | Bot / spam / referrer-spam filtering | **In Progress** |

### Roadmap completions (Piqo "Done" — 15 items recently shipped)

The Piqo UserJot roadmap lists as Done a substantial feature set. Relevant completions:

- Internal traffic filtering
- Custom events & goals
- Scheduled reports + Slack/Discord/webhook delivery
- Real-time dashboard & visitor map
- Revenue attribution (Stripe, Polar, Paddle, Dodo, Creem — **5 payment providers**)
- **Affiliate links + partner dashboards**
- **Cross-site analytics** (roll-up across all sites)
- **Google Search Console integration**
- Cookieless mode
- Auto-captured clicks & outbound links
- Team roles, excluded paths, per-site timezones
- **Public share links** (configurable per-link visibility)
- Weekly email reports
- Custom time zones

---

## 2. What This Says About the Analytics/Attribution Market

**Theme 1 — Trust comes first.**
The single highest-voted feature (4 votes) is internal traffic filtering — not attribution, not revenue. Users distrust their numbers before they build on them. Bot/spam filtering is "In Progress" at Piqo. For SourceTrack: trust gates matter more than feature breadth. A user who doesn't trust the pageview count will not trust the attribution model.

**Theme 2 — Data portability is the switching blocker.**
GA4 import (Piqo: In Progress), Plausible import (Piqo: In Progress), CSV export + public API (Piqo: Planned) are all in active demand. The main reason users don't switch to newer analytics tools is sunk cost — their historical data lives in GA4. Removing that friction converts fence-sitters.

**Theme 3 — Notifications retain users.**
Slack alerts, weekly email reports, webhook delivery — these are the highest-shipped items at Piqo (weekly email: 4 votes, Done). They don't require login. They bring the product to the user instead of making the user come to the product. Retention features, not acquisition features.

**Theme 4 — Revenue depth is a serious-user signal.**
Subscription metrics (MRR/churn/LTV/ARPU), goal values, currency selection, multi-provider revenue attribution — these appear once a user has moved from "does this work?" to "can I build a business on this?" The market is bifurcating: casual analytics users (who stay on GA4/Plausible) vs. revenue-aware operators (who will pay for attribution).

**Theme 5 — Read-access democratization.**
Public share links, team roles, embeddable widgets — users want to share results without granting full login access. This is an agency and team signal, not an individual-user signal. The Piqo UserJot roadmap lists as Done this. SourceTrack has a ShareDashboard page but limited scoping.

**Theme 6 — AI search attribution is niche but differentiated.**
X/Twitter post attribution and brand mention monitoring appear on the feedback board. AI search attribution (ChatGPT, Perplexity, etc.) is A SourceTrack differentiator — Piqo does not appear to track this specifically, though it has completed revenue attribution across payment providers. This appears to be a potential SourceTrack advantage based on the reviewed UserJot sources.

**Theme 7 — MCP is invisible to Piqo's audience right now.**
No MCP item appears anywhere on Piqo's board. This is consistent with MCP being a 2025-era capability that most analytics tools haven't touched. A read-only MCP integration for attribution data could be a meaningful V1.1 differentiation if implemented securely and verified across supported clients.

---

## 3. What SourceTrack Already Has

Items on Piqo's feedback/roadmap that SourceTrack has already built:

| Item | SourceTrack Status |
|------|--------------------|
| Revenue attribution (Stripe webhook) | ✅ Implemented / needs deployed production-readiness verification |
| Shopify revenue attribution | ✅ Implemented / needs deployed production-readiness verification |
| Google Search Console integration | ✅ Implemented / verify deployed sync behavior |
| Cookieless tracking | ✅ Core (privacy-first, no fingerprinting) |
| Custom events & goals / conversion tracking | ✅ Implemented |
| AI source performance tracking (ChatGPT, Perplexity, etc.) | ✅ SourceTrack differentiator |
| Multi-touch attribution models (8 models) | ✅ SourceTrack differentiator |
| Team roles (owner/admin/viewer) | ✅ Settings |
| Excluded paths / per-site settings | ✅ Settings |
| Public share links (ShareDashboard) | ✅ Exists, limited scoping |
| Data quality / over-reporting detection | ✅ Paid feature |
| Weekly email reports | ✅ Exists (digest) |
| Attribution window / model comparison | ✅ Attribution page |

---

## 4. What SourceTrack Partially Has

| Item | SourceTrack Status | Gap |
|------|--------------------|-----|
| Internal traffic filtering | Excluded paths in Settings | No "ignore my visits" one-click button |
| Bot/spam filtering | Not surfaced in UI | Backend may scrub some; not user-configurable |
| Alerts | Not yet built | API exists for DQ alerts; no user-facing alert rules |
| CSV / API export | Basic export from Dashboard | No public Stats API; export is one-off not scheduled |
| Period comparison | Deltas shown on KPIs | No explicit "vs previous period" toggle on every metric |
| Saved segments / filter presets | Not yet built | Filters exist on Analytics but not saveable |
| Chart annotations | Not yet built | Timeline chart exists, no annotation layer |
| Goal value / revenue per goal | Not yet built | Conversion types tracked, values recorded, no per-goal value config |
| Currency selection | Always USD | Multi-currency from Stripe partially surfaced |
| Subscription metrics (MRR) | computeMrrEstimate dead code removed in 140Q | No active subscription analytics surface |
| Affiliate links / partner dashboards | Not built | Out of scope for V1 |
| Cross-site analytics | Multi-site switcher exists | No roll-up view across all sites |
| Embeddable public widgets | Not built | ShareDashboard is full page, not widget |
| Slack/Discord/webhook delivery | Not built | Webhook adapter exists for custom endpoints |
| Per-site timezones | Settings | Not surfaced on charts — all UTC |

---

## 5. V1 Paid-Beta Blockers

Items needed for trust, correctness, deployed QA, billing/security, setup clarity, or attribution accuracy. Not a feature list — a trust gate list.

| Blocker | Reason |
|---------|--------|
| Tracking script verified / install confirmed | User can't trust attribution if installation isn't verified |
| Stripe webhook working end-to-end in staging | Revenue data is core; test-mode false positives blocked by truth gates |
| Shopify webhook deduplication verified | Order-ID dedupe must be confirmed before billing users |
| Attribution nightly job running and correct | Multi-touch models must pass unit tests before paying users rely on them |
| Billing gate enforcement (free/growth/business plan limits) | Users must hit correct limits before paid beta launch |
| Data quality over-reporting detection (paid tier) | Duplicate pixel detection must work before paying users diagnose CAC |
| Onboarding flow complete with no blockers | Confirmed in 139I-D, PASS WITH LIMITS; multi-site gate edge case outstanding |
| Privacy claims (cookieless, no fingerprinting, DNT) | Non-negotiable; must pass audit before marketing |
| Supabase realtime transport — no raw createClient() | Security rule; verified per CLAUDE.md |
| API secrets / env-safety QA passing | All qa:secrets and qa:env-safety must be PASS |
| Cal.com booking UTM passthrough verified | 140M-C confirmed; keep verified |

**Not a V1 blocker:** GA4 import, MCP server, saved segments, Slack alerts, annotations, funnels, subscription metrics, public widgets, affiliate dashboards, X post attribution, bot filtering (nice to have but not required for first paying customers).

---

## 6. V1.1 Approved Roadmap Additions

These are confirmed for V1.1 — validated by Piqo customer demand data.

| Feature | Piqo signal | SourceTrack V1.1 scope |
|---------|-------------|------------------------|
| **GA4 import** | In Progress at Piqo; #1 switching blocker | Historical import only; UI + API |
| **Plausible import** | In Progress at Piqo; 2 votes | Historical import; same import UX as GA4 |
| **X/Twitter post attribution** | In Progress at Piqo | AI/social attribution parity with ChatGPT/Perplexity |
| **SourceTrack MCP Server** | Not observed in the Piqo UserJot sources reviewed — potential SourceTrack V1.1 differentiator | Read-only, per-site-scoped, token-based, revocable, rate-limited, audited, no write/admin/billing |
| **Saved segments / filter presets** | Planned at Piqo; 1 vote | Save filter combinations; scoped per site |
| **Bot / referrer-spam filtering** | In Progress at Piqo | User-configurable; separate from path exclusions |
| **Simple alerts** | Planned at Piqo | Traffic spike/drop + goal threshold; Slack/email delivery |
| **CSV / API export polish** | Planned at Piqo | Scheduled exports; public read API for agencies |
| **Chart annotations** | Planned at Piqo; 1 vote | Deploy markers, campaign markers on timeline |
| **Currency selection** | Planned at Piqo; 1 vote | Let users set display currency; conversion from USD |
| **Goal values / revenue per goal** | Planned at Piqo | Assign monetary value per conversion type |
| **Slack conversion alerts** | Planned at Piqo; 2 votes | Real-time webhook → Slack channel; per-site config |

**MCP-specific scope (non-negotiable constraints):**
- Read-only at launch. No write, admin, or billing actions ever via MCP.
- Per-site scoped — a token grants access to exactly one site's data.
- Token-based — issued from Settings, revocable instantly.
- Rate-limited — prevent bulk harvesting.
- Audited — all MCP calls logged with timestamp and tool name.
- Redacted by default — PII (email, name, phone) stripped from MCP responses unless explicitly enabled.
- Framing: "SourceTrack MCP Server for MCP-compatible AI assistants." Do not claim native Claude/GPT/Gemini/Perplexity integration until each client path is tested and confirmed.

---

## 7. Later Roadmap Items

Useful features, but too heavy for V1.1 or create unsupported surface area.

| Feature | Why Later |
|---------|-----------|
| **Funnels** | Multi-step drop-off analysis requires significant query complexity; Piqo has it Planned but not shipped; V1.1 attribution models cover conversion journeys adequately |
| **Returning vs new visitors / retention cohorts** | Requires stable identity across sessions; meaningful only post-cookieless identity resolution; build after bot filtering and segment presets are solid |
| **Period comparison ("vs previous period" toggle)** | Useful but cosmetic; deltas already shown on KPIs; full comparison mode is a dashboard redesign; add in V1.2 |
| **Full subscription analytics suite (MRR/churn/LTV/ARPU)** | Piqo has this Planned; requires clean recurring payment event stream; build only after Stripe integration is fully tested with multi-plan customers |
| **Embeddable public widgets** | Piqo has it Planned; niche use; requires iframe trust domains and CORS config; builds after public share links are solid |
| **Historical migration wizard** | GA4/Plausible import is approved but complex; a full wizard with mapping UI is V1.2 scope |
| **Additional payment provider attribution** | Polar, Paddle, Dodo, Creem — The Piqo UserJot roadmap lists as Done all 5; SourceTrack has Stripe + Shopify; add Paddle first (high demand from SaaS), others later |
| **Per-site timezones on charts** | Settings exist but charts all show UTC; cosmetic fix, not attribution correctness |
| **Cross-site roll-up analytics** | Multi-site switcher exists; roll-up requires aggregation layer; build after per-site quality is confirmed |

---

## 8. Features to Avoid for Now

Anything that makes SourceTrack feel like a heavy enterprise dashboard or creates unsupported claims.

| Feature | Reason to Avoid |
|---------|-----------------|
| **Full affiliate dashboard** | The Piqo UserJot roadmap lists as Done this. It's a separate product surface (per-partner commissions, tracked links, payouts). Building it prematurely bloats scope and requires affiliate legal/billing design. |
| **Brand mention monitoring** | Completely different product category (social listening). Would require crawling Twitter, Reddit, etc. Way out of scope for an attribution tool. |
| **Real-time visitor map** | The Piqo UserJot roadmap lists as Done it. It looks impressive but is cosmetic. Adds infra cost (streaming geolocation), distracts from attribution accuracy, and conflicts with the "simpler than Piqo in daily use" north star. |
| **Native Salesforce/HubSpot CRM sync** | Enterprise CRM integrations require OAuth, webhook bidirectionality, field mapping, and dedicated support. V1.1 should focus on data out (CSV, API, Slack) before data in (CRM sync). |
| **Google Ads CAPI / Meta Conversions API** | Sending conversion data back to ad networks requires privacy review, rate-limit compliance, and audit trail. Not a V1.1 scope — SourceTrack pulls ad spend IN, not push conversions OUT. |
| **Funnel visualization suite** | Full funnel builder is a large product. SourceTrack's multi-touch models already tell attribution stories. Adding heavy funnel builder before simpler features land (saved segments, alerts, annotations) inverts priority. |
| **Natural language query / AI chatbot inside dashboard** | AIChat page exists but is out of current roadmap. Don't expand this until MCP server establishes a cleaner read-layer abstraction. |
| **Predictive analytics / ML forecasts** | Speculation layer on top of attribution data; no customer demand signal from Piqo; not a V1.1 trust-building feature. |

---

## 9. Simplicity Risk: How to Add Features Without Making SourceTrack Heavy

The north star is: simpler than Piqo in daily use, more premium than DataFast in visual feel, more attribution-capable than both.

Piqo's roadmap has 12 items Planned and 4 In Progress. Every feature they add risks making them heavier. SourceTrack's advantage is to stay lighter on the surface while being deeper on attribution.

**Rules for V1.1 feature implementation:**

1. **One primary action per feature.** Saved segments → one click to save. Alerts → one rule per site. Chart annotations → one click to mark a date. Do not add config panels for features that can be inferred.

2. **Progressive disclosure, not defaults.** Bot filtering should be on by default (or require one toggle to enable) — not a configuration panel. Slack alerts should be one webhook URL input — not an event type matrix.

3. **No feature that requires its own nav item.** V1.1 features should live inside existing pages (Integrations, Analytics, Dashboard, Attribution). Adding GA4 import should be an Integrations card. Adding annotations should be a control on the chart. No new top-level pages unless absolutely necessary.

4. **Suppress when empty.** Every V1.1 feature should disappear or say "—" when it has no data. No placeholder sections, no empty state theater, no "Coming soon" teasers inside the live UI.

5. **Batch the "agency convenience" features.** Saved segments + CSV export + public API + chart annotations are all convenience features for power users. Ship them in one release, not drip-fed over four sessions, so the product feels complete rather than incrementally patched.

6. **MCP must not appear in the main UI.** The MCP server is a Settings → API Tokens extension. It should not add a new nav item, a new dashboard section, or a new tutorial card. Developers find it in API docs; regular users don't see it.

7. **Avoid "feature sprawl" page structure.** If adding a feature requires a new dedicated page, that's a signal it's "Later" not "V1.1". Exception: the GA4/Plausible import wizard may need its own modal flow, but it should be accessed from Integrations, not a new nav item.

---

## 10. Updated Recommended Roadmap Sequence

### Phase 0 — V1 Paid Beta (current focus)
Gate: trust, correctness, billing, deployed QA.
- Tracking verification confirmed
- Attribution nightly job tested and correct
- Billing enforcement working
- Stripe/Shopify webhook deduplication verified
- Privacy claims auditable
- Dashboard/Analytics simplicity (140Q, 140O done)
- Integrations truth gates (140R done)
- Onboarding clear and unblocked

### Phase 1 — V1.1 Release A (data portability + noise removal)
Goal: remove the main switching objections and trust blockers.

1. **Bot / referrer-spam filtering** (In Progress at Piqo — need to ship before competitors)
2. **Internal traffic filtering UI** (one-click, not just path exclusions)
3. **GA4 import** (removes the #1 switching blocker)
4. **Plausible import** (completes the import story alongside GA4)
5. **CSV export polish** (agencies need this to justify the switch)

### Phase 2 — V1.1 Release B (daily-use productivity)
Goal: make daily use faster and stickier.

6. **Saved segments / filter presets** (convenience; avoids re-clicking)
7. **Chart annotations** (ties marketing events to traffic spikes)
8. **Currency selection** (international user trust signal)
9. **Goal values / revenue per goal** (unlocks ROI conversations)
10. **Period comparison** (move from Phase 3 if quick to ship)

### Phase 3 — V1.1 Release C (notifications + AI differentiation)
Goal: bring SourceTrack to the user without requiring login.

11. **Simple alerts** (traffic spike/drop, goal threshold)
12. **Slack conversion alerts** (pairs with alerts for real-time revenue ops)
13. **X/Twitter post attribution** (extends AI attribution parity)
14. **SourceTrack MCP Server** (read-only, per-site, token-based)

### Phase 4 — Later (complexity earned by scale)
- Period comparison (if not shipped in Phase 2)
- Funnels
- Returning/new visitors + retention cohorts
- Subscription metrics (MRR/churn/LTV/ARPU)
- Additional payment providers (Paddle first)
- Embeddable public widgets
- Cross-site roll-up
- Per-site timezones on charts

### Never (or explicit decision required)
- Full affiliate dashboard
- Brand mention monitoring / social listening
- Real-time visitor map
- Native CRM sync (Salesforce, HubSpot)
- Google Ads CAPI / Meta Conversions API push
- Predictive analytics / ML forecasts
- AI chatbot expansion before MCP is solid

---

## Raw Source Data

### Piqo UserJot — Feedback board (top-order, as scraped 2026-06-17)

```
2 votes — Plausible import (In Progress)
2 votes — Slack integration (Planned)
1 vote  — Brand Mention Monitoring (Pending)
1 vote  — Sort order A-Z (Pending)
1 vote  — Per-event custom properties / breakdowns (Pending)
1 vote  — Chart annotations (Planned)
1 vote  — GA4 import (In Progress)
1 vote  — Saved segments / filter presets (Planned)
1 vote  — Revenue currency selection (Planned)
0 votes — X post attribution (In Progress)
```

### Piqo UserJot — Roadmap (as scraped 2026-06-17)

**Planned (12):** Funnels, Returning/new visitors, Period comparison, Saved segments, Alerts, CSV export + Stats API, Chart annotations, Subscription metrics (MRR/churn/LTV/ARPU), Goal value/revenue per goal, Embeddable public widgets, Currency selection, Slack integration

**In Progress (4):** GA4 import, Bot/spam/referrer-spam filtering, Plausible import, X post attribution

**Done (15):** Internal traffic filtering, Custom events & goals, Scheduled reports + Slack/Discord/webhook, Real-time dashboard & visitor map, Revenue attribution (Stripe/Polar/Paddle/Dodo/Creem), Affiliate links + partner dashboards, Cross-site analytics, Google Search Console integration, Cookieless mode, Auto-captured clicks & outbound links, Team roles/excluded paths/per-site timezones, Public share links, Share public access to site stats, Weekly email reports, Custom time zones
