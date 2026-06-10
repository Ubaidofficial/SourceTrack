Session: 135 — Stripe Test-Mode Checkout & Webhook Evidence
Last Completed: Ran genuine Stripe TEST-mode read-only verification (account=test, 3 prices exist/active) + test-mode checkout-session creation probe + plan-mapping/pv_limit unit checks + full billing code-path audit. Appended "Session 135 Test-Mode Evidence" to docs/billing_checkout_test_mode_qa.md. NO webhook delivered, NO handler run against DB (Stripe CLI absent; Supabase staging/prod unverified — P0-2). No app/backend code changed.
P0-1 STATUS: PARTIALLY VERIFIED — NOT CLOSED. Stripe-side config + code path verified; end-to-end checkout→webhook→DB→enforcement loop still requires operator run on confirmed staging (checklist in billing doc).
Findings: F1(P0 for closing billing E2E) test prices stale ($49/$99/$199 vs advertised $29/$79/$149+) — Stripe test dashboard must match public pricing before checkout evidence is meaningful; F2(P2) product names pre-rename (Pro/Agency); F3(P2 config hygiene) pv_limit metadata absent on prices (plan-default fallback verified correct, but add metadata to match docs); F4(P1 billing hardening) checkout success/cancel/return URLs accepted raw from request body — must be generated/allow-listed server-side from trusted origin (reported, not fixed — needs review).
Verdict (134): CONDITIONAL GO — safe for 3–5 hand-picked single-instance beta customers once P0 conditions met.
Next Task: Session 136 — Provider-console separation & secrets verification (P0). Webhook→DB testing is BLOCKED until staging/prod separation is verified, so 136 runs BEFORE the Session 135B Stripe E2E closure. Do NOT start Phase C/D until P0 conditions are closed.
P0 conditions before first paid customer: (1) Stripe test-mode checkout/webhook evidence [PARTIAL — 135B operator E2E pending, blocked on 136], (2) provider-console staging/prod separation verified, (3) Supabase backups+PITR confirmed, (4) prod env secrets + ST_IP_RESOLVER_MODE=railway, (5) beta Terms/Privacy disclosed to each customer.
Roadmap Queue:
- Session 136 — Provider-console separation & secrets verification (P0) [NEXT — unblocks webhook DB testing]
- Session 135B — Full Stripe test-mode E2E checkout/webhook/portal run (P0-1 closure) [blocked on 136 + Stripe CLI/reachable webhook endpoint; fix F1 test prices first]
- Billing hardening mini-session — server-side generate/allow-list checkout & portal return URLs (F4, P1)
- Session 137 — Supabase backup/PITR verification + rollback rehearsal (P0)
- Session 138 — Lightweight exception monitoring / Sentry (P1)
- Session 139 — Onboarding validation hardening + email suppression (P1)
- Deferred: Redis/Upstash shared rate-limiter (only before horizontal scaling); conversion-cap/structural-limit enforcement decision
- Phase C (Dashboard saved widget cards) / Phase D (Campaigns AI Copilot) — blocked until P0 closed
Build: ✅ passing (node --check, git diff --check, dashboard vite build, qa:static, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
