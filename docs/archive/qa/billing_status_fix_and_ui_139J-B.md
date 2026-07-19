# Billing Status Endpoint Fix + Staging Billing UI Verification — Session 139J-B

> Date: 2026-06-12
> Scope: **STAGING ONLY** — https://sourcetrack-dashboard-staging.up.railway.app
> Method: code audit + fix, automated QA suite, real browser (Claude in Chrome extension)
> No commits. No pushes. No production. No Stripe secrets / tokens printed.

---

## 1. Verdict

**PASS — local middleware fix validated; Free-plan staging Billing UI browser-verified; post-deploy middleware verification pending/not run.**

The `validateSiteKey` fix (now selects and exposes `stripe_customer_id`) is validated **locally** by
code audit and the automated QA suite. The staging **Free-plan** Billing UI was browser-verified on
the **currently deployed** staging build: plan/usage display, the empty (free, no-customer) state,
the Terms/Privacy gate, and the upgrade CTA (real Stripe **test-mode** checkout session) all work.

**Important — the browser test does NOT prove the fixed middleware is live on staging.** It ran
against the deployed build *before* this `api/middleware/auth.js` change was committed/pushed/deployed.
For a Free site with no existing `stripe_customer_id`, `create-checkout` behaves identically with or
without the fix (`customer: undefined` either way), so the passing CTA only confirms the auth chain +
checkout-session creation on the deployed build — not the fix's customer-resolution path.

> Staging Free-plan Billing UI browser verification: PASS on the currently deployed staging build.
> Middleware fix live-on-staging verification: PENDING / NOT RUN after deployment; browser/live API verification paused.
> Paid-site billing portal flow: NOT VERIFIED; requires a paid staging site/customer.
> Production billing: UNVERIFIED.
> Paid beta: BLOCKED.

---

## 2. Root-Cause Audit (not trusting prior summaries)

Confirmed by reading the code directly:

- The bug is in `api/middleware/auth.js` → `validateSiteKey`. Both `sites` SELECT statements
  (primary + missing-column retry) omitted `stripe_customer_id`, and the constructed `req.site`
  object (the field whitelist) did not include it.
- Every billing route reads `req.site.stripe_customer_id`:
  - `GET /api/billing/status` (`api/routes/billing.js:302`) — `if (site.stripe_customer_id)` was
    always `undefined` → **`subscription` always returned `null`**, even for active subscribers.
  - `POST /api/billing/portal` (`billing.js:275,281`) — `if (!site.stripe_customer_id)` always true
    → **always returned "No Stripe customer — subscribe first"**, even for paying customers (real
    user-facing breakage of "Manage Subscription").
  - `POST /api/billing/create-checkout` (`billing.js:250`) — `customer: site.stripe_customer_id ||
    undefined` was always `undefined` → **could create a duplicate Stripe customer** instead of
    reusing the existing one.
- The `getSiteByKey` fallback in `billing.js` *does* select `stripe_customer_id`, but it only runs
  when `!req.site`, which never happens (the middleware always sets `req.site`), so the fix had to
  be in the middleware.

