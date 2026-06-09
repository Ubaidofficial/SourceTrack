Session: 129A Self-Serve Server API Tokens
Last Completed: Implemented self-serve Server API Token management on backend (GET, POST, DELETE api-keys endpoints under integrationsRouter) and frontend (Settings API Tokens card, Create Token Modal with one-time reveal, and copy workflows). Updated database schema migrations and developer docs. All static launch QAs and runtime integration tests passed.
Next Task: Ready for user review of Session 129A.
Roadmap Queue:
- Phase C (Dashboard saved widget cards)
- Phase D (Campaigns AI Copilot)
Build: ✅ passing
Branch: main

⚠️ WARNING: Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
