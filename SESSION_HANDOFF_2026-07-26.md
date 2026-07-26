# SourceTrack — Session Handoff & Prioritized Backlog
**Date:** 2026-07-26 · **Main:** post-#424 · **Tinybird prod:** deployment #25

> **Read this before the codebase.** Three separate times this session, a stale doc sent
> planning down a wrong path. Everything below is verified against runtime or code at the
> stated ref, or explicitly marked unverified.

---

## Version assessment: **v0.9**

Not 1.0. Feature-complete against design doc §23's V1 list, but P1 launch gates are open
and there is still zero production validation.

| Dimension | State |
|---|---|
| **V1 feature completeness** | ~95% — tracking, attribution, AI sources, analytics, Report Builder, journeys, leads, campaigns, onboarding, server API all built |
| **Correctness** | P0 truth bugs **closed by #424**; P0.3–P0.5 remain but none is customer-visible today |
| **Production validation** | **Zero** — no external customer has ever used it |
| **Launch gates** | **P1.1 Stripe live is the hard blocker** — you cannot take money. Plus funnels, no-referrer AI detection, trial cliff, soft limits |
| **Doc trust** | 7 of 16 FEATURE_MAP §20 rows still "not re-verified" |

**What closes 0.9 → 1.0:** P1.1–P1.7, plus one real customer completing
install → conversion → attribution end-to-end.

---

## P0 — RESOLVED by #424 (phantom column)

### ✅ P0.1 + P0.2 were ONE bug, not two

**Root cause:** `dashboard.js:91` selected `attribution_status`, which **does not exist**
on `attributed_conversions`. That column exists only on `subscription_identity` and
`subscription_revenue`. PostgREST rejects the *entire* select for one bad column →
`acRows` undefined → loop runs zero times → `sources: []`.

The call site was `{ data: acRows }` with **no error binding**, so the rejection was
invisible. That is why `/overview` returned `200` in ~199ms with every pipe healthy.

Both symptoms followed from this:
- Dashboard's *"No conversion events yet"* — `hasConversions = activeResults.length > 0`
- Attribution page's *"No conversions in this date range"* — `AttributionPage.jsx:122`
  reads the **same** `overview?.sources`; it never calls `/api/attribution` at all

**Fixed in #424:** phantom column removed · PostgREST error bound and thrown ·
`hasConversions` derived from conversion count · `analytics_unavailable` read, exported
AND rendered on both pages. 0/4 → 4/4, four mutations each caught.

**This is KI #15 (#278) recurring verbatim.** KI #16 explains why no test caught it:
`installSupabase` mocks ignore the select string. #424 adds a static column guard — the
compensating control #16 asked for — so the *class* is now caught, not just this instance.

### 🔴 P0.3 — Unexplained 422s on `/api/attribution` (still open, separate)
Prod logs show `GET /api/attribution status=422` ×4. **Not** the cause of the above —
that was my conflation of two things seen in one log window.
- `getAttribution()` has zero callers; the saved-report path can't fire (0 saved reports,
  `enabled: !!cfg.metric`). Leaves **ReportBuilder.jsx:189** and **Campaigns.jsx:1373**.
- Campaigns sends a filtered shape (`filter_campaign`) → gate denies via
  `filtersPresent → gated_dead_store`. **Likeliest, not asserted** — needs the request log.
- **To close:** capture the `Referer` header or full query string off that 422.
- Note: Dashboard widget cards already route 422s through `describeQueryError`
  (`dashboard-widget-gated-state.test.js`). The machinery exists where it fires.

### 🔴 P0.4 — Refund marker is dead (surfaced by #424)
`isUnresolvedRefund` (`dashboard.js:198`) read the phantom column, so
`UNATTRIBUTED_REFUNDS` **never filled — it never has.** Now visibly dead rather than
accidentally dead. The marker is written to event **properties**
(`stripe-webhook.js:316`), not a table column.
- **Decision needed:** add a column via migration (§0 — founder-gated), or derive the
  flag from properties. Not guessed at.

