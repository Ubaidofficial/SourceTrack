Session: 133T — Data Deletion / Privacy Request Operational Drill
Last Completed: Audited and verified account deletion, visitor erasure, and retention purges database flows, Stripe/PostHog boundaries, shared workspace caveats, and operator checklists; created docs/privacy_request_operational_drill.md.
Next Task: Session 133U — Admin / Operator Access & Internal Support Controls Audit.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
