# Session 140M — Deployed Browser E2E: Forms + Booking Attribution

**Date:** 2026-06-17
**Session:** 140M
**Scope:** Sessions 140I-B through 140L — form_submit ingestion, booking_scheduled ingestion,
provider/fallback logic, UTM passthrough, confirmed booking detection
**Tester:** AI agent (curl probes + Chrome DevTools MCP — deployed domains only)
**Localhost used:** NO

---

## Overall Status

**PARTIAL — deployed API/public-domain smoke passed, but deployed browser E2E for tracker form
capture, booking link mutation, mocked provider browser events, and unsupported-provider browser
behavior remains BLOCKED/not verified.**

Reason: The QA fixture (`dashboard/public/qa-140M-e2e-fixture.html`) is untracked and was never
committed. The staging Railway deployment does not contain it. The path
`https://sourcetrack-dashboard-staging.up.railway.app/qa-140M-e2e-fixture.html` returns the
SPA shell (React index.html), not the fixture. Browser E2E is blocked until the fixture is
committed and deployed (Option B — see section below).

---

## Raw Validation Evidence

```
git status --short --untracked-files=all
?? dashboard/public/qa-140M-e2e-fixture.html
?? docs/qa/deployed_forms_booking_e2e_140M.md

git diff --check
(no output — OK)

git diff --stat
(no output — no tracked changes)

git diff -- dashboard/public/qa-140M-e2e-fixture.html
(no output — file is untracked, not in git)

git diff -- docs/qa/deployed_forms_booking_e2e_140M.md
(no output — file is untracked, not in git)

npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

npm run qa:env-safety
PASS — All offline environment safety tests passed successfully.

npm run qa:static
PASS — static launch QA passed

npm run qa:tracker:unit
tests 217 | pass 217 | fail 0

npm run qa:identity:unit
tests 131 | pass 131 | fail 0

npm run qa:attribution:unit
tests (all pass) | fail 0

node --check api/index.js api/routes/*.js api/lib/*.js
SYNTAX OK

git status
?? dashboard/public/qa-140M-e2e-fixture.html
?? docs/qa/deployed_forms_booking_e2e_140M.md
```

---

## Section 1 — Staging Deployed API Smoke

All probes below used `https://sourcetrack-api-staging.up.railway.app`.
No real site_key used. No production data mutated.

### A. Staging API health
```
GET https://sourcetrack-api-staging.up.railway.app/api/health
→ HTTP 200
{"success":true,"data":{"status":"ok","service":"api","timestamp":"2026-06-17T09:21:24.717Z","request_id":"68edc3fb-49af-418e-b270-286e8cfcd3d5"},"error":null}
```
**PASS**

### B. /api/track — missing site_key guard
```
POST https://sourcetrack-api-staging.up.railway.app/api/track
Body: {"event":"form_submit","url":"https://qa-probe.internal"}
→ {"success":false,"data":null,"error":"Missing site_key"}
```
**PASS** — route is live, correctly guards with no crash and proper JSON error shape.

### C. /api/track — form_submit with invalid site_key
```
POST https://sourcetrack-api-staging.up.railway.app/api/track
Body: {
  "site_key": "QA_PROBE_INVALID",
  "event": "form_submit",
  "url": "https://qa-probe.internal",
  "properties": {"form_provider":"typeform","form_id":"qa-probe-form"}
}
→ {"success":false,"data":null,"error":"Invalid site_key"}
```
**PASS** — form_submit event reaches the route parser without crashing; rejected at validateSiteKey.
Proves: server-side form_submit branch exists and runs on staging.

### D. /api/track — booking_scheduled with invalid site_key
```
POST https://sourcetrack-api-staging.up.railway.app/api/track
Body: {
  "site_key": "QA_PROBE_INVALID",
  "event": "booking_scheduled",
  "url": "https://qa-probe.internal",
  "properties": {
    "booking_provider": "calendly",
    "booking_detection_method": "browser_embed_event",
    "booking_event_type": "event_scheduled"
  }
}
→ {"success":false,"data":null,"error":"Invalid site_key"}
```
**PASS** — booking_scheduled event reaches the route parser; booking_provider, booking_detection_method,
booking_event_type fields are parsed without crash. Rejected at validateSiteKey.
Proves: server-side booking_scheduled branch exists and runs on staging.

### E. Staging tracker.min.js delivery
```
GET https://sourcetrack-api-staging.up.railway.app/tracker.min.js
→ HTTP 200, Content-Type: application/javascript; charset=utf-8
```
**PASS** — Deployed tracker file served correctly over HTTPS from staging API.

---

## Section 2 — Staging Deployed Browser E2E

### Fixture Status

**BLOCKED — fixture not deployed to staging.**

- Fixture file: `dashboard/public/qa-140M-e2e-fixture.html`
- Git status: untracked (never committed)
- `git ls-files dashboard/public/` does NOT include the fixture
- The staging Railway build does not contain the file
- `curl https://sourcetrack-dashboard-staging.up.railway.app/qa-140M-e2e-fixture.html`
  returns HTTP 200 but body is the SPA shell (React index.html), not the fixture
