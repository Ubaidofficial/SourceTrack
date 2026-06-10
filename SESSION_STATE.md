Session: 133D Production Observability Audit + Minimum Alerts Plan
Last Completed: Audited production observability, added process-level uncaughtException/unhandledRejection listeners to the API server, documented environment variable rules, and added a production observability & monitoring runbook covering logs, cron schedules, incident severity classifications, and known blind spots.
Next Task: Move to Phase C (Dashboard saved widget cards).
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