### 🟡 P0.5 — `/dashboard/overview` latent swallow (deferred from #424)
The outer catch still returns `200` with everything zeroed. Not firing today, and its
user-visible half is closed (#424's fix 4 means those zeros no longer present as data).
Remaining half — making the path non-2xx — is its own PR, now with an honest rendered
state to fall back on. **Third instance of the #413 pattern.**

---

## P1 — Launch blockers

> **P1.1–P1.4 recovered from a stale roadmap (2026-06) during reconciliation.** All four
> were named as launch gates there and have **zero or near-zero presence in
> FEATURE_MAP.md** — the doc that is supposed to track launch readiness. That is the
> single most important finding of the reconciliation: the four items called gates are
> the four least tracked.

### P1.1 — Stripe live activation ⛔ **THE gate**
- Zero hits in FEATURE_MAP.md. No `sk_live_` key.
- **You cannot take money.** Every other launch task is downstream of this.
- Founder-only; no agent can do it.
- **Sub-tasks:**
  - [ ] Complete Stripe account activation
  - [ ] Flip test → live, verify the catalogue is complete (pricing audit flags this)
  - [ ] Re-run the webhook path against live mode
  - [ ] Add to FEATURE_MAP as a tracked gate

### P1.2 — AI-source detection vs. the no-referrer reality
- Zero hits in FEATURE_MAP.md for "no-referrer".
- **This is the foundation of the hero feature.** AI assistants frequently send no
  referrer at all. If detection depends on referrer presence, the moat is hollow —
  and nobody has verified it end-to-end.
- Partial evidence it works: prod shows ChatGPT (3) + Kagi (1) attributed on
  techrupt.pk, and `?utm_source=chatgpt.com` appears in real page URLs — suggesting
  detection currently leans on UTM/referrer signals that may not always be present.
- **Sub-tasks:**
  - [ ] Determine what `channel-classifier.js` does when referrer AND utm are both absent
  - [ ] Test the no-referrer case explicitly
  - [ ] If detection is referrer-dependent, scope the fallback (and be honest in marketing about coverage)

### P1.3 — Funnels ⛔ table stakes
- 7 hits in FEATURE_MAP.md (tracked), but **`FunnelChart.jsx` is absent** — re-confirmed
  in #418. No funnel routes exist.
- Called *"your one true table-stakes gap, filed #1 in queue"* a month ago. Still #1,
  still unbuilt.
- DataFast, Cometly, and Usermaven all ship funnels. This is a category expectation.
- **Sub-tasks:**
  - [ ] Scope: is V1 a simple ordered-step conversion funnel, or full path analysis?
  - [ ] Backend: can existing conversion/pageview data serve it, or is new instrumentation needed?
  - [ ] Note design §23 lists "Standalone Funnel Builder" as **V2** — V1 funnels must be
        the simpler thing, not the builder

### P1.4 — S142 Analytics migration verification
- **Zero hits in FEATURE_MAP.md.** Named as a launch gate; the doc has never heard of it.
- Status genuinely unknown — may already be done, may be obsolete post-Tinybird.
- **Sub-task:** [ ] Determine what S142 refers to and whether it still applies. Verify
  before scheduling — this may resolve to nothing.

### P1.5 — Trial expiry is a hard cliff, not a demotion
- `tier-check.js:29-43` — expired trial returns **402, tracking stops entirely**
- No demotion to `free`, despite `free` being a fully configured plan
- **Also:** message hardcodes *"Your 14-day trial has ended"* — actual trial is 28 days
- **Sub-tasks:**
  - [ ] Demote expired trials to `free` instead of blocking
  - [ ] Fix the 14/28-day copy mismatch
  - [ ] Confirm where 28 days is configured (not in code — Stripe or migration)

### P1.6 — Soft limits: first signal is a hard 402 at 100%
Cometly publicly markets against this; Usermaven built positioning on it.
- **Sub-tasks:**
  - [ ] Warn at 80% (dashboard + email — rails exist: `site_alerts`, `AlertDrawer.jsx`, `email-reports.js`)
  - [ ] Grace buffer (~20%) before the 402
  - [ ] Escalating in-app messaging

### P1.7 — Billing webhook 500s risk Stripe auto-disabling the endpoint
- Root cause: KI-44 deliberately throws on zero-row match so transient races self-heal,
  but can't distinguish transient from permanently-unmapped
- **Fix shape (Antigravity's, sound):** `recordUnresolvedSite` → commit idempotency claim →
  return `200 {received: true, unmapped: true}`. Preserves audit trail, stops retry storm.
- ⚠️ Interacts with P1.1: once live, a disabled webhook endpoint is a revenue outage.

---

## P2 — Agentic / SaaS 3.0 direction

**Evidenced, not speculative:** DataFast shipped an MCP server 18 Jul 2026 (+ CLI, agent
mode). Cometly ships `Agent` and `AI Chat` nav items.

**You're closer than it looks:** 60+ Tinybird pipes are already typed, parameterised tool
endpoints. `read:analytics` scope already exists, labelled *"Reserved for the upcoming
read API."* **That read API is this.**

**Fits §26 better than the alternative:** §26 forbids LLM-narrated revenue and fake
recommendations. An MCP server hands agents *real numbers through typed tools* — it
doesn't narrate over them. Sharper position than a chat box.

⚠️ **Hard dependency: P0.1 + P0.2 must land first.** An agent asking "how many
conversions?" would receive `0` and report it as fact, with no ability to cross-check
the way a human can against Analytics. Agentic surfaces amplify a lying read path.

- **Sub-tasks:**
  - [ ] Curate ~10 read tools over existing pipes
  - [ ] Site-scoped auth via existing API keys
  - [ ] Close the do-nothing-key gap: require ≥1 enforced scope (create button only checks `length > 0`)

---

## P3 — UI/UX (from DataFast + Cometly research)

**Guiding constraint:** design doc §2.2 targets *"lighter than Cometly/Usermaven."*
Steal mechanics, not density. Cometly's dashboard is powerful but cluttered — copying it
contradicts your own positioning.

| | Task | Effort |
|---|---|---|
| P3.1 | **Deltas with comparison values** (`4 → 5, -20% ↓`). Both competitors do this; you show "vs prior" with no number | Hours |
| P3.2 | **Bounce rate + session time into Analytics KPI strip** — data exists, currently on Dashboard header / Report Builder only | Small |
| P3.3 | **Tabs on Pages and Locations** — Sources and Devices already have them; completes the pattern | Small |
| P3.4 | **KPI strip drives the main chart** (DataFast) — click a KPI, chart switches. Highest leverage, no new data | Medium |
| P3.5 | **Report → contacts drill-down** (Cometly) — click a number, see who. You own both halves (All Leads + Journey Panel); missing the click-through | Medium |
| P3.6 | Summary row in tables · source icons · attribution-window badge on pinned reports | Small |
| P3.7 | **Dashboard/Analytics consolidation** — fewer surfaces = fewer contradictions. Structural fix for P0.2's class | Large |

---

## P4 — Feature gaps

- **P4.1 — First Purchase Date filter → New vs Returning customers.** Cometly's highest-value
  report; you can't build it. `attributed_conversions` already has the data.
- **P4.2 — Operator-based filters** (`contains`/`less than`/`more than`). You have 5 fixed
  filters; they have a filter *system*. URL-Parameters filter is the concrete driver
  (redirect-only funnels with no landing pages).
- **P4.3 — Onboarding conversions:** business-type defaults thinner than spec (ecommerce →
  `purchase` only, no `contact_form`, `add_to_cart` in taxonomy but not the picker);
  free-text custom conversions; unique-vs-every-occurrence toggle.
- **P4.4 — `date` dimension in pre-agg.** First/last touch = 2 params. Multi-touch is
  **structurally blocked** — the touchpoint object never captures conversion date.
- **P4.5 — tz-aware bucketing** in `getMultiTouchAttributionLive`, `getSessionReport`,
  `getAiPlatformAttributionLive`. Deferred 3×. Silently moves existing month/quarter numbers.
- **P4.6 — KI #72 `obj.subscription`:** `mapSubscriptionEvent:29` reads a flat field recent
  Stripe versions moved to `parent.subscription_details.subscription`. Only affects
  `stripe_subscription_id` (identity seeding). Needs sandbox verification.
- **P4.7 — "Skip for now"** on the install step — design §12 specifies it, doesn't exist.
- **P4.8 — Seat limits unenforced.** Only structural limit with zero enforcement.
  *Demoted from P1:* unreachable today (no invite mechanism exists), so it blocks only
  when team features ship — not launch.

---

## Retired: 2026-06 roadmap reconciliation

The prior roadmap is **retired, not merged.** It was a month stale on its largest item
and would have misled the next reader the same way NEXT_SESSION_PROMPT did three times
this session. Recovered items are now in P1 above; the rest is recorded here so the
reconciliation isn't re-run.

**Its biggest claim was inverted.** It listed *"ClickHouse / Tinybird migration — trigger
when PostHog per-event COGS crosses ~10–15% of MRR, not before"* under "post-launch,
deliberately un-versioned." The migration is **done** — PostHog fully decommissioned,
~60 pipes, prod deployment #25 — and the trigger never fired, because there is no MRR.
Its cost model and sequencing assumption are void.

**Listed as pending, actually shipped:**
| Roadmap said | Reality |
|---|---|
| Conversion-rate bug (142%) | Fixed — `analytics.js:405`, `cappedRate(distinctConverters, uniqueVisitors)` |
| *"Stretch if time: meeting tracking (Calendly/Cal.com)"* | Built — `booking_scheduled` in `track.js` + `tracker.js`, 3 test files |
| Onboarding + verify-events flow, tabbed install guide | Shipped #417, browser-verified 9/9 |
| v1.1: save/name reports + pin to dashboard | Already in Report Builder |
| v1.1: report visualization (line/column/KPI/stacked) | 6 chart types shipped; only **stacked + data labels** missing → P3.6 |
| v1.1: country/region + URL-parameter grouping | Country shipped; custom URL params are **dimensions but not filters** → P4.2 |

**Decision reversed, deliberately:** the roadmap put the MCP endpoint in *"Tier 3,
explicitly NOT before launch."* Now P2, with reasoning: both competitors shipped MCP
servers (DataFast 18 Jul 2026), the pipes are already typed tool endpoints, the
`read:analytics` scope already exists reserved for exactly this, and it fits §26 better
than an AI chat box. Recorded as a reversal, not drift.

**Unresolved from the roadmap:** *"3 audit bugs cleared"* — too vague to trace. If it
still matters, someone needs to say which three.

⚠️ **Caveat on the reconciliation method:** hit-counts prove absence of a *term*, not a
*concept*. "Stripe live activation" could be tracked as "Stripe production." Only parts
of the 350-line FEATURE_MAP were read.

---

## P5 — Hygiene

- [ ] `seo-revenue.js` dead `hogSql` — ~25 lines, 7 edit sites, own PR (skipped in #423 correctly)
- [ ] `seo-revenue-read-cutover.test.js` passes a `queryHog` key the seam ignores
- [ ] `attribution-engine.js:697-713` stale inline classifier (inert)
- [ ] CLAUDE.md "4 mandatory worktrees" vs actual ad-hoc practice
- [ ] `tinybird-read.js` header describes obsolete null→HogQL fallback
- [ ] FEATURE_MAP freshness CI check (CC's recommendation — ~14 PRs/9 days touched none of it).
      ⚠️ Ship non-blocking first, or it blocks P0 fixes.
- [ ] Clean 3 post-merge worktrees: `trackiq-adminhonest`, `-srvcap`, `-pvcap`
- [ ] **Staging Tinybird is 5 pipes behind prod** — parity testing there tests stale SQL

---

## Decisions recorded

| Decision | Ruling |
|---|---|
| **$0 free-plan = customer?** | **YES** (founder). *But:* invoice-level can't distinguish trial-start from free-plan signup — both are `amount_paid:0, subtotal:0, subscription_create`. Needs a **subscription-level** discriminator (`trial_end` set + `unit_amount > 0` = trial; `unit_amount === 0` = free plan). Money-rail; needs sandbox verification. **Unreachable today** (no customer has a free tier wired) — record, build later. |
| **SourceTrack's own free plan** | **Already exists**: 1 site, 30 conversions, 5k pageviews, 30d retention, last-touch + live analytics. Work is enforce + market + fix trial→free, not "add." |
| **Free tier shape** | Keep minimal. Do NOT expand to 50 free leads — that pulls toward LeadSource.co's local-services ICP. 28-day full trial → minimal free floor is more generous than DataFast/Usermaven's 14-day-then-nothing. |
| **Pricing metering unit** | Conversions primary (spans SaaS/eCom/LeadGen; matches your taxonomy + onboarding), events as fair-use backstop. **Not pageviews** — signals "web analytics tool." Deferred to Astro rebuild. |
| **Events migration** | Deferred. Real data: billable-events:pageviews ≈ **1.004:1** — near-zero benefit today. Revisit when customers use custom events. |
| **`$heartbeat`** | Wired into sessionization (#422). Prod: avg duration 0.3s → 14.4s, 1,450 of 1,738 visitors rescued from a fake zero. |
| **API capped-caller contract** | **402** + `error_code`, not `200 {ignored:true}`. First-party API ≠ webhook. |
| **kagi.com precedence** | ⏸ **UNDECIDED.** Both an organic-search host and an AI domain; AI Search runs first, so a Kagi visit with `ai_source` stamped leaves SEO revenue. Non-regressive — safe to leave. |

---

## Competitive research (exists nowhere else)

**Pricing at entry tier:**
| Tool | Free | Entry paid | Meters on |
|---|---|---|---|
| Attributer | 10 leads | $29/mo — 100 leads | leads |
| LeadSources.io | none | $48/mo — 250 leads | leads |
| LeadSource.co | 50 leads | **$19/mo — 500 leads** | leads |
| DataFast | none | $9 / $19 (30 sites) | events |
| Usermaven | none (14d trial) | $84 Growth / $199 Scale | events |
| Cometly | none | $750/mo | sessions |
| **SourceTrack** | 30 conv / 5k pv | $19/mo — 150 conv | **pageviews + conversions** |

⚠️ **You're ~3.3× more expensive per lead than LeadSource.co at $19.** You do far more
(multi-touch, revenue attribution, AI sources, CAPI) but a buyer comparing cards sees
150 vs 500 and stops reading.

**Positioning:** Attributer at $29/mo does *less* than your shipped form-fill (§2). No
dashboard, no multi-touch, no offline sync. You are already an Attributer alternative —
that's a comparison-page gap, not a product gap. ⚠️ Verify §2's shipped claims first;
that section was never re-verified.

**Do NOT copy:** DataFast's avatar-faces-on-chart and named visitor journeys (their own
FAQ concedes cookies + banner; your cookieless mode is a positioning asset). Cometly's
Contacts/Companies CRM (§1.4: "Not a CRM"). Cometly's dashboard density (§2.2).

**WordPress plugin as lead magnet:** ✗ recommended against. LeadSource's WP plugin has
**10 active installs** — the category doesn't self-distribute. If ever revisited, ship a
thin *installer* plugin (tracker + form detection, data → SourceTrack), not a standalone
local-storage tool.

---

## Session facts

**Merged & deployed:** #413 admin honest errors · #414 KI#14 doc · #415 channel classifier
(3 pipes) · #416 conversion taxonomy + trial-start regression · #417 onboarding 6→5 ·
#418 FEATURE_MAP re-baseline · #419 server-events conversion cap · #420 server-events
pageview cap · #421 8 findings + 3 stale corrections · #422 heartbeat sessionization ·
#423 hygiene. **#423 pending merge.**

**Tinybird prod:** #24 (#416 pipes) · #25 (#422 pipes)

**Verified this session:** form auto-promotion works (sub-second `form_submit` →
`$conversion`) · site-limit enforcement works · server-side API auth + scopes + revocation
+ rate limiting all pass · onboarding 5-step verified in browser, 9/9 items

**Retracted before filing:** the "incomplete site can't reach its wizard" bug. Two
resolvers exist — `resolveOnboardingSite` (`:79`, `mode=onboarding`) returns a site when
`!onboarding_completed`; `resolveDashboardSite` (`:55`) is the inverse. `Layout.jsx:192`
passes `mode=onboarding`. Confirmed empirically in browser.

**Process lessons (4 stale-doc failures this session):**
1. **A citation is not a verification** — `NEXT_SESSION_PROMPT` cited the right lines
   (`onboarding.js:63-67`) and read them backwards
2. **A pass computed against a stale base is not a pass** — a clean "no changes" is the
   *most* dangerous output; a correct no-op and a stale-tree no-op are byte-identical
3. **Deploy-then-merge failed twice in one evening** — merge is 1 command, deploy is 8.
   Consider CI failing a merge when `tinybird/pipes/**` changed without a recorded deploy.
4. **Tests can match their own comments** — #422 had 3 mutations pass because an
   explanatory `--` comment satisfied a bare grep. Strip comments before asserting;
   make it a shared helper.

**Orchestrator MCP correction:** the Tinybird MCP is bound to **`SourceTrack` (prod)**,
not `ST_Staging`. All figures cited this session were prod data.
