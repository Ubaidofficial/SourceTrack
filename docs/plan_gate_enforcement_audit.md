# Plan Gate Enforcement & Pricing Alignment Audit (Session 133N)

This document details the backend plan gate enforcement, marketing copy alignment, and deferred structural limits audit completed in Session 133N.

---

## 1. Marketing Copy & Plan Feature Alignment

To eliminate truth gaps between marketed plans and code matrices, we updated the marketing site display:
*   **Free CSV Export Mismatch:** Fixed the discrepancy where the Free plan promised watermarked CSV exports but was blocked by the `csv_export: false` matrix setting.
    *   *Fix:* Changed `dashboard/src/components/PricingCards.jsx` Free features list to state `"No CSV export"`. Changed `dashboard/src/pages/Pricing.jsx` comparison table row for Free CSV Exports to `"No"`.
*   **Starter Attribution Models Mismatch:** Fixed the discrepancy where the comparison table restricted the Starter plan to "Last-touch only" while the code allowed full multi-touch attribution.
    *   *Fix:* Updated `dashboard/src/pages/Pricing.jsx` comparison table to specify `"All 9 models"` for the Starter plan.

---

## 2. Implemented Backend Route Gates

We added plan gate verification middlewares to the following backend API endpoints. Each returns a `402 Payment Required` response with standard upgrade metadata when a plan lacks the necessary feature.

### A. Ad Platforms Integration Router (`api/routes/ad-platforms.js`)
*   **Gate feature key:** `ad_cost_sync`
*   **Scope of gating:**
    *   *Gated (Write/Sync Actions):* `GET /google/auth-url`, `POST /google/save-account`, `POST /google/sync`, `POST /meta/connect`, and `POST /meta/sync`.
    *   *Ungated (Read/Disconnect Actions):* `GET /status`, `GET /sync-history`, `POST /google/disconnect`, and `POST /meta/disconnect`.
*   **Design Decision:** Allowing read and disconnect actions ensures downgraded or expired users are never locked out of seeing their integration status or safely disconnecting their Google/Meta accounts.

### B. Cohorts Router (`api/routes/cohorts.js`)
*   **Gate feature key:** `funnels_cohorts`
*   **Scope of gating:** Applied as router-level middleware protecting all weekly and AI-source cohort routes (`GET /weekly`, `GET /ai-source`).

### C. Funnel Analytics (`api/routes/analytics.js`)
*   **Gate feature key:** `funnels_cohorts`
*   **Scope of gating:** Checked at the beginning of the `GET /funnel` handler.

### D. GDPR Retention Settings (`api/routes/gdpr.js`)
*   **Gate feature key:** Checked against `getStructuralLimits(site.plan)` retention limits.
*   **Gating Logic:**
    *   Modified `getSiteForUser` to select the `plan` column from the `sites` database table.
    *   Gated `PUT /retention` so that:
        1. Keep-forever retention (`0` days) requires a plan with at least `1825` days allowed (Scale tier).
        2. Selected retention period (`days`) cannot exceed the plan's `retention_days` limit.
*   **Safety Guarantee:** We only block updates that exceed the current plan's allowed limits. Existing retention settings are not mutated automatically, preventing data loss.

---

## 3. Gaps & Deferred Structural Limits (Audit-Only)

The following limits are defined in `PLAN_STRUCTURAL_LIMITS` but remain unenforced on the backend in this session. They are deferred to prevent breaking existing user setups and to keep database transactions lightweight.

| Limit Key | Free | Starter | Growth | Scale | Current Enforcement Status / Gaps |
|---|---|---|---|---|---|
| **Active Sites** | 1 | 1 | 3 | $\infty$ | **Audit-Only:** Enforced in dashboard UI forms, but not verified on backend site creation/ingest. |
| **Team Seats** | 1 | 1 | 3 | 99 | **Audit-Only:** Enforced in settings UI forms, but backend does not check member counts on invitation. |
| **Monthly Conversions** | 30 | 150 | 750 | 2500 | **Audit-Only:** Event ingestion never checks or drops events exceeding conversion caps. |

### Technical Rationale for Deferral:
*   *Performance Impact:* Querying current active site count, team membership count, or monthly conversion totals on every ingestion event or creation action adds database load.
*   *Upgrade Flow:* Restricting these limits on the backend requires graceful alert flags in the UI and migration paths for existing accounts that exceed their limits.

---

## 4. Hard Constraints Preserved
*   **No Price Changes:** No changes were made to pricing plans, pricing variables, or values.
*   **No Pageview/Event Limit Adjustments:** Allowed volumes remain unchanged.
*   **No Stripe IDs Modified:** Sandbox and production Stripe mapping IDs are unchanged.
*   **No Migrations:** Database schemas remain identical.
