# SourceTrack Repeatable QA Scripts

This directory contains standalone, dependency-free verification scripts for validating the codebase state and checking live API deployment logic before launching publicly.

## 1. Static Launch QA Check

This script checks files recursively to identify syntax errors, forbidden marketing claims, unredacted tracking strings, missing plan-feature gates, correct router mounts, and git statuses.

### Usage

Run from the repository root:

```bash
node scripts/qa-static-launch-check.mjs
```

NPM script alias:

```bash
npm run qa:static
```

### Checks Performed

1. **Git Status & History** — Prints short status lists and the last 10 commits.
2. **Backend Syntax** — Runs `node --check` against all Express app routers, libraries, and middlewares.
3. **Frontend Build** — Checks that the Vite dashboard builds correctly into the product target (`/dashboard/dist`).
4. **Whitespace** — Audits git lines for trailing whitespaces or leftover merge conflict indicators (`git diff --check`).
5. **Forbidden Copy & Leaks** — Searches user-facing code and trackers to verify that PostHog references, compliance assertions, and outdated trackiq signatures are completely absent. Mentions in session logs or markdown documentation files are printed as neutral warnings only.
6. **Route Mounts** — Verifies that all expected endpoints (e.g. `/api/conversion/offline` or `/api/campaign-costs`) are registered on the application router.
7. **Security Scoping & Gates** — Analyzes file structure to confirm query parameters are redacted, database selects exclude confidential customer credentials, and `requireFeature` is imported in gated paths.

---

## 2. Runtime Ingestion Smoke Checks

This script runs endpoint routing checks against a running local or production API instance to confirm tracking and identity operations succeed.

### Config Environment Variables

Configure environment variables before executing the script:

- `SOURCETRACK_API_URL` — Target host URL (defaults to `http://localhost:3000`).
- `SOURCETRACK_SITE_KEY` — Valid site key identifier.
- `SOURCETRACK_AUTH_TOKEN` — Optional dashboard access session JWT token (required to test authenticated stats endpoints).

### Usage

Run from the repository root:

```bash
# Set parameters locally or run against production targets
SOURCETRACK_API_URL=https://api.srctk.com \
SOURCETRACK_SITE_KEY=your_site_key \
SOURCETRACK_AUTH_TOKEN=your_auth_jwt_token \
node scripts/qa-runtime-smoke.mjs
```

NPM script alias:

```bash
npm run qa:smoke
```

### Endpoints Verified

- `GET /health` — Verifies server is active and reachable.
- `POST /api/track` — Dispatches a pageview payload containing mock parameters and checks for successful ingestion.
- `POST /api/conversion` — Dispatches purchase conversions with mock order IDs and values.
- `POST /api/conversion` (duplicate check) — Sends the same conversion to check deduplication skipping features.
- `POST /api/conversion/offline` — Exercises the REST offline Lead integration route.
- `GET /api/install/status` — Checks telemetry verifications.
- `GET /api/sites` (auth required) — Evaluates company site loading parameters and ensures Stripe identifiers are not leaked.
- `GET /api/dashboard/tracking-health` (auth required) — Checks SourceTrack Doctor diagnostics.
- `GET /api/events/dedupe-summary` (auth required) — Verifies duplicate metrics calculations.

---

## 3. Edge-Case QA Validation

This script performs stress-tests on the running local or production API instance, validating site key authorization, URL/referrer PII redaction, positive/negative conversion values, duplicate order IDs, offline identity binding, public dashboard scope override protections, private data field leaks, and plan feature gating.

### Config Environment Variables

Configure environment variables before executing the script:

- `SOURCETRACK_API_URL` — Target host URL (defaults to `http://localhost:3000`).
- `SOURCETRACK_SITE_KEY` — Valid site key identifier.
- `SOURCETRACK_BAD_SITE_KEY` — Invalid site key identifier (defaults to `qa_invalid_site_key`).
- `SOURCETRACK_AUTH_TOKEN` — Optional JWT authorization token.
- `SOURCETRACK_PUBLIC_SHARE_TOKEN` — Optional public share token identifier.

### Usage

Run from the repository root:

```bash
# Set parameters locally or run against production targets
SOURCETRACK_API_URL=http://localhost:3000 \
SOURCETRACK_SITE_KEY=your_site_key \
SOURCETRACK_AUTH_TOKEN=optional_jwt \
SOURCETRACK_PUBLIC_SHARE_TOKEN=optional_share_token \
npm run qa:edge
```

### Endpoints Verified

- `POST /api/track` & `POST /api/conversion` — Verified with missing, invalid, and malformed site keys.
- `POST /api/track` (PII query parameters) — Verified that values containing emails/tokens/phones do not cause crashes.
- `POST /api/conversion` (malformed conversions) — Verified with missing/negative/non-numeric conversion values.
- `POST /api/conversion/offline` (offline validation) — Verified with missing anonymous/user identities, missing conversion type, invalid values, and valid payloads.
- `GET /api/install/status` — Verified handling of missing, invalid, and valid site keys.
- `GET /api/public/:token` — Verified that override query parameters (`site_key`, `site_id`, etc.) are blocked.
- `GET /api/sites` — Verified that Stripe customer identifiers or public share tokens are never leaked to client views.
- `GET /api/attribution` & `GET /api/export/report` — Can verify plan gate behavior when auth and suitable test-plan credentials are provided.

---

## 4. Disclaimers

* **No Replacement for Manual browser QA:** While these scripts verify compilation, parameter redaction rules, and API payloads, they do not replace human visual review of dashboard elements, layout state reactiveness, or onboarding step navigations.
