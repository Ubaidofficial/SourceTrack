# SourceTrack Pricing & Plan Limits Audit

This document audits the current plan pricing structure, monthly event/pageview limits, structural gates, and Stripe mappings of SourceTrack, outlining competitor-inspired scenarios and recommendations before paid-beta launch.

---

## 1. Current In-Code Billing & Plan State

### Public Pricing Cards & Comparison (Marketing Page)
As displayed in `dashboard/src/components/PricingCards.jsx` and `dashboard/src/pages/Pricing.jsx`:

*   **Free ($0):**
    *   *Usage bounds:* 1 site, 30 attributed conversions/mo, 5,000 pageviews/mo, 30-day history.
    *   *Advertised features:* "SourceTrack logo on export".
*   **Starter ($19/mo billed yearly / $29/mo billed monthly):**
    *   *Usage bounds:* 1 site, 150 attributed conversions/mo, 50,000 pageviews/mo, 90-day history.
    *   *Advertised features:* Manual status & revenue, Saved reports & CSV export, Clean exports.
*   **Growth ($49/mo billed yearly / $79/mo billed monthly):**
    *   *Usage bounds:* 3 sites, 750 attributed conversions/mo, 150,000 pageviews/mo, 1-year history.
    *   *Advertised features:* Revenue attribution models (9 models), Dashboard widgets, 3 user seats.
*   **Scale (From $149/mo billed monthly):**
    *   *Usage bounds:* 10+ sites, 2,500+ attributed conversions/mo, 500,000+ pageviews/mo, 5-year history.
    *   *Advertised features:* Multi-user seats (99 seats), Priority onboarding support.

### Backend-Recognized Plan Configs
Defined in `api/lib/plan-features.js` and `supabase/schema.sql`:

*   **Allowed Plans (CHECK Constraint):** `('free', 'trial', 'starter', 'growth', 'scale', 'business', 'inactive', 'archived')`.
*   **Plan Aliases:** `pro` maps to `growth`; `agency` and `business` map to `scale`.
*   **Default Pageview Limits (`PLAN_DEFAULT_PV_LIMIT`):**
    *   `free`: 5,000
    *   `trial`: 10,000
    *   `starter`: 50,000
    *   `growth`: 150,000
    *   `scale`: 500,000
    *   `inactive`: 0
    *   `archived`: 0
*   **Structural Limits (`PLAN_STRUCTURAL_LIMITS`):**
    *   `free`: `{ sites: 1, webhooks: 0, team_members: 1, retention_days: 30, conversion_events: 30 }`
    *   `trial`: `{ sites: 1, webhooks: 5, team_members: 1, retention_days: 365, conversion_events: 99 }`
    *   `starter`: `{ sites: 1, webhooks: 5, team_members: 1, retention_days: 90, conversion_events: 150 }`
    *   `growth`: `{ sites: 3, webhooks: 20, team_members: 3, retention_days: 365, conversion_events: 750 }`
    *   `scale`: `{ sites: Infinity, webhooks: 99, team_members: 99, retention_days: 1825, conversion_events: 2500 }`

---

## 2. Gaps & Mismatches Found in Codebase

During the audit, we identified several functional gaps where the code behavior diverges from public marketing promises or allows gating bypasses:

### 1. Free Plan CSV Export Gate Mismatch [Bug]
*   **Issue:** The public pricing card promises Free users a "SourceTrack logo on export," implying CSV export is available. However, in `FEATURE_MATRIX` (both frontend and backend), the `csv_export` feature is gated to `false` on the Free tier.
*   **Impact:** Free users trying to export CSVs will receive a `402 Payment Required` blocking error page rather than a watermarked download.

### 2. Starter Tier Attribution Models Mismatch [Mismatch]
*   **Issue:** The public comparison table in `Pricing.jsx` specifies that the Starter plan supports "Last-touch only". However, in the backend/frontend `FEATURE_MATRIX`, `multi_touch_attribution` is set to `true` for the Starter plan, allowing Starter users to query and display all attribution models (Linear, U-Shaped, W-Shaped, first-touch, etc.) on the dashboard and Report Builder.

### 3. Unenforced Conversion/Event & Structural Limits [Missing Gating]
*   **Issue:** The structural limit bounds (such as `conversion_events` monthly limit, active site limits, and team member limits defined in `PLAN_STRUCTURAL_LIMITS`) are **never actually checked** in backend ingestion routes or dashboard creation endpoints.
*   **Impact:** A Free or Starter user can create infinite active sites or invite team members if they bypass the UI forms, and the ingestion pipeline will continue capturing conversions past 30/150 conversions without checking counts.

