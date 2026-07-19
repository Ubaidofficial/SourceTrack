# Attribution Accuracy + Signal Reliability Audit
**Session:** 140Z-G3-D14
**Status:** PARTIAL PASS (Audit & Local Testing Only)
**Date:** 2026-06-20

## Goal
Audit SourceTrack’s attribution accuracy and signal reliability before paid beta. This was an evidence-first audit/hardening session focusing on tracker ingestion, the attribution engine, conversion/revenue signals, dashboard truth, and existing tests/docs.

## 1. Code Audit Findings (Source Inspection Only)

### Tracker Ingestion (`tracker.js`, `api/routes/track.js`, `api/routes/conversion.js`)
- **Opt-out & Exclusions:** `navigator.doNotTrack` and `globalPrivacyControl` are configured to be respected before processing. Hard path exclusions are present in the code.
- **Cross-Domain:** Code for `__st_id` and `__st_ft` exists to append to URLs and read out string parameters.
- **UTMs & Click IDs:** 16 separate parameters (UTMs, `gclid`, `fbclid`, etc.) and `ai_source` domains are mapped to the event stream in the codebase.
- **PII Redaction:** `redactPiiFromObject` is called on both tracking and conversion routes for properties before PostHog dispatch.

### Attribution Engine (`api/lib/attribution-engine.js`)
- **Direct Traffic Handling:** Non-direct models are written to ignore empty or 'direct' touchpoints to prevent organic source overwrite.
- **AI Sources:** Multi-domain detection logic is present for major AI platforms (`chatgpt.com`, `claude.ai`, `gemini.google.com`, etc.).

## 2. Deterministic Test Findings (PASS)
- **Local Unit Math:** `npm run qa:attribution` runs the deterministic test harness and successfully validates the math logic for First-touch, Last-touch, Linear, Time-Decay, U-Shaped, and W-Shaped models.

## 3. Data Truth & Gating Findings (Source Inspection Only)
- **Revenue Truth Gating:** Conversions capture what the client posts (e.g., Stripe webhooks or standard js api). No fake placeholder revenue is generated on the backend.
- **Cost / ROAS UI Gating:** Found defensive UI checks in `dashboard/src/pages/Campaigns.jsx` and `ReportBuilder.jsx`. ROAS and CPA explicitly warn and suppress if total spend is 0, or if Spend currency and Conversion currency mismatch.
- **Truthful Copy:** Strict codebase grep for overclaims like "100% accurate", "perfect attribution", "exact keyword" returned zero user-facing violations.

## 4. Missing Deployed Attribution E2E (FAIL/BLOCKED)
- **`npm run qa:attribution` Integration Tests:** The `qa-attribution-integration.mjs` test fails to find the site and cannot coerce the result because live staging data for E2E attribution validation is missing.
- **Live Sync:** We do not currently have evidence of successful end-to-end attribution syncing across the live staging environment.

## 5. Remaining Risks
- **Real-World E2E:** Source code inspection and local deterministic tests do not guarantee that the tracker, data ingestion pipeline, ClickHouse aggregations, and Supabase functions all successfully communicate in production without data loss.
- **Stripe/Webhook E2E:** Live end-to-end checkout event tracking mapping to conversions needs to be validated.

## Final Verdict
**PARTIAL PASS** — Source code inspection and local mathematical harness testing passed without issue. However, live end-to-end validation of the attribution pipeline is blocked and failing. This gate cannot be fully passed until real staging/production E2E evidence is captured.
