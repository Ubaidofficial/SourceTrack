Session: 133V — Abuse / Rate-Limit / Anti-Spam Review
Last Completed: Mapped and audited rate limiting, bot/crawler filtering, webhook signature and idempotency verification, and onboarding spam/abuse guards; answered 20 pre-beta audit questions; created docs/abuse_rate_limit_spam_audit.md and updated runbooks.
Next Task: Session 133W — Review and queue subsequent pre-beta items.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, required-grep clean)
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
