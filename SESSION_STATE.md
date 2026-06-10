Session: 136 — Provider-Console Separation & Secrets Verification
Last Completed: Repo inspection + no-secret local .env presence audit for staging/prod separation across Railway/Supabase/PostHog/Stripe/Resend/domains. Verified repo is fully env-parameterized (clients env-driven, railway.json carry no secrets, no hardcoded provider hosts). NO provider console accessed. Appended "Session 136 Provider-Console Verification" to docs/staging_production_separation_audit.md. No app/backend code changed.
P0-2 STATUS: REMAINS OPEN — repo/local parameterized but provider-console separation not verified.
🚩 HEADLINE FINDING F5 (P0 staging safety): local .env SUPABASE_URL points at the PRODUCTION project ref (zxjj…umvh) with a real service-role key — i.e. local dev is wired to the production DB. qa-guard.js blocks mutating QA scripts, but the billing webhook handler is app code (not guarded), so Session 135B run locally as-is would mutate PRODUCTION. 135B stays BLOCKED until a confirmed separate staging Supabase project exists.
Prior findings still open: 135 F1(P0-for-billing-E2E) stale test prices; F3(P2) pv_limit metadata; F4(P1) request-body redirect URLs.
Verdict (134): CONDITIONAL GO — safe for 3–5 hand-picked single-instance beta customers once P0 conditions met.
Next Task: Session 137 — Supabase Backup/PITR Verification + Rollback Rehearsal (P0, console-driven, overlaps the Supabase separation checks; does not require 135B). P0-2 closure + 135B require an operator to confirm a separate staging Supabase project in the console. Do NOT start Phase C/D until P0 conditions are closed.
P0 conditions before first paid customer: (1) Stripe test-mode checkout/webhook evidence [PARTIAL — 135B blocked on confirmed staging DB], (2) provider-console staging/prod separation verified [OPEN — local .env points at prod DB], (3) Supabase backups+PITR confirmed, (4) prod env secrets + ST_IP_RESOLVER_MODE=railway, (5) beta Terms/Privacy disclosed to each customer.
Roadmap Queue:
- Session 137 — Supabase backup/PITR verification + rollback rehearsal (P0) [NEXT — console-driven, also confirms staging-project separation for P0-2/135B]
- Operator: confirm separate staging Supabase project + Railway/PostHog/Stripe/Resend console separation → close P0-2
- Session 135B — Full Stripe test-mode E2E checkout/webhook/portal run (P0-1 closure) [BLOCKED until confirmed separate staging Supabase project; fix F1 test prices first]
- Billing hardening mini-session — server-side generate/allow-list checkout & portal return URLs (F4, P1)
- Session 138 — Lightweight exception monitoring / Sentry (P1)
- Session 139 — Onboarding validation hardening + email suppression (P1)
- Deferred: Redis/Upstash shared rate-limiter (only before horizontal scaling); conversion-cap/structural-limit enforcement decision
- Phase C (Dashboard saved widget cards) / Phase D (Campaigns AI Copilot) — blocked until P0 closed
Build: ✅ passing (node --check, git diff --check, dashboard vite build, qa:static, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