> ⚠️ **CORRECTED 2026-07-25 (verified against `main` @ `c9a4113`) — "never actually checked" is NO LONGER TRUE, and this stale claim misled a planning session.** Three of the five `PLAN_STRUCTURAL_LIMITS` keys **are** enforced. Enforcement status per key, with the file:line that does it:
>
> | Key | Status | Enforced at |
> |---|---|---|
> | `conversion_events` | ✅ **ENFORCED** — all 8 ingestion paths | `claimConversionUsage` (`api/lib/conversion-limits.js:11`) called from `conversion.js:378` · `conversion-offline.js:214` · `track.js:440` · `proxy.js:145` · `stripe-webhook.js:88` + `:582` · `shopify-webhook.js:242` · `webhook-incoming.js:146` · **`server-events.js` (added by this PR — it was the one unmetered path)** |
> | `sites` | ✅ **ENFORCED** | `checkSiteCreationLimit` (`api/lib/site-limits.js:11`, limit read at `:41-43`), called at `api/routes/onboarding.js:247` |
> | `retention_days` | ✅ **ENFORCED** — see the correction on item 4 below | `api/routes/gdpr.js:584-598` |
> | `team_members` | ❌ **NOT ENFORCED** | No consumer. The key appears **only** in the `PLAN_STRUCTURAL_LIMITS` table (`api/lib/plan-features.js:64-70`). Currently unreachable rather than exploitable: there is no in-product invite/member-add mechanism at all (FEATURE_MAP §22 — membership must be provisioned out-of-band), so a user cannot exceed a seat count they have no way to increase. It becomes a real hole the moment invites ship. |
> | `webhooks` | ❌ **NOT ENFORCED** (previously unknown — nobody had checked) | The per-plan webhook **count** is never read: `getStructuralLimits(...).webhooks` has **zero** consumers repo-wide (the only `.webhooks` matches are `stripe.webhooks.constructEvent`, unrelated SDK calls). `api/routes/webhooks.js` gates the **feature** (`requireFeature(…, 'webhook_outbound')` at `:14`) but never the count, and the `.limit(10)` at `:53` is a query page size, not a plan cap. So on Growth (limit 20) and Scale (99) a customer can create unbounded outbound webhooks. |
>
> **Two of the three impacts claimed above are therefore wrong today:** infinite active sites is **blocked**, and unbounded conversion capture is **blocked**. Only the team-member claim still stands, and only in principle — see the row above. **Fixed in this PR: `server-events.js` only.** The `team_members` and `webhooks` gaps are **recorded, deliberately not fixed** (scope discipline), and are the honest remaining answer to this item.

### 4. Unenforced Data Retention Settings [Missing Gating]
*   **Issue:** GDPR settings (`PUT /api/gdpr/retention`) allow any user (including Free) to set their site retention days to 365 or 0 (keep forever), despite the pricing matrix stating Free is capped at 30 days. No backend validation scopes the retention selection to the user's plan.

> ⚠️ **CORRECTED 2026-07-25 (verified against `main` @ `c9a4113`) — this item is FALSE as written.** `PUT /api/gdpr/retention` **does** scope the selection to the plan, at `api/routes/gdpr.js:584-598`: it reads `getStructuralLimits(site.plan)` and returns **402** both when `days === 0` and the plan lacks keep-forever (`limits.retention_days < 1825`), and when `days > limits.retention_days`. A Free site (30 days) cannot set 365 or 0.
>
> **Scope of the correction — what is verified and what is not:** this confirms enforcement at the **configuration boundary** (you cannot *set* a retention longer than your plan allows). It does **not** verify that the purge job actually deletes on schedule; that is a separate question about `retention-purge.js` and was not re-checked here. Do not read this correction as "retention is fully proven end-to-end".

### 5. Ad Cost Sync & Cohort Routes Lack Backend Gates [Missing Gating]
*   **Issue:** `api/routes/ad-platforms.js` (Google and Meta Ads OAuth/sync setup) and `api/routes/cohorts.js` contain no plan-checking middleware. Free/Starter users can sync ad platforms or run cohort queries if they hit those endpoints directly, despite `ad_cost_sync` and `funnels_cohorts` being marketed as Growth/Scale features.

---

## 3. Pricing Scenario Modeling

### Scenario A: Keep Current Conservative Pricing
*Free: 5k views ($0) | Starter: 50k views ($19) | Growth: 150k views ($49) | Scale: 500k views ($149)*

*   **Pros:**
    *   **Minimal Ingest Overhead:** Low event volume per tenant protects database read/write performance.
    *   **Predictable Cost:** Limits PostHog capture usage and data warehousing growth.
*   **Cons:**
    *   **Negative Momentum:** 5k pageviews/mo is exhausted by a tiny site in a single afternoon, frustrating developers/founders and blocking setup validation.
    *   **Starter Mismatch:** starter plan is too restrictive for most paying SaaS or eCommerce operations.
