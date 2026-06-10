Session: 133A.0 Minimum Production Safety Guardrails
Last Completed: Implemented strict environment check in scripts/qa-guard.js and integrated it into all 17 database-interacting QA scripts. Allowed custom staging domains using the STAGING_HOSTS environment variable to bypass canonical redirects in dashboard/server.mjs. Added staging separation backlog task in PAID_BETA_SESSION_PLAN.md.
Next Task: Move to Phase C (Dashboard saved widget cards).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
