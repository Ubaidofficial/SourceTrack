# End-to-End Install QA
**Session:** 140Z-G3-D16
**Status:** BLOCKED
**Date:** 2026-06-20

## Goal
Verify the product can take a new user from account/site setup to first tracking signal and visible attribution evidence on a deployed domain.

## Constraints & Context
- Must use deployed staging or official production custom domains (no localhost).
- Must not mutate real customer data.
- AI Agent cannot manually click through the UI without explicit test credentials, nor can it install a JavaScript snippet on a separate, live dummy domain without operator provisioning.

## 1. Test account/site used
**BLOCKED.** No safe operator test account credentials (email/password) were provided for the deployed domain. The AI agent cannot safely register a new account on production without potentially triggering real Stripe customer creation or transactional emails.

## 2. Deployed domain(s) tested
Targeting: `https://app.sourcetrack.ai` and `https://api.srctk.com`

## 3. Browser/tool method used
AI Agent / Automated API tools. (Manual operator execution is required for full snippet install on a live dummy host).

## 4. Step-by-step install flow results
1. **Open deployed app:** PASS. (Verified `https://app.sourcetrack.ai/login` is reachable via static smoke tests).
2. **Sign up or log in with a safe operator/test account:** **BLOCKED.** Lacking test credentials or a seeded staging fixture.
3. **Create or select a safe test site:** **BLOCKED.**
4. **Get/install/copy the tracking snippet:** **BLOCKED.**
5. **Trigger a pageview/event from a deployed or safe test page:** **BLOCKED.** Requires an external live dummy domain (e.g., Vercel, Netlify, or Shopify test store) to host the snippet.
6. **Confirm first event received:** **BLOCKED.**
7. **Trigger a conversion using the supported test path/API:** **BLOCKED.**
8. **Confirm conversion received:** **BLOCKED.**
9. **Confirm source/UTM/referrer attribution is visible:** **BLOCKED.**

## 5. Snippet copy/install verification
**BLOCKED.** Cannot verify without operator test account.

## 6. Network request evidence
**BLOCKED.** Cannot capture network requests without a live test site firing the tracker.

## 7. First event received evidence
**BLOCKED.**

## 8. Conversion capture evidence
**BLOCKED.**

## 9. Attribution/source visibility evidence
**BLOCKED.**

## 10. Console/network errors
**BLOCKED.**

## 11. UX/friction findings for non-technical users
**BLOCKED.** Cannot evaluate the live UX without credentials.

## 12. Bugs/blockers found
**Blocker 1:** The AI agent lacks a safe, seeded operator test account on the deployed environment.
**Blocker 2:** The AI agent lacks a live, external dummy website to embed the `track.js` snippet into for real cross-domain telemetry verification.

## 13. Exact changes made
- Created `docs/qa/end_to_end_install_qa_140Z-G3-D16.md`.
- Appended session status to `SESSION_STATE.md`, `SESSION_LOG.md`, and `SESSION_HANDOFF.md`.
- No application code was changed.

## 14. Full raw diff
*(Verified in terminal output)*

## 15. Validation output
*(Verified in terminal output)*

## 16. Safety grep output
*(Verified in terminal output)*

## 17. Git status
*(Verified in terminal output)*

## 18. Final verdict
**BLOCKED.** The End-to-End Install QA cannot be executed by the AI agent without a seeded operator test account and an external dummy site for snippet installation. The release gate remains blocked pending manual operator execution or provision of test credentials.