*   **Who it attracts:** Micro-sites and hobby projects only.
*   **Infrastructure Risk:** Very Low.
*   **Revenue Risk:** High (high friction to start leads to checkout drop-off).

---

### Scenario B: Usermaven-Style Launch Momentum Pricing
*Free: 25k views ($0) | Starter: 100k views ($19) | Growth: 500k views ($49) | Scale: 1M views ($99)*

*   **Pros:**
    *   **High Virality/Momentum:** Extremely generous limits appeal to early-stage founders and small agencies.
    *   **Highly Competitive:** Positioned as a direct, affordable alternative to Google Analytics 4 and expensive attribution tools.
*   **Cons:**
    *   **Abuse Risk:** Open Free registration with 25k views attracts high-volume spam bots or gray-market scrapers, creating a massive influx of untrusted pageviews.
    *   **Cost Outflow:** Substantial PostHog event forwarding charges without immediate conversion to paying plans.
*   **Infrastructure Risk:** **High.** Under bursts of 200–500 events/sec, synchronous pageview inserts will saturate database connections.
*   **Requirements:** Must complete the 133L staging load tests and deploy Redis caching/rate-limit stores before adopting.

---

### Scenario C: Hybrid Attribution-First Pricing (Recommended)
*Free: 10k views ($0) | Starter: 100k views ($19) | Growth: 500k views ($59) | Scale: 1.5M views ($129)*

*   **Pros:**
    *   **Generous Paid Headroom:** The Starter tier (100k views for $19) is large enough for normal startup traffic.
    *   **High Value Retention:** Keeps advanced value features (GSC sync, automatic ad cost sync, API tokens, cookieless configuration, and advanced attribution walkthroughs) locked strictly to the Growth/Scale tiers.
    *   **Controlled Free Sandbox:** A 10k pageview limit allows developers to set up, test, verify, and browse dashboards, but forces upgrade once real marketing budgets are deployed.
*   **Cons:**
    *   Requires editing Stripe pricing structures and aligning comparison cards.
*   **Why it fits SourceTrack:** SourceTrack is an *attribution and ROI tool*, not a generic web analytics pageview counter. Gating value features (Ad cost imports, SEO revenue) allows us to price by value, keeping event limits generous.
*   **Infrastructure Risk:** Moderate. Protected by restricting the free tier.

---

## 4. Gating Strategy & Value Features Matrix

Even with generous pageview bounds, premium features must remain strictly gated to prevent giving away high-value utilities for cheap.

| Feature Area | Free Tier | Starter Tier | Growth Tier | Scale Tier |
|---|---|---|---|---|
| **Monthly Pageviews** | 10,000 | 100,000 | 500,000 | 1,500,000+ |
| **Attributed Conversions** | 30 / mo | 150 / mo | 750 / mo | Unlimited |
| **Active Sites** | 1 site | 1 site | 3 sites | Unlimited |
| **Attribution Models** | Last-touch only | Last-touch & First-touch | All 9 models | All 9 models |
| **Google Search Console** | Locked | Locked | Available | Available |
| **Ad Cost Integration (OAuth)** | Locked | Locked | Available | Available |
| **Manual Spend Entry** | Locked | Locked | Available | Available |
| **Developer API & Server Ingest** | Locked | Locked | Available | Available |
| **Outbound Ingestion Webhooks** | Locked | Locked | Available | Available |
| **Custom Domains / Proxy** | Locked | Locked | Available | Available |
| **White-Label Shared Reports** | Locked | Locked | Locked | Available |

---

## 5. Non-Negotiables Before Launching Pricing Changes

Before changing pricing limits, mappings, or copy:

1.  **Execute Staging Load Tests:** Must run the `k6` stress-test scripts created in Session 133L on a realistic staging clone to verify that the Express app and Postgres database handle 200–500 req/sec without database lockouts.
2.  **Verify Stripe Sandbox Webhooks:** Create sandbox Stripe prices matching the Price IDs, run a test checkout, and verify that the checkout webhook writes the canonical plan keys (`starter`, `growth`, `scale`) and metadata overrides successfully.
3.  **Enforce Code Gates:** Write plan validation checks on missing endpoints (`api/routes/ad-platforms.js`, `api/routes/cohorts.js`, `api/routes/analytics.js` `/funnel`, and `api/routes/gdpr.js` `/retention`).
4.  **Fix Free CSV Export Mismatch:** Either allow free CSV exports (with a watermark/limit) or update the pricing cards copy to remove the export promise from the Free tier card.

---

## 6. Verdict: Audit Complete (NOT READY FOR IMPLEMENTATION)

*This is an audit-only session. No prices, code limits, database schemas, or Stripe configurations have been modified. The recommendation is to proceed to Staging Load Testing (Session 133L tests execution) before executing these pricing changes in a separate pricing implementation session.*
