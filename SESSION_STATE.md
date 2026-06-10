Session: 133K — Support Readiness
Last Completed: Created support_readiness.md mapping, added support emails/troubleshooting links to Billing, Settings, Snippet, and Onboarding failure views without SLA/24-7 guarantees, and documented triage/escalation workflows.
Next Task: Session 133L — Event Pipeline SLOs + Load Testing + Capacity Readiness.
Roadmap Queue:
- Session 133M — Pricing & Plan Limits Audit
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
