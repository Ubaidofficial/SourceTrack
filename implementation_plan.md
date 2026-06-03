# Implementation Plan — Paid Beta Launch Preparation

Map out the exact path to paid beta, outlining what is already built, what needs QA, what needs actual code, and the session roadmap aligned with the revised telemetry priorities.

---

## 1. Top 10 Missing/Risky Items Blocking Paid Beta
1. PostHog-Dependent Onboarding Verification: Verification step checks PostHog script ingestion, which frequently fails due to script blocking. Need a direct socket/polling verified-event check.
2. No SourceTrack Doctor Assistant: Checking pixel health is buried in the debugger; no clear, automated dashboard alert panel exists.
3. Deduplication Metrics Invisible: Although deduplication cache is active on the backend, the dashboard doesn't show how many events were deduplicated.
4. No Workspace/Client Site Switcher: Layout hardcodes a single site fetch. Agencies cannot toggle client sites.
5. Weak Plan-Limit Enforcement: Stripe billing tier features are hidden on the UI but the API endpoints do not restrict them on the backend.
6. Manual Spend Input Limitations: Daily spend is manually entered. A simple spreadsheet importer or direct manual input is present but needs to be user-friendly.
7. No Broken Pixel Alerts: If the tracker stops firing, the user is never notified.
8. Stripe Webhook Sync Incompleteness: Basic subscription lifecycle synchronization is not fully bulletproof.
9. Missing Custom Property Explanations: Timeline displays custom event keys but does not explain what they mean for the business type.
10. Documentation Domain Gaps: Some references to old domain patterns still exist in help pages.

---

## 2. Items Already Present — Do NOT Rebuild
- Persistent Tracker Ingestion: Tracker ID generation, parameter parsing, pageviews, and conversions capturing.
- Single-Touch Attribution Calculations: In-query left joins for first-touch, last-touch, and non-direct variants.
- Conversion Timelines Modal: Explanation modal with event-by-event timeline and skipped touches.
- Sessionization Logic: 30-minute inactivity session reconstruction.
- AI Referrals Normalization: Classification of AI engines into AI Search.
- Saved Reports CRUD: Saved reports database table persistence and routing.
- Public Dashboards: Sharing dashboard tokens and read-only views.

---

## 3. Items Needing Runtime QA Only
- Legacy Attribution Date Truncation: Trace that historical pageviews are mapped to conversions correctly.
- Tracker Parameter Ingestion: Verify that ref_param, source_param, and via_param propagate down to conversions.
- Dashboard Fallback States: Simulate Supabase failure and verify the dashboard displays unavailable cards.
- Super Admin Previews: Verify that super admin users can inspect sites and write QA logs.

---

## 4. Items Needing Actual Implementation
- Step-by-Step Pixel Testing Assistant: In-app webhook validator.
- Automated Pixel Health Agent: Nightly crontab alerting on zero-event sites.
- Deduplication Visibility Counter: Ingest event metadata.
- Layout Client Switcher: Dropdown navbar addition.
- Backend Tier Limits Enforcer: Global middleware checking plan permissions.

---

## 5. Session-by-Session Plan

### Session 102.1 — Snippet Installation Verification Assistant
Goal: Replace PostHog-based onboarding verification with a direct check for a recent SourceTrack-ingested event.
Why: Self-serve onboarding depends on reliable verification.
Files involved:
- dashboard/src/pages/Onboarding.jsx
- api/routes/install.js
Validation:
- node --check api/routes/install.js
- cd dashboard && npm run build
Paid beta blocker: Yes.
Public launch blocker: Yes.

### Session 102.2 — SourceTrack Doctor & Tracking Health Alerts
Goal: Daily script checks if active sites have received pageviews in the last 48 hours and inserts a high-severity alert if silent.
Why: Warns users proactively if their site layout changes broke the tracking script.
Files involved:
- api/jobs/health-agent.js
- api/routes/dashboard.js
Validation:
- node --check api/routes/dashboard.js api/jobs/health-agent.js
Paid beta blocker: Yes.
Public launch blocker: Yes.

### Session 102.3 — Conversion Deduplication UI Visibility
Goal: Expose the number of deduplicated conversions in the Event Debugger page.
Why: Proves that order ID/event ID deduplication is working and protecting customer numbers.
Files involved:
- dashboard/src/pages/EventDebugger.jsx
- api/routes/events.js
Validation:
- cd dashboard && npm run build
- node --check api/routes/events.js
Paid beta blocker: No.
Public launch blocker: Yes.

### Session 102.4 — Layout Client Site Switcher Dropdown
Goal: Allow users to toggle between different sites associated with their company membership.
Why: Agencies and multi-project founders cannot use the app properly otherwise.
Files involved:
- dashboard/src/components/Layout.jsx
- dashboard/src/pages/Dashboard.jsx
Validation:
- cd dashboard && npm run build
Paid beta blocker: Yes for agencies.
Public launch blocker: Yes.

### Session 102.5 — Server-Side Plan Feature Gate Middleware
Goal: Restrict paid-tier features at the API route level, not only in the UI.
Why: Prevents tech-savvy users from bypassing UI feature locks.
Files involved:
- api/middleware/tier-check.js
- api/routes/attribution.js
Validation:
- node --check api/middleware/tier-check.js api/routes/attribution.js
Paid beta blocker: No.
Public launch blocker: Yes.

### Session 102.6 — Export & Share Scope Security Hardening
Goal: Ensure CSV exports and public dashboard share tokens cannot leak cross-site data.
Why: Security check to prevent share-token or site-scope leakage.
Files involved:
- api/routes/export.js
- api/routes/public-dashboard.js
Validation:
- node --check api/routes/export.js api/routes/public-dashboard.js
Paid beta blocker: Yes.
Public launch blocker: Yes.

### Session 102.7 — Public Docs & Ingest Domain Cleanup
Goal: Clean up remaining domain mismatches so docs and snippets match live production endpoints.
Why: Prevents users from installing old or incorrect hosts.
Files involved:
- dashboard/src/pages/Docs.jsx
- dashboard/src/pages/Snippet.jsx
Validation:
- cd dashboard && npm run build
Paid beta blocker: No.
Public launch blocker: Yes.

---

## 6. First 3 Immediate Sessions
1. Session 102.1 — Snippet Installation Verification Assistant
2. Session 102.2 — SourceTrack Doctor & Tracking Health Alerts
3. Session 102.3 — Conversion Deduplication UI Visibility
