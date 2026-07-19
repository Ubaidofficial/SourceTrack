# SourceTrack vs DataFast Parity & Simplicity Audit — QA Report (Session 140G-27)

**Date:** 2026-06-15
**Session:** 140G-27 — SourceTrack vs DataFast Feature-Parity + Simplicity Audit
**Branch:** `main` (No automatic commits or pushes)
**Status:** PENDING REVIEW — not committed
**Environment:** Staging / Local Code Audit
**Verdict:** 🟡 **PARTIAL PARITY — IMPLEMENTATION OUTSTANDING PENDING V1 REFRESH & BROWSER QA**

---

## 1. Executive Summary

This session conducts a rigorous feature-parity and simplicity audit benchmarking SourceTrack's feature set, telemetry ingestion, attribution engine, and founder UX against the competitor benchmark **DataFast**. The audit reviews the codebase and the **V1.1 Design & Product Spec** to identify gaps, verify alignment with the design system, and highlight recommendations to enhance and simplify telemetry workflows.

### Overall Verdict:
*   **Parity Level:** 🟡 **PARTIAL PARITY** (SourceTrack matches basic UTM/referral parsing and provides a unified single-touch attribution engine, but does not offer automated ad network cost syncing or native Stripe/Shopify oauth app integrations).
*   **UX & Simplicity:** 🟡 **PARTIAL** (Design direction is strong, but implementation parity remains PARTIAL pending the final V1 UI refresh and browser QA).
*   **Aesthetics Alignment:** 🟡 **PARTIAL** (Design system is documented; final UI implementation not yet verified in browser).

---

## 2. Parity Matrix: SourceTrack vs. DataFast

| Functional Area | DataFast Support | SourceTrack V1 Support | Evidence in SourceTrack Codebase | Verdict / Status | Recommendation / Fix |
|---|---|---|---|---|---|
| **Tracker Script Setup** | ✅ Single lightweight pixel tag | ✅ Single script (`tracker.js` / 4.8KB minified) | `tracker/tracker.js` | 🟢 **PASS (Code Inspected)** | Keep script minified via `npm run build:tracker`. |
| **UTM & Referral Parsing** | ✅ Extracts standard UTM parameters & referrers | ✅ Extracts UTMs, click IDs, partner overrides | `tracker/tracker.js#L125` / `api/lib/channel-classifier.js` | 🟢 **PASS (Code Inspected)** | Capture overrides safely in proxy routes. |
| **Organic AI Search Tracking** | ❌ None (grouped as generic organic/referral) | ✅ Automatic identification of 22 AI referrers (e.g. Claude, Gemini, ChatGPT) | `api/lib/channel-classifier.js` (`AI_REFERRER_DOMAINS` + `AI_DOMAINS_MAP`) | 🟢 **PASS (Code Inspected)** | SourceTrack differentiator. Expose AI sources prominently in Dashboard. |
| **Attribution Models** | ✅ Single-touch model configurations (First, Last, etc.) | ✅ 5 Single-touch models + W/U-shape and linear formulas | `api/lib/attribution-engine.js` / `MODELS` mapping in `Dashboard.jsx` | 🟢 **PASS (Code Inspected)** | Verify lookback window compliance. |
| **Visitor Journeys** | ⚠️ Flat conversions listing | ✅ Expandable step-by-step visitor timeline, click params, skipped touchpoints | `dashboard/src/pages/Journey.jsx` / `ConversionExplanationModal.jsx` | ⚠️ **PARTIAL (Not Browser Verified)** | Journeys render on mock UI, but E2E database stitching is unverified in browser. |
| **Stripe / Payment Ingestion** | ✅ Native payment app sync & MRR subscription tracking | ⚠️ Ingests Stripe test-mode webhook conversions only | `api/routes/stripe-webhook.js` (checkout.session.completed only) | ⚠️ **PARTIAL (Not Browser Verified)** | Stripe checkout.session.completed hook is parsed, but E2E webhook updates are unverified. |
| **Shopify Integration** | ✅ One-click app install | ⚠️ Manual Shopify Admin webhook recipe | `api/routes/shopify-webhook.js` | ⚠️ **PARTIAL (Not Browser Verified)** | Script verified via code inspection, but Shopify webhook signature verification is unverified. |
| **Ad spend / ROAS Ingestion** | ✅ Auto-syncs Meta, Google, TikTok Ads API spend | ⚠️ Manual CSV/Paste ad cost imports + manual campaigns CRUD | `api/routes/campaign-costs.js` / `dashboard/src/pages/Campaigns.jsx` | ⚠️ **PARTIAL (Not Browser Verified)** | Ingestion routes exist, but spreadsheet upload is unverified in browser. |
| **Lead Qualification** | ❌ None (revenue focus only) | ✅ Workflow signals (Unqualified, Qualified, MQL, SQL) | `api/routes/conversion-offline.js` / `lead_qualifications` table | ⚠️ **PARTIAL (Not Browser Verified)** | Qualification status updates DB successfully, but browser dropdown action remains unverified. |
| **Saved & Pinned Reports** | ⚠️ Default dashboards | ✅ Customizable Report Builder, custom parameters, dashboard pinning | `api/routes/saved-reports.js` / `dashboard/src/pages/ReportBuilder.jsx` | ⚠️ **PARTIAL (Not Browser Verified)** | CRUD API is verified, but ReportBuilder UI transitions are unverified in browser. |

