# SourceTrack / TrackIQ Docs Truth Audit

This document maps the findings of our paid-beta docs truthfulness audit, current capabilities, files corrected, and remaining future/unsupported claims to avoid.

## 1. Claims Audited & Current Truth

| Feature Area | Documented Claim | Current Truth / Capabilities | Status |
| :--- | :--- | :--- | :--- |
| **Pricing & Limits** | `starter`, `growth`, and `scale` pricing plans and pageview limits. | Pageview default limits (5k, 50k, 150k, 500k) and conversions (30, 150, 750, 2500) are fully consistent between frontend, backend, and pricing cards. Legacy `pro`/`agency`/`business` names are correctly aliased. | **Aligned** |
| **Canonical Tracker Paths** | Usage of `/tracker.min.js` and `/tracker.cookieless.min.js`. | Root-relative paths are canonical. Documentation, solution pages, and developer guides have been standardized. | **Corrected** |
| **Install Verification** | Script active status check. | Verification checks event database ingestion and registered domain mismatch. UI copy has been softened to make this clear, but developer/help guides needed sync. | **Aligned** |
| **Privacy & GDPR** | "privacy-compliant cookieless mode" | Cookieless mode rotates visitor hashes daily and doesn't write to storage. However, saying "privacy-compliant" is a legal warranty we must avoid. Standardized to "privacy-conscious". | **Corrected** |
| **Stripe & PostHog Deletion** | GDPR erasure completeness. | Deletion in database is complete. PostHog erasure is documented as best-effort. Stripe billing records are preserved for tax compliance. | **Aligned** |
| **Ad Platform Sync** | "Automatic Google/Meta ad cost sync" | Not implemented natively. Integrations page puts Google/Meta Ads under `FUTURE_INTEGRATIONS`. Sync options only render if credentials are saved. Cost imports are manual CSVs. | **Aligned** |
| **Google Search Console** | GSC / SEO revenue integration. | Endpoints are gated on the backend via the `gsc_seo_revenue` gate. Connection/Manage card in the Integrations UI is gated on the frontend. | **Corrected** |
| **Backup & PITR** | Disaster recovery options. | Runbook (`docs/backup_recovery.md`) is brutally honest that Supabase backup and PITR configurations must be verified in the provider UI and are not checked repository-side. | **Aligned** |

---

## 2. Files Corrected

### Standardizing Tracker Paths to Canonical Root Paths:
- **[README.md](file:///Users/ubaid/Desktop/trackiq/README.md)** (Updated architecture diagram and script paths)
- **[dashboard/src/pages/Analytics.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Analytics.jsx)**
- **[dashboard/src/pages/Integrations.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Integrations.jsx)**
- **[dashboard/src/pages/Settings.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Settings.jsx)** (Standardized cookieless snippet to `/tracker.cookieless.min.js`)
- **[dashboard/src/pages/SolutionLeadGen.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/SolutionLeadGen.jsx)**
- **[dashboard/src/pages/SolutionEcommerce.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/SolutionEcommerce.jsx)**
- **[dashboard/src/pages/SolutionAgency.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/SolutionAgency.jsx)**
- **[dashboard/src/pages/SolutionSaaS.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/SolutionSaaS.jsx)**
- **[dashboard/src/pages/docs/DocsFramer.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsFramer.jsx)**
- **[dashboard/src/pages/docs/DocsShopify.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsShopify.jsx)**
- **[dashboard/src/pages/docs/DocsWebflow.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsWebflow.jsx)**
- **[dashboard/src/pages/docs/DocsWordPress.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsWordPress.jsx)**
- **[dashboard/src/pages/docs/DocsGTM.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsGTM.jsx)**
- **[dashboard/src/pages/docs/DocsQuickstart.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/docs/DocsQuickstart.jsx)**
- **[dashboard/src/pages/developers/DevelopersTracker.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersTracker.jsx)**

### Software/Docs Compliance & Softening Copy:
- **[dashboard/src/pages/developers/DevelopersTracker.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersTracker.jsx)** (Replaced "privacy-compliant" with "privacy-conscious")

### GSC Connection Frontend Gate:
- **[dashboard/src/pages/Integrations.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Integrations.jsx)** (Added `hasFeature(site?.plan, 'gsc_seo_revenue')` gate to connect/manage GSC buttons, displaying lock state for Free/Starter plans)

### Pricing Environment Variable Alignment:
- **[.env.example](file:///Users/ubaid/Desktop/trackiq/.env.example)** & **[README.md](file:///Users/ubaid/Desktop/trackiq/README.md)** (Updated `STRIPE_PRICE_ID_BUSINESS` references to modern canonical `STRIPE_PRICE_ID_SCALE` variable)

---

## 3. Remaining Unsupported/Future Claims to Avoid

- **No automated Facebook/Google Ads spend sync:** We only support CSV cost uploads. Do not promise background API sync without connecting credentials.
- **No universal ad pixel attribution:** Conversion API dispatch depends on users supplying their own platform access tokens and configuring webhook paths manually.
- **No 100% cookieless multi-session tracking:** Daily salt rotation means cookieless visitors reset daily. Multi-session and first-touch attribution require the standard storage-based tracker.
- **No legal compliance guarantees:** Keep marketing text focused on "privacy-friendly," "privacy-conscious," and "low-risk" configurations.