This matches the blocker recorded in `docs/qa/stripe_staging_e2e_139J.md` §12 (#1).

## 3. Scoping / Security Review

The status/portal/checkout routes already enforce strict scoping via the middleware chain
`requireUserAuth → validateSiteKey → requireSiteMembership`:

- `requireUserAuth` validates the Supabase JWT and sets `req.user` with `company_id` from
  `company_members`.
- `validateSiteKey` resolves the site **only** by `site_key`.
- `requireSiteMembership` enforces `req.site.company_id === req.user.company_id` (or owner fallback
  for legacy company-less sites, or `super_admin` bypass).

So a caller cannot read another tenant's billing by passing a foreign `site_key` — membership is
validated server-side, never trusting the request body's site identity.

Adding `stripe_customer_id` to `req.site` does **not** create a leak:

- No route serializes the whole `req.site` object to a client (grep: no `json(req.site)` / spread).
  All consumers read specific whitelisted fields (`id`, `site_key`, `plan`, `domain`, etc.). Verified
  `setup-doctor.js` (the one helper passed the full `site`) reads only specific fields.
- The billing status response returns only `plan`, `limit`, `subscription` (derived from Stripe),
  and the public `prices` map — it never echoes `stripe_customer_id`.
- No service-role key, raw Stripe secret, or webhook secret is exposed by this change.

## 4. Fix (surgical)

`api/middleware/auth.js`:
- Added `stripe_customer_id` to the primary `sites` SELECT.
- Added `stripe_customer_id` to the missing-column retry SELECT.
- Added `stripe_customer_id: data.stripe_customer_id || null` to the constructed `req.site` object.

No change to the billing routes themselves — they already read `req.site.stripe_customer_id`.
At the code level this single change addresses status (subscription lookup), portal (paying customers
can manage), and checkout (existing-customer reuse). This is validated by audit + the automated QA
suite locally; **live-on-staging verification is pending until the commit is pushed/deployed.**

## 5. Routes Tested (staging)

> **All browser results below ran against the CURRENTLY DEPLOYED staging build, which does NOT yet
> include this `api/middleware/auth.js` fix.** They verify the Free-plan UI on that build; they do
> **not** prove the fixed middleware is live on staging (that is PENDING — see §7).

| Route / Surface | How | Result |
|---|---|---|
| `/billing` page load | real browser (deployed build) | ✅ PASS |
| Current plan + usage display | real browser, read from staging Supabase REST directly | ✅ PASS — "Free / Free Forever", "0 of 5,000 pageviews", 0% |
| Empty / no-customer state | real browser (deployed build) | ✅ PASS — free plan shows upgrade plans; no "Manage Subscription" portal button (correct) |
| Terms/Privacy gate | real browser (deployed build) | ✅ PASS — all 3 upgrade buttons `disabled` until checkbox checked; enable on check |
| `POST /api/billing/create-checkout` (upgrade CTA) | real browser click (deployed build) | ✅ PASS — redirected to Stripe **test-mode** checkout (`cs_test_…`); no payment entered. NOTE: for a Free site with no `stripe_customer_id`, this path behaves identically with or without the fix, so it does **not** exercise the fix's customer-resolution change. |
| Cancel-return to `/billing` | real browser (deployed build) | ✅ PASS — re-renders cleanly, still Free plan |
| `POST /api/billing/portal` (Manage Subscription) | — | ⚠️ NOT VERIFIED — requires a paid staging site/customer; on the Free plan the portal button is correctly hidden. Fix verified by code/audit only. |
| `GET /api/billing/status` | — | Not invoked by the Billing page (page reads plan/usage directly from Supabase). Fix verified by audit; no frontend consumer currently calls it. |

Test account: `imubaid93@gmail.com` (operator-logged-in, staging only). Active site:
`qa-139id-browser.example.com` (Free plan).

## 6. Console / Network Findings

- **Console:** no app errors/exceptions. Only `chrome-extension://…` "Client disconnected" noise.
- **Network:** plan/usage loaded via direct staging Supabase REST
  (`nrsvpwzekfrdrzkoecfk.supabase.co/rest/v1/pageviews?...`). The upgrade CTA fired
  `POST https://sourcetrack-api-staging.up.railway.app/api/billing/create-checkout`, which returned a
  Stripe checkout URL (the browser then redirected to `checkout.stripe.com`). No CORS/auth/env errors.

## 7. Limitations (honest)

- **Middleware fix live-on-staging verification: PENDING** — the browser test ran against the
  currently deployed staging build, which does **not** include this `api/middleware/auth.js` fix.
  It cannot prove the fixed `validateSiteKey` is live. Re-verify after the commit is pushed/deployed
  (best on a paid site so `stripe_customer_id` resolution is actually exercised on `/status`,
  `/portal`, and `/create-checkout` customer reuse).
- **Portal (paid-site) flow NOT VERIFIED** — no paid staging test site/customer available; the fix
  is verified by audit only.
- **`/api/billing/status` has no current frontend consumer** — the Billing page reads plan/usage
  directly from Supabase. The endpoint is fixed at the code level, but is not exercised by the UI.
- **Production billing is UNVERIFIED** — staging only. Do not infer production behavior.
- **Paid beta remains BLOCKED.**
- A live Stripe **test-mode** checkout session (`cs_test_…`) was created during the CTA test; no
  payment method was entered and the session was abandoned. A leftover Stripe checkout tab may remain
  open in the browser for the operator to close.

## 8. Backlog (explicitly NOT closed)

- Production auth storage namespace verification
- Production / canonical-domain password reset E2E
- Production Supabase Auth Site URL / Redirect URL / SMTP verification
- Canonical `www.sourcetrack.ai` auth route verification once domain routing is final
- Browser verification of the billing **portal** flow on a paid staging site

## 9. Git Status

App-code change: `api/middleware/auth.js` only (plus docs). No commit. No push. No Stripe secrets,
tokens, or customer IDs printed in this report.