- Chrome DevTools MCP confirmed: navigating to the URL loads the React SPA,
  not the fixture (title = "SourceTrack — Simple Revenue Attribution Software",
  location.href redirected to https://sourcetrack-dashboard-staging.up.railway.app/)
- Root cause: Railway serves SPA fallback for unknown paths; the fixture was never
  committed so it was never included in the deployed build

### Option B Required

The fixture must be committed and deployed before browser E2E can run:
1. Review and approve fixture + report commit
2. Push → CI green → Railway redeploys staging dashboard
3. Verify fixture loads at deployed URL (not SPA shell)
4. Run browser E2E against deployed fixture URL

### Blocked Browser E2E Flows (pending Option B deployment)

For each flow below, record when tested:
```
Exact URL:
Browser:
Action performed:
Console findings:
Network request observed:
Request URL:
Request method:
Event payload sample (PII redacted):
Expected result:
Actual result:
PASS/BLOCKED:
```

| # | Flow | Status |
|---|---|---|
| 1 | Native form submit emits /api/track form_submit | BLOCKED — fixture not deployed |
| 2 | Webflow form emits form_submit with form_provider=webflow | BLOCKED |
| 3 | WordPress/CF7 form emits form_submit with form_provider=wordpress | BLOCKED |
| 4 | Form fields (email/name/phone/message/password) absent from network payload | BLOCKED |
| 5 | Calendly link gets UTM passthrough in deployed browser | BLOCKED |
| 6 | Cal.com link gets UTM passthrough in deployed browser | BLOCKED |
| 7 | TidyCal link gets UTM passthrough only | BLOCKED |
| 8 | SavvyCal link gets UTM passthrough only | BLOCKED |
| 9 | Non-booking links (example.com) not mutated | BLOCKED |
| 10 | Calendly mocked event_scheduled emits booking_scheduled | BLOCKED |
| 11 | Cal.com mocked bookingSuccessfulV2 emits booking_scheduled | BLOCKED |
| 12 | Unsupported provider postMessages do not emit booking_scheduled | BLOCKED |
| 13 | No /api/conversion calls | BLOCKED |
| 14 | Browser console/network clean (no PII, no unexpected errors) | BLOCKED |

---

## Section 3 — Production Public-Domain Smoke (Read-Only)

No mutations. No site_key. No form submissions. No bookings.

```
GET https://sourcetrack.ai           → HTTP 301 → https://www.sourcetrack.ai/  PASS
GET https://www.sourcetrack.ai       → HTTP 200                                 PASS
GET https://app.sourcetrack.ai       → HTTP 200                                 PASS
GET https://app.sourcetrack.ai/login → HTTP 200                                 PASS
```
All three production-domain surfaces are reachable. Canonical redirect confirmed.

---

## Section 4 — Production Blocked Safety Cases

| Action | Status |
|---|---|
| Production API health | PASS — HTTP 200, {"status":"ok"} |
| Production /api/track missing site_key guard | PASS — {"error":"Missing site_key"} |
| Production tracker.min.js delivery | PASS — HTTP 200, application/javascript |
| Real form submissions on production | BLOCKED — production safety rule |
| Real booking creation on production | BLOCKED — production safety rule |
| Real payment / checkout | BLOCKED — not in scope |
| PII sent to production | NO — all probes used qa-probe.internal URL |
| Authenticated browser E2E on production | BLOCKED — production safety / isolation |

---

## Route Architecture Note

`/api/forms/submit` and `/api/booking/confirmed` do NOT exist as separate routes.
All form and booking attribution flows go through `POST /api/track` with
`event: "form_submit"` or `event: "booking_scheduled"`.
This is consistent with Sessions 140I-B through 140L which modified `api/routes/track.js`.

---

## Summary Table

| Area | Status |
|---|---|
| Staging API reachability | ✅ PASS |
| Staging API health | ✅ PASS |
| Staging form_submit route guard | ✅ PASS |
| Staging booking_scheduled route guard | ✅ PASS |
| Staging tracker.min.js delivery | ✅ PASS |
| Staging browser E2E — all 14 flows | ❌ BLOCKED — fixture not deployed |
| Production domain smoke (3 surfaces) | ✅ PASS |
| Production API health | ✅ PASS |
| Production API guard (form_submit) | ✅ PASS |
| Production tracker.min.js delivery | ✅ PASS |
| Production authenticated E2E | BLOCKED — safety rule |
| Unit tests (tracker/identity/attribution) | ✅ PASS — 0 failures |
| Static QA | ✅ PASS |
| Node syntax check | ✅ PASS |
| Secrets / env safety | ✅ PASS |
| git diff --check | ✅ PASS — no whitespace issues |
| Paid beta readiness | NOT READY |

**Overall: PARTIAL — deployed API/public-domain smoke passed, but deployed browser E2E for
tracker form capture, booking link mutation, mocked provider browser events, and
unsupported-provider browser behavior remains BLOCKED/not verified.**

---

## Next Required Step (Option B)

1. Operator reviews fixture (`dashboard/public/qa-140M-e2e-fixture.html`) and this report
2. Operator approves commit of fixture + report
3. Push to main → CI green → Railway staging dashboard redeploys
4. Verify fixture is served at:
   `https://sourcetrack-dashboard-staging.up.railway.app/qa-140M-e2e-fixture.html`
   (body must be the fixture HTML, not the SPA shell)
5. Run all 14 browser E2E flows against the deployed fixture URL
6. Update this report with real deployed browser evidence