---

## 3. Product Simplicity & Founder UX Audit

Evaluating SourceTrack against the "5-second rule" (every primary screen must answer one main question in five seconds):

1.  **Dashboard Overview (`/dashboard`):**
    *   *Question:* Is growth working, and where did it come from?
    *   *Status:* 🔴 **NOT BROWSER VERIFIED / PARTIAL.** KPI tiles render based on business type, but the visual presentation of charts, active widgets, and the AI Inbound Referrals hero card are not browser-verified on staging.
2.  **All Leads (`/leads`):**
    *   *Question:* Who converted, from where, and are they qualified?
    *   *Status:* 🔴 **NOT BROWSER VERIFIED / PARTIAL.** Lead profile lists, qualification badge dropdowns, and "View Journey" modals are unverified in browser.
3.  **Campaigns (`/campaigns`):**
    *   *Question:* Which campaigns are bringing traffic, conversions, and revenue?
    *   *Status:* 🔴 **NOT BROWSER VERIFIED / PARTIAL.** The campaigns page needs the updated V1 spec implemented: read-only performance tracking, no ad-management actions, no cost metrics without cost data, compact empty states, and no fake ROAS/CPL/CAC.
4.  **Journey Panel (`/journey` or detail drawers):**
    *   *Question:* What path did this visitor take before converting?
    *   *Status:* 🔴 **NOT BROWSER VERIFIED / PARTIAL.** Story cards, profile facts, and touchpoint connector styles are unverified in browser.

---

## 4. Stricter DataFast Parity Gaps

To understand how SourceTrack compares to DataFast, the following key parity gaps are documented:

*   **Install & Onboarding Simplicity:** DataFast auto-detects the first visitor pageview instantly to verify script installation. SourceTrack's Setup Doctor relies on synchronous/polling-based checks against recent database records, which is slower and more prone to timeout blocks.
*   **Payment Provider Setup:** DataFast connects to payment systems via one-click OAuth integrations. SourceTrack requires manually copying endpoint URLs and signing secrets to Stripe developers' dashboards.
*   **Shopify Setup Ease:** DataFast is a native Shopify App. SourceTrack requires configuring Shopify Admin webhook recipes manually.
*   **Google Search Console (GSC) Integration:** GSC setup on staging is currently broken because the OAuth callback redirects to the production API domain instead of the staging domain. Additionally, query-level revenue is estimated by matching landing pages, which requires strict truth labels.
*   **Daily Dashboard Clarity:** DataFast provides clean, pre-built widget matrices. SourceTrack provides a customizable Report Builder, but lacks standard pre-configured dashboard cards by default.
*   **Analytics Depth:** SourceTrack focuses heavily on attribution. It lacks native charts for generic analytics depth (e.g. returning vs. new visitor ratios, unique page view stats, bounce rate trends) on the main dashboard overview.
*   **Attribution Accuracy & Data Quality:** DataFast uses simple cookies. SourceTrack uses a complex identity stitching flow (`site_identity_links`) and daily-rotating salt hashes for cookieless tracking. However, data quality checks are only visible in a raw debugger list, whereas DataFast hides technical data failures from non-technical users.
*   **Docs & API Completeness:** The JavaScript tracker APIs (`optIn()`, `optOut()`, queue flushing) are implemented in the tracking script but are not documented on user-facing pages, creating gaps in API completeness.
*   **Browser-Verified UX Status:** Programmatic browser verification has not been completed on staging for any primary user flow (onboarding steps, custom report generation, stripe portals), leaving the live UX quality unproven.

---

## 5. Not Browser Verified (Staging QA Backlog)

The following claims and features are **unverified in browser** and require E2E validation:
1.  **Aesthetic alignment:** Inter font loading, card borders contrast, and dark mode transitions.
2.  **Dashboard Overview:** Main analytics line charts, hover states, and dynamic KPI configurations.
3.  **Recent Leads list:** Row selections, pagination, and lead qualification status updates.
4.  **Campaign Performance:** Spreadsheet import validations, import history logs, and spend-based ROAS/CPL calculations.
5.  **Revenue/Cost Metric Gating:** Verification that cost metrics (Spend, ROAS, CAC, CPL) and revenue columns are completely hidden when no data exists.
6.  **GSC Truth Labels:** Estimated query-revenue disclosures displaying under Search terms.
7.  **AI Source Chips:** Emerald, orange, purple, and blue custom AI brand chips rendering cleanly in the overview table.
8.  **Report Builder presets:** Loading, pinning, and duplicate/delete confirmation modal escapes.

---

## 6. Actionable Next Steps & Recommendations

1.  **Stripe Test-Mode E2E Verification (P0):** Execute manual staging checkout sessions to confirm that webhooks successfully write to the staging database and trigger subscription status updates.
2.  **Google Search Console Callback Redirect Fix (P0):** Correct the OAuth callback URI logic in `google-search-console.js` to utilize the staging domain instead of production routes.
3.  **V1 UI Implementation (P1):** Ensure the final V1 UI refresh (read-only campaigns page, clean empty states, no ad platform pause/budget controls) is implemented from the approved specifications.
4.  **Competitor Parity Browser QA (P1):** Run manual browser validations (using Canary profiles) to verify that SourceTrack's onboarding, dashboard, and report builder workflows match the simplicity benchmarks of DataFast and PiQo.
