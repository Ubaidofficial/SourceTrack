Session: 133R — Staging / Production Separation Audit
Last Completed: Audited environment isolation across Supabase, PostHog, Stripe, Resend, Railway, and CORS settings; resolved hardcoded production URLs in email report and threshold alert jobs; created docs/staging_production_separation_audit.md.
Next Task: Session 133S — Production Observability Verification / Incident Response Drill.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
